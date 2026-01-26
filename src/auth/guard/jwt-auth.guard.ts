// src/auth/guard/jwt-auth.guard.ts
import { Injectable, ExecutionContext, UnauthorizedException, Logger } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
    private readonly logger = new Logger(JwtAuthGuard.name);

    handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
        const request = context.switchToHttp().getRequest();

        if (err || !user) {
            const ip = request.ip || request.connection.remoteAddress;
            const userAgent = request.get('User-Agent');

            this.logger.warn(`Intento de acceso no autorizado desde IP: ${ip}, User-Agent: ${userAgent}`);

            throw err || new UnauthorizedException('Token inválido o expirado');
        }

        return user;
    }
}