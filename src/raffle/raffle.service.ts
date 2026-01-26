import {
    Injectable,
    BadRequestException,
    NotFoundException,
    Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma, TicketStatus } from '@prisma/client';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import * as path from 'path';
import { randomUUID } from 'crypto';

@Injectable()
export class RaffleService {
    private readonly logger = new Logger(RaffleService.name);
    private readonly s3 = new S3Client({
        region: process.env.AWS_REGION,
        credentials: process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY
            ? {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
            }
            : undefined,
    });

    private readonly bucket = process.env.S3_BUCKET!;
    private readonly publicBaseS3 = (process.env.PUBLIC_BASE_S3 || '').replace(/\/+$/, '');

    constructor(private prisma: PrismaService) { }

    /* =====================================================================
       CORE: ASIGNACIÓN ATÓMICA (NUEVA LÓGICA)
       ===================================================================== */

    async assignTicketsToOrder(
        tx: Prisma.TransactionClient,
        raffleId: string,
        orderId: string,
        userId: string,
        quantity: number
    ): Promise<number[]> {

        // 1. Selección y Bloqueo Atómico
        const ticketsToAssign = await tx.$queryRaw<Array<{ id: string, number: number }>>`
            SELECT id, number 
            FROM "RaffleTicket"
            WHERE "raffleId" = ${raffleId} AND "status" = 'available'
            ORDER BY "number" ASC
            LIMIT ${quantity}
            FOR UPDATE SKIP LOCKED
        `;

        if (ticketsToAssign.length < quantity) {
            throw new BadRequestException(`No hay suficientes tickets disponibles. Solicitados: ${quantity}, Encontrados: ${ticketsToAssign.length}`);
        }

        const ticketIds = ticketsToAssign.map(t => t.id);
        const assignedNumbers = ticketsToAssign.map(t => t.number);

        // 2. Actualizar estado a PAGADO
        await tx.raffleTicket.updateMany({
            where: { id: { in: ticketIds } },
            data: {
                status: TicketStatus.paid,
                userId: userId,
                orderId: orderId,
                reservation_expires_at: null
            }
        });

        // 3. Actualizar contadores del Sorteo
        await tx.raffle.update({
            where: { id: raffleId },
            data: {
                paid_tickets: { increment: quantity }
            }
        });

        this.logger.log(`🎟️ Asignados tickets [${assignedNumbers[0]} - ${assignedNumbers[assignedNumbers.length - 1]}] a orden ${orderId}`);

        return assignedNumbers;
    }

    async getAvailability(raffleId: string) {
        const count = await this.prisma.raffleTicket.count({
            where: { raffleId, status: TicketStatus.available }
        });
        return count;
    }

    /* ======= CRUD Admin ======= */

    async createRaffle(dto: {
        name: string;
        ticket_price_clp: number;
        total_tickets: number;
        starts_at: string;
        ends_at: string;
    }) {
        if (dto.total_tickets <= 0) throw new BadRequestException('total_tickets debe ser > 0');

        const starts = new Date(dto.starts_at);
        const ends = new Date(dto.ends_at);
        if (Number.isNaN(+starts) || Number.isNaN(+ends)) throw new BadRequestException('Fechas inválidas');
        if (ends <= starts) throw new BadRequestException('ends_at debe ser posterior a starts_at');

        const raffle = await this.prisma.$transaction(
            async (tx) => {
                const newRaffle = await tx.raffle.create({
                    data: {
                        name: dto.name,
                        ticket_price_clp: dto.ticket_price_clp,
                        total_tickets: dto.total_tickets,
                        starts_at: starts,
                        ends_at: ends,
                    },
                });

                const ticketsToCreate: Prisma.RaffleTicketCreateManyInput[] = [];
                for (let i = 1; i <= newRaffle.total_tickets; i++) {
                    ticketsToCreate.push({
                        raffleId: newRaffle.id,
                        number: i,
                        status: TicketStatus.available,
                    });
                }

                await tx.raffleTicket.createMany({ data: ticketsToCreate });

                return newRaffle;
            },
            { timeout: 60000 }
        );

        return { message: 'Sorteo creado', raffle };
    }

    async updateRaffle(id: string, dto: any) {
        const raffle = await this.prisma.raffle.findUnique({ where: { id } });
        if (!raffle) throw new NotFoundException('Sorteo no encontrado');

        const updated = await this.prisma.raffle.update({
            where: { id },
            data: {
                name: dto.name,
                ticket_price_clp: dto.ticket_price_clp,
                total_tickets: dto.total_tickets,
                starts_at: dto.starts_at ? new Date(dto.starts_at) : undefined,
                ends_at: dto.ends_at ? new Date(dto.ends_at) : undefined,
            },
        });

        return { message: 'Sorteo actualizado', raffle: updated };
    }

