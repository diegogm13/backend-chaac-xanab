import { Injectable, NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CacheService } from '../cache/cache.service';
import { QueryProductosDto } from './dto/query-productos.dto';

const TTL = 60_000; // 60 segundos

const SELECT = `
  id, name, description, price, original_price,
  stock, image_url, sizes, badge, activo,
  categorias (id, slug, name)
`;

@Injectable()
export class ProductosService {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly cache:    CacheService,
  ) {}

  async findAll(query: QueryProductosDto) {
    const cacheKey = `productos:${query.categoria_slug ?? ''}:${query.badge ?? ''}`;
    const cached = this.cache.get<unknown[]>(cacheKey);
    if (cached) return cached;

    let qb = this.supabase.db
      .from('productos')
      .select(SELECT)
      .eq('activo', true)
      .order('created_at', { ascending: false });

    if (query.badge) {
      qb = qb.eq('badge', query.badge);
    }

    if (query.categoria_slug) {
      // Filtro por join — evita la segunda query al resolver slug→id
      qb = (qb as any).eq('categorias.slug', query.categoria_slug);
    }

    const { data, error } = await qb;
    if (error) throw new Error(error.message);

    // Cuando se filtra por categorias.slug, Supabase devuelve productos cuya
    // categoría no coincide con categorias = null → los filtramos aquí
    const result = query.categoria_slug
      ? (data ?? []).filter((p: any) => p.categorias !== null)
      : (data ?? []);

    this.cache.set(cacheKey, result, TTL);
    return result;
  }

  async findOne(id: string) {
    const key = `producto:${id}`;
    const cached = this.cache.get<unknown>(key);
    if (cached) return cached;

    const { data, error } = await this.supabase.db
      .from('productos')
      .select(SELECT)
      .eq('id', id)
      .eq('activo', true)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!data) throw new NotFoundException('Producto no encontrado');
    this.cache.set(key, data, TTL);
    return data;
  }
}
