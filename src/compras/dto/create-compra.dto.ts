import {
  IsArray, IsOptional, IsUUID, IsString,
  IsNumber, IsNotEmpty, Min, ValidateNested, ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CompraItemDto {
  @IsUUID()
  producto_id: string;

  @IsString() @IsNotEmpty()
  size: string;

  @IsNumber() @Min(1)
  @Type(() => Number)
  quantity: number;
}

export class DireccionInlineDto {
  @IsString() @IsNotEmpty()
  calle: string;

  @IsString() @IsNotEmpty()
  numero_ext: string;

  @IsOptional() @IsString()
  numero_int?: string;

  @IsString() @IsNotEmpty()
  colonia: string;

  @IsString() @IsNotEmpty()
  ciudad: string;

  @IsString() @IsNotEmpty()
  estado: string;

  @IsString() @IsNotEmpty()
  codigo_postal: string;

  @IsOptional() @IsString()
  pais?: string;
}

export class CreateCompraDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CompraItemDto)
  items: CompraItemDto[];

  @IsOptional()
  @IsUUID()
  direccion_id?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => DireccionInlineDto)
  direccion?: DireccionInlineDto;
}
