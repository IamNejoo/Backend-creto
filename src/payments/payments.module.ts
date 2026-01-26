import { Module, MiddlewareConsumer, RequestMethod } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RaffleService } from '../raffle/raffle.service';
import { CouponsModule } from '../coupons/coupons.module';
import { MpWebhookSignatureMiddleware } from '../common/middleware/mp-webhook-signature.middleware'; // Ajusta la ruta

@Module({
    imports: [CouponsModule],
    controllers: [PaymentsController],
    providers: [PaymentsService, PrismaService, RaffleService],
    exports: [PaymentsService],
})
export class PaymentsModule {
    configure(consumer: MiddlewareConsumer) {
        consumer
            .apply(MpWebhookSignatureMiddleware)
            .forRoutes({ path: 'payments/mercadopago/webhook', method: RequestMethod.POST });
    }
}