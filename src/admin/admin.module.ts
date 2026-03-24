import { Module } from '@nestjs/common';
import { AdminProductosService } from './admin-productos.service';
import { AdminCategoriasService } from './admin-categorias.service';
import { AdminComprasService } from './admin-compras.service';
import { AdminUsuariosService } from './admin-usuarios.service';
import { AdminProductosController } from './admin-productos.controller';
import { AdminCategoriasController } from './admin-categorias.controller';
import { AdminComprasController } from './admin-compras.controller';
import { AdminUsuariosController } from './admin-usuarios.controller';
import { AuthModule } from '../auth/auth.module';
import { CacheService } from '../cache/cache.service';

@Module({
  imports: [AuthModule],
  controllers: [
    AdminProductosController,
    AdminCategoriasController,
    AdminComprasController,
    AdminUsuariosController,
  ],
  providers: [
    AdminProductosService,
    AdminCategoriasService,
    AdminComprasService,
    AdminUsuariosService,
    CacheService,
  ],
})
export class AdminModule {}
