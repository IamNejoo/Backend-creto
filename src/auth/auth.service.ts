import {
    Injectable,
    ConflictException,
    UnauthorizedException,
    NotFoundException,
    BadRequestException,
    ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import * as argon2 from 'argon2';
import * as crypto from 'crypto';
import { OAuth2Client } from 'google-auth-library'; // <--- IMPORTANTE
import { MailService } from '../mail/mail.service';
@Injectable()
export class AuthService {
    // Inicializar cliente de Google con la variable de entorno
    private googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

    constructor(
        private prisma: PrismaService,
        private jwt: JwtService,
        private mailService: MailService,
    ) { }

    /* ------------------------------------------------------------------
     * GOOGLE LOGIN (NUEVO)
     * ------------------------------------------------------------------ */
    /* ------------------------------------------------------------------
         * GOOGLE LOGIN (CORREGIDO)
         * ------------------------------------------------------------------ */
    async googleLogin(token: string) {
        try {
            const ticket = await this.googleClient.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });

            const payload = ticket.getPayload();

            // CORRECCIÓN: Validar que el payload exista antes de usarlo
            if (!payload) {
                throw new UnauthorizedException('Token de Google inválido: sin payload');
            }

            // Ahora TypeScript sabe que payload no es undefined
            const { email, name, picture, sub, given_name, family_name } = payload;

            if (!email) {
                throw new UnauthorizedException('El token de Google no contiene un email');
            }

            let user = await this.prisma.user.findUnique({
                where: { email },
            });

            if (!user) {
                user = await this.prisma.user.create({
                    data: {
                        email,
                        name: given_name || name,
                        lastname: family_name || '',
                        avatarUrl: picture,
                        googleId: sub,
                        hash: null, // Si hiciste el paso 1, esto ya no dará error
                        role: 'user',
                    },
                });
            } else {
                // Si hiciste el paso 1, esto ya no dará error
                if (!user.googleId) {
                    user = await this.prisma.user.update({
                        where: { id: user.id },
                        data: {
                            googleId: sub,
                            avatarUrl: user.avatarUrl || picture
                        },
                    });
                }
            }

            const access_token = await this.signToken(user.id, user.email);

            return {
                message: 'Login con Google exitoso',
                user: {
                    id: user.id,
                    email: user.email,
                    phone: user.phone,
                    role: user.role,
                    // Usamos as any temporalmente si los tipos de User siguen molestando, 
                    // pero con npx prisma generate debería bastar.
                    name: user.name,
                    lastname: user.lastname,
                    avatarUrl: user.avatarUrl,
                    createdAt: user.createdAt,
                },
                access_token,
            };

        } catch (error) {
            console.error('Error Google Auth:', error);
            throw new UnauthorizedException('Token de Google inválido o expirado');
        }
    }
    /* ------------------------------------------------------------------
     * REGISTER
     * ------------------------------------------------------------------ */
    async register(dto: RegisterDto) {
        const { email, password, phone, name, lastname, avatarUrl } = dto as any;

        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing) throw new ConflictException('El usuario ya existe');

        const hash = await argon2.hash(password);

        const user = await this.prisma.user.create({
            data: { email, hash, phone, name, lastname, avatarUrl },
            select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                name: true,
                lastname: true,
                avatarUrl: true,
            },
        });

        const access_token = await this.signToken(user.id, user.email);
        return { message: 'Usuario registrado exitosamente', user, access_token };
    }

    /* ------------------------------------------------------------------
     * LOGIN
     * ------------------------------------------------------------------ */
    async login(loginDto: LoginDto) {
        const { email, password } = loginDto;

        const user = await this.prisma.user.findUnique({
            where: { email },
        });

        if (!user || !user.hash) {
            throw new UnauthorizedException('Credenciales inválidas');
        }

        const valid = await argon2.verify(user.hash, password);
        if (!valid) throw new UnauthorizedException('Credenciales inválidas');

        const token = await this.signToken(user.id, user.email);

        return {
            message: 'Login exitoso',
            user: {
                id: user.id,
                email: user.email,
                phone: user.phone,
                role: user.role,
                name: (user as any).name ?? null,
                lastname: (user as any).lastname ?? null,
                avatarUrl: (user as any).avatarUrl ?? null,
                createdAt: user.createdAt,
            },
            access_token: token,
        };
    }

    /* ------------------------------------------------------------------
     * PROFILE VALIDATION (JWT strategy)
     * ------------------------------------------------------------------ */
    async validateUser(userId: string) {
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                phone: true,
                role: true,
                createdAt: true,
                name: true,
                lastname: true,
                avatarUrl: true,
            },
        });
        return user;
    }

    /* ------------------------------------------------------------------
     * PASSWORD: CHANGE (autenticado)
     * ------------------------------------------------------------------ */
    async changePassword(userId: string, oldPassword: string, newPassword: string) {
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new NotFoundException('Usuario no encontrado');

        if (!user.hash) {
            throw new ForbiddenException('Esta cuenta utiliza inicio de sesión social (Google). Usa "Restablecer contraseña" si deseas asignar una contraseña manual.');
        }

        const ok = await argon2.verify(user.hash, oldPassword);
        if (!ok) throw new UnauthorizedException('Contraseña actual incorrecta');

        const newHash = await argon2.hash(newPassword);
        await this.prisma.user.update({
            where: { id: userId },
            data: { hash: newHash },
        });

        await this.prisma.passwordResetToken.updateMany({
            where: { userId, usedAt: null },
            data: { usedAt: new Date() },
        });

        return { message: 'Contraseña actualizada exitosamente' };
    }

    /* ------------------------------------------------------------------
     * PASSWORD: REQUEST RESET (público)
     * ------------------------------------------------------------------ */
    async requestPasswordReset(email: string) {
        const user = await this.prisma.user.findUnique({ where: { email } });

        const genericResponse = {
            message: 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.',
        };

        if (!user) return genericResponse;

        const rawToken = crypto.randomBytes(32).toString('hex');
        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
        await this.mailService.sendPasswordReset(user.email, rawToken);
        await this.prisma.passwordResetToken.updateMany({
            where: { userId: user.id, usedAt: null },
            data: { usedAt: new Date() },
        });

        await this.prisma.passwordResetToken.create({
            data: {
                userId: user.id,
                tokenHash,
                expiresAt,
            },
        });

        if (process.env.NODE_ENV !== 'production') {
            return {
                ...genericResponse,
                devToken: rawToken,
            };
        }

        return genericResponse;
    }

    /* ------------------------------------------------------------------
     * PASSWORD: RESET (público con token)
     * ------------------------------------------------------------------ */
    async resetPassword(rawToken: string, newPassword: string) {
        if (!rawToken || !newPassword) {
            throw new BadRequestException('Datos incompletos');
        }

        const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
        const record = await this.prisma.passwordResetToken.findFirst({
            where: {
                tokenHash,
                usedAt: null,
                expiresAt: { gt: new Date() },
            },
            include: { user: true },
        });

        if (!record || !record.user) {
            throw new UnauthorizedException('Token inválido o expirado');
        }

        const newHash = await argon2.hash(newPassword);

        await this.prisma.$transaction([
            this.prisma.user.update({
                where: { id: record.userId },
                data: { hash: newHash },
            }),
            this.prisma.passwordResetToken.update({
                where: { id: record.id },
                data: { usedAt: new Date() },
            }),
            this.prisma.passwordResetToken.updateMany({
                where: { userId: record.userId, usedAt: null },
                data: { usedAt: new Date() },
            }),
        ]);

        return { message: 'Contraseña restablecida correctamente' };
    }

    /* ------------------------------------------------------------------
     * REFRESH TOKEN
     * ------------------------------------------------------------------ */
    async refreshToken(userId: string) {
        const user = await this.validateUser(userId);
        if (!user) throw new UnauthorizedException('Usuario no encontrado');

        const token = await this.signToken(user.id, user.email);
        return { message: 'Token renovado exitosamente', access_token: token };
    }

    /* ------------------------------------------------------------------
     * JWT HELPER
     * ------------------------------------------------------------------ */
    private async signToken(userId: string, email: string): Promise<string> {
        const payload = { sub: userId, email };

        const secret = process.env.JWT_SECRET;
        if (!secret && process.env.NODE_ENV === 'production') {
            console.error("CRITICAL: JWT_SECRET is not set in production environment!");
        }

        return this.jwt.signAsync(payload, {
            expiresIn: '7d',
            secret: secret || 'mi-super-secreto-jwt-2000',
        });
    }
}