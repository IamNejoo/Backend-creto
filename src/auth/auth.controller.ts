import {
    Body,
    Controller,
    Get,
    HttpCode,
    HttpStatus,
    Post,
    UseGuards,
    UsePipes,
    ValidationPipe,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { GoogleLoginDto } from './dto/google-login.dto'; // <--- IMPORTANTE: DTO NUEVO
import { JwtAuthGuard } from './guard/jwt-auth.guard';
import { GetUser } from './decorator/get-user.decorator';
import { IsEmail, IsString, MinLength } from 'class-validator';

// DTOs locales
class RequestResetDto {
    @IsEmail()
    email: string;
}

class ResetPasswordDto {
    @IsString()
    token: string;

    @IsString()
    @MinLength(8)
    newPassword: string;
}

class ChangePasswordDto {
    @IsString()
    oldPassword: string;

    @IsString()
    @MinLength(8)
    newPassword: string;
}

@UsePipes(
    new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
    }),
)
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) { }

    /**
     * LOGIN CON GOOGLE (NUEVO)
     * POST /auth/google
     */
    @Post('google')
    @HttpCode(HttpStatus.OK)
    async googleLogin(@Body() dto: GoogleLoginDto) {
        return this.authService.googleLogin(dto.token);
    }

    /**
     * REGISTRO
     * POST /auth/register
     */
    @Post('register')
    @HttpCode(HttpStatus.CREATED)
    async register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    /**
     * LOGIN
     * POST /auth/login
     */
    @Post('login')
    @HttpCode(HttpStatus.OK)
    async login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    /**
     * PERFIL AUTENTICADO
     * GET /auth/me
     */
    @UseGuards(JwtAuthGuard)
    @Get('me')
    @HttpCode(HttpStatus.OK)
    async me(@GetUser() user: any) {
        return { message: 'Perfil obtenido exitosamente', user };
    }

    /**
     * SOLICITAR RESETEO DE CONTRASEÑA
     * POST /auth/request-reset
     */
    @Post('request-reset')
    @HttpCode(HttpStatus.OK)
    async requestReset(@Body() dto: RequestResetDto) {
        return this.authService.requestPasswordReset(dto.email);
    }

    /**
     * COMPLETAR RESETEO DE CONTRASEÑA
     * POST /auth/reset-password
     */
    @Post('reset-password')
    @HttpCode(HttpStatus.OK)
    async resetPassword(@Body() dto: ResetPasswordDto) {
        return this.authService.resetPassword(dto.token, dto.newPassword);
    }

    /**
     * CAMBIAR CONTRASEÑA (usuario autenticado)
     * POST /auth/change-password
     */
    @UseGuards(JwtAuthGuard)
    @Post('change-password')
    @HttpCode(HttpStatus.OK)
    async changePassword(@GetUser() user: any, @Body() dto: ChangePasswordDto) {
        return this.authService.changePassword(user.id, dto.oldPassword, dto.newPassword);
    }

    /**
     * REFRESH TOKEN (opcional)
     * POST /auth/refresh
     */
    @UseGuards(JwtAuthGuard)
    @Post('refresh')
    @HttpCode(HttpStatus.OK)
    async refresh(@GetUser() user: any) {
        return this.authService.refreshToken(user.id);
    }
}