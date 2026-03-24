import { Controller, Get, Patch, Param, Body, UseGuards, Query } from '@nestjs/common';
import { AdminComprasService } from './admin-compras.service';
import { UpdateCompraStatusDto, QueryComprasDto } from './dto/admin-compra.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/compras')
export class AdminComprasController {
  constructor(private readonly adminComprasService: AdminComprasService) {}

  @Get()
  findAll(@Query() query: QueryComprasDto) {
    return this.adminComprasService.findAll(query);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateCompraStatusDto) {
    return this.adminComprasService.updateStatus(id, dto);
  }
}
