import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CacheService } from '../cache/cache.service';

const TTL = 60_000; // 60 segundos

@Injectable()
export class CategoriasService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly cache:    CacheService,
  ) {}

  async findAll() {
    const cached = this.cache.get<unknown[]>('categorias:all');
    if (cached) return cached;

    const { data, error } = await this.supabase.db
      .from('categorias')
      .select('*')
      .order('orden', { ascending: true });

    if (error) throw new Error(error.message);
    const result = data ?? [];
    this.cache.set('categorias:all', result, TTL);
    return result;
  }

  async findBySlug(slug: string) {
    const key = `categorias:slug:${slug}`;
    const cached = this.cache.get<unknown>(key);
    if (cached) return cached;

    const { data, error } = await this.supabase.db
      .from('categorias')
      .select('*')
      .eq('slug', slug)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException(`Categoría '${slug}' no encontrada`);
    this.cache.set(key, data, TTL);
    return data;
  }
}
