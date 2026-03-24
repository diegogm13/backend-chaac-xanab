import { Controller, Get } from '@nestjs/common';
import { LinksExternosService } from './links-externos.service';

@Controller('links-externos')
export class LinksExternosController {
  constructor(private readonly linksExternosService: LinksExternosService) {}

  @Get()
  findAll() {
    return this.linksExternosService.findAll();
  }
}
