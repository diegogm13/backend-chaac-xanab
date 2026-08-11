import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateRoleDto, UpdateRolePermisosDto } from './dto/roles.dto';

@Injectable()
export class RolesService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase.db
      .from('roles')
      .select('id, nombre, descripcion, created_at')
      .order('nombre', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async create(dto: CreateRoleDto) {
    const { data: existing } = await this.supabase.db
      .from('roles')
      .select('id')
      .eq('nombre', dto.nombre)
      .maybeSingle();

    if (existing) throw new ConflictException('Ya existe un rol con ese nombre');

    const { data, error } = await this.supabase.db
      .from('roles')
      .insert({ nombre: dto.nombre, descripcion: dto.descripcion })
      .select('id, nombre, descripcion, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async findAllPermisos() {
    const { data, error } = await this.supabase.db
      .from('permisos')
      .select('id, codigo, descripcion')
      .order('codigo', { ascending: true });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async findPermisosByRole(roleId: string) {
    await this.getRoleOrFail(roleId);

    const { data, error } = await this.supabase.db
      .from('roles_permisos')
      .select('permisos(id, codigo, descripcion)')
      .eq('role_id', roleId);

    if (error) throw new BadRequestException(error.message);
    return (data ?? []).map((row: { permisos: unknown }) => row.permisos);
  }

  async updateRolePermisos(roleId: string, dto: UpdateRolePermisosDto) {
    await this.getRoleOrFail(roleId);

    const { error: deleteError } = await this.supabase.db
      .from('roles_permisos')
      .delete()
      .eq('role_id', roleId);

    if (deleteError) throw new BadRequestException(deleteError.message);

    if (dto.permisoIds.length > 0) {
      const { error: insertError } = await this.supabase.db
        .from('roles_permisos')
        .insert(dto.permisoIds.map((permiso_id) => ({ role_id: roleId, permiso_id })));

      if (insertError) throw new BadRequestException(insertError.message);
    }

    return this.findPermisosByRole(roleId);
  }

  /** Usado por AdminUsuariosService para validar que un rol exista antes de asignarlo. */
  async roleExists(nombre: string): Promise<boolean> {
    const { data } = await this.supabase.db
      .from('roles')
      .select('id')
      .eq('nombre', nombre)
      .maybeSingle();

    return !!data;
  }

  private async getRoleOrFail(roleId: string) {
    const { data } = await this.supabase.db
      .from('roles')
      .select('id')
      .eq('id', roleId)
      .maybeSingle();

    if (!data) throw new NotFoundException('Rol no encontrado');
    return data;
  }
}
