import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SupabaseModule } from './supabase/supabase.module';
import { CacheService } from './cache/cache.service';
import { AuthModule } from './auth/auth.module';
import { CategoriasModule } from './categorias/categorias.module';
import { ProductosModule } from './productos/productos.module';
import { LinksExternosModule } from './links-externos/links-externos.module';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { AdminModule } from './admin/admin.module';
import { ComprasModule } from './compras/compras.module';
import { WebAuthnModule } from './webauthn/webauthn.module';
import { BitacoraModule } from './bitacora/bitacora.module';
import { RolesModule } from './roles/roles.module';
import { Channel3Module } from './channel3/channel3.module';
import { BusquedaModule } from './busqueda/busqueda.module';
import { ContactoModule } from './contacto/contacto.module';
import { ElasticsearchModule } from './elasticsearch/elasticsearch.module';
import { ReindexadoModule } from './elasticsearch/reindexado.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    CloudinaryModule,
    BitacoraModule,
    RolesModule,
    AuthModule,
    CategoriasModule,
    ProductosModule,
    LinksExternosModule,
    AdminModule,
    ComprasModule,
    WebAuthnModule,
    Channel3Module,
    BusquedaModule,
    ContactoModule,
    ElasticsearchModule,
    ReindexadoModule,
  ],
  providers: [CacheService],
  exports:   [CacheService],
})
export class AppModule {}
