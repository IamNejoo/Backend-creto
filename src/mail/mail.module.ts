import { Global, Module } from '@nestjs/common';
import { MailService } from './mail.service';
import { MailController } from './mail.controller'; // <--- IMPORTAR ESTO
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module'; // <--- IMPORTAR ESTO si no es global

@Global()
@Module({
    imports: [ConfigModule, PrismaModule], // Asegúrate que PrismaModule esté aquí si no es @Global
    controllers: [MailController],         // <--- AGREGAR ESTO
    providers: [MailService],
    exports: [MailService],
})
export class MailModule { }