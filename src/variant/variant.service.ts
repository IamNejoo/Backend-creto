import {
    Injectable,
    NotFoundException,
    ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVariantDto } from './dto/create-variant.dto';
import { UpdateVariantDto } from './dto/update-variant.dto';

@Injectable()
export class VariantService {
    constructor(private prisma: PrismaService) { }

    /**
     * Genera un SKU único basado en el título del producto y los atributos de la variante.
     * Maneja colisiones añadiendo un sufijo numérico (ej: SKU-2, SKU-3).
     */
    private async _generateSku(
        productTitle: string,
        size?: string,
        color?: string,
    ): Promise<string> {
        // 1. Crear la base del SKU de forma legible
        const productPrefix = productTitle.substring(0, 3).toUpperCase();
        const sizeCode = size ? `-${size.substring(0, 3).toUpperCase()}` : '';
        const colorCode = color ? `-${color.substring(0, 3).toUpperCase()}` : '';
        const baseSku = `${productPrefix}${sizeCode}${colorCode}`;

        // 2. Verificar si ya existe y manejar colisiones
        let finalSku = baseSku;
        let counter = 2;
        while (await this.prisma.variant.findUnique({ where: { sku: finalSku } })) {
            finalSku = `${baseSku}-${counter}`;
            counter++;
        }

        return finalSku;
    }

    async create(dto: CreateVariantDto) {
        const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const generatedSku = await this._generateSku(product.title, dto.size, dto.color);

        // Doble verificación para máxima seguridad en caso de concurrencia.
        const exists = await this.prisma.variant.findUnique({ where: { sku: generatedSku } });
        if (exists) throw new ConflictException('El SKU generado ya existe, intente de nuevo.');

        const variant = await this.prisma.variant.create({
            data: {
                productId: dto.productId,
                sku: generatedSku, // Usamos el SKU generado
                size: dto.size,
                color: dto.color,
                extra_price: dto.extra_price || 0,
            },
            include: { levels: { include: { source: true } } },
        });

        return { message: 'Variante creada', variant };
    }

    async update(id: string, dto: UpdateVariantDto) {
        const variant = await this.prisma.variant.findUnique({ where: { id } });
        if (!variant) throw new NotFoundException('Variante no encontrada');

        if (dto.sku && dto.sku !== variant.sku) {
            const skuExists = await this.prisma.variant.findUnique({ where: { sku: dto.sku } });
            if (skuExists) throw new ConflictException('SKU ya existe');
        }

        const updated = await this.prisma.variant.update({
            where: { id },
            data: dto,
            include: { levels: { include: { source: true } } },
        });

        return { message: 'Variante actualizada', variant: updated };
    }

    async remove(id: string) {
        const variant = await this.prisma.variant.findUnique({ where: { id } });
        if (!variant) throw new NotFoundException('Variante no encontrada');

        const blocking = await this.prisma.inventoryLevel.count({
            where: {
                variantId: id,
                OR: [{ stock: { gt: 0 } }, { reserved: { gt: 0 } }],
            },
        });

        if (blocking > 0) {
            throw new ConflictException(
                'No se puede eliminar la variante: tiene stock o reservas activas.',
            );
        }

        const deleted = await this.prisma.variant.update({
            where: { id },
            data: { active: false },
        });

        return { message: 'Variante desactivada', variant: deleted };
    }

    async listByProduct(productId: string) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const variants = await this.prisma.variant.findMany({
            where: { productId, active: true },
            include: { levels: { include: { source: true } } },
            orderBy: { createdAt: 'desc' },
        });

        return { variants };
    }
}