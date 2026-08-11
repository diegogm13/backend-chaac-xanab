import { Module } from '@nestjs/common';
import { RolesService } from './roles.service';
import { RolesController, PermisosController } from './roles.controller';

@Module({
  controllers: [RolesController, PermisosController],
  providers: [RolesService],
  exports: [RolesService],
})
export class RolesModule {}
