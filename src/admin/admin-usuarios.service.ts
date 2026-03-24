import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateRoleDto } from './dto/admin-usuario.dto';

@Injectable()
export class AdminUsuariosService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase.db
      .from('usuarios')
      .select('id, name, email, role, created_at')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async updateRole(userId: string, dto: UpdateRoleDto) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .update({ role: dto.role })
      .eq('id', userId)
      .select('id, name, email, role')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
