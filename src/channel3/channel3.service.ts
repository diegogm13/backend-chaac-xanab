import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../cache/cache.service';
import {
  Channel3Offer,
  Channel3Product,
  Channel3SearchResponse,
  ExternalProduct,
} from './external-product.model';

const CHANNEL3_SEARCH_URL = 'https://api.trychannel3.com/v1/search';

// Chaac Xanab es una tienda 100% de calzado — el slug real se confirmó contra
// GET /v1/categories/search?query=shoes (Channel3), no es un valor inventado.
const CATEGORIA_ZAPATOS = 'shoes';

// Channel3 recomienda no cachear resultados de búsqueda por horas/días
// (precios, disponibilidad y URLs de oferta son "unstable" en su docs).
const CACHE_TTL_MS = 10 * 60_000;

@Injectable()
export class Channel3Service {
  private readonly logger = new Logger(Channel3Service.name);
  private readonly apiKey?: string;

  constructor(
    private readonly config: ConfigService,
    private readonly cache: CacheService,
  ) {
    this.apiKey = this.config.get<string>('CHANNEL3_API_KEY');
  }

  /** Busca productos en Channel3. Nunca lanza: si algo falla, regresa []. */
  async search(query: string, limit = 12): Promise<ExternalProduct[]> {
    if (!this.apiKey) {
      this.logger.warn(
        'CHANNEL3_API_KEY no configurada — se omite la búsqueda externa',
      );
      return [];
    }

    const cacheKey = `channel3:${query.trim().toLowerCase()}`;
    const cached = this.cache.get<ExternalProduct[]>(cacheKey);
    if (cached) return cached;

    let response: Response;
    try {
      response = await fetch(CHANNEL3_SEARCH_URL, {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'content-type': 'application/json',
        },
        // config.language: 'es' — Channel3 no soporta country/currency=MX/MXN
        // (ver enums documentados), así que se dejan sin forzar.
        // filters.category_ids: restringe SIEMPRE a calzado — sin esto Channel3
        // busca en todo su catálogo (motos, herramientas, lo que sea).
        body: JSON.stringify({
          query,
          limit,
          config: { language: 'es' },
          filters: { category_ids: [CATEGORIA_ZAPATOS] },
        }),
        signal: AbortSignal.timeout(8000),
      });
    } catch (err) {
      this.logger.error(`Error de red consultando Channel3: ${(err as Error).message}`);
      return [];
    }

    if (!response.ok) {
      const body = await response.text().catch(() => '');
      this.logger.error(
        `Channel3 respondió ${response.status} para query="${query}": ${body.slice(0, 300)}`,
      );
      return [];
    }

    let data: Channel3SearchResponse;
    try {
      data = await response.json();
    } catch (err) {
      this.logger.error(`Respuesta de Channel3 no es JSON válido: ${(err as Error).message}`);
      return [];
    }

    const productos = this.normalizar(data.products ?? []);
    this.cache.set(cacheKey, productos, CACHE_TTL_MS);
    return productos;
  }

  private normalizar(productos: Channel3Product[]): ExternalProduct[] {
    return productos
      .map((p) => this.normalizarProducto(p))
      .filter((p): p is ExternalProduct => p !== null);
  }

  private normalizarProducto(p: Channel3Product): ExternalProduct | null {
    const oferta = this.mejorOferta(p.offers);
    if (!oferta) return null; // sin oferta no hay a dónde mandar al usuario

    const imagenPrincipal =
      p.images?.find((img) => img.is_main_image) ?? p.images?.[0];

    const tallas = p.variants?.options?.find((o) => /talla|size/i.test(o.name))
      ?.values?.map((v) => v.label);

    return {
      externalId: p.id,
      name: p.title,
      brand: p.brands?.[0]?.name,
      description: p.description ?? undefined,
      imageUrl: imagenPrincipal?.cleaned_url ?? imagenPrincipal?.url,
      price: oferta.price?.price,
      currency: oferta.price?.currency,
      availability: oferta.availability,
      sizes: tallas,
      retailer: oferta.domain,
      productUrl: oferta.url,
      source: 'channel3',
    };
  }

  /** Entre todas las ofertas del producto, prioriza una en stock y la más barata. */
  private mejorOferta(offers: Channel3Offer[] | undefined): Channel3Offer | undefined {
    if (!offers?.length) return undefined;
    const enStock = offers.filter((o) => o.availability === 'InStock');
    const candidatos = enStock.length ? enStock : offers;
    return candidatos.reduce((min, o) =>
      (o.price?.price ?? Infinity) < (min.price?.price ?? Infinity) ? o : min,
    );
  }
}
