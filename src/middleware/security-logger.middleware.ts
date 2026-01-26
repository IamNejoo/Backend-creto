// src/middleware/security-logger.middleware.ts
import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class SecurityLoggerMiddleware implements NestMiddleware {
    private readonly logger = new Logger('SecurityLogger');

    use(req: Request, res: Response, next: NextFunction) {
        const { method, originalUrl, ip } = req;
        const userAgent = req.get('User-Agent') || '';

        // Log requests sensibles
        if (originalUrl.includes('/auth/') || method !== 'GET') {
            this.logger.log(`${method} ${originalUrl} - IP: ${ip} - UA: ${userAgent}`);
        }

        // Detectar patrones sospechosos
        const suspiciousPatterns = [
            '/admin', '/.env', '/config', '/backup', '/database',
            'SELECT', 'UNION', 'DROP', 'DELETE', '<script>'
        ];

        if (suspiciousPatterns.some(pattern =>
            originalUrl.toLowerCase().includes(pattern.toLowerCase())
        )) {
            this.logger.warn(`⚠️  Actividad sospechosa detectada: ${method} ${originalUrl} desde ${ip}`);
        }

        next();
    }
}