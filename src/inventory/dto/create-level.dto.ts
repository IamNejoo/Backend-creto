import { IsInt, IsString, Min } from 'class-validator';

export class CreateLevelDto {
    @IsString() variantId: string;
    @IsString() sourceId: string;
    @IsInt() @Min(0) stock: number;
}
