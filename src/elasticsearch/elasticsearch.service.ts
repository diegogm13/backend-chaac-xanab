import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ProductoDocumentoES } from './producto-documento.model';

export const INDICE_PRODUCTOS = 'productos';

/**
 * Habla con Elasticsearch (o cualquier motor compatible con su API REST, como
 * OpenSearch) por HTTP directo en vez del cliente oficial @elastic/elasticsearch.
 * Se decidió así porque ese cliente rechaza a propósito conectarse a motores que
 * no sean Elasticsearch "genuino" (revisa una cabecera especial y truena si no
 * la encuentra) — y servicios alojados como Bonsai suelen dar clústers OpenSearch.
 * Peticiones HTTP simples funcionan igual contra los dos.
 */
@Injectable()
export class ElasticsearchService {
  private readonly logger = new Logger(ElasticsearchService.name);
  private indiceListo = false;

  constructor(private readonly config: ConfigService) {}

  /** URL base (sin credenciales embebidas) + cabeceras de auth. null si no hay configuración. */
  private getConexion(): { baseUrl: string; headers: Record<string, string> } | null {
    const node = this.config.get<string>('ELASTICSEARCH_NODE');
    if (!node) {
      this.logger.warn('ELASTICSEARCH_NODE no configurado — la búsqueda inteligente está deshabilitada');
      return null;
    }

    let url: URL;
    try {
      url = new URL(node);
    } catch {
      this.logger.error(`ELASTICSEARCH_NODE no es una URL válida: "${node}"`);
      return null;
    }

    const headers: Record<string, string> = { 'content-type': 'application/json' };

    const apiKey = this.config.get<string>('ELASTICSEARCH_API_KEY');
    const usuarioEnv = this.config.get<string>('ELASTICSEARCH_USERNAME');
    const passwordEnv = this.config.get<string>('ELASTICSEARCH_PASSWORD');

    // Prioridad: API key > usuario/contraseña embebidos en la URL (típico de
    // Bonsai: https://user:pass@host) > usuario/contraseña en variables separadas.
    if (apiKey) {
      headers['authorization'] = `ApiKey ${apiKey}`;
    } else if (url.username || url.password) {
      const usuario = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      headers['authorization'] = `Basic ${Buffer.from(`${usuario}:${password}`).toString('base64')}`;
      url.username = '';
      url.password = '';
    } else if (usuarioEnv && passwordEnv) {
      headers['authorization'] = `Basic ${Buffer.from(`${usuarioEnv}:${passwordEnv}`).toString('base64')}`;
    }

    return { baseUrl: url.origin, headers };
  }

  private async peticion(
    metodo: string,
    ruta: string,
    body?: unknown,
  ): Promise<{ ok: boolean; status: number; data: any }> {
    const conexion = this.getConexion();
    if (!conexion) return { ok: false, status: 0, data: null };

    const res = await fetch(`${conexion.baseUrl}${ruta}`, {
      method: metodo,
      headers: conexion.headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });

    const texto = await res.text();
    let data: any = null;
    try { data = texto ? JSON.parse(texto) : null; } catch { data = texto; }
    return { ok: res.ok, status: res.status, data };
  }

  /** true si Elasticsearch/OpenSearch está configurado Y responde. Nunca lanza. */
  async estaDisponible(): Promise<boolean> {
    if (!this.getConexion()) return false;
    try {
      const { ok } = await this.peticion('GET', '/_cluster/health');
      return ok;
    } catch (err) {
      this.logger.warn(`Elasticsearch no responde: ${(err as Error).message}`);
      return false;
    }
  }

