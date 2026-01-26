// backend/src/orders/dto/create-order.dto.ts
import { IsArray, IsNotEmpty, IsOptional, IsString, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class OrderItemDto {
    @IsString()
    @IsNotEmpty()
    variantId: string;

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

    @IsString()
    @IsOptional()
    couponCode?: string;

    @IsString()
    @IsOptional()
    notes?: string;
}