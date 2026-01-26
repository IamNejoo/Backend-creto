import { IsString, IsInt, IsEnum, IsOptional, IsBoolean, Min, IsUrl } from 'class-validator';
import { ProductType } from '@prisma/client';

export class UpdateProductDto {
    @IsString()
    @IsOptional()
    title?: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    @IsOptional()
    description?: string;

    @IsInt()
    @Min(0)
    @IsOptional()
    price_clp?: number;

    @IsEnum(ProductType)
    @IsOptional()
    type?: ProductType;

    @IsBoolean()
    @IsOptional()
    active?: boolean;

    /** Si lo envías, ajustamos el stock del “variant” por defecto */
    @IsInt()
    @Min(0)
    @IsOptional()
    stock?: number;

    /** Si lo envías, marcamos esta imagen como primaria */
    @IsUrl({ require_tld: false })
    @IsOptional()
    imageUrl?: string;
}
