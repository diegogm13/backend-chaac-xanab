import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from '../supabase/supabase.service';
import { RolesService } from '../roles/roles.service';
import { BitacoraService } from '../bitacora/bitacora.service';
import { UpdateRoleDto, CreateAdminUserDto, UpdateAdminUserDto, AdminChangePasswordDto } from './dto/admin-usuario.dto';

export interface ActorInfo {
  id: string;
  email: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AdminUsuariosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly roles: RolesService,
    private readonly bitacora: BitacoraService,
  ) {}

  async findAll() {
    const { data, error } = await this.supabase.db
      .from('usuarios')
      .select('id, name, email, role, activo, deleted_at, created_at')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async createUser(dto: CreateAdminUserDto, actor: ActorInfo) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (existing) throw new ConflictException('El correo ya está registrado');

    const role = dto.role ?? 'customer';
    if (!(await this.roles.roleExists(role))) {
      throw new BadRequestException(`El rol "${role}" no existe`);
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .insert({
        name: dto.name,
        email: dto.email.toLowerCase(),
        password_hash,
        role,
        email_verified: true,
      })
      .select('id, name, email, role, activo, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.bitacora.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: 'ALTA_USUARIO',
      detalle: `Usuario creado: ${data.email} (rol: ${data.role})`,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return data;
  }

  async updateUser(userId: string, dto: UpdateAdminUserDto, actor: ActorInfo) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id, email, role')
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    if (dto.email) {
      const { data: emailTaken } = await this.supabase.db
        .from('usuarios')
        .select('id')
        .eq('email', dto.email.toLowerCase())
        .neq('id', userId)
        .maybeSingle();
      if (emailTaken) throw new ConflictException('El correo ya está en uso');
    }

    if (dto.role && !(await this.roles.roleExists(dto.role))) {
      throw new BadRequestException(`El rol "${dto.role}" no existe`);
    }

    const updates: Record<string, string> = {};
    if (dto.name)  updates['name']  = dto.name;
    if (dto.email) updates['email'] = dto.email.toLowerCase();
    if (dto.role)  updates['role']  = dto.role;

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .update(updates)
      .eq('id', userId)
      .select('id, name, email, role, activo, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);

    if (dto.role && dto.role !== existing.role) {
      await this.bitacora.registrar({
        usuarioId: actor.id,
        usuarioEmail: actor.email,
        accion: 'CAMBIO_ROL',
        detalle: `Rol de ${existing.email} cambiado de "${existing.role}" a "${dto.role}"`,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    }

    return data;
  }

  async updateRole(userId: string, dto: UpdateRoleDto, actor: ActorInfo) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id, email, role')
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    if (!(await this.roles.roleExists(dto.role))) {
      throw new BadRequestException(`El rol "${dto.role}" no existe`);
    }

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .update({ role: dto.role })
      .eq('id', userId)
      .select('id, name, email, role')
      .single();

    if (error) throw new BadRequestException(error.message);

    if (dto.role !== existing.role) {
      await this.bitacora.registrar({
        usuarioId: actor.id,
        usuarioEmail: actor.email,
        accion: 'CAMBIO_ROL',
        detalle: `Rol de ${existing.email} cambiado de "${existing.role}" a "${dto.role}"`,
        ip: actor.ip,
        userAgent: actor.userAgent,
      });
    }

    return data;
  }

  async setEstado(userId: string, activo: boolean, actor: ActorInfo) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id, email')
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .update({ activo })
      .eq('id', userId)
      .select('id, name, email, role, activo')
      .single();

    if (error) throw new BadRequestException(error.message);

    await this.bitacora.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: activo ? 'ACTIVAR_USUARIO' : 'DESACTIVAR_USUARIO',
      detalle: `Usuario ${activo ? 'activado' : 'desactivado'}: ${existing.email}`,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return data;
  }

  /** Cambia la contraseña de un usuario desde el panel de administración (sin pedir la actual). */
  async changePassword(userId: string, dto: AdminChangePasswordDto, actor: ActorInfo) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    const password_hash = await bcrypt.hash(dto.newPassword, 10);

    const { error } = await this.supabase.db
      .from('usuarios')
      .update({ password_hash })
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);

    await this.bitacora.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: 'CAMBIO_PASSWORD',
      detalle: `Contraseña cambiada por un administrador para: ${existing.email}`,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  /** Eliminación PERMANENTE: borra el registro de la base de datos, no solo lo desactiva. */
  async deleteUser(userId: string, actor: ActorInfo) {
    if (userId === actor.id) {
      throw new BadRequestException('No puedes eliminar tu propia cuenta');
    }

    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    const { error } = await this.supabase.db
      .from('usuarios')
      .delete()
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);

    await this.bitacora.registrar({
      usuarioId: actor.id,
      usuarioEmail: actor.email,
      accion: 'BAJA_USUARIO',
      detalle: `Usuario eliminado permanentemente: ${existing.email}`,
      ip: actor.ip,
      userAgent: actor.userAgent,
    });

    return { message: 'Usuario eliminado permanentemente' };
  }
}
