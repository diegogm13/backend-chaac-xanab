import { IsIn, IsOptional, IsString } from 'class-validator';

const STATUSES = ['pendiente', 'procesando', 'confirmado', 'enviado', 'entregado', 'cancelado'] as const;

export class UpdateCompraStatusDto {
  @IsIn(STATUSES)
  status: string;
}

export class QueryComprasDto {
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @IsOptional()
  @IsString()
  user_id?: string;
}
