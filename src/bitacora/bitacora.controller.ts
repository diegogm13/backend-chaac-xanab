import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { BitacoraService } from './bitacora.service';
import { BitacoraQueryDto } from './dto/bitacora-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/bitacora')
export class BitacoraController {
  constructor(private readonly bitacoraService: BitacoraService) {}

  @Get()
  findAll(@Query() query: BitacoraQueryDto) {
    return this.bitacoraService.findAll(query);
  }
}
