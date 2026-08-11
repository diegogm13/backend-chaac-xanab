import { Controller, Get, Post, Patch, Put, Delete, Param, Body, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AdminUsuariosService } from './admin-usuarios.service';
import { UpdateRoleDto, CreateAdminUserDto, UpdateAdminUserDto, UpdateEstadoDto, AdminChangePasswordDto } from './dto/admin-usuario.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { JwtPayload } from '../auth/strategies/jwt.strategy';
import { getClientIp } from '../common/get-client-ip';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/usuarios')
export class AdminUsuariosController {
  constructor(private readonly adminUsuariosService: AdminUsuariosService) {}

  @Get()
  findAll() {
    return this.adminUsuariosService.findAll();
  }

  @Post()
  createUser(@Body() dto: CreateAdminUserDto, @CurrentUser() admin: JwtPayload, @Req() req: Request) {
    return this.adminUsuariosService.createUser(dto, this.actorFrom(admin, req));
  }

  @Put(':id')
  updateUser(
    @Param('id') id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentUser() admin: JwtPayload,
    @Req() req: Request,
  ) {
    return this.adminUsuariosService.updateUser(id, dto, this.actorFrom(admin, req));
  }

  @Patch(':id/role')
  updateRole(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() admin: JwtPayload,
    @Req() req: Request,
  ) {
    return this.adminUsuariosService.updateRole(id, dto, this.actorFrom(admin, req));
  }

  @Patch(':id/estado')
  setEstado(
    @Param('id') id: string,
    @Body() dto: UpdateEstadoDto,
    @CurrentUser() admin: JwtPayload,
    @Req() req: Request,
  ) {
    return this.adminUsuariosService.setEstado(id, dto.activo, this.actorFrom(admin, req));
  }

  @Patch(':id/password')
  changePassword(
    @Param('id') id: string,
    @Body() dto: AdminChangePasswordDto,
    @CurrentUser() admin: JwtPayload,
    @Req() req: Request,
  ) {
    return this.adminUsuariosService.changePassword(id, dto, this.actorFrom(admin, req));
  }

  @Delete(':id')
  deleteUser(@Param('id') id: string, @CurrentUser() admin: JwtPayload, @Req() req: Request) {
    return this.adminUsuariosService.deleteUser(id, this.actorFrom(admin, req));
  }

  private actorFrom(admin: JwtPayload, req: Request) {
    return {
      id: admin.sub,
      email: admin.email,
      ip: getClientIp(req),
      userAgent: req.headers['user-agent'],
    };
  }
}
