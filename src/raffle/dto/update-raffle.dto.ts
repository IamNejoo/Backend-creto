import { IsDateString, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpdateRaffleDto {
    @IsOptional() @IsString() name?: string;
    @IsOptional() @IsInt() @Min(1) ticket_price_clp?: number;
    @IsOptional() @IsInt() @Min(1) total_tickets?: number;
    @IsOptional() @IsDateString() starts_at?: string;
    @IsOptional() @IsDateString() ends_at?: string;
}
