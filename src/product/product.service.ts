// backend/src/product/product.service.ts
import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'crypto';
import * as path from 'path';

type TX = Parameters<PrismaService['$transaction']>[0] extends (arg: infer A) => any ? A : never;

@Injectable()
export class ProductService {
    private readonly s3: S3Client;
    private readonly bucket: string;
    private readonly publicBaseS3: string;

    constructor(
        private prisma: PrismaService,
        private config: ConfigService,
    ) {
        const region = this.config.get('AWS_REGION');
        this.bucket = this.config.get('S3_BUCKET') || '';
        this.publicBaseS3 = (this.config.get('PUBLIC_BASE_S3') || '').replace(/\/+$/, '');

        this.s3 = new S3Client({
            region,
            credentials: this.config.get('AWS_ACCESS_KEY_ID') && this.config.get('AWS_SECRET_ACCESS_KEY')
                ? {
                    accessKeyId: this.config.get('AWS_ACCESS_KEY_ID')!,
                    secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY')!,
                }
                : undefined,
        });
    }

    /* ---------- Helpers ---------- */

    private generateSlug(title: string): string {
        return title
            .toLowerCase()
            .replace(/[áàäâã]/g, 'a')
            .replace(/[éèëê]/g, 'e')
            .replace(/[íìïî]/g, 'i')
            .replace(/[óòöôõ]/g, 'o')
            .replace(/[úùüû]/g, 'u')
            .replace(/ñ/g, 'n')
            .replace(/ç/g, 'c')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .substring(0, 50);
    }

    private getPrimaryImageUrl(images: { s3_key: string; is_primary: boolean }[]) {
        return images.find((i) => i.is_primary)?.s3_key;
    }

    private computeInventoryTotals(variants: any[]) {
        let stock = 0, reserved = 0;
        for (const v of variants || []) {
            for (const l of v.levels || []) {
                stock += l.stock || 0;
                reserved += l.reserved || 0;
            }
        }
        const available = Math.max(0, stock - reserved);
        return { stock, reserved, available };
    }

    private mapProduct(p: any) {
        return {
            ...p,
            primaryImageUrl: this.getPrimaryImageUrl(p.images ?? []),
            inventoryTotals: this.computeInventoryTotals(p.variants ?? []),
        };
    }

    private async ensureDefaultInventorySource(tx: TX) {
        let source = await tx.inventorySource.findFirst({ where: { name: 'Default Warehouse' } });
        if (!source) {
            source = await tx.inventorySource.create({
                data: { name: 'Default Warehouse', type: 'warehouse', active: true },
            });
        }
        return source;
    }

    private async ensureDefaultVariant(tx: TX, productId: string) {
        let variant = await tx.variant.findFirst({
            where: { productId, sku: { startsWith: 'SIMPLE-' } },
        });
        if (!variant) {
            const sku = `SIMPLE-${productId.slice(0, 8)}`;
            variant = await tx.variant.create({ data: { productId, sku } });
        }
        return variant;
    }

    private async setStock(tx: TX, productId: string, stock: number) {
        const variant = await this.ensureDefaultVariant(tx, productId);
        const source = await this.ensureDefaultInventorySource(tx);

        await tx.inventoryLevel.upsert({
            where: { variantId_sourceId: { variantId: variant.id, sourceId: source.id } },
            update: { stock },
            create: { variantId: variant.id, sourceId: source.id, stock, reserved: 0 },
        });
    }

    private async setPrimaryImage(tx: TX, productId: string, imageUrl: string) {
        await tx.productImage.updateMany({ where: { productId, is_primary: true }, data: { is_primary: false } });
        await tx.productImage.create({
            data: { productId, s3_key: imageUrl, is_primary: true, position: 0 },
        });
    }

    private guessExt(mime: string): string {
        if (mime.includes('png')) return '.png';
        if (mime.includes('webp')) return '.webp';
        if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
        return '.jpg';
    }

    /* ---------- S3 Presigned URLs ---------- */

    async createProductImagePresign(productId: string, filename: string, contentType: string) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new NotFoundException('Producto no encontrado');

        const okMime = /^image\/(png|jpe?g|webp)$/i.test(contentType);
        if (!okMime) throw new BadRequestException('Tipo MIME no permitido');

        const ext = path.extname(filename || '').toLowerCase() || this.guessExt(contentType);
        const uuid = randomUUID();
        const key = `products/${productId}/${uuid}${ext}`;

        const MAX_BYTES = 6 * 1024 * 1024; // 6 MB

        const presign = await createPresignedPost(this.s3, {
            Bucket: this.bucket,
            Key: key,
            Conditions: [
                ['content-length-range', 1, MAX_BYTES],
                ['starts-with', '$Content-Type', 'image/'],
            ],
            Fields: {
                'Content-Type': contentType,
            },
            Expires: 600, // 10 min
        });

        const publicUrl = this.publicBaseS3
            ? `${this.publicBaseS3}/${key}`
            : `https://${this.bucket}.s3.${this.config.get('AWS_REGION')}.amazonaws.com/${key}`;

