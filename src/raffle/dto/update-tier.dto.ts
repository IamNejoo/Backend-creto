import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateTierDto {
    @IsOptional() @IsInt() @Min(1)
    quantity?: number;

    @IsOptional() @IsInt() @Min(0)
    price_clp?: number;

    @IsOptional() @IsBoolean()
    active?: boolean;

    @IsOptional() @IsInt()
    sort?: number;

    @IsOptional() @IsDateString()
    starts_at?: string;

    @IsOptional() @IsDateString()
    ends_at?: string;

    @IsOptional() @IsString()
    label?: string;
}
