import {
  IsString, IsNotEmpty, IsNumber, IsOptional,
  IsArray, IsIn, IsBoolean, Min, IsUUID,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

function parseSizes({ value }: { value: unknown }): string[] {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch { return [value]; }
  }
  return [];
}

function parseBoolean({ value }: { value: unknown }): boolean {
  if (typeof value === 'boolean') return value;
  return value === 'true';
}

export class CreateProductoDto {
  @IsOptional() @IsUUID()
  categoria_id?: string;

  @IsString() @IsNotEmpty()
  name: string;

  @IsOptional() @IsString()
  description?: string;

  @Type(() => Number)
  @IsNumber() @Min(0)
  price: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  original_price?: number;

  @Type(() => Number)
  @IsNumber() @Min(0)
  stock: number;

  @Transform(parseSizes)
  @IsArray()
  @IsString({ each: true })
  sizes: string[];

  @IsOptional()
  @IsIn(['new', 'popular', 'sale'])
  badge?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  activo?: boolean;
}

export class UpdateProductoDto {
  @IsOptional() @IsUUID()
  categoria_id?: string;

  @IsOptional() @IsString() @IsNotEmpty()
  name?: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  original_price?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  stock?: number;

  @IsOptional()
  @Transform(parseSizes)
  @IsArray()
  @IsString({ each: true })
  sizes?: string[];

  @IsOptional()
  @IsIn(['new', 'popular', 'sale'])
  badge?: string;

  @IsOptional()
  @Transform(parseBoolean)
  @IsBoolean()
  activo?: boolean;
}

export class AjusteStockDto {
  @Type(() => Number)
  @IsNumber()
  delta: number; // positivo = añadir, negativo = quitar
}
