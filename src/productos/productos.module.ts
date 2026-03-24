import { Module } from '@nestjs/common';
import { ProductosService } from './productos.service';
import { ProductosController } from './productos.controller';
import { CacheService } from '../cache/cache.service';

@Module({
  controllers: [ProductosController],
  providers: [ProductosService, CacheService],
  exports: [ProductosService],
})
export class ProductosModule {}
