import {
    ConflictException,
    Injectable,
    NotFoundException,
    BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSourceDto } from './dto/create-source.dto';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';

type UpsertLevelInput = {
    sourceId: string;
    stock: number;
    reserved?: number;
};

@Injectable()
export class InventoryService {
    constructor(private prisma: PrismaService) { }

    /* =========================
     *        SOURCES
     * ========================= */
    async createSource(dto: CreateSourceDto) {
        const source = await this.prisma.inventorySource.create({ data: dto });
        return { message: 'Fuente creada', source };
    }

    async listSources() {
        const sources = await this.prisma.inventorySource.findMany({
            orderBy: { name: 'asc' },
        });
        return { sources };
    }

    /* =========================
     *        LEVELS
     * ========================= */
    async createLevel(dto: CreateLevelDto) {
        const exists = await this.prisma.inventoryLevel.findUnique({
            where: {
                variantId_sourceId: { variantId: dto.variantId, sourceId: dto.sourceId },
            },
        });
        if (exists)
            throw new ConflictException(
                'Ya existe un nivel para esa variante y fuente',
            );

        const variant = await this.prisma.variant.findUnique({
            where: { id: dto.variantId },
        });
        if (!variant) throw new NotFoundException('Variante no encontrada');

        const source = await this.prisma.inventorySource.findUnique({
            where: { id: dto.sourceId },
        });
        if (!source) throw new NotFoundException('Fuente no encontrada');

        const level = await this.prisma.inventoryLevel.create({
            data: { ...dto, reserved: 0 },
        });
        return { message: 'Nivel creado', level };
    }

    async listLevelsByVariant(variantId: string) {
        const levels = await this.prisma.inventoryLevel.findMany({
            where: { variantId },
            include: { source: true },
        });
        return { levels };
    }

    async updateLevel(variantId: string, sourceId: string, dto: UpdateLevelDto) {
        const level = await this.prisma.inventoryLevel.findUnique({
            where: { variantId_sourceId: { variantId, sourceId } },
        });
        if (!level) throw new NotFoundException('Nivel no encontrado');

        if (
            (dto.stock != null && dto.stock < 0) ||
            (dto.reserved != null && dto.reserved < 0)
        ) {
            throw new BadRequestException('Valores no pueden ser negativos');
        }

        const updated = await this.prisma.inventoryLevel.update({
            where: { variantId_sourceId: { variantId, sourceId } },
            data: dto,
        });
        return { message: 'Nivel actualizado', level: updated };
    }

    /* =========================
     * RESERVAS / LIBERAR / CONSUMIR
     * ========================= */
    async reserve(variantId: string, sourceId: string, qty: number) {
        if (qty <= 0) throw new BadRequestException('Cantidad inválida');

        return this.prisma.$transaction(async (tx) => {
            const lvl = await tx.inventoryLevel.findUnique({
                where: { variantId_sourceId: { variantId, sourceId } },
            });
            if (!lvl) throw new NotFoundException('Nivel no encontrado');

            const available = lvl.stock - lvl.reserved;
            if (available < qty) throw new ConflictException('Stock insuficiente');

            return tx.inventoryLevel.update({
                where: { variantId_sourceId: { variantId, sourceId } },
                data: { reserved: { increment: qty } },
            });
        });
    }

    async release(variantId: string, sourceId: string, qty: number) {
        if (qty <= 0) throw new BadRequestException('Cantidad inválida');

        return this.prisma.$transaction(async (tx) => {
            const lvl = await tx.inventoryLevel.findUnique({
                where: { variantId_sourceId: { variantId, sourceId } },
            });
            if (!lvl) throw new NotFoundException('Nivel no encontrado');

            const dec = Math.min(qty, lvl.reserved);
            return tx.inventoryLevel.update({
                where: { variantId_sourceId: { variantId, sourceId } },
                data: { reserved: { decrement: dec } },
            });
        });
    }

    async consume(variantId: string, sourceId: string, qty: number) {
        if (qty <= 0) throw new BadRequestException('Cantidad inválida');

        return this.prisma.$transaction(async (tx) => {
            const lvl = await tx.inventoryLevel.findUnique({
                where: { variantId_sourceId: { variantId, sourceId } },
            });
            if (!lvl) throw new NotFoundException('Nivel no encontrado');

            if (lvl.reserved < qty || lvl.stock < qty) {
                throw new ConflictException('No hay reservas/stock para consumir');
            }

            return tx.inventoryLevel.update({
                where: { variantId_sourceId: { variantId, sourceId } },
                data: { reserved: { decrement: qty }, stock: { decrement: qty } },
            });
        });
    }

    /* =========================
     *  MÉTODOS PARA EL FRONT ACTUAL
     * ========================= */

    // Devuelve niveles + fuentes activas
    async getByVariant(variantId: string) {
        const variant = await this.prisma.variant.findUnique({ where: { id: variantId } });
        if (!variant) throw new NotFoundException('Variante no encontrada');

        const [levels, sources] = await Promise.all([
            this.prisma.inventoryLevel.findMany({
                where: { variantId },
                include: { source: true },
                orderBy: { sourceId: 'asc' },
            }),
            this.prisma.inventorySource.findMany({
                where: { active: true },
                orderBy: { name: 'asc' },
            }),
        ]);

        return { levels, sources };
    }

    // Upsert masivo y transaccional de niveles
    async updateLevels(variantId: string, newLevels: UpsertLevelInput[]) {
        const variant = await this.prisma.variant.findUnique({ where: { id: variantId } });
        if (!variant) throw new NotFoundException('Variante no encontrada');

        if (!Array.isArray(newLevels)) {
            throw new BadRequestException('Formato inválido de niveles');
        }

        const sourceIds = newLevels.map((l) => l.sourceId);
        const uniqueSourceIds = Array.from(new Set(sourceIds));

        const sources = await this.prisma.inventorySource.findMany({
            where: { id: { in: uniqueSourceIds } },
            select: { id: true },
        });
        const validIds = new Set(sources.map((s) => s.id));
        const invalid = uniqueSourceIds.filter((id) => !validIds.has(id));
        if (invalid.length > 0) {
            throw new NotFoundException(`Fuentes inexistentes: ${invalid.join(', ')}`);
        }

        if (newLevels.some((l) => l.stock == null || l.stock < 0)) {
            throw new BadRequestException('Stock inválido (no puede ser negativo)');
        }

        await this.prisma.$transaction(async (tx) => {
            for (const lvl of newLevels) {
                await tx.inventoryLevel.upsert({
                    where: { variantId_sourceId: { variantId, sourceId: lvl.sourceId } },
                    update: { stock: lvl.stock },
                    create: {
                        variantId,
                        sourceId: lvl.sourceId,
                        stock: lvl.stock,
                        reserved: 0,
                    },
                });
            }
        });

        const updated = await this.prisma.inventoryLevel.findMany({
            where: { variantId },
            include: { source: true },
            orderBy: { sourceId: 'asc' },
        });

        return { message: 'Inventario actualizado', levels: updated };
    }
}
