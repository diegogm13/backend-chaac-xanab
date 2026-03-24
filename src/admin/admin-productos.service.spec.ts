import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminProductosService } from './admin-productos.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';

function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['select']      = jest.fn(() => self);
  self['insert']      = jest.fn(() => self);
  self['update']      = jest.fn(() => self);
  self['delete']      = jest.fn(() => self);
  self['eq']          = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  self['single']      = jest.fn().mockResolvedValue(resolve);
  return self;
}

describe('AdminProductosService', () => {
  let service: AdminProductosService;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminProductosService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
        {
          provide: CloudinaryService,
          useValue: {
            uploadBuffer: jest.fn().mockResolvedValue('https://cloudinary.com/test.jpg'),
            deleteByUrl: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();
    service = module.get<AdminProductosService>(AdminProductosService);
  });

  describe('ajustarStock', () => {
    it('incrementa el stock correctamente', async () => {
      const producto = { id: 'uuid-1', stock: 10 };
      const actualizado = { id: 'uuid-1', name: 'Air Max', stock: 15 };

      mockFrom
        .mockReturnValueOnce(buildChain(producto))    // select stock actual
        .mockReturnValueOnce(buildChain(actualizado)); // update

      const result = await service.ajustarStock('uuid-1', { delta: 5 });
      expect((result as { stock: number }).stock).toBe(15);
    });

    it('lanza BadRequestException si el stock resultante es negativo', async () => {
      mockFrom.mockReturnValueOnce(buildChain({ id: 'uuid-1', stock: 3 }));

      await expect(service.ajustarStock('uuid-1', { delta: -10 }))
        .rejects.toThrow(BadRequestException);
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(service.ajustarStock('uuid-fake', { delta: 1 }))
        .rejects.toThrow(NotFoundException);
    });
  });

  describe('remove', () => {
    it('hace soft delete correctamente', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'uuid-1' }))  // check exists
        .mockReturnValueOnce(buildChain(null));              // update activo=false

      const result = await service.remove('uuid-1');
      expect((result as { message: string }).message).toContain('eliminado');
    });

    it('lanza NotFoundException si el producto no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(service.remove('uuid-fake')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create con imagen', () => {
    it('sube imagen a Cloudinary y guarda la URL en el producto', async () => {
      const nuevoProducto = { id: 'uuid-new', name: 'Air Max', image_url: 'https://cloudinary.com/test.jpg' };
      mockFrom.mockReturnValueOnce(buildChain(nuevoProducto));

      const dto = {
        categoria_id: 'cat-uuid', name: 'Air Max',
        price: 2000, stock: 10, sizes: ['26', '27'],
      };
      const result = await service.create(dto, Buffer.from('fake-image'));
      expect((result as { image_url: string }).image_url).toBe('https://cloudinary.com/test.jpg');
    });
  });
});
