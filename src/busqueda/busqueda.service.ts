import { Injectable, Logger } from '@nestjs/common';
import { ProductosService } from '../productos/productos.service';
import { Channel3Service } from '../channel3/channel3.service';
import { ExternalProduct } from '../channel3/external-product.model';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { ProductoDocumentoES } from '../elasticsearch/producto-documento.model';

@Injectable()
export class BusquedaService {
  private readonly logger = new Logger(BusquedaService.name);

  constructor(
    private readonly productosService: ProductosService,
    private readonly channel3Service: Channel3Service,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  /**
   * Búsqueda propia: Elasticsearch primero (multi-campo, sinónimos, tolerante a errores),
   * con fallback automático al buscador por ILIKE en Supabase si Elasticsearch no está
   * disponible — la búsqueda nunca se rompe aunque Elasticsearch esté caído o sin configurar.
   * Solo si NO hay resultados propios se consulta Channel3 (tienda aliada).
   */
  async buscar(q: string): Promise<{
    ownProducts: unknown[];
    externalProducts: ExternalProduct[];
    motor: 'elasticsearch' | 'supabase';
  }> {
    const elasticsearchDisponible = await this.elasticsearchService.estaDisponible();

    if (elasticsearchDisponible) {
      const hits = await this.elasticsearchService.buscar(q);
      if (hits.length > 0) {
        return {
          ownProducts: hits.map(documentoAProducto),
          externalProducts: [],
          motor: 'elasticsearch',
        };
      }
      // Elasticsearch respondió pero sin coincidencias — se intenta Channel3 más abajo.
    } else {
      this.logger.warn('Elasticsearch no disponible, usando búsqueda por coincidencia de texto en Supabase');
    }

    // Fallback: buscador original (ILIKE en Supabase) — cubre tanto "ES caído" como
    // "ES no encontró nada pero un match literal de texto sí existe".
    const ownProducts = await this.productosService.buscarPorTermino(q);
    if (ownProducts.length > 0) {
      return { ownProducts, externalProducts: [], motor: 'supabase' };
    }

    const externalProducts = await this.channel3Service.search(q);
    return { ownProducts: [], externalProducts, motor: elasticsearchDisponible ? 'elasticsearch' : 'supabase' };
  }
}

/** Convierte un documento de Elasticsearch a la misma forma que ya espera el frontend (fila de Supabase). */
function documentoAProducto(doc: ProductoDocumentoES) {
  return {
    id: doc.producto_id,
    name: doc.nombre,
    description: doc.descripcion,
    price: doc.precio,
    original_price: doc.precio_original ?? undefined,
    stock: doc.disponibilidad === 'disponible' ? 1 : 0,
    image_url: doc.imagen_url ?? '',
    sizes: doc.tallas,
    badge: doc.badge ?? undefined,
    activo: doc.activo,
    categorias: doc.categoria ? { id: '', slug: '', name: doc.categoria } : undefined,
    // Campos extra del motor de búsqueda inteligente — el frontend los usa solo para
    // mostrar la insignia de "producto de ejemplo"; el resto del diseño no cambia.
    demo: doc.demo,
    marca: doc.marca ?? undefined,
    color: doc.color ?? undefined,
    genero: doc.genero ?? undefined,
  };
}
