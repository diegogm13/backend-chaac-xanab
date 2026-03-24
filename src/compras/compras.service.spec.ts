import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ComprasService } from './compras.service';
import { SupabaseService } from '../supabase/supabase.service';

function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['select']      = jest.fn(() => self);
  self['insert']      = jest.fn(() => self);
  self['update']      = jest.fn(() => self);
  self['eq']          = jest.fn(() => self);
  self['in']          = jest.fn(() => self);
  self['order']       = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  self['single']      = jest.fn().mockResolvedValue(resolve);
  // para queries que terminan en await directo (sin single)
  self['then']        = jest.fn((cb: (v: typeof resolve) => unknown) => Promise.resolve(cb(resolve)));
  return self;
}

const USUARIO = 'user-uuid-1';
const PRODUCTO = { id: 'prod-uuid-1', name: 'Air Max', price: 2000, image_url: 'img.jpg', stock: 10, activo: true };
const COMPRA   = { id: 'compra-uuid-1', total: 4000, status: 'pendiente', created_at: new Date() };

describe('ComprasService', () => {
  let service: ComprasService;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComprasService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
      ],
    }).compile();
    service = module.get<ComprasService>(ComprasService);
  });

  describe('create', () => {
    it('crea la compra y descuenta el stock correctamente', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain([PRODUCTO]))    // select productos
        .mockReturnValueOnce(buildChain(COMPRA))         // insert compra
        .mockReturnValueOnce(buildChain(null))           // insert items
        .mockReturnValueOnce(buildChain(null));          // update stock

      const result = await service.create(USUARIO, {
        items: [{ producto_id: 'prod-uuid-1', size: '27', quantity: 2 }],
      });

      expect((result as { total: number }).total).toBe(4000);
    });

    it('lanza BadRequestException si stock insuficiente', async () => {
      const productoSinStock = { ...PRODUCTO, stock: 1 };
      mockFrom.mockReturnValueOnce(buildChain([productoSinStock]));

      await expect(
        service.create(USUARIO, {
          items: [{ producto_id: 'prod-uuid-1', size: '27', quantity: 5 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('lanza BadRequestException si el producto no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain([]));

      await expect(
        service.create(USUARIO, {
          items: [{ producto_id: 'uuid-fake', size: '27', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findOne', () => {
    it('retorna la compra si el usuario es el dueño', async () => {
      const compraConUser = { ...COMPRA, user_id: USUARIO, compras_items: [] };
      mockFrom.mockReturnValueOnce(buildChain(compraConUser));

      const result = await service.findOne('compra-uuid-1', USUARIO);
      expect((result as { id: string }).id).toBe('compra-uuid-1');
    });

    it('lanza ForbiddenException si el usuario no es el dueño', async () => {
      const compraDeOtro = { ...COMPRA, user_id: 'otro-uuid', compras_items: [] };
      mockFrom.mockReturnValueOnce(buildChain(compraDeOtro));

      await expect(service.findOne('compra-uuid-1', USUARIO))
        .rejects.toThrow(ForbiddenException);
    });

    it('lanza NotFoundException si la compra no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(service.findOne('uuid-fake', USUARIO))
        .rejects.toThrow(NotFoundException);
    });
  });
});
