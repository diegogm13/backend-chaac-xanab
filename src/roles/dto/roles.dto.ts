import { IsArray, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateRoleDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsOptional()
  @IsString()
  descripcion?: string;
}

export class UpdateRolePermisosDto {
  @IsArray()
  @IsUUID('4', { each: true })
  permisoIds: string[];
}
