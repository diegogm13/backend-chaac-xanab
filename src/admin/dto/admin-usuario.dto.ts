import { IsIn, IsEmail, IsNotEmpty, IsString, IsOptional, MinLength } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['customer', 'admin'])
  role: string;
}

export class CreateAdminUserDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsIn(['customer', 'admin'])
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
  @IsIn(['customer', 'admin'])
  role?: string;
}
