import { IsOptional, IsString, IsIn } from 'class-validator';

export class QueryProductosDto {
  @IsOptional()
  @IsString()
  categoria_slug?: string;

  @IsOptional()
  @IsIn(['new', 'popular', 'sale'])
  badge?: string;
}
