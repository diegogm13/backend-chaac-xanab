import { Module } from '@nestjs/common';
import { CategoriasService } from './categorias.service';
import { CategoriasController } from './categorias.controller';
import { CacheService } from '../cache/cache.service';

@Module({
  controllers: [CategoriasController],
  providers: [CategoriasService, CacheService],
  exports: [CategoriasService],
})
export class CategoriasModule {}
