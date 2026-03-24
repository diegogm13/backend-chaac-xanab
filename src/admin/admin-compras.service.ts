import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { UpdateCompraStatusDto, QueryComprasDto } from './dto/admin-compra.dto';

@Injectable()
export class AdminComprasService {
  constructor(private readonly supabase: SupabaseService) {}

  async findAll(query: QueryComprasDto) {
    let qb = this.supabase.db
      .from('compras')
      .select(`
        id, total, status, created_at,
        usuarios (id, name, email),
        compras_items (id, name, price, size, quantity, image_url)
      `)
      .order('created_at', { ascending: false });

    if (query.status) qb = qb.eq('status', query.status);
    if (query.user_id) qb = qb.eq('user_id', query.user_id);

    const { data, error } = await qb;
    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  async updateStatus(compraId: string, dto: UpdateCompraStatusDto) {
    const { data: existing } = await this.supabase.db
      .from('compras')
      .select('id')
      .eq('id', compraId)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Compra no encontrada');

    const { data, error } = await this.supabase.db
      .from('compras')
      .update({ status: dto.status })
      .eq('id', compraId)
      .select('id, status, total, created_at')
      .single();

    if (error) throw new BadRequestException(error.message);
    return data;
  }
}
