import { Controller, Get, Post, Put, Param, Body, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service';
import { CreateRoleDto, UpdateRolePermisosDto } from './dto/roles.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/roles')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAll();
  }

  @Post()
  create(@Body() dto: CreateRoleDto) {
    return this.rolesService.create(dto);
  }

  @Get(':id/permisos')
  findPermisos(@Param('id') id: string) {
    return this.rolesService.findPermisosByRole(id);
  }

  @Put(':id/permisos')
  updatePermisos(@Param('id') id: string, @Body() dto: UpdateRolePermisosDto) {
    return this.rolesService.updateRolePermisos(id, dto);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/permisos')
export class PermisosController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  findAll() {
    return this.rolesService.findAllPermisos();
  }
}
