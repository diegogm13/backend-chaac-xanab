import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host:   'smtp.gmail.com',
      port:   587,
      secure: false,
      auth: {
        user: this.config.getOrThrow('GMAIL_USER'),
        pass: this.config.getOrThrow('GMAIL_APP_PASSWORD'),
      },
    });
  }

  async sendVerificationEmail(to: string, name: string, token: string): Promise<void> {
    const frontendUrl = this.config.get('FRONTEND_URL') ?? 'http://localhost:4200';
    const link = `${frontendUrl}/verify-email?token=${token}`;

    await this.transporter.sendMail({
      from:    `"Chaac Xanab" <${this.config.getOrThrow('GMAIL_USER')}>`,
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
}
