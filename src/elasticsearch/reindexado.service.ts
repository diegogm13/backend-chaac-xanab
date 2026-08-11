import { Injectable, Logger } from '@nestjs/common';
import { ProductosService } from '../productos/productos.service';
import { ElasticsearchService } from './elasticsearch.service';
import { mapearProductoADocumento, ProductoSupabaseRow, PRODUCTOS_DEMO } from './producto-documento.model';

@Injectable()
export class ReindexadoService {
  private readonly logger = new Logger(ReindexadoService.name);

  constructor(
    private readonly productosService: ProductosService,
    private readonly elasticsearchService: ElasticsearchService,
  ) {}

  /**
   * Reindexa TODO el catálogo activo real de Supabase.
   * incluirDemo=true además (re)agrega los 4 productos de ejemplo — están apagados
   * por defecto porque ya se confirmó que la búsqueda funciona con catálogo real.
   */
  async reindexarTodo(incluirDemo = false): Promise<{ productosReales: number; productosDemo: number; disponible: boolean }> {
    const disponible = await this.elasticsearchService.estaDisponible();
    if (!disponible) {
      this.logger.warn('Elasticsearch no está disponible — no se puede reindexar');
      return { productosReales: 0, productosDemo: 0, disponible: false };
    }

    const filas = (await this.productosService.findAll({})) as unknown as ProductoSupabaseRow[];
    const documentosReales = filas.map(mapearProductoADocumento);

    const indexadosReales = await this.elasticsearchService.indexarProductos(documentosReales);
    const indexadosDemo = incluirDemo ? await this.elasticsearchService.indexarProductos(PRODUCTOS_DEMO) : 0;

    this.logger.log(`Reindexado completo: ${indexadosReales} productos reales, ${indexadosDemo} de ejemplo`);
    return { productosReales: indexadosReales, productosDemo: indexadosDemo, disponible: true };
  }

  /** Quita del índice los 4 productos de ejemplo (si estaban puestos de una demo anterior). */
  async quitarProductosDemo(): Promise<number> {
    for (const doc of PRODUCTOS_DEMO) {
      await this.elasticsearchService.eliminarProducto(doc.producto_id);
    }
    this.logger.log(`${PRODUCTOS_DEMO.length} productos de ejemplo quitados del índice`);
    return PRODUCTOS_DEMO.length;
  }
}
