import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from './strategy/jwt.strategy';
import { ThrottlerModule } from '@nestjs/throttler'; // <-- NUEVO

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    // Configuración base para el Rate Limit en memoria
    ThrottlerModule.forRoot([{
        ttl: 60000,
        limit: 10, // Un limite general alto por si acaso
    }]),
    JwtModule.register({
      global: true,
      secret: process.env.JWT_SECRET || 'mi-super-secreto-jwt-2000',
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule { }