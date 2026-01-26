import { IsInt, IsNotEmpty, IsOptional, IsString, Min, Max } from 'class-validator';

export class CreateCheckoutDto {
    @IsInt()
    @Min(1, { message: 'Mínimo 1 ticket' })
    @Max(1000, { message: 'Máximo 1000 tickets por compra' })
    quantity: number;

    @IsOptional()
    @IsString()
    couponCode?: string;
}