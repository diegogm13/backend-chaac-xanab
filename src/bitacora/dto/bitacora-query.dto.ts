import { IsOptional, IsIn, IsDateString, IsInt, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

export const ACCIONES_BITACORA = [
  'LOGIN', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'LOGOUT',
  'CAMBIO_PASSWORD', 'ALTA_USUARIO', 'BAJA_USUARIO',
  'CAMBIO_ROL', 'ACTIVAR_USUARIO', 'DESACTIVAR_USUARIO',
] as const;

export type AccionBitacora = (typeof ACCIONES_BITACORA)[number];

export class BitacoraQueryDto {
  @IsOptional()
  @IsIn(ACCIONES_BITACORA)
  accion?: AccionBitacora;

  @IsOptional()
  @IsUUID()
  usuarioId?: string;

  @IsOptional()
  @IsDateString()
  desde?: string;

  @IsOptional()
  @IsDateString()
  hasta?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;
}
