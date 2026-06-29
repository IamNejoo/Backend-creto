import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { JwtStrategy } from './strategy/jwt.strategy';
import { ThrottlerModule } from '@nestjs/throttler';
import { getJwtSecret } from '../config/jwt-secret';

@Module({
  imports: [
    PrismaModule,
    PassportModule,
    ThrottlerModule.forRoot([{
        ttl: 60000,
        limit: 10,
    }]),
    JwtModule.register({
      global: true,
      secret: getJwtSecret(),
      signOptions: { expiresIn: '7d' },
    }),
  ],
  providers: [AuthService, JwtStrategy],
  controllers: [AuthController],
  exports: [AuthService],
})
export class AuthModule { }