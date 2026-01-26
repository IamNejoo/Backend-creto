import { IsBoolean, IsDateString, IsInt, IsNotEmpty, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class CreateTierDto {
    @IsInt() @Min(1)
    quantity: number;

    @IsInt() @Min(0)
    price_clp: number;

    // opcionales (para gestión/UX)
    @IsOptional() @IsBoolean()
    active?: boolean;

    @IsOptional() @IsInt()
    sort?: number;

    @IsOptional() @IsDateString()
    starts_at?: string;

    @IsOptional() @IsDateString()
    ends_at?: string;

    @IsOptional() @IsString() @MinLength(1)
    label?: string;
}
