/** Producto normalizado proveniente de una tienda aliada (ej. Channel3). */
export interface ExternalProduct {
  externalId: string;
  name: string;
  brand?: string;
  description?: string;
  imageUrl?: string;
  price?: number;
  currency?: string;
  availability?: string;
  sizes?: string[];
  retailer?: string;
  productUrl: string;
  /**
   * Channel3 no expone un campo de afiliado separado: su `offer.url` ya es
   * el "attributed buy link" (documentado así en /guides/offer). Se deja el
   * campo por si en el futuro otro proveedor sí lo distingue.
   */
  affiliateUrl?: string;
  source: string;
}

/** Forma parcial de la respuesta real de POST /v1/search de Channel3 (solo los campos que usamos). */
export interface Channel3SearchResponse {
  products: Channel3Product[];
  next_page_token?: string | null;
}

export interface Channel3Product {
  id: string;
  title: string;
  description?: string | null;
  brands?: { id: string; name: string }[];
  images?: {
    url: string;
    cleaned_url?: string | null;
    is_main_image: boolean;
  }[];
  offers?: Channel3Offer[];
  variants?: {
    options?: {
      name: string;
      values: { label: string; exists: boolean }[];
    }[];
  } | null;
}

export interface Channel3Offer {
  url: string;
  domain: string;
  price: {
    price: number;
    compare_at_price?: number | null;
    currency: string;
  };
  availability: 'InStock' | 'OutOfStock';
}
