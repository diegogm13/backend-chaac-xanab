import { IsString, IsNotEmpty, IsOptional, IsBoolean } from 'class-validator';

export class DireccionDto {
  @IsString() @IsNotEmpty() calle: string;
  @IsString() @IsNotEmpty() numero_ext: string;
  @IsOptional() @IsString() numero_int?: string;
  @IsString() @IsNotEmpty() colonia: string;
  @IsString() @IsNotEmpty() ciudad: string;
  @IsString() @IsNotEmpty() estado: string;
  @IsString() @IsNotEmpty() codigo_postal: string;
  @IsOptional() @IsString() pais?: string;
  @IsOptional() @IsBoolean() es_principal?: boolean;
}