    async deleteRaffle(id: string) {
        const r = await this.prisma.raffle.findUnique({
            where: { id },
            select: { id: true, paid_tickets: true },
        });
        if (!r) throw new NotFoundException('Sorteo no encontrado');
        if (r.paid_tickets > 0) throw new BadRequestException('No puedes eliminar un sorteo con stickers pagados');

        await this.prisma.$transaction(async (tx) => {
            await tx.raffleImage.deleteMany({ where: { raffleId: id } });
            await tx.rafflePricingTier.deleteMany({ where: { raffleId: id } });
            await tx.raffleTicket.deleteMany({ where: { raffleId: id } });
            await tx.raffle.delete({ where: { id } });
        });

        return { message: 'Sorteo eliminado' };
    }

    /* ======= Lectura Pública ======= */

    async listRaffles(includeImages = false, includeTiers = false, status?: 'active' | 'scheduled' | 'finished') {
        const now = new Date();
        const where: Prisma.RaffleWhereInput = {};

        if (status === 'active') {
            where.starts_at = { lte: now };
            where.ends_at = { gte: now };
        } else if (status === 'scheduled') {
            where.starts_at = { gt: now };
        } else if (status === 'finished') {
            where.ends_at = { lt: now };
        }

        const raffles = await this.prisma.raffle.findMany({
            where,
            include: {
                images: includeImages ? { orderBy: [{ is_primary: 'desc' }, { position: 'asc' }] } : false,
                pricingTiers: includeTiers ? {
                    where: { active: true },
                    orderBy: [{ sort: 'asc' }, { quantity: 'asc' }]
                } : false,
            },
            orderBy: [{ createdAt: 'desc' }],
        });
        return { raffles };
    }

    async getFeatured() {
        const now = new Date();
        let raffle = await this.prisma.raffle.findFirst({
            where: { starts_at: { lte: now }, ends_at: { gte: now }, is_featured: true },
            include: this.getRaffleIncludes(),
        });

        if (!raffle) {
            raffle = await this.prisma.raffle.findFirst({
                where: { starts_at: { lte: now }, ends_at: { gte: now } },
                orderBy: { ends_at: 'asc' },
                include: this.getRaffleIncludes(),
            });
        }
        return { raffle };
    }

    async getRaffle(id: string) {
        const raffle = await this.prisma.raffle.findUnique({
            where: { id },
            include: this.getRaffleIncludes(),
        });
        if (!raffle) throw new NotFoundException('Sorteo no encontrado');
        return { raffle };
    }

    // CORRECCIÓN: Eliminado "as const" y agregado tipo de retorno explícito
    private getRaffleIncludes(): Prisma.RaffleInclude {
        return {
            images: { orderBy: [{ is_primary: 'desc' }, { position: 'asc' }] },
            pricingTiers: {
                where: { active: true },
                orderBy: [{ sort: 'asc' }, { quantity: 'asc' }],
            },
        };
    }

    /* ======= Calculadora de Precios ======= */

    public computeBestPricing(
        baseUnitPrice: number,
        quantity: number,
        tiers: { quantity: number; price_clp: number; active?: boolean }[],
    ) {
        const candidates = (tiers || []).filter((t) => (t?.active ?? true) && t.quantity > 0);
        const sorted = candidates.sort((a, b) => (a.price_clp / a.quantity) - (b.price_clp / b.quantity));

        let remaining = quantity;
        const breakdown: any[] = [];
        let total = 0;

        for (const t of sorted) {
            if (remaining >= t.quantity) {
                const packs = Math.floor(remaining / t.quantity);
                if (packs > 0) {
                    const packQty = packs * t.quantity;
                    const part = packs * t.price_clp;
                    const unit = Math.floor(t.price_clp / t.quantity);

                    breakdown.push({ kind: 'tier', quantity: packQty, unit_price_clp: unit, total_clp: part });
                    total += part;
                    remaining -= packQty;
                }
            }
        }

        if (remaining > 0) {
            const part = remaining * baseUnitPrice;
            breakdown.push({ kind: 'base', quantity: remaining, unit_price_clp: baseUnitPrice, total_clp: part });
            total += part;
        }

        return { total_clp: total, breakdown };
    }

    /* ======= Tiers & Imágenes ======= */

    async listTiers(raffleId: string) {
        return { tiers: await this.prisma.rafflePricingTier.findMany({ where: { raffleId }, orderBy: [{ sort: 'asc' }, { quantity: 'asc' }] }) };
    }
    async createTier(raffleId: string, dto: any) {
        return { tier: await this.prisma.rafflePricingTier.create({ data: { ...dto, raffleId } }) };
    }
    async updateTier(raffleId: string, tierId: string, dto: any) {
        return { tier: await this.prisma.rafflePricingTier.update({ where: { id: tierId }, data: dto }) };
    }
    async deleteTier(raffleId: string, tierId: string) {
        await this.prisma.rafflePricingTier.delete({ where: { id: tierId } });
        return { message: 'Tier eliminado' };
    }

