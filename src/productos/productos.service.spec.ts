import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { SupabaseService } from '../supabase/supabase.service';

function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['select']      = jest.fn(() => self);
  self['eq']          = jest.fn(() => self);
  self['order']       = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  // para el caso de query que termina en await (sin single/maybeSingle)
  self['then']        = jest.fn((cb: (v: typeof resolve) => unknown) => Promise.resolve(cb(resolve)));
  return self;
}

describe('ProductosService', () => {
  let service: ProductosService;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductosService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
      ],
    }).compile();
    service = module.get<ProductosService>(ProductosService);
  });

  describe('findOne', () => {
    it('lanza NotFoundException si el producto no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));
      await expect(service.findOne('uuid-fake')).rejects.toThrow(NotFoundException);
    });

    it('retorna el producto si existe', async () => {
      const producto = { id: 'uuid-1', name: 'Air Max', activo: true };
      mockFrom.mockReturnValueOnce(buildChain(producto));
      const result = await service.findOne('uuid-1');
      expect(result).toEqual(producto);
    });
  });

  describe('findAll sin filtros', () => {
    it('retorna lista vacía si no hay productos', async () => {
      mockFrom.mockReturnValueOnce(buildChain([]));
      const result = await service.findAll({});
      expect(result).toEqual([]);
    });
  });
});
