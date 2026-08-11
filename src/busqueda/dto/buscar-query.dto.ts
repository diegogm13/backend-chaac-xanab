import { IsString, MinLength, MaxLength } from 'class-validator';

export class BuscarQueryDto {
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  q!: string;
}
