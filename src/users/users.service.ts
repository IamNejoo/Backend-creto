import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { randomUUID } from 'crypto';
import * as path from 'path';

@Injectable()
export class UsersService {
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

    async getMe(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                role: true,
                phone: true,
                createdAt: true,
                name: true,
                lastname: true,
                avatarUrl: true,
            },
        });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        return { user };
    }

    async updateMe(userId: string, dto: UpdateProfileDto) {
        const user = await this.prisma.user.update({
            where: { id: userId },
            data: dto,
            select: {
                id: true,
                email: true,
                role: true,
                phone: true,
                createdAt: true,
                name: true,
                lastname: true,
                avatarUrl: true,
            },
        });

        return {
            message: 'Perfil actualizado',
            user,
        };
    }

    async createAvatarPresign(userId: string, filename: string, contentType: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        const okMime = /^image\/(png|jpe?g|webp)$/i.test(contentType);
        if (!okMime) throw new BadRequestException('Tipo MIME no permitido');

        const ext = path.extname(filename || '').toLowerCase() || this.guessExt(contentType);
        const uuid = randomUUID();
        const key = `avatars/${userId}/${uuid}${ext}`;

        const MAX_BYTES = 2 * 1024 * 1024; // 2 MB

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

    async updateAvatarFromS3(userId: string, keyOrUrl: string) {
        let publicUrl = keyOrUrl;

        if (!/^https?:\/\//i.test(keyOrUrl)) {
            if (!this.publicBaseS3) {
                throw new BadRequestException('PUBLIC_BASE_S3 no está configurado');
            }
            publicUrl = `${this.publicBaseS3}/${keyOrUrl.replace(/^\/+/, '')}`;
        }

        const user = await this.prisma.user.update({
            where: { id: userId },
            data: { avatarUrl: publicUrl },
            select: {
                id: true,
                email: true,
                role: true,
                phone: true,
                createdAt: true,
                name: true,
                lastname: true,
                avatarUrl: true,
            },
        });

        return {
            message: 'Avatar actualizado',
            user,
        };
    }
    // backend/src/users/users.service.ts
    // AGREGAR después del método updateAvatarFromS3

    async getAll() {
        const users = await this.prisma.user.findMany({
            select: {
                id: true,
                email: true,
                role: true,
                name: true,
                lastname: true,
                phone: true,
                avatarUrl: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
        });
        return { users };
    }

    async getById(id: string) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            select: {
                id: true,
                email: true,
                role: true,
                name: true,
                lastname: true,
                phone: true,
                avatarUrl: true,
                createdAt: true,
            },
        });
        if (!user) throw new NotFoundException('Usuario no encontrado');
        return { user };
    }

    async update(id: string, data: any) {
        const user = await this.prisma.user.update({
            where: { id },
            data: {
                role: data.role,
                name: data.name,
                lastname: data.lastname,
                phone: data.phone,
            },
            select: {
                id: true,
                email: true,
                role: true,
                name: true,
                lastname: true,
                phone: true,
                avatarUrl: true,
                createdAt: true,
            },
        });
        return { user };
    }

    async delete(id: string) {
        await this.prisma.user.delete({ where: { id } });
        return { message: 'Usuario eliminado' };
    }
    private guessExt(mime: string): string {
        if (mime.includes('png')) return '.png';
        if (mime.includes('webp')) return '.webp';
        if (mime.includes('jpeg') || mime.includes('jpg')) return '.jpg';
        return '.jpg';
    }
}