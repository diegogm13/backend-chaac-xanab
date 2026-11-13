import {
  Injectable, BadRequestException, ConflictException,
  NotFoundException, ForbiddenException, InternalServerErrorException, Logger,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompraDto } from './dto/create-compra.dto';

/** Resultado de crear una compra; `repetida` indica que se devolvió una compra ya existente (idempotencia). */
export interface ResultadoCompra {
  repetida: boolean;
  compra: Record<string, unknown> & { items: unknown[] };
}

type ErrorPg = { message: string; code?: string };

@Injectable()
export class ComprasService {
  private readonly logger = new Logger(ComprasService.name);

  constructor(private readonly supabase: SupabaseService) {}

  // ─── Confirmar compra ─────────────────────────────────────────────────────
  // Práctica 12: antes eran 6 + N viajes secuenciales a Supabase (dirección,
  // productos, cabecera, renglones y un UPDATE de stock por producto) sin
  // transacción, con lectura-cálculo-escritura del stock. Ahora es UNA llamada a
  // la función crear_compra (practica12/sql/optimizacion.sql), que corre en una
  // sola transacción, descuenta el stock de forma atómica
  // (UPDATE … SET stock = stock − n WHERE stock >= n) y aplica la llave de
  // idempotencia para que un reintento no duplique la compra.
  async create(userId: string, dto: CreateCompraDto, idempotencyKey?: string): Promise<ResultadoCompra> {
    const params = {
      p_user_id: userId,
      p_items: dto.items.map((i) => ({ producto_id: i.producto_id, size: i.size, quantity: i.quantity })),
      p_direccion: dto.direccion ?? null,
      p_direccion_id: dto.direccion_id ?? null,
      p_idempotency_key: idempotencyKey ?? null,
    };

    let { data, error } = await this.supabase.db.rpc('crear_compra', params);
    // Dos peticiones simultáneas con la misma llave: la segunda choca con el índice
    // único (23505) y, al repetir la llamada, recibe la compra que ganó.
    if (error?.code === '23505' && idempotencyKey) {
      ({ data, error } = await this.supabase.db.rpc('crear_compra', params));
    }
    if (error) throw this.traducirError(error);

    const r = data as { repetida: boolean; compra: Record<string, unknown>; items: unknown[] };
    return { repetida: r.repetida, compra: { ...r.compra, items: r.items } };
  }

  /** Convierte los errores de PostgreSQL en respuestas HTTP con el código correcto (antes todo era 400). */
  private traducirError(error: ErrorPg) {
    switch (error.code) {
      case 'P0001': return new ConflictException(error.message);          // stock insuficiente → 409
      case 'P0002': return new NotFoundException(error.message);          // producto inexistente o inactivo → 404
      case 'P0003': return new BadRequestException(error.message);        // compra sin productos → 400
      case '22P02': return new BadRequestException('Identificador inválido');
      default:
        this.logger.error(`crear_compra falló: ${error.code ?? ''} ${error.message}`);
        return new InternalServerErrorException('No se pudo registrar la compra');
    }
  }

  // ─── Historial del usuario autenticado ────────────────────────────────────
  // Práctica 12: paginación opcional por cursor (limite + antes=<created_at>).
  // Sin parámetros responde igual que antes (todas), para no romper al sitio web.
  async findMisCompras(userId: string, limite?: number, antes?: string) {
    let q = this.supabase.db
      .from('compras')
      .select(`
        id, total, status, created_at,
        compras_items (id, name, price, size, quantity, image_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (antes) q = q.lt('created_at', antes);
    if (limite) q = q.limit(limite);

    const { data, error } = await q;
    if (error) throw this.traducirError(error);
    return data ?? [];
  }

  // ─── Detalle de una compra (solo el dueño) ────────────────────────────────
  async findOne(compraId: string, userId: string) {
    const { data, error } = await this.supabase.db
      .from('compras')
      .select(`
        id, total, status, created_at, user_id,
        compras_items (id, name, price, size, quantity, image_url, producto_id),
        usuarios_direcciones (calle, numero_ext, colonia, ciudad, estado, codigo_postal)
      `)
      .eq('id', compraId)
      .maybeSingle();

    if (error) throw this.traducirError(error);
    if (!data) throw new NotFoundException('Compra no encontrada');
    if (data.user_id !== userId) throw new ForbiddenException('No tienes acceso a esta compra');

    return data;
  }
}
