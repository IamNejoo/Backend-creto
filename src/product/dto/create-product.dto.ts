import { IsString, IsInt, IsEnum, IsOptional, IsBoolean, Min, IsUrl } from 'class-validator';
import { ProductType } from '@prisma/client';

export class CreateProductDto {
    @IsString()
    title: string;

    @IsString()
    @IsOptional()
    slug?: string;

    @IsString()
    description: string;

    @IsInt()
    @Min(0)
    price_clp: number;

    @IsEnum(ProductType)
    type: ProductType;

    @IsBoolean()
    @IsOptional()
    active?: boolean = true;

    /** Cantidad inicial (opcional). Si lo envías, se creará un Variant + InventoryLevel por defecto */
    @IsInt()
    @Min(0)
    @IsOptional()
    stock?: number;

    /** Imagen principal (URL pública). Se guardará como ProductImage (is_primary=true). */
    @IsUrl({ require_tld: false })
    @IsOptional()
    imageUrl?: string;
}
