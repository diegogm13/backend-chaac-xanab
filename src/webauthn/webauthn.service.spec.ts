import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { BadRequestException, NotFoundException, ConflictException } from '@nestjs/common';
import { WebAuthnService } from './webauthn.service';
import { SupabaseService } from '../supabase/supabase.service';

function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['select']      = jest.fn(() => self);
  self['insert']      = jest.fn(() => self);
  self['update']      = jest.fn(() => self);
  self['delete']      = jest.fn(() => self);
  self['eq']          = jest.fn(() => self);
  self['gt']          = jest.fn(() => self);
  self['lt']          = jest.fn(() => self);
  self['order']       = jest.fn(() => self);
  self['limit']       = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  self['single']      = jest.fn().mockResolvedValue(resolve);
  self['then']        = jest.fn((cb: (v: typeof resolve) => unknown) => Promise.resolve(cb(resolve)));
  return self;
}

describe('WebAuthnService', () => {
  let service: WebAuthnService;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebAuthnService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
        { provide: JwtService, useValue: { sign: jest.fn().mockReturnValue('webauthn-token') } },
        {
          provide: ConfigService,
          useValue: {
            getOrThrow: (key: string) => {
              const map: Record<string, string> = {
                WEBAUTHN_RP_ID:   'localhost',
                WEBAUTHN_RP_NAME: 'CHAAC XANAB',
                WEBAUTHN_ORIGIN:  'http://localhost:4200',
              };
              if (!map[key]) throw new Error(`Missing: ${key}`);
              return map[key];
            },
          },
        },
      ],
    }).compile();

    service = module.get<WebAuthnService>(WebAuthnService);
  });

  describe('generateRegistrationChallenge', () => {
    it('retorna opciones de registro si el usuario existe y no tiene credencial', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'user-1', email: 'a@b.com' })) // usuario existe
        .mockReturnValueOnce(buildChain(null))   // sin credencial existente
        .mockReturnValueOnce(buildChain(null))   // cleanExpired
        .mockReturnValueOnce(buildChain(null));  // saveChallenge

      const result = await service.generateRegistrationChallenge({
        email: 'a@b.com', displayName: 'Ana',
      });

      expect(result).toHaveProperty('challenge');
      expect(result).toHaveProperty('rp');
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(
        service.generateRegistrationChallenge({ email: 'no@existe.com', displayName: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza ConflictException si ya tiene credencial registrada', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'user-1', email: 'a@b.com' }))
        .mockReturnValueOnce(buildChain({ id: 'cred-1' })); // ya existe credencial

      await expect(
        service.generateRegistrationChallenge({ email: 'a@b.com', displayName: 'Ana' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('generateLoginChallenge', () => {
    it('lanza NotFoundException si el usuario no tiene credencial', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'user-1' })) // usuario existe
        .mockReturnValueOnce(buildChain(null));             // sin credencial

      await expect(
        service.generateLoginChallenge({ email: 'a@b.com' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('lanza NotFoundException si el usuario no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(
        service.generateLoginChallenge({ email: 'no@existe.com' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('consumeChallenge (via verifyLogin)', () => {
    it('lanza BadRequestException si no hay challenge activo', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(null))  // cleanExpired
        .mockReturnValueOnce(buildChain(null)); // consumeChallenge → sin challenge

      await expect(
        service.verifyLogin({
          email: 'a@b.com',
          credentialId: 'cred-id',
          clientDataJSON: 'data',
          authenticatorData: 'auth',
          signature: 'sig',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
