import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { RolesService } from './roles.service';
import { SupabaseService } from '../supabase/supabase.service';

function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['select']      = jest.fn(() => self);
  self['insert']      = jest.fn(() => self);
  self['update']      = jest.fn(() => self);
  self['delete']      = jest.fn(() => self);
  self['eq']          = jest.fn(() => self);
  self['order']       = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  self['single']      = jest.fn().mockResolvedValue(resolve);
  return self;
}

describe('RolesService', () => {
  let service: RolesService;
  let mockFrom: jest.Mock;

  beforeEach(async () => {
    mockFrom = jest.fn();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RolesService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
      ],
    }).compile();
    service = module.get<RolesService>(RolesService);
  });

  describe('create', () => {
    it('crea un rol nuevo', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(null))                              // check exists
        .mockReturnValueOnce(buildChain({ id: 'r1', nombre: 'soporte' }));   // insert

      const result = await service.create({ nombre: 'soporte' });
      expect((result as { nombre: string }).nombre).toBe('soporte');
    });

    it('lanza ConflictException si el rol ya existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain({ id: 'r1' }));

      await expect(service.create({ nombre: 'admin' })).rejects.toThrow(ConflictException);
    });
  });

  describe('findPermisosByRole', () => {
    it('lanza NotFoundException si el rol no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(service.findPermisosByRole('r-fake')).rejects.toThrow(NotFoundException);
    });

    it('devuelve los permisos asociados al rol', async () => {
      const permisosRows = { data: [{ permisos: { id: 'p1', codigo: 'usuarios.ver' } }], error: null };
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'r1' })) // getRoleOrFail
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue(permisosRows) }) });

      const result = await service.findPermisosByRole('r1');
      expect(result).toEqual([{ id: 'p1', codigo: 'usuarios.ver' }]);
    });
  });

  describe('updateRolePermisos', () => {
    it('reemplaza los permisos del rol (delete + insert)', async () => {
      const deleteEq = jest.fn().mockResolvedValue({ error: null });
      const insertMock = jest.fn().mockResolvedValue({ error: null });
      const permisosRows = { data: [{ permisos: { id: 'p2', codigo: 'roles.gestionar' } }], error: null };

      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'r1' })) // getRoleOrFail
        .mockReturnValueOnce({ delete: jest.fn().mockReturnValue({ eq: deleteEq }) }) // delete existentes
        .mockReturnValueOnce({ insert: insertMock }) // insert nuevos
        .mockReturnValueOnce(buildChain({ id: 'r1' })) // getRoleOrFail (dentro de findPermisosByRole)
        .mockReturnValueOnce({ select: jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue(permisosRows) }) });

      const result = await service.updateRolePermisos('r1', { permisoIds: ['p2'] });

      expect(insertMock).toHaveBeenCalledWith([{ role_id: 'r1', permiso_id: 'p2' }]);
      expect(result).toEqual([{ id: 'p2', codigo: 'roles.gestionar' }]);
    });
  });

  describe('roleExists', () => {
    it('devuelve true si el rol existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain({ id: 'r1' }));
      await expect(service.roleExists('admin')).resolves.toBe(true);
    });

    it('devuelve false si el rol no existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));
      await expect(service.roleExists('inexistente')).resolves.toBe(false);
    });
  });
});