    async addImage(raffleId: string, publicUrl: string) {
        const count = await this.prisma.raffleImage.count({ where: { raffleId } });
        return { image: await this.prisma.raffleImage.create({ data: { raffleId, s3_key: publicUrl, is_primary: count === 0, position: count } }) };
    }
    async addImageFromS3(raffleId: string, keyOrUrl: string) {
        let publicUrl = keyOrUrl;
        if (!/^https?:\/\//i.test(keyOrUrl)) {
            if (!this.publicBaseS3) throw new BadRequestException('PUBLIC_BASE_S3 no está configurado');
            publicUrl = `${this.publicBaseS3}/${keyOrUrl.replace(/^\/+/, '')}`;
        }
        return this.addImage(raffleId, publicUrl);
    }
    async setPrimaryImage(raffleId: string, imageId: string) {
        await this.prisma.$transaction(async tx => {
            await tx.raffleImage.updateMany({ where: { raffleId }, data: { is_primary: false } });
            await tx.raffleImage.update({ where: { id: imageId }, data: { is_primary: true } });
        });
        return { message: 'Imagen actualizada' };
    }
    async deleteImage(raffleId: string, imageId: string) {
        await this.prisma.raffleImage.delete({ where: { id: imageId } });
        return { message: 'Imagen eliminada' };
    }
    async createRaffleImagePresign(raffleId: string, filename: string, contentType: string) {
        // --- INICIO DEBUG ---
        this.logger.log(`🕵️ [DEBUG START] Iniciando prefirma para Sorteo: ${raffleId}`);
        this.logger.log(`📊 Estado actual de PUBLIC_BASE_S3: '${this.publicBaseS3}'`);

        if (!this.publicBaseS3) {
            this.logger.error(`🔥 [ALERTA CRÍTICA] 'PUBLIC_BASE_S3' está vacía o undefined.`);
            this.logger.error(`   -> Consecuencia: El backend devolverá solo la 'key' relativa.`);
            this.logger.error(`   -> Resultado visual: La imagen se verá rota en el frontend.`);
        } else {
            this.logger.log(`✅ Configuración OK: Se usará la base '${this.publicBaseS3}' para construir la URL.`);
        }
        // --- FIN DEBUG ---

        const ext = path.extname(filename || '').toLowerCase() || '.jpg';
        const key = `raffles/${raffleId}/${randomUUID()}${ext}`;

        const presign = await createPresignedPost(this.s3, {
            Bucket: this.bucket,
            Key: key,
            Conditions: [['content-length-range', 1, 6000000], ['starts-with', '$Content-Type', 'image/']],
            Fields: { 'Content-Type': contentType },
            Expires: 600,
        });

        // Generamos la URL y la logueamos para verificar
        const finalUrl = this.publicBaseS3 ? `${this.publicBaseS3}/${key}` : key;

        this.logger.log(`🚀 [DEBUG END] URL final generada para el frontend: ${finalUrl}`);

        return { upload: presign, public_url: finalUrl, key };
    }

    /* ======= User Tickets ======= */

    async listTickets(raffleId: string, page = 1, limit = 50, search = '') {
        // Lógica para saber si es una exportación masiva
        const isExport = limit === -1;

        // Si NO es exportación, calculamos el salto. Si es exportación, skip es 0.
        const skip = isExport ? 0 : (page - 1) * limit;

        // 1. Filtro Base
        const whereClause: Prisma.RaffleTicketWhereInput = {
            raffleId,
            status: TicketStatus.paid, // Solo pagados
        };

        // 2. Lógica de Búsqueda
        if (search) {
            const isNumber = !isNaN(Number(search));
            whereClause.OR = [
                ...(isNumber ? [{ number: Number(search) }] : []),
                { user: { email: { contains: search, mode: 'insensitive' } } },
                { user: { name: { contains: search, mode: 'insensitive' } } },
                { user: { lastname: { contains: search, mode: 'insensitive' } } },
                { order: { number: { contains: search, mode: 'insensitive' } } }
            ];
        }

        // 3. Preparar opciones de consulta
        const queryOptions: any = {
            where: whereClause,
            orderBy: { number: 'asc' },
            include: {
                user: {
                    include: { addresses: true }
                },
                order: true
            }
        };

        // Solo aplicamos paginación si NO es exportación
        if (!isExport) {
            queryOptions.take = limit;
            queryOptions.skip = skip;
        }

        // 4. Ejecutar consultas
        // Si es exportación, no necesitamos contar el total para la paginación visual,
        // pero mantenemos la estructura para no romper el return.
        const [tickets, total] = await Promise.all([
            this.prisma.raffleTicket.findMany(queryOptions),
            this.prisma.raffleTicket.count({ where: whereClause })
        ]);

        return {
            data: tickets,
            meta: {
                total,
                page,
                last_page: isExport ? 1 : Math.ceil(total / limit),
                limit
            }
        };
    }

    async getUserTickets(userId: string) {
        const tickets = await this.prisma.raffleTicket.findMany({
            where: { userId, status: TicketStatus.paid },
            include: {
                raffle: { include: { images: { where: { is_primary: true }, take: 1 } } }
            },
            orderBy: { number: 'asc' }
        });
        return { tickets };
    }
}