import { Type } from 'class-transformer';
import {
    IsArray,
    IsInt,
    IsOptional,
    IsString,
    Min,
    ValidateNested,
} from 'class-validator';

export class UpdateLevelItemDto {
    @IsString()
    sourceId: string;

    @IsInt()
    @Min(0)
    stock: number;

    // Reservas en bulk son opcionales; el front actual no las envía.
    @IsOptional()
    @IsInt()
    @Min(0)
    reserved?: number;
}

export class UpdateLevelsBulkDto {
    @IsString()
    variantId: string;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => UpdateLevelItemDto)
    updates: UpdateLevelItemDto[];
}
