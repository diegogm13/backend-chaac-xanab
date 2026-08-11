import { Injectable, BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { AccionBitacora, BitacoraQueryDto } from './dto/bitacora-query.dto';

export interface RegistrarBitacoraParams {
  usuarioId?: string | null;
  usuarioEmail?: string | null;
  accion: AccionBitacora;
  detalle?: string;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class BitacoraService {
  constructor(private readonly supabase: SupabaseService) {}

  /** Registra una acción de auditoría. Nunca lanza — un fallo aquí no debe romper el flujo principal. */
  async registrar(params: RegistrarBitacoraParams): Promise<void> {
    try {
      const { error } = await this.supabase.db.from('bitacora').insert({
        usuario_id:    params.usuarioId ?? null,
        usuario_email: params.usuarioEmail ?? null,
        accion:        params.accion,
        detalle:       params.detalle ?? null,
        ip_address:    params.ip ?? null,
        user_agent:    params.userAgent ?? null,
      });
      if (error) console.error('[Bitacora] Error al registrar acción:', error.message);
    } catch (err) {
      console.error('[Bitacora] Error inesperado al registrar acción:', err);
    }
  }

  async findAll(query: BitacoraQueryDto) {
    const page  = query.page ?? 1;
    const limit = query.limit ?? 20;

    let builder = this.supabase.db
      .from('bitacora')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false });

    if (query.accion)     builder = builder.eq('accion', query.accion);
    if (query.usuarioId)  builder = builder.eq('usuario_id', query.usuarioId);
    if (query.desde)      builder = builder.gte('created_at', query.desde);
    if (query.hasta)      builder = builder.lte('created_at', query.hasta);

    const { data, error, count } = await builder.range((page - 1) * limit, page * limit - 1);

    if (error) throw new BadRequestException(error.message);
    return { data: data ?? [], total: count ?? 0, page, limit };
  }
}
