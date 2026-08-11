import { Controller, Get, Query } from '@nestjs/common';
import { BusquedaService } from './busqueda.service';
import { BuscarQueryDto } from './dto/buscar-query.dto';

@Controller('busqueda')
export class BusquedaController {
  constructor(private readonly busquedaService: BusquedaService) {}

  @Get()
  buscar(@Query() dto: BuscarQueryDto) {
    return this.busquedaService.buscar(dto.q);
  }
}
