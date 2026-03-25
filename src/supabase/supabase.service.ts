import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private readonly adminClient: SupabaseClient;
  private readonly publicClient: SupabaseClient;

  constructor(private config: ConfigService) {
    const url = this.config.getOrThrow<string>('SUPABASE_URL');

    // Admin: bypassa RLS — solo para operaciones internas del backend
    this.adminClient = createClient(
      url,
      this.config.getOrThrow<string>('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } },
    );

    // Anon: para operaciones de Auth (signUp, verifyOtp, resend)
    this.publicClient = createClient(
      url,
      this.config.getOrThrow<string>('SUPABASE_ANON_KEY'),
      { auth: { persistSession: false } },
    );
  }

  /** Cliente admin — queries a la BD */
  get db(): SupabaseClient {
    return this.adminClient;
  }

  /** Cliente anon — operaciones de Supabase Auth */
  get auth(): SupabaseClient {
    return this.publicClient;
  }
}
