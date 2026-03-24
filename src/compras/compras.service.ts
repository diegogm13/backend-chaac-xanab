import {
  Injectable, BadRequestException,
  NotFoundException, ForbiddenException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateCompraDto } from './dto/create-compra.dto';

@Injectable()
export class ComprasService {
  constructor(private readonly supabase: SupabaseService) {}

  // ─── Guardar dirección inline y devolver su ID ───────────────────────────────
  private async upsertDireccion(userId: string, dir: NonNullable<CreateCompraDto['direccion']>): Promise<string | null> {
    const payload = { user_id: userId, es_principal: true, pais: dir.pais ?? 'México', ...dir };

    const { data: existing } = await this.supabase.db
      .from('usuarios_direcciones')
      .select('id')
      .eq('user_id', userId)
      .eq('es_principal', true)
      .maybeSingle();

    if (existing) {
      const { data } = await this.supabase.db
        .from('usuarios_direcciones')
        .update(payload)
        .eq('id', existing.id)
        .select('id')
        .single();
      return data?.id ?? null;
    }

    const { data } = await this.supabase.db
      .from('usuarios_direcciones')
      .insert(payload)
      .select('id')
      .single();
    return data?.id ?? null;
  }

  // ─── Confirmar compra ────────────────────────────────────────────────────────
  async create(userId: string, dto: CreateCompraDto) {
    const { items } = dto;

    // Resolver ID de dirección: viene como UUID o como objeto inline
    let direccion_id: string | null = dto.direccion_id ?? null;
    if (!direccion_id && dto.direccion) {
      direccion_id = await this.upsertDireccion(userId, dto.direccion);
    }

    // 1. Obtener todos los productos de la compra de una sola query
    const productIds = items.map(i => i.producto_id);
    const { data: productos, error: prodError } = await this.supabase.db
      .from('productos')
      .select('id, name, price, image_url, stock, activo')
      .in('id', productIds)
      .eq('activo', true);

    if (prodError) throw new BadRequestException(prodError.message);

    // 2. Validar que todos los productos existen y tienen stock suficiente
    const productoMap = new Map((productos ?? []).map(p => [p.id, p]));

    for (const item of items) {
      const prod = productoMap.get(item.producto_id);
      if (!prod) {
        throw new BadRequestException(`Producto ${item.producto_id} no encontrado o inactivo`);
      }
      if (prod.stock < item.quantity) {
        throw new BadRequestException(
          `Stock insuficiente para "${prod.name}". Disponible: ${prod.stock}, pedido: ${item.quantity}`,
        );
      }
    }

    // 3. Calcular total
    const total = items.reduce((sum, item) => {
      const prod = productoMap.get(item.producto_id)!;
      return sum + prod.price * item.quantity;
    }, 0);

    // 4. Crear registro de compra
    const { data: compra, error: compraError } = await this.supabase.db
      .from('compras')
      .insert({ user_id: userId, direccion_id: direccion_id ?? null, total })
      .select('id, total, status, created_at')
      .single();

    if (compraError) throw new BadRequestException(compraError.message);

    // 5. Insertar items con snapshot de precio/nombre/imagen
    const compraItems = items.map(item => {
      const prod = productoMap.get(item.producto_id)!;
      return {
        compra_id:   compra.id,
        producto_id: item.producto_id,
        name:        prod.name,
        price:       prod.price,
        size:        item.size,
        quantity:    item.quantity,
        image_url:   prod.image_url,
      };
    });

    const { error: itemsError } = await this.supabase.db
      .from('compras_items')
      .insert(compraItems);

    if (itemsError) throw new BadRequestException(itemsError.message);

    // 6. Descontar stock de cada producto
    for (const item of items) {
      const prod = productoMap.get(item.producto_id)!;
      await this.supabase.db
        .from('productos')
        .update({ stock: prod.stock - item.quantity })
        .eq('id', item.producto_id);
    }

    return { ...compra, items: compraItems };
  }

  // ─── Historial del usuario autenticado ──────────────────────────────────────
  async findMisCompras(userId: string) {
    const { data, error } = await this.supabase.db
      .from('compras')
      .select(`
        id, total, status, created_at,
        compras_items (id, name, price, size, quantity, image_url)
      `)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data ?? [];
  }

  // ─── Detalle de una compra (solo el dueño) ───────────────────────────────────
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

    if (error) throw new BadRequestException(error.message);
    if (!data) throw new NotFoundException('Compra no encontrada');
    if (data.user_id !== userId) throw new ForbiddenException('No tienes acceso a esta compra');

    return data;
  }
}
