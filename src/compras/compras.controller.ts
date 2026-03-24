import { Controller, Post, Get, Param, Body, UseGuards } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { CreateCompraDto } from './dto/create-compra.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard)
@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCompraDto) {
    return this.comprasService.create(user.sub, dto);
  }

  @Get('mis-compras')
  findMisCompras(@CurrentUser() user: JwtPayload) {
    return this.comprasService.findMisCompras(user.sub);
  }

  // IMPORTANTE: 'mis-compras' ANTES de ':id' para evitar conflicto de rutas
  @Get(':id')
  findOne(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.comprasService.findOne(id, user.sub);
  }
}