  /** Crea el índice con su mapping y analizador de sinónimos si todavía no existe. Idempotente. */
  async asegurarIndice(): Promise<boolean> {
    if (this.indiceListo) return true;
    if (!this.getConexion()) return false;

    try {
      const existe = await this.peticion('HEAD', `/${INDICE_PRODUCTOS}`);
      if (existe.status === 404) {
        const creado = await this.peticion('PUT', `/${INDICE_PRODUCTOS}`, {
          settings: {
            analysis: {
              filter: {
                sinonimos_filter: {
                  type: 'synonym_graph',
                  // Cada línea es un grupo de términos intercambiables.
                  synonyms: [
                    'dama, damas, mujer, mujeres, femenino, femenina',
                    'caballero, caballeros, hombre, hombres, masculino, varonil',
                    'niño, niños, niña, niñas, infantil, kids',
                    'zapatos, zapato, tenis, calzado, zapatillas, zapatilla',
                    'rosa, rosado, rosada, rosita',
                    'deportivo, deportivos, deportiva, deportivas',
                  ],
                },
                // Quita palabras vacías ("para", "de", "la"...) para que no generen
                // coincidencias ruidosas cuando se busca con operador OR.
                palabras_vacias: {
                  type: 'stop',
                  stopwords: '_spanish_',
                },
              },
              analyzer: {
                // Analizador de INDEXADO: sin expansión de sinónimos (recomendado por Elastic:
                // synonym_graph no debe usarse al indexar, solo al buscar).
                analizador_indexado: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'palabras_vacias'],
                },
                // Analizador de BÚSQUEDA: aquí sí se expanden los sinónimos.
                analizador_busqueda: {
                  type: 'custom',
                  tokenizer: 'standard',
                  filter: ['lowercase', 'asciifolding', 'palabras_vacias', 'sinonimos_filter'],
                },
              },
            },
          },
          mappings: {
            properties: {
              producto_id:      { type: 'keyword' },
              nombre:            campoTexto(),
              descripcion:       campoTexto(),
              marca:             campoTexto(),
              categoria:         campoTexto(),
              genero:            campoTexto(),
              color:             campoTexto(),
              etiquetas:         campoTexto(),
              tallas:            { type: 'keyword' },
              precio:            { type: 'float' },
              precio_original:   { type: 'float' },
              disponibilidad:    { type: 'keyword' },
              imagen_url:        { type: 'keyword', index: false },
              badge:             { type: 'keyword' },
              activo:            { type: 'boolean' },
              demo:              { type: 'boolean' },
            },
          },
        });
        if (!creado.ok) {
          this.logger.error(`No se pudo crear el índice: ${JSON.stringify(creado.data).slice(0, 300)}`);
          return false;
        }
        this.logger.log(`Índice "${INDICE_PRODUCTOS}" creado con mapping y sinónimos`);
      }
      this.indiceListo = true;
      return true;
    } catch (err) {
      this.logger.error(`No se pudo crear/verificar el índice: ${(err as Error).message}`);
      return false;
    }
  }

  /** Indexa (o reemplaza) un lote de productos. Devuelve cuántos se indexaron con éxito. */
  async indexarProductos(docs: ProductoDocumentoES[]): Promise<number> {
    if (docs.length === 0) return 0;
    if (!this.getConexion() || !(await this.asegurarIndice())) return 0;

    try {
      // _bulk usa NDJSON: una línea de acción + una línea de documento, por cada doc.
      const lineas = docs.flatMap((doc) => [
        JSON.stringify({ index: { _index: INDICE_PRODUCTOS, _id: doc.producto_id } }),
        JSON.stringify(doc),
      ]);
      const cuerpo = lineas.join('\n') + '\n';

      const conexion = this.getConexion()!;
      const res = await fetch(`${conexion.baseUrl}/_bulk?refresh=true`, {
        method: 'POST',
        headers: { ...conexion.headers, 'content-type': 'application/x-ndjson' },
        body: cuerpo,
        signal: AbortSignal.timeout(20_000),
      });
      const data = await res.json();

      if (!res.ok || data.errors) {
        const fallos = (data.items ?? []).filter((item: any) => item.index?.error);
        if (fallos.length) {
          this.logger.error(`${fallos.length}/${docs.length} documentos fallaron al indexar: ${JSON.stringify(fallos[0]).slice(0, 300)}`);
        }
        return docs.length - fallos.length;
      }
      return docs.length;
    } catch (err) {
      this.logger.error(`Error en bulk index: ${(err as Error).message}`);
      return 0;
    }
  }

  /** Indexa un solo producto — usado por el CRUD del admin para mantener el índice al día. */
  async indexarProducto(doc: ProductoDocumentoES): Promise<void> {
    await this.indexarProductos([doc]);
  }

  async eliminarProducto(productoId: string): Promise<void> {
    if (!this.getConexion() || !(await this.asegurarIndice())) return;
    try {
      await this.peticion('DELETE', `/${INDICE_PRODUCTOS}/_doc/${encodeURIComponent(productoId)}`);
    } catch (err) {
      this.logger.error(`No se pudo eliminar el producto ${productoId} del índice: ${(err as Error).message}`);
    }
  }

  /**
   * Búsqueda inteligente multi-campo con sinónimos y tolerancia a errores tipográficos.
   * Prioriza (boost) marca > género > color > categoría > nombre > etiquetas > descripción,
   * tal como se pidió: "nike rosa para dama" debe priorizar marca=Nike, género=mujer, color=rosa.
   * Nunca lanza: si Elasticsearch falla, regresa [].
   */
  async buscar(texto: string, limite = 24): Promise<ProductoDocumentoES[]> {
    if (!this.getConexion() || !(await this.asegurarIndice())) return [];

    try {
      const { ok, data } = await this.peticion('POST', `/${INDICE_PRODUCTOS}/_search`, {
        size: limite,
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query: texto,
                  type: 'most_fields',
                  operator: 'or',
                  // Exige que la mayoría de las palabras de la búsqueda coincidan en algún
                  // campo — evita que 1 sola palabra suelta (p. ej. "de", "para") haga que
                  // productos completamente ajenos aparezcan como resultado.
                  minimum_should_match: '65%',
                  fuzziness: 'AUTO',
                  analyzer: 'analizador_busqueda',
                  fields: [
                    'marca^4',
                    'genero^3',
                    'color^2.5',
                    'categoria^2',
                    'nombre^1.5',
                    'etiquetas^1.2',
                    'descripcion',
                  ],
                },
              },
            ],
            filter: [{ term: { activo: true } }],
          },
        },
      });

      if (!ok) {
        this.logger.error(`Elasticsearch respondió error en la búsqueda: ${JSON.stringify(data).slice(0, 300)}`);
        return [];
      }

      return (data.hits?.hits ?? []).map((h: any) => h._source as ProductoDocumentoES);
    } catch (err) {
      this.logger.error(`Error consultando Elasticsearch: ${(err as Error).message}`);
      return [];
    }
  }
}

function campoTexto() {
  return {
    type: 'text' as const,
    analyzer: 'analizador_indexado',
    search_analyzer: 'analizador_busqueda',
    fields: { keyword: { type: 'keyword' as const, ignore_above: 256 } },
  };
}
