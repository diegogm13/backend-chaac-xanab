/** Documento tal como se guarda en el índice "productos" de Elasticsearch. */
export interface ProductoDocumentoES {
  producto_id: string;
  nombre: string;
  descripcion: string;
  marca: string | null;
  categoria: string | null;
  genero: string | null;
  color: string | null;
  tallas: string[];
  precio: number;
  precio_original: number | null;
  etiquetas: string[];
  disponibilidad: 'disponible' | 'agotado';
  imagen_url: string | null;
  badge: string | null;
  activo: boolean;
  /** true únicamente para los productos de ejemplo listados en DEMO_PRODUCTOS — nunca para catálogo real. */
  demo: boolean;
}

/** Forma mínima de una fila de Supabase (tabla productos + categorias embebida) que necesitamos para mapear. */
export interface ProductoSupabaseRow {
  id: string;
  name: string;
  description?: string | null;
  price: number;
  original_price?: number | null;
  stock: number;
  image_url?: string | null;
  sizes?: string[] | null;
  badge?: string | null;
  activo: boolean;
  categorias?: { id: string; slug: string; name: string } | null;
}

// Diccionarios de detección — heurística sobre texto libre (nombre/descripción).
// Son un "mejor esfuerzo": si un producto no menciona su color en el texto, color queda en null
// (no se inventa). No sustituyen datos reales; solo enriquecen lo que ya existe.
const COLORES: Record<string, string> = {
  rosa: 'rosa', rosado: 'rosa', rosita: 'rosa',
  negro: 'negro', negra: 'negro',
  blanco: 'blanco', blanca: 'blanco',
  azul: 'azul',
  rojo: 'rojo', roja: 'rojo',
  verde: 'verde',
  amarillo: 'amarillo', amarilla: 'amarillo',
  gris: 'gris',
  morado: 'morado', morada: 'morado', purpura: 'morado', 'púrpura': 'morado',
  naranja: 'naranja',
  dorado: 'dorado', dorada: 'dorado',
  plateado: 'plateado', plateada: 'plateado',
  beige: 'beige',
  cafe: 'café', 'café': 'café', marron: 'café', 'marrón': 'café',
};

const GENERO_POR_TEXTO: Record<string, string> = {
  dama: 'mujer', damas: 'mujer', mujer: 'mujer', mujeres: 'mujer', femenino: 'mujer', femenina: 'mujer',
  caballero: 'hombre', caballeros: 'hombre', hombre: 'hombre', hombres: 'hombre', masculino: 'hombre', varonil: 'hombre',
  'niño': 'niños', 'niños': 'niños', 'niña': 'niños', 'niñas': 'niños', infantil: 'niños', kids: 'niños',
};

// categorias.slug ya es un dato real de la BD — cuando el slug identifica género, es más confiable
// que buscar palabras sueltas en el texto.
const GENERO_POR_SLUG: Record<string, string> = {
  hombre: 'hombre',
  mujer: 'mujer',
  ninos: 'niños',
};

function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, ''); // quita acentos para comparar
}

function detectarPorDiccionario(texto: string, diccionario: Record<string, string>): string | null {
  const normalizado = normalizar(texto);
  for (const [clave, valor] of Object.entries(diccionario)) {
    const claveNormalizada = normalizar(clave);
    if (new RegExp(`\\b${claveNormalizada}\\b`).test(normalizado)) {
      return valor;
    }
  }
  return null;
}

