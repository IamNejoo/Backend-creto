import { IsEmail, IsOptional, IsString, MinLength, IsUrl } from 'class-validator';

export class RegisterDto {
    @IsEmail()
    email: string;

    @IsString()
    @MinLength(6)
    password: string;

    @IsOptional()
    @IsString()
    phone?: string;

    // NUEVOS
    @IsOptional()
    @IsString()
    name?: string;

    @IsOptional()
    @IsString()
    lastname?: string;

    @IsOptional()
    @IsUrl({ require_tld: false })
    avatarUrl?: string;
}
