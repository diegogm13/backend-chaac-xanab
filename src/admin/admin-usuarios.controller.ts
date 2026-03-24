import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { AdminUsuariosService } from './admin-usuarios.service';
import { UpdateRoleDto } from './dto/admin-usuario.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/usuarios')
export class AdminUsuariosController {
  constructor(private readonly adminUsuariosService: AdminUsuariosService) {}

  @Get()
  findAll() {
    return this.adminUsuariosService.findAll();
  }

  @Patch(':id/role')
  updateRole(@Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.adminUsuariosService.updateRole(id, dto);
  }
}
