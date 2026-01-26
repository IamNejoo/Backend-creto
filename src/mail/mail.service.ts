import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MailService {
  private resend: Resend;
  private readonly logger = new Logger(MailService.name);
  private fromEmail: string;
  private frontendUrl: string;

  // Variables S3
  private s3: S3Client;
  private bucket: string;
  private publicBaseS3: string;

  constructor(private config: ConfigService) {
    // 1. Configuración Resend
    this.resend = new Resend(this.config.get('RESEND_API_KEY'));
    this.fromEmail = this.config.get('EMAIL_FROM') || 'onboarding@resend.dev';
    this.frontendUrl = this.config.get('PUBLIC_BASE_URL') || 'http://localhost:5173';

    // 2. Configuración S3
    const region = this.config.get('AWS_REGION');
    this.bucket = this.config.get('S3_BUCKET') || '';
    this.publicBaseS3 = (this.config.get('PUBLIC_BASE_S3') || '').replace(/\/+$/, '');

    this.s3 = new S3Client({
      region,
      credentials: this.config.get('AWS_ACCESS_KEY_ID') && this.config.get('AWS_SECRET_ACCESS_KEY')
        ? {
          accessKeyId: this.config.get('AWS_ACCESS_KEY_ID')!,
          secretAccessKey: this.config.get('AWS_SECRET_ACCESS_KEY')!,
        }
        : undefined,
    });
  }

  // --- 1. CORREO DE RECUPERACIÓN DE CONTRASEÑA ---
  async sendPasswordReset(email: string, token: string) {
    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = this.getCyberpunkTemplate(
      'Restablecer Contraseña',
      `
        <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong>Nivem Corps</strong>.</p>
        <p>Si no fuiste tú, ignora este mensaje. Si fuiste tú, pulsa el botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: #00E5FF; color: #000000; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px; display: inline-block; box-shadow: 0 0 15px rgba(0, 229, 255, 0.4);">
            Restablecer Contraseña
          </a>
        </div>
        <p style="font-size: 12px; color: #666;">O copia este enlace: <a href="${resetLink}" style="color: #00E5FF;">${resetLink}</a></p>
        <p style="font-size: 12px; color: #666;">Este enlace expira en 1 hora.</p>
      `
    );

    await this.sendEmail(email, 'Recupera tu acceso a Nivem Corps 🔐', html);
  }

  // --- 2. CORREO DE CONFIRMACIÓN DE COMPRA Y STICKERS ---
  async sendOrderConfirmation(email: string, orderData: {
    orderNumber: string;
    customerName: string;
    tickets: number[];
    total: number;
    products: string[];
    raffleDate: string;
    billing: {
      name: string;
      rut: string;
      address: string;
      city: string;
      phone: string;
    }
  }) {
    // FORMATO NVM-0001
    const stickerList = orderData.tickets.map(t =>
      `<span style="display:inline-block; background:#1E2128; border:1px dashed #00E5FF; color:#00E5FF; padding:5px 10px; margin:4px; border-radius:4px; font-family:monospace; font-weight:bold; font-size: 14px;">
                Stickets-${String(t).padStart(4, '0')}
             </span>`
    ).join(' ');

    const productList = orderData.products.map(p => `<li style="margin-bottom: 5px;">${p}</li>`).join('');

    const hasStickers = orderData.tickets.length > 0;

    // URL estática de ejemplo (si tienes una variable para esto, mejor úsala)
    const ticketIconUrl = "https://nivem-ecommerce-assets-611773454107.s3.us-east-2.amazonaws.com/raffles/1+sticker.png";

    const html = this.getCyberpunkTemplate(
      '¡Misión Confirmada!',
      `
        <p>Hola <strong>${orderData.customerName}</strong>,</p>
        <p>Tu pago ha sido procesado correctamente. A continuación, el detalle de tu adquisición:</p>
        
        <div style="background-color: #1E2128; border-left: 4px solid #00E5FF; padding: 15px; margin: 20px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td align="left" valign="middle">
                        <p style="margin: 0; color: #aaa; font-size: 12px; text-transform: uppercase;">Orden</p>
                        <p style="margin: 0; font-size: 20px; font-weight: bold; color: #fff; font-family: monospace;">#${orderData.orderNumber}</p>
                    </td>
                    <td align="right" valign="middle">
                        <p style="margin: 0; color: #aaa; font-size: 12px; text-transform: uppercase;">📅 Fecha Sorteo</p>
                        <p style="margin: 0; font-size: 16px; font-weight: bold; color: #00E5FF;">${orderData.raffleDate}</p>
                    </td>
                </tr>
            </table>
        </div>

        <h3 style="color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px;">
            ${hasStickers ? '🎫 Tus Stickers Asignados' : '📦 Detalle'}
        </h3>
        
        <div style="margin-bottom: 20px;">
          ${hasStickers
        ? `
               <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                  <div style="flex: 1; display: flex; flex-wrap: wrap; gap: 5px;">
                    ${stickerList}
                  </div>
                  <div style="flex-shrink: 0;">
                    <img 
                      src="${ticketIconUrl}" 
                      alt="Ticket Icon" 
                      style="width: 120px; height: auto; object-fit: contain; border-radius: 8px; border: 1px solid #333;" 
                    />
                  </div>
               </div>
              `
        : '<p style="color: #666; font-style: italic;">Este pedido no incluye stickers de sorteo.</p>'
      }
        </div>

        <h3 style="color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px;">📦 Resumen de Productos</h3>
        <ul style="color: #ccc; padding-left: 20px;">
          ${productList}
        </ul>
        
        <h3 style="color: #fff; border-bottom: 1px solid #333; padding-bottom: 10px; margin-top: 30px;">📄 Información de Facturación</h3>
        <div style="background-color: #15171E; padding: 15px; border-radius: 6px; font-size: 14px; color: #cccccc; border: 1px solid #2A2D36;">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 5px 0; color: #888; width: 120px;">Nombre/Razón:</td>
                    <td style="padding: 5px 0; font-weight: bold;">${orderData.billing.name}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #888;">RUT:</td>
                    <td style="padding: 5px 0; font-weight: bold;">${orderData.billing.rut}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #888;">Dirección:</td>
                    <td style="padding: 5px 0;">${orderData.billing.address}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #888;">Ciudad:</td>
                    <td style="padding: 5px 0;">${orderData.billing.city}</td>
                </tr>
                <tr>
                    <td style="padding: 5px 0; color: #888;">Teléfono:</td>
                    <td style="padding: 5px 0;">${orderData.billing.phone}</td>
                </tr>
            </table>
        </div>

        <p style="text-align: right; font-size: 18px; margin-top: 20px;">Total Pagado: <strong style="color: #00E5FF;">$${orderData.total.toLocaleString('es-CL')}</strong></p>
      `
    );

    await this.sendEmail(email, `Confirmación de Pedido #${orderData.orderNumber} 🚀`, html);
  }

  // --- 3. CORREO MASIVO OPTIMIZADO (BATCH / LOTES) ---
  // Ideal para Plan Pro: Envía hasta 100 correos en una sola petición HTTP.
  async sendBroadcastEmail(recipients: string[], subject: string, contentHtml: string) {
    const html = this.getCyberpunkTemplate(subject, contentHtml);

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return { success: 0, failed: 0, errors: ['No hay destinatarios'] };
    }

    const results = { success: 0, failed: 0, errors: [] as any[] };

    // Dividimos la lista en lotes de 100 (Límite de Resend Batch)
    const chunkSize = 100;

    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);

      // Preparamos el array de objetos para Batch
      const batchPayload = chunk.map(email => ({
        from: this.fromEmail,
        to: [email],
        subject: subject,
        html: html,
      }));

      try {
        // Enviamos el lote completo (1 request = 100 correos)
        const { data, error } = await this.resend.batch.send(batchPayload);

        if (error) {
          throw new Error(error.message);
        }

        // Si data.data existe, significa que el lote fue aceptado
        if (data && data.data) {
          results.success += data.data.length;
        }

        this.logger.log(`Lote ${i / chunkSize + 1} enviado: ${chunk.length} correos.`);

      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        this.logger.error(`Error crítico en lote ${i}: ${msg}`);
        results.failed += chunk.length;
        results.errors.push({ batchIndex: i, error: msg });
      }

      // Pequeña pausa de seguridad (1 segundo) entre lotes para no saturar
      if (i + chunkSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // --- 4. GENERAR FIRMA S3 (15MB + URL CORRECTA) ---
  async generatePresignedUpload(filename: string, contentType: string) {
    const key = `mail-images/${uuidv4()}-${filename.replace(/\s+/g, '-')}`;

    // 🔥 LÍMITE 15MB
    const maxBytes = 15 * 1024 * 1024;

    const { url, fields } = await createPresignedPost(this.s3, {
      Bucket: this.bucket,
      Key: key,
      Conditions: [
        ['content-length-range', 0, maxBytes],
        ['starts-with', '$Content-Type', contentType.split('/')[0]],
      ],
      Fields: {
        'Content-Type': contentType,
      },
      Expires: 300,
    });

    // Construcción URL pública robusta
    const publicUrl = this.publicBaseS3
      ? `${this.publicBaseS3}/${key}`
      : `https://${this.bucket}.s3.${this.config.get('AWS_REGION')}.amazonaws.com/${key}`;

    return {
      upload: {
        url,
        fields,
      },
      public_url: publicUrl,
      max_bytes: maxBytes,
    };
  }

  // --- MÉTODO PRIVADO GENÉRICO (Individual) ---
  private async sendEmail(to: string, subject: string, html: string) {
    try {
      const response = await this.resend.emails.send({
        from: this.fromEmail,
        to: [to],
        subject: subject,
        html: html,
      });

      if (response.error) {
        this.logger.error(`Error Resend: ${response.error.message}`);
        return null;
      }

      this.logger.log(`Correo enviado a ${to} | ID: ${response.data?.id}`);
      return response.data;

    } catch (error) {
      this.logger.error(`Fallo crítico enviando correo a ${to}`, error);
      return null;
    }
  }

  // --- PLANTILLA BASE CYBERPUNK (RESPONSIVE FIX) ---
  private getCyberpunkTemplate(title: string, content: string): string {
    return `
      <!DOCTYPE html>
      <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                /* ESTILOS CRÍTICOS PARA MÓVIL */
                img { max-width: 100% !important; height: auto !important; display: block; border-radius: 8px; margin: 10px 0; }
                .wrapper { width: 100%; table-layout: fixed; background-color: #0B0E14; padding-bottom: 40px; }
                .main-box { background-color: #13151A; margin: 0 auto; width: 100%; max-width: 600px; border: 1px solid #2A2D36; border-radius: 16px; overflow: hidden; box-shadow: 0 0 50px rgba(0, 229, 255, 0.1); }
                .content-p { font-size: 16px; line-height: 1.6; color: #cccccc; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; }
                
                @media only screen and (max-width: 600px) {
                    .main-box { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
                    .content-p { font-size: 14px !important; }
                    .padding-box { padding: 20px !important; }
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: #0B0E14;">
          
          <div class="wrapper">
            <div style="padding: 20px 0;">
                <div class="main-box">
                    
                    <div style="background-color: #000000; padding: 30px; text-align: center; border-bottom: 2px solid #00E5FF;">
                        <h2 style="color: #ffffff; margin: 0; text-transform: uppercase; letter-spacing: 6px; font-size: 24px; font-family: sans-serif;">NIVEM<span style="color: #00E5FF;">CORPS</span></h2>
                    </div>

                    <div class="padding-box" style="padding: 40px 30px;">
                        <h1 style="color: #00E5FF; font-size: 22px; margin-top: 0; text-transform: uppercase; text-shadow: 0 0 10px rgba(0, 229, 255, 0.3); margin-bottom: 20px; font-family: sans-serif;">${title}</h1>
                        
                        <div class="content-p">
                            ${content}
                        </div>
                    </div>

                    <div style="background-color: #0B0E14; padding: 20px; text-align: center; border-top: 1px solid #2A2D36; color: #666; font-family: sans-serif;">
                        <p style="margin: 5px 0; font-size: 12px;">© 2025 Nivem Corps.</p>
                        <p style="margin: 5px 0; font-size: 12px;">Acceso concedido. Protocolo NVM-Secure.</p>
                    </div>

                </div>
            </div>
          </div>

        </body>
      </html>
    `;
  }
}