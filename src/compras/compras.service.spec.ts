import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, InternalServerErrorException, NotFoundException } from '@nestjs/common';
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
  let mockRpc: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();
    mockRpc = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComprasService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom, rpc: mockRpc } } },
      ],
    }).compile();
    service = module.get<ComprasService>(ComprasService);
  });

  // Práctica 12: create() hace UNA llamada a la función transaccional crear_compra.
  describe('create (RPC crear_compra)', () => {
    const DTO = { items: [{ producto_id: 'prod-uuid-1', size: '27', quantity: 2 }] };
    const OK = { repetida: false, compra: { id: 'compra-uuid-1', total: 4000, status: 'pendiente' }, items: [{ name: 'Air Max' }] };

    it('una sola llamada RPC con los parámetros correctos y devuelve la compra con sus items', async () => {
      mockRpc.mockResolvedValueOnce({ data: OK, error: null });
      const r = await service.create(USUARIO, DTO, 'llave-idem-123');
      expect(mockRpc).toHaveBeenCalledTimes(1);
      expect(mockRpc).toHaveBeenCalledWith('crear_compra', expect.objectContaining({
        p_user_id: USUARIO, p_idempotency_key: 'llave-idem-123', p_items: DTO.items,
      }));
      expect(mockFrom).not.toHaveBeenCalled();
      expect(r.repetida).toBe(false);
      expect(r.compra.total).toBe(4000);
      expect(r.compra.items).toHaveLength(1);
    });

    it('stock insuficiente (P0001) → ConflictException 409', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0001', message: 'Stock insuficiente' } });
      await expect(service.create(USUARIO, DTO)).rejects.toThrow(ConflictException);
    });

    it('producto inexistente (P0002) → NotFoundException 404', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { code: 'P0002', message: 'no encontrado' } });
      await expect(service.create(USUARIO, DTO)).rejects.toThrow(NotFoundException);
    });

    it('error de infraestructura → 500 genérico (ya no 400 con el mensaje interno)', async () => {
      mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'TypeError: fetch failed' } });
      await expect(service.create(USUARIO, DTO)).rejects.toThrow(InternalServerErrorException);
    });

    it('carrera de idempotencia (23505) → repite la llamada y devuelve la compra que ganó', async () => {
      mockRpc
        .mockResolvedValueOnce({ data: null, error: { code: '23505', message: 'duplicate key' } })
        .mockResolvedValueOnce({ data: { ...OK, repetida: true }, error: null });
      const r = await service.create(USUARIO, DTO, 'llave-idem-123');
      expect(mockRpc).toHaveBeenCalledTimes(2);
      expect(r.repetida).toBe(true);
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