/** Convierte una fila real de Supabase (producto + categoría) al documento que indexa Elasticsearch. */
export function mapearProductoADocumento(row: ProductoSupabaseRow): ProductoDocumentoES {
  const textoCompleto = `${row.name} ${row.description ?? ''}`;

  // Marca: primera palabra del nombre — funciona porque el catálogo sigue el patrón "Marca Modelo"
  // (ej. "Nike Air Max 270", "Adidas Stan Smith Bonega"). Es una inferencia, no un campo real.
  const marca = row.name.trim().split(/\s+/)[0] || null;

  const color = detectarPorDiccionario(textoCompleto, COLORES);

  // Género: primero el slug real de categoría (dato confiable de la BD);
  // si la categoría no indica género (running, ofertas, etc.), se intenta por texto.
  const genero =
    (row.categorias?.slug && GENERO_POR_SLUG[row.categorias.slug]) ||
    detectarPorDiccionario(textoCompleto, GENERO_POR_TEXTO) ||
    null;

  const etiquetas = [row.badge, row.categorias?.name, marca, genero, color]
    .filter((v): v is string => !!v);

  return {
    producto_id: row.id,
    nombre: row.name,
    descripcion: row.description ?? '',
    marca,
    categoria: row.categorias?.name ?? null,
    genero,
    color,
    tallas: row.sizes ?? [],
    precio: row.price,
    precio_original: row.original_price ?? null,
    etiquetas,
    disponibilidad: row.stock > 0 && row.activo ? 'disponible' : 'agotado',
    imagen_url: row.image_url ?? null,
    badge: row.badge ?? null,
    activo: row.activo,
    demo: false,
  };
}

/**
 * Productos de ejemplo — EXISTEN ÚNICAMENTE en Elasticsearch, nunca se escriben en Supabase.
 * Sirven para demostrar el ranking por marca/género/color/categoría con los ejemplos exactos
 * pedidos ("Nike rosa para dama", etc.). Siempre viajan con demo:true y el frontend los marca
 * visiblemente como "Producto de ejemplo" — nunca son comprables.
 */
export const PRODUCTOS_DEMO: ProductoDocumentoES[] = [
  {
    producto_id: 'demo-nike-air-max-rosa-dama',
    nombre: 'Nike Air Max Rosa para Dama',
    descripcion: 'Tenis deportivos Nike Air Max en color rosa, diseñados para dama. Amortiguación Air y estilo urbano.',
    marca: 'Nike',
    categoria: 'Tenis',
    genero: 'mujer',
    color: 'rosa',
    tallas: ['23', '24', '25', '26'],
    precio: 2499,
    precio_original: null,
    etiquetas: ['Nike', 'mujer', 'rosa', 'tenis', 'deportivo'],
    disponibilidad: 'disponible',
    imagen_url: null,
    badge: 'new',
    activo: true,
    demo: true,
  },
  {
    producto_id: 'demo-nike-court-blanco-dama',
    nombre: 'Nike Court Blanco para Dama',
    descripcion: 'Zapatos Nike Court en blanco, corte clásico para dama, ideales para uso casual y deportivo.',
    marca: 'Nike',
    categoria: 'Zapatos',
    genero: 'mujer',
    color: 'blanco',
    tallas: ['23', '24', '25', '26'],
    precio: 2199,
    precio_original: null,
    etiquetas: ['Nike', 'mujer', 'blanco', 'zapatos', 'casual'],
    disponibilidad: 'disponible',
    imagen_url: null,
    badge: null,
    activo: true,
    demo: true,
  },
  {
    producto_id: 'demo-puma-deportivo-rosa-dama',
    nombre: 'Puma Deportivo Rosa para Dama',
    descripcion: 'Tenis deportivos Puma en rosa, ligeros y transpirables, pensados para dama activa.',
    marca: 'Puma',
    categoria: 'Tenis',
    genero: 'mujer',
    color: 'rosa',
    tallas: ['22', '23', '24', '25'],
    precio: 1899,
    precio_original: 2199,
    etiquetas: ['Puma', 'mujer', 'rosa', 'tenis', 'deportivo'],
    disponibilidad: 'disponible',
    imagen_url: null,
    badge: 'sale',
    activo: true,
    demo: true,
  },
  {
    producto_id: 'demo-adidas-running-negro-caballero',
    nombre: 'Adidas Running Negro para Caballero',
    descripcion: 'Tenis Adidas para correr en color negro, para caballero, con suela de alto retorno de energía.',
    marca: 'Adidas',
    categoria: 'Tenis',
    genero: 'hombre',
    color: 'negro',
    tallas: ['26', '27', '28', '29'],
    precio: 2799,
    precio_original: null,
    etiquetas: ['Adidas', 'hombre', 'negro', 'tenis', 'running'],
    disponibilidad: 'disponible',
    imagen_url: null,
    badge: 'popular',
    activo: true,
    demo: true,
  },
];
