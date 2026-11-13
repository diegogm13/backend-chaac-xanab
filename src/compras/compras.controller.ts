import {
  Controller, Post, Get, Param, Body, UseGuards, Headers, Query, Res,
  BadRequestException, ParseUUIDPipe,
} from '@nestjs/common';
import { Response } from 'express';
import { ComprasService } from './compras.service';
import { CreateCompraDto, MisComprasQueryDto } from './dto/create-compra.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@UseGuards(JwtAuthGuard)
@Controller('compras')
export class ComprasController {
  constructor(private readonly comprasService: ComprasService) {}

  /**
   * Idempotency-Key (opcional): el cliente la genera una vez por intento de compra y
   * la reenvía en los reintentos. Si ya existe, responde la compra original con
   * la cabecera Idempotent-Replayed: true y NO crea otra.
   */
  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateCompraDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (idempotencyKey !== undefined && !/^[A-Za-z0-9_-]{8,100}$/.test(idempotencyKey)) {
      throw new BadRequestException('Idempotency-Key inválida (8 a 100 caracteres alfanuméricos, - o _)');
    }
    const r = await this.comprasService.create(user.sub, dto, idempotencyKey);
    if (r.repetida) res.setHeader('Idempotent-Replayed', 'true');
    return r.compra;
  }

  @Get('mis-compras')
  findMisCompras(@CurrentUser() user: JwtPayload, @Query() q: MisComprasQueryDto) {
    return this.comprasService.findMisCompras(user.sub, q.limite, q.antes);
  }

  // IMPORTANTE: 'mis-compras' ANTES de ':id' para evitar conflicto de rutas
  @Get(':id')
  findOne(@Param('id', new ParseUUIDPipe()) id: string, @CurrentUser() user: JwtPayload) {
    return this.comprasService.findOne(id, user.sub);
  }
}
