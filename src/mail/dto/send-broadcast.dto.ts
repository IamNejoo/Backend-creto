import { IsString, IsArray, IsBoolean, IsOptional, IsNotEmpty } from 'class-validator';

export class SendBroadcastDto {
    @IsString()
    @IsNotEmpty()
    subject: string;

    @IsString()
    @IsNotEmpty()
    content: string; // Aquí vendrá el HTML del editor

    @IsArray()
    @IsOptional()
    recipients: string[]; // Array de correos electrónicos

    @IsBoolean()
    @IsOptional()
    sendToAll: boolean; // Flag para "Enviar a todos"
}