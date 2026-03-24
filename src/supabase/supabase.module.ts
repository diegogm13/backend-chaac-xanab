import { Global, Module } from '@nestjs/common';
import { SupabaseService } from './supabase.service';

@Global() // disponible en todos los módulos sin importar manualmente
@Module({
  providers: [SupabaseService],
  exports: [SupabaseService],
})
export class SupabaseModule {}
