// src/auth/strategy/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from '../auth.service';
import { getJwtSecret } from '../../config/jwt-secret';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
    constructor(private authService: AuthService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: getJwtSecret(),
        });
    }

    async validate(payload: { sub: string; email: string }) {
        const user = await this.authService.validateUser(payload.sub);

        if (!user) {
            throw new UnauthorizedException('Token inválido');
        }

        return user;
    }
}