import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';
import { ConfigService } from '@nestjs/config';
import { S3Client } from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class MailService {
  private resend: Resend | null = null;
  private readonly logger = new Logger(MailService.name);
  private fromEmail: string;
  private frontendUrl: string;

  // Variables S3
  private s3: S3Client;
  private bucket: string;
  private publicBaseS3: string;

  private mailEnabled = false;

  // --- Paleta CretoTV ---
  private readonly COLORS = {
    bg: '#0B0E14',
    card: '#13151A',
    cardAlt: '#1E2128',
    border: '#2A2D36',
    red: '#E50914',
    redGlow: 'rgba(229, 9, 20, 0.4)',
    redSoft: 'rgba(229, 9, 20, 0.1)',
    green: '#69BE28',
    greenGlow: 'rgba(105, 190, 40, 0.4)',
    yellow: '#DFFF00',
    white: '#FFFFFF',
    textPrimary: '#EEEEEE',
    textSecondary: '#AAAAAA',
    textMuted: '#666666',
  };

  constructor(private config: ConfigService) {
    const resendKey = this.config.get<string>('RESEND_API_KEY')?.trim();

    this.fromEmail = this.config.get<string>('EMAIL_FROM') || 'onboarding@resend.dev';
    this.frontendUrl = this.config.get<string>('PUBLIC_BASE_URL') || 'http://localhost:5173';

    if (resendKey) {
      this.resend = new Resend(resendKey);
      this.mailEnabled = true;
    } else {
      console.warn('[MailService] RESEND_API_KEY no configurada. Envío de correos DESHABILITADO.');
      this.resend = null;
      this.mailEnabled = false;
    }

    const region = this.config.get<string>('AWS_REGION');
    this.bucket = this.config.get<string>('S3_BUCKET') || '';
    this.publicBaseS3 = (this.config.get<string>('PUBLIC_BASE_S3') || '').replace(/\/+$/, '');

    this.s3 = new S3Client({
      region,
      credentials:
        this.config.get<string>('AWS_ACCESS_KEY_ID') && this.config.get<string>('AWS_SECRET_ACCESS_KEY')
          ? {
            accessKeyId: this.config.get<string>('AWS_ACCESS_KEY_ID')!,
            secretAccessKey: this.config.get<string>('AWS_SECRET_ACCESS_KEY')!,
          }
          : undefined,
    });
  }

  // =====================================================================
  // 1. CORREO DE RECUPERACIÓN DE CONTRASEÑA
  // =====================================================================
  async sendPasswordReset(email: string, token: string) {
    const resetLink = `${this.frontendUrl}/reset-password?token=${token}`;

    const html = this.getCretoTemplate(
      '🔐 Restablecer Contraseña',
      `
        <p>Hemos recibido una solicitud para restablecer la contraseña de tu cuenta en <strong style="color: ${this.COLORS.white};">CretoTV</strong>.</p>
        <p>Si no fuiste tú, ignora este mensaje. Si fuiste tú, pulsa el botón:</p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${resetLink}" style="background-color: ${this.COLORS.red}; color: ${this.COLORS.white}; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 15px; display: inline-block; box-shadow: 0 4px 20px ${this.COLORS.redGlow}; text-transform: uppercase; letter-spacing: 1px;">
            Restablecer Contraseña
          </a>
        </div>
        <p style="font-size: 12px; color: ${this.COLORS.textMuted};">O copia este enlace: <a href="${resetLink}" style="color: ${this.COLORS.red};">${resetLink}</a></p>
        <p style="font-size: 12px; color: ${this.COLORS.textMuted};">Este enlace expira en 1 hora.</p>
      `
    );

    await this.sendEmail(email, 'Recupera tu acceso a CretoTV 🔐', html);
  }

  // =====================================================================
  // 2. CORREO DE CONFIRMACIÓN DE COMPRA Y STICKERS
  // =====================================================================
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
      email: string;
      phone: string;
    }
  }) {
    const stickerList = orderData.tickets.map(t =>
      `<span style="display:inline-block; background:${this.COLORS.bg}; border:1px dashed ${this.COLORS.red}; color:${this.COLORS.red}; padding:6px 12px; margin:4px; border-radius:6px; font-family:'Courier New',monospace; font-weight:bold; font-size:14px; letter-spacing:0.5px;">
        Sticker-${String(t).padStart(4, '0')}
      </span>`
    ).join(' ');

    const productList = orderData.products.map(p =>
      `<li style="margin-bottom: 6px; color: ${this.COLORS.textPrimary}; padding: 4px 0;">${p}</li>`
    ).join('');

    const hasStickers = orderData.tickets.length > 0;

    const ticketIconUrl = "https://cretop-photos.s3.us-east-2.amazonaws.com/CretoTV+(2).png";

    const html = this.getCretoTemplate(
      '🎉 ¡Compra Confirmada!',
      `
        <p>Hola <strong style="color: ${this.COLORS.white};">${orderData.customerName}</strong>,</p>
        <p>Tu pago ha sido procesado correctamente. A continuación, el detalle de tu compra:</p>
        
        <!-- Resumen de orden -->
        <div style="background-color: ${this.COLORS.cardAlt}; border-left: 4px solid ${this.COLORS.red}; padding: 18px 20px; margin: 24px 0; border-radius: 0 10px 10px 0;">
            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                    <td align="left" valign="middle">
                        <p style="margin: 0; color: ${this.COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">Orden</p>
                        <p style="margin: 4px 0 0; font-size: 22px; font-weight: 900; color: ${this.COLORS.white}; font-family: 'Courier New', monospace;">#${orderData.orderNumber}</p>
                    </td>
                    <td align="right" valign="middle">
                        <p style="margin: 0; color: ${this.COLORS.textMuted}; font-size: 11px; text-transform: uppercase; font-weight: 700; letter-spacing: 1px;">📅 Fecha Sorteo</p>
                        <p style="margin: 4px 0 0; font-size: 17px; font-weight: 800; color: ${this.COLORS.red};">${orderData.raffleDate}</p>
                    </td>
                </tr>
            </table>
        </div>

        <!-- Stickers -->
        <h3 style="color: ${this.COLORS.white}; border-bottom: 1px solid ${this.COLORS.border}; padding-bottom: 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">
            ${hasStickers ? '🎫 Tus Stickers Asignados' : '📦 Detalle'}
        </h3>
        
        <div style="margin-bottom: 24px;">
          ${hasStickers
        ? `
               <div style="display: flex; align-items: center; justify-content: space-between; gap: 15px;">
                  <div style="flex: 1; display: flex; flex-wrap: wrap; gap: 5px;">
                    ${stickerList}
                  </div>
                  <div style="flex-shrink: 0;">
                    <img 
                      src="${ticketIconUrl}" 
                      alt="CretoTV" 
                      style="width: 110px; height: auto; object-fit: contain; border-radius: 10px; border: 1px solid ${this.COLORS.border};" 
                    />
                  </div>
               </div>
              `
        : `<p style="color: ${this.COLORS.textMuted}; font-style: italic;">Este pedido no incluye stickers de sorteo.</p>`
      }
        </div>

        <!-- Productos -->
        <h3 style="color: ${this.COLORS.white}; border-bottom: 1px solid ${this.COLORS.border}; padding-bottom: 10px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">📦 Resumen de Productos</h3>
        <ul style="color: ${this.COLORS.textSecondary}; padding-left: 20px; margin: 16px 0;">
          ${productList}
        </ul>
        
        <!-- Facturación -->
        <h3 style="color: ${this.COLORS.white}; border-bottom: 1px solid ${this.COLORS.border}; padding-bottom: 10px; margin-top: 30px; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">📄 Información de Facturación</h3>
        <div style="background-color: ${this.COLORS.bg}; padding: 18px; border-radius: 10px; font-size: 14px; color: ${this.COLORS.textSecondary}; border: 1px solid ${this.COLORS.border};">
            <table style="width: 100%; border-collapse: collapse;">
                <tr>
                    <td style="padding: 6px 0; color: ${this.COLORS.textMuted}; width: 120px; font-size: 12px; text-transform: uppercase;">Nombre:</td>
                    <td style="padding: 6px 0; font-weight: bold; color: ${this.COLORS.textPrimary};">${orderData.billing.name}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: ${this.COLORS.textMuted}; width: 120px; font-size: 12px; text-transform: uppercase;">Email:</td>
                    <td style="padding: 6px 0; font-weight: bold; color: ${this.COLORS.textPrimary};">${orderData.billing.email}</td>
                </tr>
                <tr>
                    <td style="padding: 6px 0; color: ${this.COLORS.textMuted}; font-size: 12px; text-transform: uppercase;">Teléfono:</td>
                    <td style="padding: 6px 0; color: ${this.COLORS.textPrimary};">${orderData.billing.phone}</td>
                </tr>
            </table>
        </div>

        <!-- Total -->
        <div style="text-align: right; margin-top: 24px; padding: 16px 20px; background: ${this.COLORS.cardAlt}; border-radius: 10px; border: 1px solid ${this.COLORS.border};">
            <span style="color: ${this.COLORS.textMuted}; font-size: 13px; text-transform: uppercase; letter-spacing: 1px;">Total Pagado</span>
            <p style="margin: 4px 0 0; font-size: 28px; font-weight: 900; color: ${this.COLORS.green}; letter-spacing: -1px;">$${orderData.total.toLocaleString('es-CL')}</p>
        </div>

        <!-- CTA -->
        <div style="text-align: center; margin-top: 30px;">
          <a href="${this.frontendUrl}/account/orders" style="background-color: ${this.COLORS.red}; color: ${this.COLORS.white}; padding: 14px 32px; border-radius: 10px; text-decoration: none; font-weight: 800; font-size: 14px; display: inline-block; box-shadow: 0 4px 20px ${this.COLORS.redGlow}; text-transform: uppercase; letter-spacing: 1px;">
            Ver Mis Pedidos
          </a>
        </div>
      `
    );

    await this.sendEmail(email, `Confirmación de Pedido #${orderData.orderNumber} 🎉`, html);
  }

  // =====================================================================
  // 3. CORREO MASIVO OPTIMIZADO (BATCH / LOTES)
  // =====================================================================
  async sendBroadcastEmail(recipients: string[], subject: string, contentHtml: string) {
    const html = this.getCretoTemplate(subject, contentHtml);

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return { success: 0, failed: 0, errors: ['No hay destinatarios'] };
    }

    const results = { success: 0, failed: 0, errors: [] as any[] };
    const chunkSize = 100;

    for (let i = 0; i < recipients.length; i += chunkSize) {
      const chunk = recipients.slice(i, i + chunkSize);

      const batchPayload = chunk.map(email => ({
        from: this.fromEmail,
        to: [email],
        subject: subject,
        html: html,
      }));

      try {
        if (!this.mailEnabled || !this.resend) {
          console.warn('[MailService] Batch email skipped: RESEND_API_KEY missing');
          return { skipped: true };
        }
        const { data, error } = await this.resend.batch.send(batchPayload);

        if (error) {
          throw new Error(error.message);
        }

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

      if (i + chunkSize < recipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    return results;
  }

  // =====================================================================
  // 4. GENERAR FIRMA S3
  // =====================================================================
  async generatePresignedUpload(filename: string, contentType: string) {
    const key = `mail-images/${uuidv4()}-${filename.replace(/\s+/g, '-')}`;
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

    const publicUrl = this.publicBaseS3
      ? `${this.publicBaseS3}/${key}`
      : `https://${this.bucket}.s3.${this.config.get('AWS_REGION')}.amazonaws.com/${key}`;

    return {
      upload: { url, fields },
      public_url: publicUrl,
      max_bytes: maxBytes,
    };
  }

  // =====================================================================
  // MÉTODO PRIVADO - ENVIAR EMAIL INDIVIDUAL
  // =====================================================================
  private async sendEmail(to: string, subject: string, html: string) {
    try {
      if (!this.mailEnabled || !this.resend) {
        console.warn('[MailService] Batch email skipped: RESEND_API_KEY missing');
        return { skipped: true };
      }
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

  // =====================================================================
  // PLANTILLA BASE CRETOTV (DARK + RED ACCENT)
  // =====================================================================
  private getCretoTemplate(title: string, content: string): string {
    const logoUrl = "https://cretop-photos.s3.us-east-2.amazonaws.com/CretoTV+(2).png";

    return `
      <!DOCTYPE html>
      <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
                img { max-width: 100% !important; height: auto !important; display: block; border-radius: 8px; margin: 10px 0; }
                .wrapper { width: 100%; table-layout: fixed; background-color: ${this.COLORS.bg}; padding: 20px 0 40px; }
                .main-box { background-color: ${this.COLORS.card}; margin: 0 auto; width: 100%; max-width: 600px; border: 1px solid ${this.COLORS.border}; border-radius: 16px; overflow: hidden; box-shadow: 0 0 60px ${this.COLORS.redSoft}; }
                .content-p { font-size: 15px; line-height: 1.7; color: ${this.COLORS.textSecondary}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
                .content-p p { margin: 0 0 12px; }
                .content-p strong { color: ${this.COLORS.white}; }
                .content-p a { color: ${this.COLORS.red}; }

                @media only screen and (max-width: 600px) {
                    .main-box { width: 100% !important; border-radius: 0 !important; border-left: none !important; border-right: none !important; }
                    .content-p { font-size: 14px !important; }
                    .padding-box { padding: 24px 18px !important; }
                }
            </style>
        </head>
        <body style="margin: 0; padding: 0; background-color: ${this.COLORS.bg};">
          <div class="wrapper">
            <div class="main-box">
                
                <!-- HEADER -->
                <div style="background-color: #000000; padding: 28px 30px; text-align: center; border-bottom: 3px solid ${this.COLORS.red};">
                    <table width="100%" cellpadding="0" cellspacing="0" border="0">
                        <tr>
                            <td align="center">
                                <img src="${logoUrl}" alt="CretoTV" style="height: 50px; width: auto; margin: 0 auto; border-radius: 0;" />
                            </td>
                        </tr>
                        <tr>
                            <td align="center" style="padding-top: 12px;">
                                <h2 style="color: ${this.COLORS.white}; margin: 0; text-transform: uppercase; letter-spacing: 5px; font-size: 22px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-weight: 900;">
                                    CRETO<span style="color: ${this.COLORS.red};">TV</span>
                                </h2>
                            </td>
                        </tr>
                    </table>
                </div>

                <!-- CONTENT -->
                <div class="padding-box" style="padding: 36px 30px;">
                    <h1 style="color: ${this.COLORS.white}; font-size: 22px; margin: 0 0 20px; text-transform: uppercase; font-weight: 900; letter-spacing: 0.5px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        ${title}
                    </h1>
                    
                    <div class="content-p">
                        ${content}
                    </div>
                </div>

                <!-- FOOTER -->
                <div style="background-color: ${this.COLORS.bg}; padding: 24px 30px; text-align: center; border-top: 1px solid ${this.COLORS.border};">
                    <p style="margin: 0 0 6px; font-size: 12px; color: ${this.COLORS.textMuted}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        © ${new Date().getFullYear()} CretoTV. Todos los derechos reservados.
                    </p>
                    <p style="margin: 0; font-size: 11px; color: ${this.COLORS.textMuted}; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
                        <a href="${this.frontendUrl}" style="color: ${this.COLORS.red}; text-decoration: none;">www.cretotv.cl</a>
                    </p>
                </div>

            </div>
          </div>
        </body>
      </html>
    `;
  }
}