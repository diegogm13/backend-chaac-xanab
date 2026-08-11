import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { CacheService } from '../cache/cache.service';
import { CreateProductoDto, UpdateProductoDto, AjusteStockDto } from './dto/create-producto.dto';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { mapearProductoADocumento, ProductoSupabaseRow } from '../elasticsearch/producto-documento.model';

@Injectable()
export class AdminProductosService {
  private readonly logger = new Logger(AdminProductosService.name);

  constructor(
    private readonly supabase:       SupabaseService,
    private readonly cloudinary:     CloudinaryService,
    private readonly cache:          CacheService,
    private readonly elasticsearch:  ElasticsearchService,
  ) {}

  /** Mantiene el índice de Elasticsearch al día. Nunca lanza: un fallo aquí no debe tumbar el CRUD del admin. */
  private sincronizarIndice(row: unknown): void {
    this.elasticsearch
      .indexarProducto(mapearProductoADocumento(row as ProductoSupabaseRow))
      .catch((err) => this.logger.warn(`No se pudo sincronizar con Elasticsearch: ${(err as Error).message}`));
  }

  async findAll(): Promise<unknown> {
    const { data, error } = await this.supabase.db
      .from('productos')
      .select('*, categorias(id, slug, name)')
      .order('created_at', { ascending: false });

    if (error) throw new BadRequestException(error.message);
    return data;
  }

  async create(dto: CreateProductoDto, imageBuffer?: Buffer): Promise<unknown> {
    let image_url: string | undefined;

    if (imageBuffer) {
      image_url = await this.cloudinary.uploadBuffer(
        imageBuffer,
        'chaac-xanab/productos',
      );
    }

    const { data, error } = await this.supabase.db
      .from('productos')
      .insert({ ...dto, image_url })
      .select('*, categorias(id, slug, name)')
      .single();

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('productos:');
    this.sincronizarIndice(data);
    return data;
  }

  async update(id: string, dto: UpdateProductoDto, imageBuffer?: Buffer): Promise<unknown> {
    const { data: existing } = await this.supabase.db
      .from('productos')
      .select('id, image_url')
      .eq('id', id)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Producto no encontrado');

    const updates: Record<string, unknown> = { ...dto };

    if (imageBuffer) {
      // Subir nueva imagen y eliminar la anterior
      updates['image_url'] = await this.cloudinary.uploadBuffer(
        imageBuffer,
        'chaac-xanab/productos',
      );
      if (existing.image_url) {
        await this.cloudinary.deleteByUrl(existing.image_url);
      }
    }

    const { data, error } = await this.supabase.db
      .from('productos')
      .update(updates)
      .eq('id', id)
      .select('*, categorias(id, slug, name)')
      .single();

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('productos:');
    this.sincronizarIndice(data);
    return data;
  }

  async remove(id: string): Promise<{ message: string }> {
    const { data: existing } = await this.supabase.db
      .from('productos')
      .select('id')
      .eq('id', id)
      .maybeSingle();

    if (!existing) throw new NotFoundException('Producto no encontrado');

    // Soft delete: marcar como inactivo
    const { error } = await this.supabase.db
      .from('productos')
      .update({ activo: false })
      .eq('id', id);

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('productos:');
    this.elasticsearch.eliminarProducto(id)
      .catch((err) => this.logger.warn(`No se pudo quitar el producto del índice: ${(err as Error).message}`));
    return { message: 'Producto eliminado correctamente' };
  }

  async ajustarStock(id: string, dto: AjusteStockDto): Promise<unknown> {
    // Leer stock actual
    const { data: producto } = await this.supabase.db
      .from('productos')
      .select('id, stock')
      .eq('id', id)
      .maybeSingle();

    if (!producto) throw new NotFoundException('Producto no encontrado');

    const nuevoStock = producto.stock + dto.delta;
    if (nuevoStock < 0) {
      throw new BadRequestException(
        `Stock insuficiente. Actual: ${producto.stock}, delta: ${dto.delta}`,
      );
    }

    const { data, error } = await this.supabase.db
      .from('productos')
      .update({ stock: nuevoStock })
      .eq('id', id)
      .select('id, name, stock')
      .single();

    if (error) throw new BadRequestException(error.message);
    this.cache.delByPrefix('productos:');

    // El .select() de arriba solo trae {id, name, stock} para no cambiar el contrato de
    // esta respuesta; para sincronizar el índice se vuelve a leer la fila completa aparte.
    (async () => {
      try {
        const { data: fila } = await this.supabase.db
          .from('productos')
          .select('*, categorias(id, slug, name)')
          .eq('id', id)
          .maybeSingle();
        if (fila) this.sincronizarIndice(fila);
      } catch (err) {
        this.logger.warn(`No se pudo releer el producto para sincronizar: ${(err as Error).message}`);
      }
    })();

    return data;
  }
}
