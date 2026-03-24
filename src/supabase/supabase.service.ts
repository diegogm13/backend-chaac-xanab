import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly client: SupabaseClient;

  constructor(private config: ConfigService) {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');
    const key = this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY');
    // Service Role Key: bypassa RLS, solo usar en el backend
    this.client = createClient(url, key, {
      auth: { persistSession: false },
    });
  }

  /** Devuelve el cliente listo para queries */
  get db(): SupabaseClient {
    return this.client;
  }
}
