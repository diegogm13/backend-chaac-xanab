import { Module } from '@nestjs/common';
import { ReindexadoController } from './reindexado.controller';
import { ReindexadoService } from './reindexado.service';
import { ElasticsearchModule } from './elasticsearch.module';
import { ProductosModule } from '../productos/productos.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [ElasticsearchModule, ProductosModule, AuthModule],
  controllers: [ReindexadoController],
  providers: [ReindexadoService],
})
export class ReindexadoModule {}
