import { IsOptional, IsString, Length, IsUrl } from 'class-validator';

export class UpdateProfileDto {
    @IsOptional()
    @IsString()
    @Length(2, 50)
    name?: string;

    @IsOptional()
    @IsString()
    @Length(2, 50)
    lastname?: string;

    /** Solo si decides permitir setear URL directa (por ahora el upload la setea) */
    @IsOptional()
    @IsUrl({ require_tld: false })
    avatarUrl?: string;

    @IsOptional()
    @IsString()
    @Length(5, 30)
    phone?: string;
}
