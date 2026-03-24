import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';
import { SupabaseService } from '../supabase/supabase.service';
import {
  RegisterChallengeDto,
  RegisterVerifyDto,
  LoginChallengeDto,
  LoginVerifyDto,
} from './dto/webauthn.dto';
import { JwtPayload } from '../auth/strategies/jwt.strategy';

@Injectable()
export class WebAuthnService {
  private readonly rpId: string;
  private readonly rpName: string;
  private readonly origin: string;

  constructor(
    private readonly supabase: SupabaseService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
  ) {
    this.rpId   = this.config.getOrThrow('WEBAUTHN_RP_ID');
    this.rpName = this.config.getOrThrow('WEBAUTHN_RP_NAME');
    this.origin = this.config.getOrThrow('WEBAUTHN_ORIGIN');
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  /** Limpia challenges expirados para un email (delete-on-read) */
  private async cleanExpiredChallenges(email: string): Promise<void> {
    await this.supabase.db
      .from('webauthn_challenges')
      .delete()
      .eq('email', email)
      .lt('expires_at', new Date().toISOString());
  }

  /** Guarda un challenge en BD con TTL de 60 segundos */
  private async saveChallenge(email: string, challenge: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 60_000).toISOString();
    await this.supabase.db
      .from('webauthn_challenges')
      .insert({ email, challenge, expires_at: expiresAt });
  }

  /** Obtiene y elimina el challenge activo para un email */
  private async consumeChallenge(email: string): Promise<string> {
    await this.cleanExpiredChallenges(email);

    const { data } = await this.supabase.db
      .from('webauthn_challenges')
      .select('id, challenge')
      .eq('email', email)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!data) throw new BadRequestException('Challenge expirado o no encontrado. Inténtalo de nuevo.');

    // Consumir (eliminar) el challenge para que no pueda reusarse
    await this.supabase.db
      .from('webauthn_challenges')
      .delete()
      .eq('id', data.id);

    return data.challenge;
  }

  // ─── Registro ────────────────────────────────────────────────────────────────

  async generateRegistrationChallenge(dto: RegisterChallengeDto) {
    // Verificar que el usuario existe
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id, email')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (!user) throw new NotFoundException('Usuario no encontrado. Regístrate primero.');

    // Verificar que no tenga ya una credencial biométrica
    const { data: existingCred } = await this.supabase.db
      .from('credenciales_biometricas')
      .select('id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (existingCred) throw new ConflictException('Ya tienes una credencial biométrica registrada.');

    await this.cleanExpiredChallenges(dto.email);

    const options = await generateRegistrationOptions({
      rpName:                 this.rpName,
      rpID:                   this.rpId,
      userName:               dto.email,
      userDisplayName:        dto.displayName,
      attestationType:        'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification:        'required',
        residentKey:             'preferred',
      },
      timeout: 60_000,
    });

    await this.saveChallenge(dto.email, options.challenge);

    return options; // El frontend usa esto directamente para navigator.credentials.create()
  }

  async verifyRegistration(dto: RegisterVerifyDto) {
    const expectedChallenge = await this.consumeChallenge(dto.email);

    // Obtener usuario
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id, email, role, name')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (!user) throw new NotFoundException('Usuario no encontrado.');

    // Reconstruir el formato RegistrationResponseJSON que espera @simplewebauthn/server
    const response: RegistrationResponseJSON = {
      id:       dto.credentialId,
      rawId:    dto.credentialId,
      response: {
        clientDataJSON:    dto.clientDataJSON,
        attestationObject: dto.attestationObject,
        transports:        ['internal'],
      },
      type:                    'public-key',
      clientExtensionResults:  {},
    };

    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID:   this.rpId,
      });
    } catch (err: unknown) {
      throw new BadRequestException(
        `Verificación fallida: ${err instanceof Error ? err.message : 'error desconocido'}`,
      );
    }

    if (!verification.verified || !verification.registrationInfo) {
      throw new BadRequestException('No se pudo verificar la credencial biométrica.');
    }

    const { credentialID, credentialPublicKey, counter } = verification.registrationInfo;

    // Guardar credencial: public key como base64url
    const publicKeyBase64 = Buffer.from(credentialPublicKey).toString('base64url');

    const { error } = await this.supabase.db
      .from('credenciales_biometricas')
      .insert({
        user_id:       user.id,
        credential_id: credentialID,
        public_key:    publicKeyBase64,
        counter:       counter,
      });

    if (error) throw new BadRequestException(error.message);

    return { verified: true, message: 'Credencial biométrica registrada correctamente.' };
  }

  // ─── Login ───────────────────────────────────────────────────────────────────

  async generateLoginChallenge(dto: LoginChallengeDto) {
    // Verificar usuario y credencial
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const { data: cred } = await this.supabase.db
      .from('credenciales_biometricas')
      .select('credential_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cred) throw new NotFoundException('No tienes huella registrada. Actívala en tu perfil.');

    await this.cleanExpiredChallenges(dto.email);

    const options = await generateAuthenticationOptions({
      rpID:             this.rpId,
      userVerification: 'required',
      allowCredentials: [{ id: cred.credential_id }],
      timeout:          60_000,
    });

    await this.saveChallenge(dto.email, options.challenge);

    // El frontend necesita el credentialId para construir allowCredentials
    return {
      challenge:    options.challenge,
      credentialId: cred.credential_id,
    };
  }

  async verifyLogin(dto: LoginVerifyDto): Promise<{ token: string }> {
    const expectedChallenge = await this.consumeChallenge(dto.email);

    // Obtener usuario y credencial
    const { data: user } = await this.supabase.db
      .from('usuarios')
      .select('id, email, role, name')
      .eq('email', dto.email.toLowerCase())
      .maybeSingle();

    if (!user) throw new NotFoundException('Usuario no encontrado.');

    const { data: cred } = await this.supabase.db
      .from('credenciales_biometricas')
      .select('id, credential_id, public_key, counter')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!cred) throw new NotFoundException('Credencial biométrica no encontrada.');

    // Reconstruir AuthenticationResponseJSON
    const response: AuthenticationResponseJSON = {
      id:       dto.credentialId,
      rawId:    dto.credentialId,
      response: {
        clientDataJSON:    dto.clientDataJSON,
        authenticatorData: dto.authenticatorData,
        signature:         dto.signature,
      },
      type:                   'public-key',
      clientExtensionResults: {},
    };

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: this.origin,
        expectedRPID:   this.rpId,
        authenticator: {
          credentialID:        cred.credential_id,
          credentialPublicKey: Buffer.from(cred.public_key, 'base64url'),
          counter:             cred.counter,
        },
      });
    } catch (err: unknown) {
      throw new BadRequestException(
        `Verificación fallida: ${err instanceof Error ? err.message : 'error desconocido'}`,
      );
    }

    if (!verification.verified) {
      throw new BadRequestException('La firma biométrica no es válida.');
    }

    // Actualizar counter anti-replay
    await this.supabase.db
      .from('credenciales_biometricas')
      .update({ counter: verification.authenticationInfo.newCounter })
      .eq('id', cred.id);

    // Emitir JWT — mismo contrato que AuthService
    const payload: JwtPayload = {
      sub:   user.id,
      email: user.email,
      role:  user.role,
      name:  user.name,
    };

    return { token: this.jwt.sign(payload) };
  }
}
