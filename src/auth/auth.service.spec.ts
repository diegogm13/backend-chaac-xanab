import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import { BitacoraService } from '../bitacora/bitacora.service';

// Builder para simular la cadena fluent de Supabase
function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['eq']          = jest.fn(() => self);
  self['neq']         = jest.fn(() => self);
  self['select']      = jest.fn(() => self);
  self['insert']      = jest.fn(() => self);
  self['update']      = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  self['single']      = jest.fn().mockResolvedValue(resolve);
  return self;
}

describe('AuthService', () => {
  let service: AuthService;
  let mockFrom: jest.Mock;
  let bitacora: { registrar: jest.Mock };

  beforeEach(async () => {
    mockFrom = jest.fn();
    bitacora = { registrar: jest.fn().mockResolvedValue(undefined) };

    const mockSupabase = {
      db: { from: mockFrom },
      auth: { auth: { signUp: jest.fn().mockResolvedValue({}) } },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabase },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('mock-token') } },
        { provide: ConfigService, useValue: { get: jest.fn(() => 'https://frontend.test'), getOrThrow: jest.fn() } },
        { provide: BitacoraService, useValue: bitacora },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── register ────────────────────────────────────────────────────────────────
  describe('register', () => {
    it('crea el usuario y devuelve un mensaje cuando el email es nuevo', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(null))   // check: email no existe
        .mockReturnValueOnce(buildChain(null));  // insert

      const result = await service.register({
        name: 'Ana', email: 'ana@test.com', password: 'Abc12345!',
      });
      expect(result.message).toBeDefined();
    });

    it('lanza ConflictException si el email ya existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain({ id: 'uuid-existing' }));

      await expect(
        service.register({ name: 'Ana', email: 'ana@test.com', password: 'Abc12345!' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────
  describe('login', () => {
    const baseUser = async (overrides: Record<string, unknown> = {}) => ({
      id: 'uuid-1', email: 'ana@test.com', role: 'customer', name: 'Ana',
      password_hash: await bcrypt.hash('Password123!', 4),
      email_verified: true, activo: true, deleted_at: null,
      failed_login_attempts: 0, locked_until: null,
      ...overrides,
    });

    it('devuelve token con credenciales correctas y registra LOGIN en bitácora', async () => {
      mockFrom.mockReturnValueOnce(buildChain(await baseUser()));

      const result = await service.login({ email: 'ana@test.com', password: 'Password123!' });

      expect(result.token).toBe('mock-token');
      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'LOGIN' }),
      );
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(
        service.login({ email: 'noexiste@test.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza el login de una cuenta desactivada', async () => {
      mockFrom.mockReturnValueOnce(buildChain(await baseUser({ activo: false })));

      await expect(
        service.login({ email: 'ana@test.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza el login de una cuenta eliminada (soft delete)', async () => {
      mockFrom.mockReturnValueOnce(buildChain(await baseUser({ deleted_at: new Date().toISOString() })));

      await expect(
        service.login({ email: 'ana@test.com', password: 'Password123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('rechaza el login mientras la cuenta esté bloqueada (locked_until futuro)', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60_000).toISOString();
      mockFrom.mockReturnValueOnce(buildChain(await baseUser({ locked_until: lockedUntil })));

      await expect(
        service.login({ email: 'ana@test.com', password: 'Password123!' }),
      ).rejects.toMatchObject({ response: { message: 'ACCOUNT_LOCKED' } });
    });

    it('incrementa failed_login_attempts con contraseña incorrecta (sin llegar al límite)', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(await baseUser({ failed_login_attempts: 1 })))
        .mockReturnValueOnce(buildChain(null)); // update failed_login_attempts

      await expect(
        service.login({ email: 'ana@test.com', password: 'incorrecta' }),
      ).rejects.toThrow(UnauthorizedException);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'LOGIN_FALLIDO' }),
      );
    });

    it('bloquea la cuenta al llegar al máximo de intentos fallidos', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(await baseUser({ failed_login_attempts: 4 })))
        .mockReturnValueOnce(buildChain(null)); // update locked_until

      await expect(
        service.login({ email: 'ana@test.com', password: 'incorrecta' }),
      ).rejects.toMatchObject({ response: { message: 'ACCOUNT_LOCKED' } });

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CUENTA_BLOQUEADA' }),
      );
    });
  });

  // ─── changePassword ──────────────────────────────────────────────────────────
  describe('changePassword', () => {
    it('actualiza la contraseña y registra CAMBIO_PASSWORD', async () => {
      const hash = await bcrypt.hash('actual123', 4);
      mockFrom
        .mockReturnValueOnce(buildChain({ email: 'ana@test.com', password_hash: hash })) // select
        .mockReturnValueOnce(buildChain(null)); // update

      const result = await service.changePassword('uuid-1', {
        currentPassword: 'actual123', newPassword: 'NuevaPass123!',
      });

      expect(result.message).toBeDefined();
      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CAMBIO_PASSWORD' }),
      );
    });

    it('lanza UnauthorizedException si la contraseña actual es incorrecta', async () => {
      const hash = await bcrypt.hash('actual123', 4);
      mockFrom.mockReturnValueOnce(buildChain({ email: 'ana@test.com', password_hash: hash }));

      await expect(
        service.changePassword('uuid-1', { currentPassword: 'mala', newPassword: 'NuevaPass123!' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });

  // ─── logout ──────────────────────────────────────────────────────────────────
  describe('logout', () => {
    it('registra LOGOUT en la bitácora', async () => {
      const result = await service.logout('uuid-1', 'ana@test.com', { ip: '127.0.0.1' });

      expect(result.message).toBeDefined();
      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'LOGOUT', usuarioId: 'uuid-1' }),
      );
    });
  });
});
