// backend/src/orders/dto/create-order.dto.ts
import { IsArray, IsOptional, IsString, IsInt, Min, ValidateNested, IsNotEmpty } from 'class-validator';
import { Type } from 'class-transformer';

export class ShippingAddressDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsNotEmpty()
    line1: string;

    @IsString()
    @IsOptional()
    line2?: string;

    @IsString()
    @IsNotEmpty()
    city: string;

    @IsString()
    @IsNotEmpty()
    region: string;

    @IsString()
    @IsOptional()
    country?: string;

    @IsString()
    @IsOptional()
    zip?: string;

    @IsString()
    @IsOptional()
    phone?: string;
}

export class OrderItemDto {
    @IsString()
    @IsOptional()
    variantId?: string;

    @IsString()
    @IsOptional()
    productId?: string;

    @IsInt()
    @Min(1)
    qty: number;
}

export class CreateOrderDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => OrderItemDto)
    items: OrderItemDto[];

    @IsString()
    @IsOptional()
    addressId?: string;

    @IsOptional()
    @ValidateNested()
    @Type(() => ShippingAddressDto)
    shipping?: ShippingAddressDto;

    @IsString()
    @IsOptional()
    couponCode?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}