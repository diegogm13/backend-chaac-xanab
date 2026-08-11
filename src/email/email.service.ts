import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface ContactMessage {
  name: string;
  email: string;
  subject: string;
  message: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly config: ConfigService) {}

  /** Crea el transporter SMTP de forma perezosa; nunca lanza si faltan credenciales. */
  private getTransporter(): nodemailer.Transporter | null {
    if (this.transporter) return this.transporter;

    const user = this.config.get<string>('GMAIL_USER');
    const pass = this.config.get<string>('GMAIL_APP_PASSWORD');
    if (!user || !pass) {
      this.logger.warn('GMAIL_USER/GMAIL_APP_PASSWORD no configurados — el envío de correos está deshabilitado');
      return null;
    }

    this.transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: { user, pass },
    });
    return this.transporter;
  }

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const transporter = this.getTransporter();
    const from = this.config.get<string>('GMAIL_USER');
    if (!transporter || !from) return;

    const frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:4200';
    const link = `${frontendUrl}/verify-email?token=${token}`;

    await transporter.sendMail({
      from:    `"Chaac Xanab" <${from}>`,
      to,
      subject: 'Confirma tu correo — Chaac Xanab',
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8" /></head>
        <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

                <!-- Header -->
                <tr>
                  <td style="background:#111;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:24px;letter-spacing:3px;text-transform:uppercase;">
                      CHAAC XANAB
                    </h1>
                  </td>
                </tr>

                <!-- Body -->
                <tr>
                  <td style="padding:40px 40px 32px;">
                    <h2 style="margin:0 0 16px;color:#111;font-size:20px;">Hola, ${name}</h2>
                    <p style="margin:0 0 24px;color:#444;line-height:1.6;font-size:15px;">
                      Gracias por registrarte en <strong>Chaac Xanab</strong>. Para activar tu cuenta
                      y empezar a comprar, confirma tu correo electrónico haciendo clic en el botón.
                    </p>

                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="center" style="padding:8px 0 32px;">
                          <a href="${link}"
                             style="display:inline-block;background:#111;color:#fff;text-decoration:none;
                                    padding:14px 36px;border-radius:4px;font-size:15px;font-weight:bold;
                                    letter-spacing:1px;text-transform:uppercase;">
                            Confirmar correo
                          </a>
                        </td>
                      </tr>
                    </table>

                    <p style="margin:0 0 8px;color:#888;font-size:13px;">
                      Este enlace expira en <strong>24 horas</strong>.
                    </p>
                    <p style="margin:0;color:#888;font-size:13px;">
                      Si no creaste esta cuenta, ignora este mensaje.
                    </p>
                  </td>
                </tr>

                <!-- Footer -->
                <tr>
                  <td style="background:#f9f9f9;padding:20px 40px;border-top:1px solid #eee;">
                    <p style="margin:0;color:#bbb;font-size:12px;text-align:center;">
                      © 2026 Chaac Xanab — México
                    </p>
                  </td>
                </tr>

              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
  }

  /** Envía el mensaje del formulario de contacto a la bandeja de la tienda. Devuelve false si el correo no está configurado. */
  async sendContactMessage(msg: ContactMessage): Promise<boolean> {
    const transporter = this.getTransporter();
    const to = this.config.get<string>('GMAIL_USER');
    if (!transporter || !to) return false;

    // Escapamos el contenido que viene del visitante antes de insertarlo en el HTML del correo.
    const name    = this.escapeHtml(msg.name);
    const email   = this.escapeHtml(msg.email);
    const subject = this.escapeHtml(msg.subject);
    const message = this.escapeHtml(msg.message);

    try {
      await this.doSendContactMessage(transporter, to, msg, { name, email, subject, message });
      return true;
    } catch (err) {
      // Gmail rechazó el envío (credenciales inválidas, 2FA incompleto, etc.) —
      // no dejamos que tumbe la petición con un 500 crudo.
      this.logger.error(`No se pudo enviar el correo de contacto: ${(err as Error).message}`);
      return false;
    }
  }

  private async doSendContactMessage(
    transporter: nodemailer.Transporter,
    to: string,
    msg: ContactMessage,
    escaped: { name: string; email: string; subject: string; message: string },
  ): Promise<void> {
    const { name, email, subject, message } = escaped;

    await transporter.sendMail({
      from:    `"Formulario de contacto — Chaac Xanab" <${to}>`,
      to,
      replyTo: msg.email,
      subject: `[Contacto] ${msg.subject}`,
      html: `
        <!DOCTYPE html>
        <html lang="es">
        <head><meta charset="UTF-8" /></head>
        <body style="margin:0;padding:0;background:#f5f5f5;font-family:Arial,sans-serif;">
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:40px 0;">
            <tr><td align="center">
              <table width="560" cellpadding="0" cellspacing="0"
                     style="background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
                <tr>
                  <td style="background:#111;padding:32px 40px;text-align:center;">
                    <h1 style="margin:0;color:#fff;font-size:24px;letter-spacing:3px;text-transform:uppercase;">
                      CHAAC XANAB
                    </h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:40px;">
                    <h2 style="margin:0 0 16px;color:#111;font-size:18px;">Nuevo mensaje de contacto</h2>
                    <p style="margin:0 0 8px;color:#444;font-size:14px;"><strong>Nombre:</strong> ${name}</p>
                    <p style="margin:0 0 8px;color:#444;font-size:14px;"><strong>Correo:</strong> ${email}</p>
                    <p style="margin:0 0 16px;color:#444;font-size:14px;"><strong>Asunto:</strong> ${subject}</p>
                    <p style="margin:0 0 4px;color:#888;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Mensaje</p>
                    <p style="margin:0;color:#222;font-size:15px;line-height:1.6;white-space:pre-wrap;">${message}</p>
                  </td>
                </tr>
              </table>
            </td></tr>
          </table>
        </body>
        </html>
      `,
    });
  }

  private escapeHtml(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
