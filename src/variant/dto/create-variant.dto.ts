import { IsString, IsNotEmpty, IsOptional, IsNumber, Min } from 'class-validator';

export class CreateVariantDto {
    @IsString()
    @IsNotEmpty()
    productId: string;

    // Hacemos el SKU opcional, ya que lo generará el backend
    @IsOptional()
    @IsString()
    sku?: string;

    @IsOptional()
    @IsString()
    size?: string;

    @IsOptional()
    @IsString()
    color?: string;

    @IsOptional()
    @IsNumber()
    @Min(0)
    extra_price?: number;
}