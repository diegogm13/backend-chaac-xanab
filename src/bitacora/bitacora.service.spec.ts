import { Test, TestingModule } from '@nestjs/testing';
import { BitacoraService } from './bitacora.service';
import { SupabaseService } from '../supabase/supabase.service';

describe('BitacoraService', () => {
  let service: BitacoraService;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BitacoraService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
      ],
    }).compile();
    service = module.get<BitacoraService>(BitacoraService);
  });

  describe('registrar', () => {
    it('inserta un registro en la bitácora', async () => {
      const insert = jest.fn().mockResolvedValue({ error: null });
      mockFrom.mockReturnValueOnce({ insert });

      await service.registrar({ usuarioId: 'uuid-1', usuarioEmail: 'ana@test.com', accion: 'LOGIN' });

      expect(mockFrom).toHaveBeenCalledWith('bitacora');
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ usuario_id: 'uuid-1', accion: 'LOGIN' }),
      );
    });

    it('no lanza si la inserción falla (no debe romper el flujo principal)', async () => {
      const insert = jest.fn().mockResolvedValue({ error: { message: 'db error' } });
      mockFrom.mockReturnValueOnce({ insert });

      await expect(
        service.registrar({ accion: 'LOGIN_FALLIDO' }),
      ).resolves.toBeUndefined();
    });
  });

  describe('findAll', () => {
    it('devuelve resultados paginados aplicando filtros', async () => {
      const self: Record<string, jest.Mock> = {};
      self['select']  = jest.fn(() => self);
      self['order']   = jest.fn(() => self);
      self['eq']      = jest.fn(() => self);
      self['gte']     = jest.fn(() => self);
      self['lte']     = jest.fn(() => self);
      self['range']   = jest.fn().mockResolvedValue({
        data: [{ id: '1', accion: 'LOGIN' }], error: null, count: 1,
      });
      mockFrom.mockReturnValueOnce(self);

      const result = await service.findAll({ accion: 'LOGIN', page: 1, limit: 20 });

      expect(self['eq']).toHaveBeenCalledWith('accion', 'LOGIN');
      expect(result.total).toBe(1);
      expect(result.data).toHaveLength(1);
    });
  });
});
