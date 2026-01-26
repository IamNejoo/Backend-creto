import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';
import { InventorySourceType } from '@prisma/client';


export class CreateSourceDto {
    @IsString() name: string;
    @IsEnum(InventorySourceType) type: InventorySourceType; // 'supplier' | 'warehouse'
    @IsOptional() @IsBoolean() active?: boolean = true;
}
