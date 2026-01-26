import {
    Injectable,
    BadRequestException,
    Logger,
    NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RaffleService } from '../raffle/raffle.service';
import { PaymentStatus, OrderStatus } from '@prisma/client';
import axios from 'axios';
import * as crypto from 'crypto';
import { MailService } from '../mail/mail.service';
import { CouponsService } from '../coupons/coupons.service';

function normalizeBase(url?: string): string {
    if (!url) return '';
    return url.replace(/\/+$/, '');
}

// Helper para formatear fecha en español
function formatDate(date: Date | string | null): string {
    if (!date) return 'Fecha por confirmar';
    const d = new Date(date);
    return new Intl.DateTimeFormat('es-CL', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(d);
}

@Injectable()
export class PaymentsService {
    private readonly logger = new Logger(PaymentsService.name);

    // --- Config ---
    private readonly flowApiKey: string;
    private readonly flowSecretKey: string;
    private readonly flowApiUrl: string;
    private readonly mpAccessToken: string;

    // --- URLs ---
    private readonly apiBase: string;

    constructor(
        private prisma: PrismaService,
        private raffles: RaffleService,
        private mailService: MailService,
        private coupons: CouponsService,
    ) {
        // Flow Init
        this.flowApiKey = process.env.FLOW_API_KEY || '';
        this.flowSecretKey = process.env.FLOW_SECRET_KEY || '';
        this.flowApiUrl = normalizeBase(process.env.FLOW_API_URL);

        if (!this.flowApiKey || !this.flowSecretKey || !this.flowApiUrl) {
            this.logger.error('❌ Credenciales de Flow no configuradas correctamente.');
        }

        // Mercado Pago Init
        this.mpAccessToken = process.env.MP_ACCESS_TOKEN || '';
        if (!this.mpAccessToken) {
            this.logger.warn('⚠️ MP_ACCESS_TOKEN no configurado. Mercado Pago no funcionará.');
        }

        // URLs Base
        const apiBase = process.env.API_BASE_URL || 'http://localhost:3000/api/v1';
        this.apiBase = normalizeBase(apiBase);
    }

    private _createFlowSignature(params: Record<string, string | number>): string {
        const sortedKeys = Object.keys(params).sort();
        const data = sortedKeys.map(key => `${key}=${params[key]}`).join('&');
        const hmac = crypto.createHmac('sha256', this.flowSecretKey);
        hmac.update(data);
        return hmac.digest('hex');
    }

    private async calculateTotalWithCoupon(baseTotal: number, couponCode?: string) {
        if (!couponCode) return { finalTotal: baseTotal, discountAmount: 0, couponId: null };
        try {
            const validation = await this.coupons.validate({ code: couponCode, subtotal: baseTotal });
            if (validation.valid) {
                return {
                    finalTotal: validation.new_total,
                    discountAmount: validation.discount_clp,
                    couponId: validation.coupon_id
                };
            }
        } catch (error) {
            this.logger.warn(`Cupón inválido: ${couponCode}`);
        }
        return { finalTotal: baseTotal, discountAmount: 0, couponId: null };
    }

    // =================================================================
    // 1. CHECKOUT MERCADO PAGO (Crear Preferencia)
    // =================================================================
    async createMpRaffleCheckout(userId: string, raffleId: string, quantity: number, couponCode?: string) {
        this.logger.log(`🔵 Checkout MP Iniciado (User: ${userId}, Raffle: ${raffleId}, Qty: ${quantity})`);

        if (quantity <= 0) throw new BadRequestException('Cantidad inválida');

        // 1. Validaciones y Stock
        const raffle = await this.prisma.raffle.findUnique({
            where: { id: raffleId },
            include: { pricingTiers: { where: { active: true } } }
        });
        if (!raffle) throw new NotFoundException('Sorteo no encontrado');

        const available = await this.raffles.getAvailability(raffleId);
        if (available < quantity) throw new BadRequestException(`Stock insuficiente. Quedan ${available} Stickers.`);

        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        // 🔥 CORRECCIÓN CRÍTICA: Mercado Pago a veces falla con emails en mayúsculas
        const payerEmail = user.email ? user.email.toLowerCase().trim() : 'guest@nivem.cl';

        // 2. Calcular Precios
        const pricing = this.raffles.computeBestPricing(raffle.ticket_price_clp, quantity, raffle.pricingTiers);
        const baseTotal = pricing.total_clp;
        const { finalTotal, discountAmount, couponId } = await this.calculateTotalWithCoupon(baseTotal, couponCode);
        const safeTotal = Math.max(0, finalTotal);

        if (safeTotal === 0) throw new BadRequestException('El monto total no puede ser 0 para Mercado Pago.');

        // 3. Crear Orden DB
        const orderNumber = `STICKER-${Date.now().toString(36).toUpperCase()}`;
        const order = await this.prisma.order.create({
            data: {
                userId,
                number: orderNumber,
                status: OrderStatus.pending,
                subtotal_clp: baseTotal,
                discount_clp: discountAmount,
                total_clp: safeTotal,
                currency: 'CLP',
            },
        });

        // 4. Registrar Intención (RaffleEntry)
        await this.prisma.raffleEntry.create({
            data: {
                raffleId,
                userId,
                orderId: order.id,
                entries: quantity,
                source: 'pending_purchase'
            }
        });

        if (couponId) {
            await this.prisma.orderDiscount.create({
                data: { orderId: order.id, couponId, amount_clp: discountAmount, description: `Cupón ${couponCode}` }
            });
        }

        // 5. Crear Pago Local (Estado INIT)
        const payment = await this.prisma.payment.create({
            data: { orderId: order.id, provider: 'mercadopago', status: PaymentStatus.init, amount_clp: safeTotal },
        });

        // 6. LLAMADA A API MERCADO PAGO
        try {
            const preferenceData = {
                items: [
                    {
                        id: raffleId,
                        title: `Pack ${quantity} Stickers: ${raffle.name}`,
                        quantity: 1,
                        currency_id: 'CLP',
                        unit_price: safeTotal
                    }
                ],
                payer: {
                    email: payerEmail,
                    name: user.name || 'Cliente',
                    surname: user.lastname || ''
                },
                // 🔥 ENLAZAMOS EL PAGO LOCAL CON 'external_reference'
                external_reference: payment.id,
                back_urls: {
                    success: `${this.apiBase}/payments/mercadopago/return?status=success`,
                    failure: `${this.apiBase}/payments/mercadopago/return?status=failure`,
                    pending: `${this.apiBase}/payments/mercadopago/return?status=pending`
                },
                auto_return: 'approved',
                notification_url: `${this.apiBase}/payments/mercadopago/webhook`,
                statement_descriptor: "NIVEM RAFFLE"
            };

            this.logger.log(`📡 Enviando preferencia a Mercado Pago...`);
            const response = await axios.post(
                'https://api.mercadopago.com/checkout/preferences',
                preferenceData,
                { headers: { Authorization: `Bearer ${this.mpAccessToken}` } }
            );

            // Guardamos el ID de la preferencia
            await this.prisma.payment.update({
                where: { id: payment.id },
                data: { flow_token: response.data.id } // Usamos flow_token para guardar el preference_id
            });

            return {
                preference_id: response.data.id,
                init_point: response.data.init_point,
                order_id: order.id
            };

        } catch (error: any) {
            this.logger.error(`❌ Error creando preferencia MP: ${error.message}`, error.response?.data);
            // Marcamos la orden como fallida para no dejar basura
            await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.failed } });
            throw new BadRequestException('Error al conectar con Mercado Pago');
        }
    }

    // =================================================================
    // 2. WEBHOOK MERCADO PAGO
    // =================================================================
    async handleMpWebhook(query: any, body: any) {
        // MP envía el ID en 'query.id' (viejos) o 'body.data.id' (nuevos)
        // El middleware ya logueó todo, aquí procesamos.
        const topic = query.topic || body.type;
        const resourceId = query.id || body?.data?.id;

        this.logger.log(`🔔 Webhook MP Procesando -> Topic: ${topic}, ID: ${resourceId}`);

        // Solo nos interesan notificaciones de pago
        if ((topic !== 'payment' && body?.type !== 'payment') || !resourceId) {
            return { ok: true };
        }

        try {
            // 1. Consultar estado real a Mercado Pago
            const response = await axios.get(
                `https://api.mercadopago.com/v1/payments/${resourceId}`,
                { headers: { Authorization: `Bearer ${this.mpAccessToken}` } }
            );

            const paymentData = response.data;
            const status = paymentData.status; // approved, rejected, pending
            const externalRef = paymentData.external_reference; // NUESTRO payment.id

            if (!externalRef) {
                this.logger.warn(`Pago MP ${resourceId} sin external_reference. Ignorando.`);
                return { ok: true };
            }

            // 2. Buscar Pago Local
            const localPayment = await this.prisma.payment.findUnique({
                where: { id: externalRef },
                select: { id: true, status: true, orderId: true }
            });

            if (!localPayment) {
                this.logger.error(`Pago local ${externalRef} no encontrado.`);
                return { ok: true };
            }

            // 3. Idempotencia: Si ya está aprobado, salir
            if (localPayment.status === PaymentStatus.approved) {
                this.logger.log(`Pago MP ${externalRef} ya estaba aprobado.`);
                return { ok: true };
            }

            // 4. Procesar según estado
            if (status === 'approved') {
                // ✅ PAGO EXITOSO: Usamos la lógica centralizada
                await this.processSuccessfulPayment(localPayment.id, resourceId.toString(), null);

            } else if (status === 'rejected' || status === 'cancelled') {
                // ❌ PAGO RECHAZADO
                await this.prisma.payment.update({
                    where: { id: localPayment.id },
                    data: { status: PaymentStatus.rejected }
                });
                await this.prisma.order.update({
                    where: { id: localPayment.orderId },
                    data: { status: OrderStatus.failed }
                });
                this.logger.warn(`Pago MP ${externalRef} rechazado/cancelado.`);
            }

            return { ok: true };

        } catch (error: any) {
            this.logger.error(`❌ Error Webhook MP: ${error.message}`);
            // Retornamos OK para evitar reintentos infinitos de MP en caso de error lógico nuestro
            return { ok: true };
        }
    }

    // =================================================================
    // 3. CHECKOUT FLOW (LEGACY PERO ROBUSTO)
    // =================================================================
    async createFlowRaffleCheckout(userId: string, raffleId: string, quantity: number, couponCode?: string) {
        this.logger.log(`🔵 Checkout Flow Iniciado (User: ${userId}, Raffle: ${raffleId}, Qty: ${quantity})`);

        if (quantity <= 0) throw new BadRequestException('Cantidad inválida');

        // 1. Datos del Sorteo
        const raffle = await this.prisma.raffle.findUnique({
            where: { id: raffleId },
            include: { pricingTiers: { where: { active: true } } }
        });
        if (!raffle) throw new NotFoundException('Sorteo no encontrado');

        // 2. Verificar Disponibilidad
        const available = await this.raffles.getAvailability(raffleId);
        if (available < quantity) throw new BadRequestException(`Stock insuficiente. Quedan ${available} Stickers.`);

        const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
        if (!user || !user.email) throw new BadRequestException('El usuario no tiene un email configurado.');

        // 3. Calcular Precios
        const pricing = this.raffles.computeBestPricing(raffle.ticket_price_clp, quantity, raffle.pricingTiers);
        const baseTotal = pricing.total_clp;
        const { finalTotal, discountAmount, couponId } = await this.calculateTotalWithCoupon(baseTotal, couponCode);
        const safeTotal = Math.max(0, finalTotal);
        if (safeTotal === 0) throw new BadRequestException('El monto total no puede ser 0 para pagar con Flow.');

        // 4. Crear Orden
        const orderNumber = `STICKER-${Date.now().toString(36).toUpperCase()}`;
        const order = await this.prisma.order.create({
            data: {
                userId,
                number: orderNumber,
                status: OrderStatus.pending,
                subtotal_clp: baseTotal,
                discount_clp: discountAmount,
                total_clp: safeTotal,
                currency: 'CLP',
            },
        });

        // 5. Registrar Intención
        await this.prisma.raffleEntry.create({
            data: { raffleId, userId, orderId: order.id, entries: quantity, source: 'pending_purchase' }
        });

        if (couponId) {
            await this.prisma.orderDiscount.create({
                data: { orderId: order.id, couponId, amount_clp: discountAmount, description: `Cupón ${couponCode}` }
            });
        }

        // 6. Crear Pago Local
        const payment = await this.prisma.payment.create({
            data: { orderId: order.id, provider: 'flow', status: PaymentStatus.init, amount_clp: safeTotal },
        });

        // 7. Flow API
        const itemTitle = `Pack ${quantity} STickers: ${raffle.name}`;
        const params: Record<string, string | number> = {
            apiKey: this.flowApiKey,
            commerceOrder: payment.id,
            subject: itemTitle,
            amount: safeTotal,
            email: user.email,
            currency: 'CLP',
            urlConfirmation: `${this.apiBase}/payments/flow/webhook`,
            urlReturn: `${this.apiBase}/payments/flow/return?order_id=${order.id}`,
            urlFailure: `${this.apiBase}/payments/flow/failure?order_id=${order.id}`,
            urlPending: `${this.apiBase}/payments/flow/pending?order_id=${order.id}`,
        };

        const signature = this._createFlowSignature(params);
        const body = new URLSearchParams();
        Object.entries(params).forEach(([key, value]) => body.append(key, String(value)));
        body.append('s', signature);

        try {
            const response = await axios.post(`${this.flowApiUrl}/payment/create`, body, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });
            const flowResponse = response.data;

            if (!flowResponse?.token || !flowResponse?.url) {
                throw new BadRequestException('Error Flow: Respuesta incompleta.');
            }

            await this.prisma.payment.update({
                where: { id: payment.id },
                data: {
                    flow_token: flowResponse.token,
                    flow_order_id: flowResponse.flowOrder ? String(flowResponse.flowOrder) : null
                },
            });

            return {
                message: 'Orden de Flow creada.',
                init_point: `${flowResponse.url}?token=${flowResponse.token}`,
                order_id: order.id
            };

        } catch (err: any) {
            this.logger.error(`❌ Error Flow: ${err.message}`);
            await this.prisma.order.update({ where: { id: order.id }, data: { status: OrderStatus.failed } });
            throw new BadRequestException('Error comunicando con Flow.');
        }
    }

    // =================================================================
    // 4. WEBHOOK FLOW (ROBUSTO)
    // =================================================================
    async handleFlowWebhook(body: { token?: string }) {
        const token = body?.token;
        if (!token) {
            this.logger.warn('Webhook Flow sin token.');
            return { ok: true };
        }

        try {
            // 1. Validar estado con Flow (Timeout de 10s)
            const params = { apiKey: this.flowApiKey, token: token };
            const signature = this._createFlowSignature(params);

            const response = await axios.get(`${this.flowApiUrl}/payment/getStatus`, {
                params: { ...params, s: signature },
                timeout: 10000
            });

            const statusResponse = response.data;
            const flowStatus = statusResponse?.status; // 2 = Pagado
            const paymentId = statusResponse?.commerceOrder;
            const flowOrder = statusResponse?.flowOrder ? String(statusResponse.flowOrder) : null;

            if (!paymentId) return { ok: true };

            // 2. Idempotencia
            const payment = await this.prisma.payment.findUnique({
                where: { id: paymentId },
                select: { id: true, status: true, orderId: true }
            });

            if (!payment) return { ok: true };
            if (payment.status === PaymentStatus.approved) return { ok: true };

            // 3. Procesar
            if (flowStatus === 2) {
                // ✅ PAGO EXITOSO
                await this.processSuccessfulPayment(payment.id, token, flowOrder);
            } else if (flowStatus === 3 || flowStatus === 4) {
                // ❌ PAGO RECHAZADO
                await this.prisma.payment.update({
                    where: { id: payment.id },
                    data: { status: PaymentStatus.rejected, flow_token: token, flow_order_id: flowOrder },
                });
                await this.prisma.order.update({
                    where: { id: payment.orderId },
                    data: { status: OrderStatus.failed }
                });
            }

            return { ok: true };

        } catch (error: any) {
            this.logger.error(`❌ Error Webhook Flow: ${error.message}`);
            // Lanzamos error controlado 400 (o retornamos OK si queremos silenciar)
            throw new BadRequestException('Error interno webhook Flow');
        }
    }

    // =================================================================
    // 5. PROCESAMIENTO CENTRALIZADO (NÚCLEO DEL SISTEMA)
    // =================================================================
    // =================================================================
    // 5. PROCESAMIENTO BLINDADO (CORREGIDO)
    // =================================================================
    private async processSuccessfulPayment(paymentId: string, token: string, flowOrderId: string | null) {
        let emailPayload: any = null;
        let userEmail: string | null = null;

        try {
            await this.prisma.$transaction(async (tx) => {
                // A. Verificación Atómica Anti-Duplicados
                const currentPayment = await tx.payment.findUnique({ where: { id: paymentId } });

                // Si ya está aprobado, abortamos para no dar doble ticket
                if (!currentPayment || currentPayment.status === PaymentStatus.approved) {
                    this.logger.warn(`🛑 Pago ${paymentId} ya procesado. Omitiendo duplicado.`);
                    return;
                }

                // B. Actualizar Pago
                const payment = await tx.payment.update({
                    where: { id: paymentId },
                    data: { status: PaymentStatus.approved, flow_token: token, flow_order_id: flowOrderId },
                    include: { order: true }
                });

                if (!payment.orderId) return;

                // C. Lógica de Tickets
                const entry = await tx.raffleEntry.findFirst({ where: { orderId: payment.orderId }, include: { raffle: true } });
                let assignedNumbers: number[] = [];

                if (entry && entry.raffleId && entry.entries > 0) {
                    // Doble seguridad: verificar si la orden ya tiene tickets
                    // 👇 AQUÍ ESTABA EL ERROR (ticket -> raffleTicket)
                    const existingCount = await tx.raffleTicket.count({ where: { orderId: payment.orderId } });

                    if (existingCount === 0) {
                        assignedNumbers = await this.raffles.assignTicketsToOrder(tx, entry.raffleId, payment.orderId, payment.order.userId, entry.entries);
                        this.logger.log(`🎟️ Asignados stickers: ${assignedNumbers.length}`);
                    }
                }

                // D. Cupones y Cierre
                const orderDiscount = await tx.orderDiscount.findFirst({ where: { orderId: payment.orderId } });
                if (orderDiscount?.couponId) await tx.coupon.update({ where: { id: orderDiscount.couponId }, data: { used: { increment: 1 } } });

                const updatedOrder = await tx.order.update({
                    where: { id: payment.orderId },
                    data: { status: OrderStatus.paid },
                    include: { user: { include: { addresses: true } } }
                });

                // E. Datos Email
                if (updatedOrder.user?.email) {
                    userEmail = updatedOrder.user.email;
                    const user = updatedOrder.user;
                    const raffleDateString = entry?.raffle?.ends_at ? formatDate(entry.raffle.ends_at) : 'Pronto';
                    const defaultAddress = user.addresses[0];
                    emailPayload = {
                        orderNumber: updatedOrder.number,
                        customerName: user.name || 'Cliente',
                        tickets: assignedNumbers,
                        total: payment.amount_clp,
                        products: [`Pack ${entry?.entries || 0} Stickers`],
                        raffleDate: raffleDateString,
                        billing: { name: user.name || 'Cliente', rut: 'N/A', address: defaultAddress?.line1 || 'N/A', city: defaultAddress?.city || 'N/A', phone: user.phone || 'N/A' }
                    };
                }
            }, { timeout: 20000 });

            // Email fuera de transacción
            if (userEmail && emailPayload) {
                this.mailService.sendOrderConfirmation(userEmail, emailPayload)
                    .then(() => this.logger.log(`📧 Email enviado a ${userEmail}`))
                    .catch(e => this.logger.error(`⚠️ Error enviando email (Pago OK): ${e}`));
            }
        } catch (error: any) {
            this.logger.error(`❌ Error procesando pago ${paymentId}: ${error.message}`);
        }
    }

    // --- Helper para Redirección Frontend ---
    async checkFlowStatusRealTime(token: string, orderId: string): Promise<'success' | 'failure' | 'pending'> {
        const order = await this.prisma.order.findUnique({ where: { id: orderId } });
        if (order?.status === OrderStatus.paid) return 'success';
        if (order?.status === OrderStatus.failed || order?.status === OrderStatus.cancelled) return 'failure';

        if (token) {
            try {
                const params = { apiKey: this.flowApiKey, token: token };
                const signature = this._createFlowSignature(params);
                const response = await axios.get(`${this.flowApiUrl}/payment/getStatus`, {
                    params: { ...params, s: signature },
                    timeout: 5000
                });
                const flowStatus = response.data?.status;
                if (flowStatus === 2) return 'success';
                if (flowStatus === 3 || flowStatus === 4) return 'failure';
            } catch (error) {
                this.logger.error(`Error checkFlowStatusRealTime: ${error}`);
            }
        }
        return 'pending';
    }
}