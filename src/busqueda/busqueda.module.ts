import { Module } from '@nestjs/common';
import { BusquedaController } from './busqueda.controller';
import { BusquedaService } from './busqueda.service';
import { ProductosModule } from '../productos/productos.module';
import { Channel3Module } from '../channel3/channel3.module';
import { ElasticsearchModule } from '../elasticsearch/elasticsearch.module';

@Module({
  imports: [ProductosModule, Channel3Module, ElasticsearchModule],
  controllers: [BusquedaController],
  providers: [BusquedaService],
})
export class BusquedaModule {}
