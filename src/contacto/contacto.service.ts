import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { EmailService } from '../email/email.service';
import { ContactoDto } from './dto/contacto.dto';

@Injectable()
export class ContactoService {
  private readonly logger = new Logger(ContactoService.name);

  constructor(private readonly emailService: EmailService) {}

  async enviar(dto: ContactoDto) {
    const enviado = await this.emailService.sendContactMessage({
      name:    dto.nombre,
      email:   dto.email,
      subject: dto.asunto,
      message: dto.mensaje,
    });

    if (!enviado) {
      this.logger.warn(
        `Mensaje de contacto de ${dto.email} no se pudo enviar (correo no configurado): "${dto.asunto}"`,
      );
      throw new ServiceUnavailableException(
        'No pudimos enviar tu mensaje en este momento. Intenta más tarde.',
      );
    }

    return { message: 'Mensaje recibido. Te responderemos pronto.' };
  }
}
