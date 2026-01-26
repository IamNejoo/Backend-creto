import { IsString, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateVariantDto {
    @IsOptional() @IsString() sku?: string;
    @IsOptional() @IsString() size?: string;
    @IsOptional() @IsString() color?: string;
    @IsOptional() @IsInt() @Min(0) extra_price?: number;

    @IsOptional() @IsInt() @Min(0) weight_g?: number;
    @IsOptional() @IsInt() @Min(0) dim_l?: number;
    @IsOptional() @IsInt() @Min(0) dim_w?: number;
    @IsOptional() @IsInt() @Min(0) dim_h?: number;
}
