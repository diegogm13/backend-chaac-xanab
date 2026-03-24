import { Injectable } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class LinksExternosService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll() {
    const { data, error } = await this.supabase.db
      .from('links_externos')
      .select('id, name, url')
      .order('orden', { ascending: true });

    if (error) throw new Error(error.message);
    return data ?? [];
  }
}
