import { IsEmail, IsString, MinLength, MaxLength } from 'class-validator';

export class ContactoDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  nombre!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(120)
  asunto!: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  mensaje!: string;
}
