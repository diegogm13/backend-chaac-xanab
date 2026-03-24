import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SupabaseService } from '../supabase/supabase.service';
import * as bcrypt from 'bcrypt';

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

  beforeEach(async () => {
    mockFrom = jest.fn();
    const mockSupabase = { db: { from: mockFrom } };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: SupabaseService, useValue: mockSupabase },
        {
          provide: JwtService,
          useValue: { sign: jest.fn().mockReturnValue('mock-token') },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ─── register ────────────────────────────────────────────────────────────────
  describe('register', () => {
    it('devuelve token cuando el email es nuevo', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(null))           // check: email no existe
        .mockReturnValueOnce(buildChain({                // insert: nuevo usuario
          id: 'uuid-1', email: 'ana@test.com', role: 'customer', name: 'Ana',
        }));

      const result = await service.register({
        name: 'Ana', email: 'ana@test.com', password: 'abc123',
      });
      expect(result.token).toBe('mock-token');
    });

    it('lanza ConflictException si el email ya existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain({ id: 'uuid-existing' }));

      await expect(
        service.register({ name: 'Ana', email: 'ana@test.com', password: 'abc123' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  // ─── login ───────────────────────────────────────────────────────────────────
  describe('login', () => {
    it('devuelve token con credenciales correctas', async () => {
      const hash = await bcrypt.hash('password123', 1);
      mockFrom.mockReturnValueOnce(buildChain({
        id: 'uuid-1', email: 'ana@test.com', role: 'customer',
        name: 'Ana', password_hash: hash,
      }));

      const result = await service.login({ email: 'ana@test.com', password: 'password123' });
      expect(result.token).toBe('mock-token');
    });

    it('lanza UnauthorizedException con contraseña incorrecta', async () => {
      const hash = await bcrypt.hash('correct', 1);
      mockFrom.mockReturnValueOnce(buildChain({
        id: 'uuid-1', email: 'ana@test.com', role: 'customer',
        name: 'Ana', password_hash: hash,
      }));

      await expect(
        service.login({ email: 'ana@test.com', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('lanza UnauthorizedException si el usuario no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(
        service.login({ email: 'noexiste@test.com', password: 'x' }),
      ).rejects.toThrow(UnauthorizedException);
    });
  });
});
