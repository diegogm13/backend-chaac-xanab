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

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    SupabaseModule,
    CloudinaryModule,
    AuthModule,
    CategoriasModule,
    ProductosModule,
    LinksExternosModule,
    AdminModule,
    ComprasModule,
    WebAuthnModule,
  ],
  providers: [CacheService],
  exports:   [CacheService],
})
export class AppModule {}