        return {
            message: 'URL prefirmada creada',
            key,
            upload: presign,
            public_url: publicUrl,
            max_bytes: MAX_BYTES,
            allowed_mime: ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'],
        };
    }

    async addImageFromS3(productId: string, keyOrUrl: string) {
        const product = await this.prisma.product.findUnique({ where: { id: productId } });
        if (!product) throw new NotFoundException('Producto no encontrado');

        let publicUrl = keyOrUrl;
        if (!/^https?:\/\//i.test(keyOrUrl)) {
            if (!this.publicBaseS3) {
                throw new BadRequestException('PUBLIC_BASE_S3 no está configurado');
            }
            publicUrl = `${this.publicBaseS3}/${keyOrUrl.replace(/^\/+/, '')}`;
        }

        await this.prisma.$transaction(async (tx) => {
            await this.setPrimaryImage(tx, productId, publicUrl);
        });

        const updated = await this.prisma.product.findUnique({
            where: { id: productId },
            include: {
                images: { orderBy: { position: 'asc' } },
                variants: { include: { levels: true } },
                categories: { include: { category: true } },
            },
        });

        return {
            message: 'Imagen añadida exitosamente',
            product: this.mapProduct(updated),
        };
    }

    /* ---------- CRUD ---------- */

    async create(dto: CreateProductDto) {
        const {
            title, slug, description, price_clp, type,
            active = true, stock, imageUrl,
        } = dto;

        const finalSlug = slug || this.generateSlug(title);

        const exists = await this.prisma.product.findUnique({ where: { slug: finalSlug } });
        if (exists) throw new ConflictException('Ya existe un producto con este slug');

        const product = await this.prisma.$transaction(async (tx) => {
            const created = await tx.product.create({
                data: { title, slug: finalSlug, description, price_clp, type, active },
            });

            if (typeof stock === 'number') {
                await this.setStock(tx, created.id, stock);
            }

            if (imageUrl) {
                await this.setPrimaryImage(tx, created.id, imageUrl);
            }

            const full = await tx.product.findUnique({
                where: { id: created.id },
                include: {
                    images: { orderBy: { position: 'asc' } },
                    variants: { include: { levels: true } },
                    categories: { include: { category: true } },
                },
            });

            return full!;
        });

        return { message: 'Producto creado exitosamente', product: this.mapProduct(product) };
    }

    async findAll(includeInactive = false) {
        const products = await this.prisma.product.findMany({
            where: includeInactive ? {} : { active: true },
            include: {
                images: { where: { is_primary: true }, take: 1 },
                variants: { include: { levels: true }, take: 5 },
                categories: { include: { category: true } },
            },
            orderBy: { createdAt: 'desc' },
        });

        return {
            message: 'Productos obtenidos exitosamente',
            products: products.map((p) => this.mapProduct(p)),
            total: products.length,
        };
    }

    async findOne(id: string) {
        const p = await this.prisma.product.findUnique({
            where: { id },
            include: {
                images: { orderBy: { position: 'asc' } },
                variants: { include: { levels: true } },
                categories: { include: { category: true } },
                digitalAssets: true,
            },
        });
        if (!p) throw new NotFoundException('Producto no encontrado');
        return { message: 'Producto obtenido exitosamente', product: this.mapProduct(p) };
    }

    async findBySlug(slug: string) {
        const p = await this.prisma.product.findUnique({
            where: { slug },
            include: {
                images: { orderBy: { position: 'asc' } },
                variants: { include: { levels: true } },
                categories: { include: { category: true } },
                digitalAssets: true,
            },
        });
        if (!p || !p.active) throw new NotFoundException('Producto no encontrado');
        return { message: 'Producto obtenido exitosamente', product: this.mapProduct(p) };
    }

    async update(id: string, dto: UpdateProductDto) {
        const exists = await this.prisma.product.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException('Producto no encontrado');

        if (dto.slug && dto.slug !== exists.slug) {
            const other = await this.prisma.product.findUnique({ where: { slug: dto.slug } });
            if (other) throw new ConflictException('Ya existe un producto con este slug');
        }
        if (dto.title && !dto.slug) {
            dto.slug = this.generateSlug(dto.title);
        }

        const { stock, imageUrl, ...data } = dto;

        const updated = await this.prisma.$transaction(async (tx) => {
            const p = await tx.product.update({ where: { id }, data });

            if (typeof stock === 'number') {
                await this.setStock(tx, id, stock);
            }
            if (imageUrl) {
                await this.setPrimaryImage(tx, id, imageUrl);
            }

            const full = await tx.product.findUnique({
                where: { id: p.id },
                include: {
                    images: { orderBy: { position: 'asc' } },
                    variants: { include: { levels: true } },
                    categories: { include: { category: true } },
                },
            });
            return full!;
        });

        return { message: 'Producto actualizado exitosamente', product: this.mapProduct(updated) };
    }

    async remove(id: string) {
        const exists = await this.prisma.product.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException('Producto no encontrado');

        const p = await this.prisma.product.update({ where: { id }, data: { active: false } });
        return { message: 'Producto eliminado exitosamente', product: p };
    }

    async hardDelete(id: string) {
        const exists = await this.prisma.product.findUnique({ where: { id } });
        if (!exists) throw new NotFoundException('Producto no encontrado');
        await this.prisma.product.delete({ where: { id } });
        return { message: 'Producto eliminado permanentemente' };
    }
}