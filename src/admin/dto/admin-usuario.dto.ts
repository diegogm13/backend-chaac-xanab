import { IsIn } from 'class-validator';

export class UpdateRoleDto {
  @IsIn(['customer', 'admin'])
  role: string;
}
