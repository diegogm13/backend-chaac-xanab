/**
 * Práctica 11 — Doble de prueba de SupabaseService.
 *
 * Implementa en memoria el subconjunto del query builder de supabase-js que usa
 * el backend (select/insert/update/delete + eq/neq/in/is/order + single/maybeSingle)
 * y reproduce las restricciones de migration.sql que importan para las pruebas:
 *   - columnas UUID: un valor no-UUID devuelve el error 22P02 de PostgreSQL
 *   - productos.stock CHECK (stock >= 0) -> 23514
 *   - usuarios.email UNIQUE                -> 23505
 * `latenciaMs` simula el viaje de red a Supabase para poder reproducir
 * condiciones de carrera entre peticiones concurrentes.
 */
import { randomUUID } from 'crypto';

type Fila = Record<string, any>;
type Resultado = { data: any; error: { message: string; code?: string } | null; count?: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLUMNAS_UUID = new Set(['id', 'user_id', 'producto_id', 'compra_id', 'direccion_id', 'categoria_id']);

export class FakeSupabase {
  tablas: Record<string, Fila[]> = {};
  latenciaMs = 0;
  consultas = 0;
  /** Expresiones recibidas por .or() (para revisar la sanitización de búsquedas). */
  filtrosOr: string[] = [];
  /** Supabase inalcanzable: supabase-js devuelve { error } (no lanza). */
  caida = false;
  /** Falla inyectada en una operación concreta, p. ej. { tabla: 'compras_items', op: 'insert' }. */
  fallar: { tabla: string; op: string } | null = null;
  correosEnviados: string[] = [];
  auth = {
    auth: {
      signUp: async ({ email }: { email: string }) => {
        this.correosEnviados.push(email);
        return { data: {}, error: null };
      },
    },
  };

  get db() {
    return { from: (t: string) => new Consulta(this, t) };
  }

  tabla(nombre: string): Fila[] {
    return (this.tablas[nombre] ??= []);
  }
}

class Consulta implements PromiseLike<Resultado> {
  private filtros: Array<(f: Fila) => boolean> = [];
  private errorFiltro: Resultado['error'] = null;
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private datos: any;
  private orden?: { col: string; asc: boolean };

  constructor(private readonly db: FakeSupabase, private readonly tabla: string) {}

  private columnas: string[] | null = null;

  /** Proyecta columnas simples como PostgREST ("*" o relaciones embebidas no se proyectan). */
  select(cols?: string, _opts?: unknown) {
    if (cols && !cols.includes('*') && !cols.includes('(')) {
      this.columnas = cols.split(',').map((c) => c.trim()).filter(Boolean);
    }
    return this;
  }
  insert(d: any) { this.op = 'insert'; this.datos = d; return this; }
  update(d: any) { this.op = 'update'; this.datos = d; return this; }
  delete() { this.op = 'delete'; return this; }
  or(expr: string) { this.db.filtrosOr.push(expr); return this; }
  range() { return this; }

  eq(col: string, v: any) {
    this.validarUuid(col, v);
    this.filtros.push((f) => f[col] === v);
    return this;
  }
  neq(col: string, v: any) { this.filtros.push((f) => f[col] !== v); return this; }
  in(col: string, vs: any[]) {
    vs.forEach((v) => this.validarUuid(col, v));
    this.filtros.push((f) => vs.includes(f[col]));
    return this;
  }
  is(col: string, v: any) { this.filtros.push((f) => (f[col] ?? null) === v); return this; }
  order(col: string, o?: { ascending?: boolean }) { this.orden = { col, asc: o?.ascending ?? true }; return this; }

  maybeSingle() { return this.ejecutar('maybe'); }
  single() { return this.ejecutar('single'); }
  then<A = Resultado, B = never>(ok?: ((v: Resultado) => A | PromiseLike<A>) | null, err?: ((e: any) => B | PromiseLike<B>) | null) {
    return this.ejecutar(null).then(ok, err);
  }

  private validarUuid(col: string, v: any) {
    if (COLUMNAS_UUID.has(col) && typeof v === 'string' && !UUID.test(v)) {
      this.errorFiltro = { message: `invalid input syntax for type uuid: "${v}"`, code: '22P02' };
    }
  }

  private async ejecutar(modo: 'single' | 'maybe' | null): Promise<Resultado> {
    this.db.consultas++;
    if (this.db.latenciaMs) await new Promise((r) => setTimeout(r, this.db.latenciaMs));
    if (this.db.caida) return { data: null, error: { message: 'TypeError: fetch failed' } };
    if (this.db.fallar?.tabla === this.tabla && this.db.fallar.op === this.op) {
      return { data: null, error: { message: `fallo inyectado en ${this.op} ${this.tabla}`, code: 'XX000' } };
    }
    if (this.errorFiltro) return { data: null, error: this.errorFiltro };

    const filas = this.db.tabla(this.tabla);
    const coincide = (f: Fila) => this.filtros.every((fn) => fn(f));
    let salida: Fila[];

    switch (this.op) {
      case 'insert': {
        const nuevas: Fila[] = (Array.isArray(this.datos) ? this.datos : [this.datos]).map((d: Fila) => ({
          id: randomUUID(), created_at: new Date().toISOString(),
          ...(this.tabla === 'compras' ? { status: 'pendiente' } : {}),
          ...d,
        }));
        if (this.tabla === 'usuarios' && nuevas.some((n) => filas.some((f) => f.email === n.email))) {
          return { data: null, error: { message: 'duplicate key value violates unique constraint "usuarios_email_key"', code: '23505' } };
        }
        filas.push(...nuevas);
        salida = nuevas;
        break;
      }
      case 'update': {
        salida = filas.filter(coincide);
        if (this.tabla === 'productos' && typeof this.datos.stock === 'number' && this.datos.stock < 0) {
          return { data: null, error: { message: 'new row for relation "productos" violates check constraint "productos_stock_check"', code: '23514' } };
        }
        salida.forEach((f) => Object.assign(f, this.datos));
        break;
      }
      case 'delete': {
        salida = filas.filter(coincide);
        this.db.tablas[this.tabla] = filas.filter((f) => !coincide(f));
        break;
      }
      default: {
        salida = filas.filter(coincide);
        if (this.orden) {
          const { col, asc } = this.orden;
          salida = [...salida].sort((a, b) => (a[col] > b[col] ? 1 : -1) * (asc ? 1 : -1));
        }
      }
    }

    const proyectadas = this.columnas
      ? salida.map((f) => Object.fromEntries(this.columnas!.map((c) => [c, f[c]])))
      : salida;
    const copia = JSON.parse(JSON.stringify(proyectadas));
    if (modo === 'single') {
      return copia.length === 1
        ? { data: copia[0], error: null }
        : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' } };
    }
    if (modo === 'maybe') return { data: copia[0] ?? null, error: null };
    return { data: copia, error: null, count: copia.length };
  }
}
