import { IsDateString, IsInt, IsNotEmpty, IsString, Min } from 'class-validator';

export class CreateRaffleDto {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsInt()
    @Min(1)
    ticket_price_clp: number;

    @IsInt()
    @Min(1)
    total_tickets: number;

    @IsDateString()
    starts_at: string;

    @IsDateString()
    ends_at: string;
}
