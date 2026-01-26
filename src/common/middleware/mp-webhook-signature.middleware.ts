import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import * as crypto from 'crypto';

@Injectable()
export class MpWebhookSignatureMiddleware implements NestMiddleware {
    private readonly logger = new Logger(MpWebhookSignatureMiddleware.name);

    private tryParseBody(rawBody: Buffer | undefined): any | null {
        if (!rawBody || rawBody.length === 0) return null;
        try {
            return JSON.parse(rawBody.toString('utf-8'));
        } catch (e) {
            return null;
        }
    }

    use(req: Request & { rawBody?: Buffer }, _res: Response, next: NextFunction) {
        const secret = process.env.MP_WEBHOOK_SECRET?.trim();

        // Si no hay secreto, pasamos (Modo inseguro pero funcional)
        if (!secret) {
            return next();
        }

        const xSignature = req.headers['x-signature'] as string;
        const xRequestId = req.headers['x-request-id'] as string;

        // Si faltan headers, pasamos igual (para no bloquear pings de prueba)
        if (!xSignature || !xRequestId) {
            return next();
        }

        // Parsear headers
        const parts = xSignature.split(',').reduce((acc, part) => {
            const [key, value] = part.split('=');
            if (key && value) acc[key.trim()] = value.trim();
            return acc;
        }, {} as Record<string, string>);

        const ts = parts['ts'];
        const hashRaw = parts['v1'];

        // Convertir a minúsculas para comparar
        const hash = hashRaw ? hashRaw.toLowerCase() : null;

        // Extraer ID (Lógica tolerante a fallos)
        const parsedBody = this.tryParseBody(req.rawBody);
        let dataId = (req.query.id as string)?.trim();

        if (!dataId && parsedBody?.data?.id) dataId = parsedBody.data.id.toString();

        // Soporte para merchant_order y topics raros
        if (!dataId && parsedBody?.resource) {
            const matches = parsedBody.resource.match(/\/(\d+)$/);
            if (matches && matches[1]) dataId = matches[1];
        }

        // Si no encontramos ID, pasamos el control al Controller sin validar firma
        if (!dataId) {
            // No bloqueamos, solo avisamos
            // this.logger.warn(`⚠️ Webhook sin ID claro (Topic: ${req.query.topic || parsedBody?.topic}). Pasando al controlador.`);
            return next();
        }

        // Validación Matemática
        try {
            const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
            const hmac = crypto.createHmac('sha256', secret);
            hmac.update(manifest);
            const calculatedHash = hmac.digest('hex');

            if (calculatedHash !== hash) {
                // 🛑 ERROR DE FIRMA DETECTADO
                // Pero NO lanzamos excepción. Solo logueamos el error.
                this.logger.error(`❌ Firma inválida para ID ${dataId}. (Se permite el paso para no perder la venta)`);
                // this.logger.debug(`Esperado: ${hash} | Calculado: ${calculatedHash}`);
            } else {
                // ✅ Firma Correcta
                // this.logger.log(`✅ Firma verificada para ID ${dataId}`);
            }
        } catch (error) {
            this.logger.error('Error calculando firma (Pasando petición igual):', error);
        }

        // SIEMPRE PASAMOS AL CONTROLADOR
        return next();
    }
}