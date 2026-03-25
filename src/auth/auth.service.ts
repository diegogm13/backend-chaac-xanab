import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import * as crypto from 'crypto';
import { SupabaseService } from '../supabase/supabase.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { DireccionDto } from './dto/direccion.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const SALT_ROUNDS = 10;

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  // ─── Registro ────────────────────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<{ message: string }> {
    const { data: existing } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (existing) throw new ConflictException('El correo ya está registrado');

    const password_hash = await bcrypt.hash(dto.password, SALT_ROUNDS);

    const { error } = await this.supabase.db
      .from('usuarios')
      .insert({
        name: dto.name,
        email: dto.email.toLowerCase(),
        password_hash,
        email_verified: false,
      });

    if (error) throw new BadRequestException(error.message);

    // Supabase Auth dispara el correo de verificación
    try {
      const frontendUrl = this.config.get<string>('FRONTEND_URL', 'https://chaacxanab.vercel.app');
      await this.supabase.auth.auth.signUp({
        email: dto.email.toLowerCase(),
        password: crypto.randomUUID(),
        options: { emailRedirectTo: `${frontendUrl}/verify-email` },
      });
    } catch (authErr) {
      console.error('[Auth] Error al enviar correo de verificación:', authErr);
    }

    return { message: 'Te enviamos un correo de verificación. Revisa tu bandeja de entrada.' };
  }

  // ─── Verificar email ─────────────────────────────────────────────────────────
  async verifyEmail(tokenHash: string): Promise<{ message: string }> {
    const { data, error } = await this.supabase.auth.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'signup',
    });

    if (error || !data.user?.email) {
      throw new BadRequestException('Enlace de verificación inválido o ya utilizado.');
    }

    await this.supabase.db
      .from('usuarios')
      .update({ email_verified: true })
      .eq('email', data.user.email);

    return { message: 'Correo verificado correctamente. Ya puedes iniciar sesión.' };
  }

  // ─── Reenviar verificación ───────────────────────────────────────────────────
  async resendVerification(emailAddress: string): Promise<{ message: string }> {
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id, email_verified')
      .eq('email', emailAddress.toLowerCase())
      .maybeSingle();

    // Respuesta genérica para no revelar si el email existe
    if (!user || user.email_verified) {
      return { message: 'Si el correo existe y no está verificado, recibirás un nuevo enlace.' };
    }

    try {
      await this.supabase.auth.auth.resend({
        type: 'signup',
        email: emailAddress.toLowerCase(),
      });
    } catch (authErr) {
      console.error('[Auth] Error reenviando verificación:', authErr);
    }

    return { message: 'Si el correo existe y no está verificado, recibirás un nuevo enlace.' };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<{ token: string }> {
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id, email, role, name, password_hash, email_verified')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (!user) throw new UnauthorizedException('Correo o contraseña incorrectos');

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) throw new UnauthorizedException('Correo o contraseña incorrectos');

    if (!user.email_verified) {
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    return { token: this.signToken(user) };
  }

  // ─── Obtener perfil ──────────────────────────────────────────────────────────
  async getMe(userId: string) {
    const { data, error } = await this.supabase.db
      .from('usuarios')
      .select('id, name, email, role, created_at')
      .eq('id', userId)
      .single();

    if (error || !data) throw new NotFoundException('Usuario no encontrado');
    return data;
  }

  // ─── Actualizar nombre/email ─────────────────────────────────────────────────
  async updateMe(userId: string, dto: UpdateProfileDto) {
    if (dto.email) {
      const { data: existing } = await this.supabase.db
        .from('usuarios')
        .select('id')
        .eq('email', dto.email.toLowerCase())
        .neq('id', userId)
        .maybeSingle();

      if (existing) throw new ConflictException('El correo ya está en uso');
    }

    const updates: Record<string, string> = {};
    if (dto.name) updates['name'] = dto.name;
    if (dto.email) updates['email'] = dto.email.toLowerCase();

    const { data, error } = await this.supabase.db
      .from('usuarios')
      .update(updates)
      .eq('id', userId)
      .select('id, name, email, role')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ─── Cambiar contraseña ──────────────────────────────────────────────────────
  async changePassword(userId: string, dto: ChangePasswordDto) {
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('password_hash')
      .eq('id', userId)
      .single();

    if (!user) throw new NotFoundException('Usuario no encontrado');

    const valid = await bcrypt.compare(dto.currentPassword, user.password_hash);
    if (!valid) throw new UnauthorizedException('Contraseña actual incorrecta');

    const password_hash = await bcrypt.hash(dto.newPassword, SALT_ROUNDS);

    await this.supabase.db
      .from('usuarios')
      .update({ password_hash })
      .eq('id', userId);

    return { message: 'Contraseña actualizada correctamente' };
  }

  // ─── Dirección principal ─────────────────────────────────────────────────────
  async getDireccion(userId: string) {
    const { data } = await this.supabase.db
      .from('usuarios_direcciones')
      .select('*')
      .eq('user_id', userId)
      .eq('es_principal', true)
      .maybeSingle();

    return data ?? null;
  }

  async upsertDireccion(userId: string, dto: DireccionDto) {
    // Buscar si ya tiene una dirección principal
    const { data: existing } = await this.supabase.db
      .from('usuarios_direcciones')
      .select('id')
      .eq('user_id', userId)
      .eq('es_principal', true)
      .maybeSingle();

    const payload = {
      user_id: userId,
      es_principal: true,
      pais: dto.pais ?? 'México',
      ...dto,
    };

    if (existing) {
      const { data, error } = await this.supabase.db
        .from('usuarios_direcciones')
        .update(payload)
        .eq('id', existing.id)
        .select('*')
        .single();
      if (error) throw new BadRequestException(error.message);
      return data;
    }

    const { data, error } = await this.supabase.db
      .from('usuarios_direcciones')
      .insert(payload)
      .select('*')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  // ─── Utilidades ──────────────────────────────────────────────────────────────
  private signToken(user: { id: string; email: string; role: string; name: string }): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
    };
    return this.jwt.sign(payload);
  }
}
