// backend/src/orders/orders.service.ts
import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class OrdersService {
    constructor(private prisma: PrismaService) { }

    private async generateOrderNumber(): Promise<string> {
        const timestamp = Date.now().toString(36).toUpperCase();
        const random = Math.random().toString(36).substring(2, 6).toUpperCase();
        return `ORD-${timestamp}-${random}`;
    }

    async create(userId: string, dto: CreateOrderDto) {
        if (!dto.items || dto.items.length === 0) {
            throw new BadRequestException('La orden debe tener al menos un producto');
        }

        const variantIds = dto.items.map(item => item.variantId);
        const variants = await this.prisma.variant.findMany({
            where: {
                id: { in: variantIds },
                active: true,
            },
            include: {
                product: {
                    include: {
                        images: true,
                    },
                },
                levels: {
                    include: {
                        source: true,
                    },
                },
            },
        });

        if (variants.length !== variantIds.length) {
            throw new BadRequestException('Algunas variantes no existen o están inactivas');
        }

        // Validar stock para productos físicos
        for (const item of dto.items) {
            const variant = variants.find(v => v.id === item.variantId);
            if (!variant) continue;

            if (variant.product.type === 'physical') {
                const availableStock = variant.levels.reduce(
                    (sum, level) => sum + (level.stock - level.reserved),
                    0
                );

                if (availableStock < item.qty) {
                    throw new BadRequestException(
                        `Stock insuficiente para ${variant.product.title}. Disponible: ${availableStock}`
                    );
                }
            }
        }

        // Calcular totales
        let subtotal = 0;
        const orderItems: any[] = [];

        for (const item of dto.items) {
            const variant = variants.find(v => v.id === item.variantId);
            if (!variant) continue;

            const unitPrice = variant.product.price_clp + variant.extra_price;
            const totalPrice = unitPrice * item.qty;
            subtotal += totalPrice;

            orderItems.push({
                productId: variant.product.id,
                variantId: variant.id,
                title_snap: variant.product.title,
                sku_snap: variant.sku,
                qty: item.qty,
                unit_price_clp: unitPrice,
                total_clp: totalPrice,
            });
        }

        // Aplicar cupón si existe
        let discountAmount = 0;
        let couponId: string | null = null;

        if (dto.couponCode) {
            const coupon = await this.prisma.coupon.findUnique({
                where: { code: dto.couponCode },
            });

            if (!coupon) {
                throw new BadRequestException('Cupón no válido');
            }

            const now = new Date();
            if (coupon.starts_at && now < coupon.starts_at) {
                throw new BadRequestException('El cupón aún no está activo');
            }
            if (coupon.ends_at && now > coupon.ends_at) {
                throw new BadRequestException('El cupón ha expirado');
            }
            if (coupon.used >= coupon.max_uses) {
                throw new BadRequestException('El cupón ha alcanzado su límite de usos');
            }
            if (coupon.min_subtotal && subtotal < coupon.min_subtotal) {
                throw new BadRequestException(
                    `El subtotal mínimo para este cupón es $${coupon.min_subtotal}`
                );
            }

            if (coupon.type === 'amount') {
                discountAmount = Math.min(coupon.value, subtotal);
            } else if (coupon.type === 'percent') {
                discountAmount = Math.round((subtotal * coupon.value) / 100);
            }

            couponId = coupon.id;
        }

        // Calcular IVA (19%)
        const taxRate = 0.19;
        const taxAmount = Math.round((subtotal - discountAmount) * taxRate);
        const shippingCost = 0;
        const total = subtotal - discountAmount + taxAmount + shippingCost;
        const orderNumber = await this.generateOrderNumber();

        // Crear orden en transacción
        const order = await this.prisma.$transaction(async (tx) => {
            const newOrder = await tx.order.create({
                data: {
                    userId,
                    number: orderNumber,
                    status: OrderStatus.draft,
                    subtotal_clp: subtotal,
                    discount_clp: discountAmount,
                    tax_clp: taxAmount,
                    shipping_clp: shippingCost,
                    total_clp: total,
                    currency: 'CLP',
                    items: {
                        create: orderItems,
                    },
                    taxLines: {
                        create: {
                            name: 'IVA',
                            rate: taxRate,
                            amount_clp: taxAmount,
                        },
                    },
                },
                include: {
                    items: {
                        include: {
                            product: {
                                include: {
                                    images: true,
                                },
                            },
                            variant: true,
                        },
                    },
                    taxLines: true,
                },
            });

            // Aplicar cupón
            if (couponId && discountAmount > 0) {
                await tx.orderDiscount.create({
                    data: {
                        orderId: newOrder.id,
                        couponId,
                        description: `Cupón: ${dto.couponCode}`,
                        amount_clp: discountAmount,
                    },
                });

                await tx.coupon.update({
                    where: { id: couponId },
                    data: { used: { increment: 1 } },
                });
            }

            // Reservar stock para productos físicos
            for (const item of dto.items) {
                const variant = variants.find(v => v.id === item.variantId);
                if (variant?.product.type === 'physical') {
                    let remaining = item.qty;

                    for (const level of variant.levels) {
                        if (remaining <= 0) break;

                        const available = level.stock - level.reserved;
                        const toReserve = Math.min(available, remaining);

                        if (toReserve > 0) {
                            await tx.inventoryLevel.update({
                                where: { id: level.id },
                                data: { reserved: { increment: toReserve } },
                            });
                            remaining -= toReserve;
                        }
                    }
                }
            }

            // Copiar dirección si existe
            if (dto.addressId) {
                const address = await tx.address.findFirst({
                    where: {
                        id: dto.addressId,
                        userId,
                    },
                });

                if (address) {
                    await tx.orderAddress.create({
                        data: {
                            orderId: newOrder.id,
                            type: 'shipping',
                            name: address.name || '',
                            line1: address.line1,
                            line2: address.line2,
                            city: address.city,
                            region: address.region,
                            country: address.country,
                            zip: address.zip,
                            phone: address.phone,
                        },
                    });
                }
            }

            return newOrder;
        });

        return { order };
    }

    async findById(orderId: string, userId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        product: {
                            include: {
                                images: true,
                            },
                        },
                        variant: true,
                    },
                },
                addresses: true,
                payments: true,
                discounts: {
                    include: {
                        coupon: true,
                    },
                },
                taxLines: true,
            },
        });

        if (!order) {
            throw new NotFoundException('Orden no encontrada');
        }

        if (order.userId !== userId) {
            throw new ForbiddenException('No tienes acceso a esta orden');
        }

        return { order };
    }

    async findByUser(
        userId: string,
        options: {
            status?: OrderStatus;
            limit?: number;
            offset?: number;
        } = {}
    ) {
        const { status, limit = 50, offset = 0 } = options;

        const where: Prisma.OrderWhereInput = {
            userId,
            ...(status && { status }),
        };

        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                include: {
                    items: {
                        include: {
                            product: {
                                include: {
                                    images: true,
                                },
                            },
                        },
                    },
                    payments: true,
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.order.count({ where }),
        ]);

        return { orders, total };
    }

    async cancel(orderId: string, userId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                items: {
                    include: {
                        variant: {
                            include: {
                                levels: true,
                            },
                        },
                    },
                },
            },
        });

        if (!order) {
            throw new NotFoundException('Orden no encontrada');
        }

        if (order.userId !== userId) {
            throw new ForbiddenException('No tienes acceso a esta orden');
        }

        if (!['draft', 'pending'].includes(order.status)) {
            throw new BadRequestException('Solo se pueden cancelar órdenes en estado draft o pending');
        }

        await this.prisma.$transaction(async (tx) => {
            for (const item of order.items) {
                if (item.variant) {
                    for (const level of item.variant.levels) {
                        await tx.inventoryLevel.update({
                            where: { id: level.id },
                            data: { reserved: { decrement: Math.min(level.reserved, item.qty) } },
                        });
                    }
                }
            }

            await tx.order.update({
                where: { id: orderId },
                data: { status: OrderStatus.cancelled },
            });
        });

        const updatedOrder = await this.findById(orderId, userId);
        return updatedOrder;
    }

    async updateStatus(orderId: string, status: OrderStatus) {
        const order = await this.prisma.order.update({
            where: { id: orderId },
            data: { status },
            include: {
                items: {
                    include: {
                        product: true,
                        variant: {
                            include: {
                                levels: true,
                            },
                        },
                    },
                },
            },
        });

        if (status === OrderStatus.paid) {
            await this.prisma.$transaction(async (tx) => {
                for (const item of order.items) {
                    if (item.variant) {
                        let remaining = item.qty;

                        for (const level of item.variant.levels) {
                            if (remaining <= 0) break;

                            const toConsume = Math.min(level.reserved, remaining);

                            if (toConsume > 0) {
                                await tx.inventoryLevel.update({
                                    where: { id: level.id },
                                    data: {
                                        reserved: { decrement: toConsume },
                                        stock: { decrement: toConsume },
                                    },
                                });
                                remaining -= toConsume;
                            }
                        }
                    }
                }
            });
        }

        return { order };
    }


    async findAll(options: { status?: OrderStatus; limit?: number; offset?: number } = {}) {
        const { status, limit = 50, offset = 0 } = options;

        const where: Prisma.OrderWhereInput = status ? { status } : {};

        const [orders, total] = await Promise.all([
            this.prisma.order.findMany({
                where,
                include: {
                    user: { select: { id: true, email: true, name: true, lastname: true } },
                    items: { include: { product: true } },
                    payments: true,
                },
                orderBy: { createdAt: 'desc' },
                take: limit,
                skip: offset,
            }),
            this.prisma.order.count({ where }),
        ]);

        return { orders, total };
    }

    async findByIdAdmin(orderId: string) {
        const order = await this.prisma.order.findUnique({
            where: { id: orderId },
            include: {
                user: true,
                items: {
                    include: {
                        product: { include: { images: true } },
                        variant: true,
                    },
                },
                addresses: true,
                payments: true,
                discounts: { include: { coupon: true } },
                taxLines: true,
            },
        });

        if (!order) throw new NotFoundException('Orden no encontrada');
        return { order };
    }
}