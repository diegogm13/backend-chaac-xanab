import { IsString, IsNotEmpty, IsOptional, IsNumber, IsIn, Min } from 'class-validator';
import { Type } from 'class-transformer';

const SLUGS_VALIDOS = [
  'running','lifestyle','basquetbol','nuevo',
  'hombre','mujer','ninos','ofertas','snkrs',
] as const;

export class CreateCategoriaDto {
  @IsIn(SLUGS_VALIDOS)
  slug: string;

  @IsString() @IsNotEmpty()
  name: string;

  @IsOptional() @IsString()
  subtitle?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  orden?: number;
}

export class UpdateCategoriaDto {
  @IsOptional() @IsString() @IsNotEmpty()
  name?: string;

  @IsOptional() @IsString()
  subtitle?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber() @Min(0)
  orden?: number;
}
