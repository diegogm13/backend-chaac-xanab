import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { AdminUsuariosService } from './admin-usuarios.service';
import { SupabaseService } from '../supabase/supabase.service';
import { RolesService } from '../roles/roles.service';
import { BitacoraService } from '../bitacora/bitacora.service';

function buildChain(data: unknown, error: unknown = null) {
  const self: Record<string, jest.Mock> = {};
  const resolve = { data, error };
  self['select']      = jest.fn(() => self);
  self['insert']      = jest.fn(() => self);
  self['update']      = jest.fn(() => self);
  self['delete']      = jest.fn(() => self);
  self['eq']          = jest.fn(() => self);
  self['neq']         = jest.fn(() => self);
  self['is']          = jest.fn(() => self);
  self['order']       = jest.fn(() => self);
  self['maybeSingle'] = jest.fn().mockResolvedValue(resolve);
  self['single']      = jest.fn().mockResolvedValue(resolve);
  return self;
}

describe('AdminUsuariosService', () => {
  let service: AdminUsuariosService;
  let mockFrom: jest.Mock;
  let roles: { roleExists: jest.Mock };
  let bitacora: { registrar: jest.Mock };
  const actor = { id: 'admin-1', email: 'admin@test.com', ip: '127.0.0.1', userAgent: 'jest' };

  beforeEach(async () => {
    mockFrom = jest.fn();
    roles = { roleExists: jest.fn().mockResolvedValue(true) };
    bitacora = { registrar: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminUsuariosService,
        { provide: SupabaseService, useValue: { db: { from: mockFrom } } },
        { provide: RolesService, useValue: roles },
        { provide: BitacoraService, useValue: bitacora },
      ],
    }).compile();

    service = module.get<AdminUsuariosService>(AdminUsuariosService);
  });

  describe('createUser', () => {
    it('crea el usuario cuando el rol existe y registra ALTA_USUARIO', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain(null)) // check email exists
        .mockReturnValueOnce(buildChain({ id: 'u1', email: 'nuevo@test.com', role: 'customer' })); // insert

      const result = await service.createUser(
        { name: 'Nuevo', email: 'nuevo@test.com', password: 'Abc12345!', role: 'customer' },
        actor,
      );

      expect((result as { email: string }).email).toBe('nuevo@test.com');
      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'ALTA_USUARIO' }),
      );
    });

    it('lanza ConflictException si el correo ya existe', async () => {
      mockFrom.mockReturnValueOnce(buildChain({ id: 'existing' }));

      await expect(
        service.createUser({ name: 'X', email: 'x@test.com', password: 'Abc12345!' }, actor),
      ).rejects.toThrow(ConflictException);
    });

    it('lanza BadRequestException si el rol no existe', async () => {
      roles.roleExists.mockResolvedValueOnce(false);
      mockFrom.mockReturnValueOnce(buildChain(null)); // check email exists

      await expect(
        service.createUser({ name: 'X', email: 'x@test.com', password: 'Abc12345!', role: 'inexistente' }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('setEstado', () => {
    it('desactiva un usuario y registra DESACTIVAR_USUARIO', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'u1', email: 'user@test.com' })) // check exists
        .mockReturnValueOnce(buildChain({ id: 'u1', activo: false }));         // update

      await service.setEstado('u1', false, actor);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'DESACTIVAR_USUARIO' }),
      );
    });

    it('lanza NotFoundException si el usuario no existe o está eliminado', async () => {
      mockFrom.mockReturnValueOnce(buildChain(null));

      await expect(service.setEstado('u-fake', true, actor)).rejects.toThrow(NotFoundException);
    });
  });

  // Desde migration-borrado-usuario.sql el borrado es FÍSICO (DELETE + ON DELETE
  // CASCADE en compras). La versión anterior de esta prueba esperaba borrado
  // lógico y quedó desactualizada (Práctica 11, hallazgo DEF-07).
  describe('deleteUser (eliminación permanente)', () => {
    it('ejecuta DELETE y registra BAJA_USUARIO', async () => {
      const existsChain = buildChain({ id: 'u1', email: 'user@test.com' });
      const deleteChain = buildChain(null);
      deleteChain['eq'] = jest.fn().mockResolvedValue({ error: null });
      mockFrom
        .mockReturnValueOnce(existsChain) // check exists
        .mockReturnValueOnce(deleteChain); // delete

      const result = await service.deleteUser('u1', actor);

      expect(deleteChain['delete']).toHaveBeenCalled();
      expect(deleteChain['eq']).toHaveBeenCalledWith('id', 'u1');
      expect(result.message).toBe('Usuario eliminado permanentemente');
      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'BAJA_USUARIO' }),
      );
    });
  });

  describe('updateRole', () => {
    it('registra CAMBIO_ROL cuando el rol cambia', async () => {
      mockFrom
        .mockReturnValueOnce(buildChain({ id: 'u1', email: 'user@test.com', role: 'customer' })) // check exists
        .mockReturnValueOnce(buildChain({ id: 'u1', email: 'user@test.com', role: 'admin' }));    // update

      await service.updateRole('u1', { role: 'admin' }, actor);

      expect(bitacora.registrar).toHaveBeenCalledWith(
        expect.objectContaining({ accion: 'CAMBIO_ROL' }),
      );
    });

    it('lanza BadRequestException si el rol no existe', async () => {
      roles.roleExists.mockResolvedValueOnce(false);
      mockFrom.mockReturnValueOnce(buildChain({ id: 'u1', email: 'user@test.com', role: 'customer' }));

      await expect(
        service.updateRole('u1', { role: 'inexistente' }, actor),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
