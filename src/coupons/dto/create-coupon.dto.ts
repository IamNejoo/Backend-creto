import { IsString, IsInt, IsEnum, IsOptional, Min, IsDateString, IsNotEmpty } from 'class-validator';
import { DiscountType } from '@prisma/client';

export class CreateCouponDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsEnum(DiscountType)
    type: DiscountType; // 'percent' | 'amount'

    @IsInt()
    @Min(1)
    value: number;

    @IsInt()
    @Min(1)
    max_uses: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    min_subtotal?: number;

    @IsOptional()
    @IsDateString()
    starts_at?: string;

    @IsOptional()
    @IsDateString()
    ends_at?: string;
}

export class ValidateCouponDto {
    @IsString()
    @IsNotEmpty()
    code: string;

    @IsInt()
    @Min(0)
    subtotal: number;
}