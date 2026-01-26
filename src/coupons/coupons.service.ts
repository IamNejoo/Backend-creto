import { Injectable, BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, ValidateCouponDto } from './dto/create-coupon.dto';

@Injectable()
export class CouponsService {
    constructor(private prisma: PrismaService) { }

    async create(dto: CreateCouponDto) {
        // Verificar si el código ya existe
        const existing = await this.prisma.coupon.findUnique({ where: { code: dto.code } });
        if (existing) throw new ConflictException('El código de cupón ya existe');

        return this.prisma.coupon.create({
            data: {
                code: dto.code,
                type: dto.type,
                value: dto.value,
                max_uses: dto.max_uses,
                min_subtotal: dto.min_subtotal || 0,
                starts_at: dto.starts_at ? new Date(dto.starts_at) : null,
                ends_at: dto.ends_at ? new Date(dto.ends_at) : null,
            },
        });
    }

    async findAll() {
        return this.prisma.coupon.findMany({
            orderBy: { createdAt: 'desc' },
        });
    }

    async remove(id: string) {
        try {
            return await this.prisma.coupon.delete({ where: { id } });
        } catch (error) {
            throw new NotFoundException('Cupón no encontrado');
        }
    }

    // --- LÓGICA DE VALIDACIÓN PARA EL CHECKOUT ---
    async validate(dto: ValidateCouponDto) {
        const coupon = await this.prisma.coupon.findUnique({ where: { code: dto.code } });

        if (!coupon) throw new NotFoundException('Cupón no válido');

        const now = new Date();

        // 1. Validar Fechas
        if (coupon.starts_at && now < coupon.starts_at) {
            throw new BadRequestException('El cupón aún no está activo');
        }
        if (coupon.ends_at && now > coupon.ends_at) {
            throw new BadRequestException('El cupón ha expirado');
        }

        // 2. Validar Usos
        if (coupon.used >= coupon.max_uses) {
            throw new BadRequestException('Este cupón ya agotó sus usos');
        }

        // 3. Validar Monto Mínimo
        if (coupon.min_subtotal && dto.subtotal < coupon.min_subtotal) {
            throw new BadRequestException(`El monto mínimo para este cupón es $${coupon.min_subtotal}`);
        }

        // 4. Calcular Descuento
        let discountAmount = 0;
        if (coupon.type === 'percent') {
            discountAmount = Math.floor(dto.subtotal * (coupon.value / 100));
        } else {
            discountAmount = coupon.value;
        }

        // Asegurar que el descuento no sea mayor al total
        if (discountAmount > dto.subtotal) {
            discountAmount = dto.subtotal;
        }

        return {
            valid: true,
            coupon_id: coupon.id,
            code: coupon.code,
            discount_clp: discountAmount,
            new_total: dto.subtotal - discountAmount,
            type: coupon.type,
            value: coupon.value
        };
    }
}