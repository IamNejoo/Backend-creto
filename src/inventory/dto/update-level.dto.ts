import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateLevelDto {
    @IsOptional()
    @IsInt()
    @Min(0)
    stock?: number;

    @IsOptional()
    @IsInt()
    @Min(0)
    reserved?: number;
}
