import { Body, Controller, Post } from '@nestjs/common';
import { ContactoService } from './contacto.service';
import { ContactoDto } from './dto/contacto.dto';

@Controller('contacto')
export class ContactoController {
  constructor(private readonly contactoService: ContactoService) {}

  @Post()
  enviar(@Body() dto: ContactoDto) {
    return this.contactoService.enviar(dto);
  }
}
