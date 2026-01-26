import {
    Body, Controller, Post, Param, UseGuards, Query, Res, Logger, HttpCode, HttpStatus, Get
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/guard/jwt-auth.guard';
import { GetUser } from '../auth/decorator/get-user.decorator';
import { CreateCheckoutDto } from './dto/create-checkout.dto';
import type { Response } from 'express';

@Controller('payments')
export class PaymentsController {
    private readonly logger = new Logger(PaymentsController.name);

    constructor(private readonly payments: PaymentsService) { }

    // --- CHECKOUT FLOW ---
    @UseGuards(JwtAuthGuard)
    @Post('raffles/:id/checkout-flow')
    async createFlowCheckout(
        @Param('id') raffleId: string,
        @GetUser('id') userId: string,
        @Body() dto: CreateCheckoutDto,
    ) {
        return this.payments.createFlowRaffleCheckout(userId, raffleId, dto.quantity, dto.couponCode);
    }

    // --- CHECKOUT MERCADO PAGO (Genérico) ---
    @UseGuards(JwtAuthGuard)
    @Post('raffles/:id/checkout')
    async createMpCheckout(
        @Param('id') raffleId: string,
        @GetUser('id') userId: string,
        @Body() dto: CreateCheckoutDto,
    ) {
        // Redirige al servicio de Mercado Pago
        return this.payments.createMpRaffleCheckout(userId, raffleId, dto.quantity, dto.couponCode);
    }

    // --- WEBHOOKS (Ambos responden 200 OK siempre) ---

    @Post('flow/webhook')
    @HttpCode(HttpStatus.OK)
    async flowWebhook(@Body() body: { token?: string }) {
        return this.payments.handleFlowWebhook(body);
    }

    @Post('mercadopago/webhook')
    @HttpCode(HttpStatus.OK)
    async mpWebhook(@Query() query: any, @Body() body: any) {
        // El middleware ya logueó todo, aquí solo procesamos
        return this.payments.handleMpWebhook(query, body);
    }

    // --- REDIRECCIONES MERCADO PAGO ---
    @Get('mercadopago/return')
    async mpReturn(@Query() query: any, @Res() res: Response) {
        const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
        const status = query.status;
        const paymentId = query.payment_id;

        if (status === 'success' || status === 'approved') {
            res.redirect(`${publicBase}/checkout/success?payment_id=${paymentId}`);
        } else if (status === 'failure') {
            res.redirect(`${publicBase}/checkout/failure`);
        } else {
            res.redirect(`${publicBase}/checkout/pending`);
        }
    }

    // --- REDIRECCIONES FLOW ---
    @Post('flow/return')
    async flowReturn(@Query('order_id') orderId: string, @Body('token') token: string, @Res() res: Response) {
        const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
        const status = await this.payments.checkFlowStatusRealTime(token, orderId);
        if (status === 'success') res.redirect(`${publicBase}/checkout/success?order_id=${orderId}`);
        else if (status === 'failure') res.redirect(`${publicBase}/checkout/failure?order_id=${orderId}`);
        else res.redirect(`${publicBase}/checkout/pending?order_id=${orderId}`);
    }

    @Post('flow/failure')
    async flowFailure(@Query('order_id') orderId: string, @Res() res: Response) {
        const publicBase = process.env.PUBLIC_BASE_URL || 'http://localhost:5173';
        res.redirect(`${publicBase}/checkout/failure?order_id=${orderId}`);
    }
}