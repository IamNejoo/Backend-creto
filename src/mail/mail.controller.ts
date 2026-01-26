import { Body, Controller, Post, Get } from '@nestjs/common';
import { MailService } from './mail.service';
import { PrismaService } from '../prisma/prisma.service';

@Controller('mail')
export class MailController {
    constructor(
        private readonly mailService: MailService,
        private readonly prisma: PrismaService
    ) { }

    // 1. Endpoint para llenar la lista de usuarios en el Frontend
    @Get('users')
    async getUsers() {
        return this.prisma.user.findMany({
            select: {
                email: true,
                name: true,
            },
            // NOTA: No usamos 'where' porque en tu schema el email es obligatorio (@unique)
        });
    }

    // 2. Endpoint para enviar el correo masivo
    @Post('broadcast')
    async sendBroadcast(
        @Body() body: { subject: string; content: string; recipients: string[]; sendToAll: boolean }
    ) {
        // Inicializamos como array vacío por seguridad
        let finalRecipients: string[] = body.recipients || [];

        // Si se seleccionó "Enviar a todos", ignoramos la lista manual y sacamos de la BD
        if (body.sendToAll) {
            const allUsers = await this.prisma.user.findMany({
                select: { email: true },
            });
            finalRecipients = allUsers.map(u => u.email);
        }

        // Filtro de seguridad: Eliminar duplicados y nulos antes de pasar al servicio
        // Esto evita errores si la BD tuviera datos sucios o el frontend enviara dobles
        finalRecipients = [...new Set(finalRecipients)].filter(email => email && email.includes('@'));

        return this.mailService.sendBroadcastEmail(
            finalRecipients,
            body.subject,
            body.content
        );
    }

    // 3. Endpoint para generar firma de subida a S3 (Imágenes del editor)
    @Post('images/presign')
    async presignImage(
        @Body() body: { filename: string; contentType: string }
    ) {
        return this.mailService.generatePresignedUpload(
            body.filename,
            body.contentType
        );
    }
}