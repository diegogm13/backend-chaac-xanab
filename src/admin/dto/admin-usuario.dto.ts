import {
  IsEmail, IsNotEmpty, IsString, IsOptional, IsBoolean, IsStrongPassword,
} from 'class-validator';

export class UpdateRoleDto {
  @IsString()
  @IsNotEmpty()
  role: string;
}

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsStrongPassword({ minLength: 8, minLowercase: 1, minUppercase: 1, minNumbers: 1, minSymbols: 1 })
  password: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateAdminUserDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsString()
  role?: string;
}

export class UpdateEstadoDto {
  @IsBoolean()
  activo: boolean;
}
