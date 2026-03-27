import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateRoleDto, CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-usuario.dto';

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

  async createUser(dto: CreateAdminUserDto) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (existing) throw new ConflictException('El correo ya está registrado');

    const password_hash = await bcrypt.hash(dto.password, 10);

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .insert({
        name: dto.name,
        email: dto.email.toLowerCase(),
        password_hash,
        role: dto.role ?? 'customer',
        email_verified: true,
      })
      .select('id, name, email, role, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async updateUser(userId: string, dto: UpdateAdminUserDto) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('id', userId)
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

    const updates: Record<string, string> = {};
    if (dto.name)  updates['name']  = dto.name;
    if (dto.email) updates['email'] = dto.email.toLowerCase();
    if (dto.role)  updates['role']  = dto.role;

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .update(updates)
      .eq('id', userId)
      .select('id, name, email, role, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
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

  async deleteUser(userId: string) {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Usuario no encontrado');

    const { error } = await this.supabase.db
      .from('usuarios')
      .delete()
      .eq('id', userId);

    if (error) throw new BadRequestException(error.message);
    return { message: 'Usuario eliminado correctamente' };
  }
}
