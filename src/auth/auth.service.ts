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
import { BitacoraService } from '../bitacora/bitacora.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { UpdateProfileDto, ChangePasswordDto } from './dto/update-profile.dto';
import { DireccionDto } from './dto/direccion.dto';
import { JwtPayload } from './strategies/jwt.strategy';

const SALT_ROUNDS = 10;
const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;

export interface RequestMeta {
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly bitacora: BitacoraService,
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

  // ─── Verificar email por access_token (flujo Supabase hash redirect) ─────────
  async verifyEmailByToken(accessToken: string): Promise<{ message: string }> {
    const { data, error } = await this.supabase.auth.auth.getUser(accessToken);

    if (error || !data.user?.email) {
      throw new BadRequestException('Token de verificación inválido o expirado.');
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
  async login(dto: LoginDto, meta: RequestMeta = {}): Promise<{ token: string }> {
    const email = dto.email.toLowerCase();
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id, email, role, name, password_hash, email_verified, activo, deleted_at, failed_login_attempts, locked_until')
      .eq('email', email)
      .maybeSingle();

    if (!user) {
      await this.bitacora.registrar({
        usuarioEmail: email, accion: 'LOGIN_FALLIDO', detalle: 'Correo no registrado',
        ip: meta.ip, userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    if (user.deleted_at || !user.activo) {
      await this.bitacora.registrar({
        usuarioId: user.id, usuarioEmail: user.email, accion: 'LOGIN_FALLIDO',
        detalle: 'Cuenta desactivada o eliminada', ip: meta.ip, userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Esta cuenta está desactivada. Contacta al administrador.');
    }

    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      const minutesLeft = Math.ceil((new Date(user.locked_until).getTime() - Date.now()) / 60000);
      throw new UnauthorizedException({ message: 'ACCOUNT_LOCKED', retryAfterMinutes: minutesLeft });
    }

    const valid = await bcrypt.compare(dto.password, user.password_hash);
    if (!valid) {
      const attempts = (user.failed_login_attempts ?? 0) + 1;
      if (attempts >= MAX_FAILED_ATTEMPTS) {
        const locked_until = new Date(Date.now() + LOCK_MINUTES * 60_000).toISOString();
        await this.supabase.db.from('usuarios')
          .update({ failed_login_attempts: 0, locked_until }).eq('id', user.id);
        await this.bitacora.registrar({
          usuarioId: user.id, usuarioEmail: user.email, accion: 'CUENTA_BLOQUEADA',
          detalle: `Cuenta bloqueada ${LOCK_MINUTES} minutos tras ${MAX_FAILED_ATTEMPTS} intentos fallidos`,
          ip: meta.ip, userAgent: meta.userAgent,
        });
        throw new UnauthorizedException({ message: 'ACCOUNT_LOCKED', retryAfterMinutes: LOCK_MINUTES });
      }

      await this.supabase.db.from('usuarios').update({ failed_login_attempts: attempts }).eq('id', user.id);
      await this.bitacora.registrar({
        usuarioId: user.id, usuarioEmail: user.email, accion: 'LOGIN_FALLIDO',
        detalle: `Contraseña incorrecta (intento ${attempts}/${MAX_FAILED_ATTEMPTS})`,
        ip: meta.ip, userAgent: meta.userAgent,
      });
      throw new UnauthorizedException('Correo o contraseña incorrectos');
    }

    // Credenciales correctas: reinicia el contador de intentos fallidos
    if (user.failed_login_attempts > 0 || user.locked_until) {
      await this.supabase.db.from('usuarios')
        .update({ failed_login_attempts: 0, locked_until: null }).eq('id', user.id);
    }

    if (!user.email_verified) {
      throw new UnauthorizedException('EMAIL_NOT_VERIFIED');
    }

    await this.bitacora.registrar({
      usuarioId: user.id, usuarioEmail: user.email, accion: 'LOGIN',
      ip: meta.ip, userAgent: meta.userAgent,
    });

    return { token: this.signToken(user) };
  }

  // ─── Logout ──────────────────────────────────────────────────────────────────
  // El JWT es stateless (nada que invalidar en servidor); esto solo deja constancia
  // en la bitácora de que el usuario cerró sesión.
  async logout(userId: string, userEmail: string, meta: RequestMeta = {}): Promise<{ message: string }> {
    await this.bitacora.registrar({
      usuarioId: userId, usuarioEmail: userEmail, accion: 'LOGOUT',
      ip: meta.ip, userAgent: meta.userAgent,
    });
    return { message: 'Sesión cerrada correctamente' };
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
  async changePassword(userId: string, dto: ChangePasswordDto, meta: RequestMeta = {}) {
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('email, password_hash')
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

    await this.bitacora.registrar({
      usuarioId: userId, usuarioEmail: user.email, accion: 'CAMBIO_PASSWORD',
      ip: meta.ip, userAgent: meta.userAgent,
    });

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
