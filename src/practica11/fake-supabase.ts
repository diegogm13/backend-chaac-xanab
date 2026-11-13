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
    return { from: (t: string) => new Consulta(this, t), rpc: (f: string, p: Fila) => this.rpc(f, p) };
  }

  tabla(nombre: string): Fila[] {
    return (this.tablas[nombre] ??= []);
  }

  /**
   * Práctica 12 — emula las funciones de practica12/sql/optimizacion.sql.
   * Un solo viaje de red (una latencia) y semántica de TRANSACCIÓN: si algo falla
   * se restauran las tablas tal como estaban (rollback). El cuerpo corre sin
   * `await` intermedios, así que es atómico frente a otras peticiones, igual que
   * el UPDATE … WHERE stock >= n de PostgreSQL.
   */
  async rpc(funcion: string, p: Fila): Promise<Resultado> {
    this.consultas++;
    if (this.latenciaMs) await new Promise((r) => setTimeout(r, this.latenciaMs));
    if (this.caida) return { data: null, error: { message: 'TypeError: fetch failed' } };
    const respaldo = JSON.parse(JSON.stringify(this.tablas));
    const error = (message: string, code: string) => {
      this.tablas = respaldo;
      return { data: null, error: { message, code } };
    };

    if (funcion === 'descontar_stock') {
      const prod = this.tabla('productos').find((x) => x.id === p.p_producto_id && x.activo && x.stock >= p.p_cantidad);
      if (!prod) return error('STOCK_INSUFICIENTE', 'P0001');
      prod.stock -= p.p_cantidad;
      return { data: prod.stock, error: null };
    }
    if (funcion !== 'crear_compra') return error(`función ${funcion} no existe`, '42883');

    const respuesta = (compra: Fila, repetida: boolean) => ({
      data: {
        repetida,
        compra: { id: compra.id, total: compra.total, status: compra.status, created_at: compra.created_at },
        items: this.tabla('compras_items').filter((i) => i.compra_id === compra.id).map(({ id, ...i }) => i),
      },
      error: null,
    });

    if (p.p_idempotency_key) {
      const previa = this.tabla('compras').find((c) => c.user_id === p.p_user_id && c.idempotency_key === p.p_idempotency_key);
      if (previa) return respuesta(previa, true);
    }
    if (!Array.isArray(p.p_items) || p.p_items.length === 0) return error('La compra no tiene productos', 'P0003');

    let dirId = p.p_direccion_id ?? null;
    if (!dirId && p.p_direccion) {
      const dirs = this.tabla('usuarios_direcciones');
      const actual = dirs.find((d) => d.user_id === p.p_user_id && d.es_principal);
      if (actual) Object.assign(actual, p.p_direccion);
      else dirs.push({ id: randomUUID(), user_id: p.p_user_id, es_principal: true, pais: 'México', ...p.p_direccion });
      dirId = (actual ?? dirs[dirs.length - 1]).id;
    }

    const compra: Fila = {
      id: randomUUID(), user_id: p.p_user_id, direccion_id: dirId, total: 0, status: 'pendiente',
      idempotency_key: p.p_idempotency_key ?? null, created_at: new Date().toISOString(),
    };
    this.tabla('compras').push(compra);

    const orden = [...p.p_items].sort((a, b) => String(a.producto_id).localeCompare(String(b.producto_id)));
    for (const it of orden) {
      if (!UUID.test(it.producto_id)) return error(`invalid input syntax for type uuid: "${it.producto_id}"`, '22P02');
      const prod = this.tabla('productos').find((x) => x.id === it.producto_id && x.activo);
      if (!prod) return error(`Producto ${it.producto_id} no encontrado o inactivo`, 'P0002');
      if (prod.stock < it.quantity) {
        return error(`Stock insuficiente para "${prod.name}". Disponible: ${prod.stock}, pedido: ${it.quantity}`, 'P0001');
      }
      if (this.fallar?.tabla === 'compras_items' && this.fallar.op === 'insert') {
        return error('fallo inyectado en insert compras_items', 'XX000');
      }
      prod.stock -= it.quantity;
      this.tabla('compras_items').push({
        id: randomUUID(), compra_id: compra.id, producto_id: prod.id, name: prod.name, price: prod.price,
        size: it.size, quantity: it.quantity, image_url: prod.image_url,
      });
      compra.total += prod.price * it.quantity;
    }
    return respuesta(compra, false);
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
  lt(col: string, v: any) { this.filtros.push((f) => f[col] < v); return this; }
  private tope: number | null = null;
  limit(n: number) { this.tope = n; return this; }
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
        if (this.tope !== null) salida = salida.slice(0, this.tope);
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
