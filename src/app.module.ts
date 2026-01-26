import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AuthModule } from './auth/auth.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProductModule } from './product/product.module';
import { VariantModule } from './variant/variant.module';
import { InventoryModule } from './inventory/inventory.module';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { UsersModule } from './users/users.module';
import { RaffleModule } from './raffle/raffle.module';
import { ScheduleModule } from '@nestjs/schedule';
import { PaymentsModule } from './payments/payments.module';
import { OrdersModule } from './orders/orders.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AccountModule } from './account/account.module';
import { CouponsModule } from './coupons/coupons.module';
import { MailModule } from './mail/mail.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      {
        name: 'short',
        ttl: 1000,      // 1 segundo
        limit: 30,      // 30 requests por segundo
      },
      {
        name: 'medium',
        ttl: 10000,     // 10 segundos
        limit: 100,     // 100 requests por 10 segundos
      },
      {
        name: 'long',
        ttl: 60000,     // 1 minuto  
        limit: 300,     // 300 requests por minuto
      },
    ]),

    // Módulos de infraestructura y negocio
    PrismaModule,
    AuthModule,
    MailModule,
    CouponsModule,
    ProductModule,
    VariantModule,
    InventoryModule,
    UsersModule,
    RaffleModule,
    ScheduleModule.forRoot(),
    PaymentsModule,
    OrdersModule,
    DashboardModule,
    AccountModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule { }