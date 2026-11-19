import { Controller, Get, Param, Query, ParseUUIDPipe } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { QueryProductosDto } from './dto/query-productos.dto';

@Controller('productos')
export class ProductosController {
  constructor(private readonly productosService: ProductosService) {}

  @Get()
  findAll(@Query() query: QueryProductosDto) {
    return this.productosService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.productosService.findOne(id);
  }
}
