/**
 * Práctica 11 — Fase 3: White Box de los endpoints por HTTP real.
 *
 * Se levanta la app exactamente como en api/index.ts (prefijo /api y el mismo
 * ValidationPipe) con los controladores, guards (JwtAuthGuard, RolesGuard),
 * estrategia JWT y servicios REALES. Sólo SupabaseService se sustituye por
 * FakeSupabase (ver fake-supabase.ts). Las peticiones viajan por un socket TCP
 * local con fetch(), así que el código HTTP y el JSON son los que vería la app.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { AddressInfo } from 'net';

import { AdminProductosController } from '../admin/admin-productos.controller';
import { AdminProductosService } from '../admin/admin-productos.service';
import { AuthController } from '../auth/auth.controller';
import { AuthService } from '../auth/auth.service';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtStrategy } from '../auth/strategies/jwt.strategy';
import { BitacoraService } from '../bitacora/bitacora.service';
import { CacheService } from '../cache/cache.service';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import { ComprasController } from '../compras/compras.controller';
import { ComprasService } from '../compras/compras.service';
import { ElasticsearchService } from '../elasticsearch/elasticsearch.service';
import { ProductosController } from '../productos/productos.controller';
import { ProductosService } from '../productos/productos.service';
import { SupabaseService } from '../supabase/supabase.service';
import { FakeSupabase } from './fake-supabase';

const SECRET = 'secreto-de-pruebas-practica-11';
const PASS = 'Chaac#2026';
const IDS = {
  cliente: '11111111-1111-4111-8111-111111111111',
  otro: '22222222-2222-4222-8222-222222222222',
  admin: '33333333-3333-4333-8333-333333333333',
  sinVerificar: '44444444-4444-4444-8444-444444444444',
  tenis: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  ultimo: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  inactivo: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  noExiste: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
};
const DIRECCION = {
  calle: 'Calle 60', numero_ext: '123', colonia: 'Centro', ciudad: 'Mérida', estado: 'Yucatán', codigo_postal: '97000',
};

describe('Práctica 11 — Endpoints HTTP (White Box)', () => {
  let app: INestApplication;
  let base: string;
  let jwt: JwtService;
  const fake = new FakeSupabase();
  const hash = bcrypt.hashSync(PASS, 4);

  const token = (sub: string, role: string, expiresIn: string | number = '2h') =>
    jwt.sign({ sub, email: `${role}@chaac.mx`, role, name: role }, { expiresIn });

  async function http(metodo: string, ruta: string, opts: { body?: unknown; token?: string; crudo?: string } = {}) {
    const r = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: {
        'content-type': 'application/json',
        ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.crudo ?? (opts.body === undefined ? undefined : JSON.stringify(opts.body)),
    });
    const texto = await r.text();
    let json: any = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* cuerpo no JSON */ }
    return { status: r.status, json, texto, headers: r.headers };
  }

  function sembrar() {
    fake.tablas = {
      categorias: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', slug: 'running', name: 'Running' }],
      productos: [
        { id: IDS.tenis, name: 'Chaac Runner', price: 2000, stock: 5, activo: true, image_url: 'a.jpg', sizes: ['26'], created_at: '2026-01-02' },
        { id: IDS.ultimo, name: 'Xanab Edición', price: 3500, stock: 1, activo: true, image_url: 'b.jpg', sizes: ['27'], created_at: '2026-01-01' },
        { id: IDS.inactivo, name: 'Descontinuado', price: 100, stock: 9, activo: false, image_url: 'c.jpg', sizes: [], created_at: '2025-01-01' },
      ],
      usuarios: [
        { id: IDS.cliente, email: 'cliente@chaac.mx', name: 'Cliente', role: 'customer', password_hash: hash, email_verified: true, activo: true, failed_login_attempts: 0 },
        { id: IDS.otro, email: 'otro@chaac.mx', name: 'Otro', role: 'customer', password_hash: hash, email_verified: true, activo: true, failed_login_attempts: 0 },
        { id: IDS.admin, email: 'admin@chaac.mx', name: 'Admin', role: 'admin', password_hash: hash, email_verified: true, activo: true, failed_login_attempts: 0 },
        { id: IDS.sinVerificar, email: 'nuevo@chaac.mx', name: 'Nuevo', role: 'customer', password_hash: hash, email_verified: false, activo: true, failed_login_attempts: 0 },
      ],
      compras: [{ id: '55555555-5555-4555-8555-555555555555', user_id: IDS.otro, total: 2000, status: 'pendiente', created_at: '2026-02-01' }],
      compras_items: [], usuarios_direcciones: [], bitacora: [],
    };
    fake.latenciaMs = 0;
    fake.caida = false;
    fake.fallar = null;
  }

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET })] }),
        PassportModule,
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '2h' } }),
      ],
      controllers: [AuthController, ProductosController, ComprasController, AdminProductosController],
      providers: [
        AuthService, JwtStrategy, RolesGuard, BitacoraService, ProductosService, ComprasService,
        AdminProductosService, CacheService,
        { provide: SupabaseService, useValue: fake },
        { provide: CloudinaryService, useValue: { uploadBuffer: jest.fn(), deleteByUrl: jest.fn() } },
        { provide: ElasticsearchService, useValue: { indexarProducto: jest.fn().mockResolvedValue(0), eliminarProducto: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();

    app = mod.createNestApplication({ logger: false });
    // Igual que api/index.ts (el entry point que corre en Vercel).
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    jwt = mod.get(JwtService);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    sembrar();
    app.get(CacheService).delByPrefix('');
  });

  // ─────────────────────────────── 200 / 201 ────────────────────────────────
  describe('WEB-01 respuestas exitosas', () => {
    it('200 GET /api/productos: sólo activos, estructura JSON consistente', async () => {
      const r = await http('GET', '/api/productos');
      expect(r.status).toBe(200);
      expect(r.json).toHaveLength(2);
      for (const p of r.json) {
        expect(p).toEqual(expect.objectContaining({ id: expect.any(String), name: expect.any(String), price: expect.any(Number), stock: expect.any(Number) }));
      }
      expect(r.json.map((p: any) => p.id)).not.toContain(IDS.inactivo);
    });

    it('200 GET /api/productos/:id existente', async () => {
      const r = await http('GET', `/api/productos/${IDS.tenis}`);
      expect(r.status).toBe(200);
      expect(r.json.name).toBe('Chaac Runner');
    });

    it('201 POST /api/auth/register: crea usuario, no devuelve la contraseña ni el hash', async () => {
      const r = await http('POST', '/api/auth/register', { body: { name: 'Ana', email: 'Ana@Chaac.mx', password: PASS } });
      expect(r.status).toBe(201);
      expect(r.texto).not.toMatch(/password|hash|Chaac#2026/i);
      const u = fake.tabla('usuarios').find((x) => x.email === 'ana@chaac.mx');
      expect(u).toBeDefined();
      expect(u!.password_hash).not.toBe(PASS);
      expect(await bcrypt.compare(PASS, u!.password_hash)).toBe(true);
    });

    it('201 POST /api/auth/login devuelve sólo { token } y el JWT trae rol', async () => {
      const r = await http('POST', '/api/auth/login', { body: { email: 'cliente@chaac.mx', password: PASS } });
      expect(r.status).toBe(201);
      expect(Object.keys(r.json)).toEqual(['token']);
      expect(jwt.decode(r.json.token)).toEqual(expect.objectContaining({ sub: IDS.cliente, role: 'customer' }));
      expect(fake.tabla('bitacora').map((b) => b.accion)).toContain('LOGIN');
    });

    it('200 GET /api/auth/me no expone password_hash', async () => {
      const r = await http('GET', '/api/auth/me', { token: token(IDS.cliente, 'customer') });
      expect(r.status).toBe(200);
      expect(r.texto).not.toContain('password_hash');
    });

    it('201 POST /api/compras: el servidor calcula el total y descuenta stock', async () => {
      const r = await http('POST', '/api/compras', {
        token: token(IDS.cliente, 'customer'),
        body: { items: [{ producto_id: IDS.tenis, size: '26', quantity: 2 }], direccion: DIRECCION },
      });
      expect(r.status).toBe(201);
      expect(r.json.total).toBe(4000);
      expect(fake.tabla('productos').find((p) => p.id === IDS.tenis)!.stock).toBe(3);
      expect(fake.tabla('compras_items')).toHaveLength(1);
      // Persistencia: la compra aparece en el historial
      const h = await http('GET', '/api/compras/mis-compras', { token: token(IDS.cliente, 'customer') });
      expect(h.json.map((c: any) => c.id)).toContain(r.json.id);
    });
  });

  // ──────────────────────────────── 4xx ─────────────────────────────────────
  describe('WEB-02 / WEB-03 errores y validación del backend', () => {
    it.each([
      ['email inválido', { name: 'A', email: 'no-es-correo', password: PASS }],
      ['contraseña débil', { name: 'A', email: 'a@chaac.mx', password: 'abc' }],
      ['nombre vacío', { name: '', email: 'a@chaac.mx', password: PASS }],
      ['campo no permitido (forbidNonWhitelisted)', { name: 'A', email: 'a@chaac.mx', password: PASS, role: 'admin' }],
    ])('400 register: %s -> message[] y nada insertado', async (_c, body) => {
      const antes = fake.tabla('usuarios').length;
      const r = await http('POST', '/api/auth/register', { body });
      expect(r.status).toBe(400);
      expect(Array.isArray(r.json.message)).toBe(true);
      expect(fake.tabla('usuarios')).toHaveLength(antes);
    });

    it('400 JSON mal formado', async () => {
      const r = await http('POST', '/api/auth/login', { crudo: '{"email": "a@b.c", ' });
      expect(r.status).toBe(400);
    });

    it('409 register con correo existente (sin importar mayúsculas)', async () => {
      const r = await http('POST', '/api/auth/register', { body: { name: 'X', email: 'CLIENTE@chaac.mx', password: PASS } });
      expect(r.status).toBe(409);
    });

    it.each([
      ['items vacío', { items: [] }],
      ['quantity 0 (límite)', { items: [{ producto_id: IDS.tenis, size: '26', quantity: 0 }] }],
      ['producto_id no UUID', { items: [{ producto_id: 'abc', size: '26', quantity: 1 }] }],
      ['size vacío', { items: [{ producto_id: IDS.tenis, size: '', quantity: 1 }] }],
    ])('400 POST /api/compras: %s', async (_c, body) => {
      const r = await http('POST', '/api/compras', { token: token(IDS.cliente, 'customer'), body });
      expect(r.status).toBe(400);
      expect(fake.tabla('compras')).toHaveLength(1);
    });

    it('quantity 1 (límite válido) -> 201', async () => {
      const r = await http('POST', '/api/compras', {
        token: token(IDS.cliente, 'customer'), body: { items: [{ producto_id: IDS.tenis, size: '26', quantity: 1 }] },
      });
      expect(r.status).toBe(201);
    });

    it('HALLAZGO: stock insuficiente responde 400 (semánticamente sería 409/422)', async () => {
      const r = await http('POST', '/api/compras', {
        token: token(IDS.cliente, 'customer'), body: { items: [{ producto_id: IDS.ultimo, size: '27', quantity: 2 }] },
      });
      expect(r.status).toBe(400);
      expect(r.json.message).toContain('Stock insuficiente');
      expect(fake.tabla('productos').find((p) => p.id === IDS.ultimo)!.stock).toBe(1);
    });

    it('404 GET /api/productos/:id inexistente y producto inactivo', async () => {
      expect((await http('GET', `/api/productos/${IDS.noExiste}`)).status).toBe(404);
      expect((await http('GET', `/api/productos/${IDS.inactivo}`)).status).toBe(404);
    });

    it('404 GET /api/compras/:id inexistente', async () => {
      const r = await http('GET', `/api/compras/${IDS.noExiste}`, { token: token(IDS.cliente, 'customer') });
      expect(r.status).toBe(404);
    });

    it('DEFECTO DEF-05: GET /api/productos/abc (id no UUID) -> 500 en vez de 400/404', async () => {
      const r = await http('GET', '/api/productos/abc');
      expect(r.status).toBe(500);
      expect(r.json).toEqual({ statusCode: 500, message: 'Internal server error' }); // no filtra detalles
    });
  });

  // ─────────────────────────── 401 vs 403 ───────────────────────────────────
  describe('WEB-04 autenticación (401) vs autorización (403)', () => {
    it('401 sin token', async () => {
      expect((await http('GET', '/api/compras/mis-compras')).status).toBe(401);
    });

    it('401 token con firma inválida', async () => {
      const falso = token(IDS.cliente, 'customer').slice(0, -3) + 'xyz';
      expect((await http('GET', '/api/auth/me', { token: falso })).status).toBe(401);
    });

    it('401 token expirado', async () => {
      const vencido = token(IDS.cliente, 'customer', -60);
      expect((await http('GET', '/api/auth/me', { token: vencido })).status).toBe(401);
    });

    it('401 login: contraseña errónea y correo inexistente dan el MISMO mensaje', async () => {
      const a = await http('POST', '/api/auth/login', { body: { email: 'cliente@chaac.mx', password: 'Mala#123' } });
      const b = await http('POST', '/api/auth/login', { body: { email: 'nadie@chaac.mx', password: 'Mala#123' } });
      expect([a.status, b.status]).toEqual([401, 401]);
      expect(a.json.message).toBe(b.json.message);
    });

    it('401 EMAIL_NOT_VERIFIED', async () => {
      const r = await http('POST', '/api/auth/login', { body: { email: 'nuevo@chaac.mx', password: PASS } });
      expect([r.status, r.json.message]).toEqual([401, 'EMAIL_NOT_VERIFIED']);
    });

    it('401 ACCOUNT_LOCKED al 5.º intento fallido y bloquea aun con la contraseña correcta', async () => {
      const codigos: number[] = [];
      for (let i = 0; i < 5; i++) {
        codigos.push((await http('POST', '/api/auth/login', { body: { email: 'cliente@chaac.mx', password: 'Mala#123' } })).status);
      }
      const r = await http('POST', '/api/auth/login', { body: { email: 'cliente@chaac.mx', password: PASS } });
      expect(codigos).toEqual([401, 401, 401, 401, 401]);
      expect(r.json).toEqual(expect.objectContaining({ message: 'ACCOUNT_LOCKED', retryAfterMinutes: expect.any(Number) }));
    });

    it('403 cliente autenticado intentando ver la compra de otro usuario', async () => {
      const r = await http('GET', '/api/compras/55555555-5555-4555-8555-555555555555', { token: token(IDS.cliente, 'customer') });
      expect(r.status).toBe(403);
      const dueno = await http('GET', '/api/compras/55555555-5555-4555-8555-555555555555', { token: token(IDS.otro, 'customer') });
      expect(dueno.status).toBe(200);
    });

    it('401 vs 403 vs 200 en /api/admin/productos', async () => {
      expect((await http('GET', '/api/admin/productos')).status).toBe(401);
      expect((await http('GET', '/api/admin/productos', { token: token(IDS.cliente, 'customer') })).status).toBe(403);
      expect((await http('GET', '/api/admin/productos', { token: token(IDS.admin, 'admin') })).status).toBe(200);
    });

    it('HALLAZGO: DELETE /api/admin/productos/:id responde 200 con cuerpo (no 204) y es borrado lógico', async () => {
      const r = await http('DELETE', `/api/admin/productos/${IDS.tenis}`, { token: token(IDS.admin, 'admin') });
      expect(r.status).toBe(200);
      expect(r.json.message).toBeDefined();
      expect(fake.tabla('productos').find((p) => p.id === IDS.tenis)!.activo).toBe(false);
      expect((await http('GET', `/api/productos/${IDS.tenis}`)).status).toBe(404);
    });
  });

  // ─────────────────────────────── 5xx ──────────────────────────────────────
  describe('500 y errores de infraestructura', () => {
    it('500 GET /api/productos con Supabase caído, sin filtrar el detalle', async () => {
      fake.caida = true;
      const r = await http('GET', '/api/productos');
      expect(r.status).toBe(500);
      expect(r.texto).not.toContain('fetch failed');
    });

    it('DEFECTO DEF-06: con Supabase caído, /api/compras/mis-compras responde 400 y filtra el error interno', async () => {
      fake.caida = true;
      const r = await http('GET', '/api/compras/mis-compras', { token: token(IDS.cliente, 'customer') });
      expect(r.status).toBe(400); // debería ser 500/503: el cliente no hizo nada mal
      expect(r.json.message).toBe('TypeError: fetch failed');
    });
  });

  // ─────────────────── Caminos restantes de compras / productos ─────────────
  describe('Caminos de ComprasService.create() y ProductosService', () => {
    const t = () => token(IDS.cliente, 'customer');
    const item = { producto_id: IDS.tenis, size: '26', quantity: 1 };

    it('dirección inline: 1.ª compra INSERTA, 2.ª ACTUALIZA la misma dirección principal', async () => {
      await http('POST', '/api/compras', { token: t(), body: { items: [item], direccion: DIRECCION } });
      await http('POST', '/api/compras', { token: t(), body: { items: [item], direccion: { ...DIRECCION, calle: 'Calle 62' } } });
      const dirs = fake.tabla('usuarios_direcciones').filter((d) => d.user_id === IDS.cliente);
      expect(dirs).toHaveLength(1);
      expect(dirs[0].calle).toBe('Calle 62');
      const compras = fake.tabla('compras').filter((c) => c.user_id === IDS.cliente);
      expect(new Set(compras.map((c) => c.direccion_id)).size).toBe(1);
    });

    it('direccion_id explícito se usa tal cual; sin dirección -> null', async () => {
      const dirId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      const a = await http('POST', '/api/compras', { token: t(), body: { items: [item], direccion_id: dirId } });
      const b = await http('POST', '/api/compras', { token: t(), body: { items: [item] } });
      expect([a.status, b.status]).toEqual([201, 201]);
      const [ca, cb] = fake.tabla('compras').filter((c) => c.user_id === IDS.cliente);
      expect([ca.direccion_id, cb.direccion_id]).toEqual([dirId, null]);
    });

    it('producto inactivo en la compra -> 400 "no encontrado o inactivo"', async () => {
      const r = await http('POST', '/api/compras', { token: t(), body: { items: [{ ...item, producto_id: IDS.inactivo }] } });
      expect(r.status).toBe(400);
      expect(r.json.message).toContain('no encontrado o inactivo');
    });

    it.each([
      ['SELECT productos', { tabla: 'productos', op: 'select' }],
      ['INSERT compras', { tabla: 'compras', op: 'insert' }],
    ])('falla de Supabase en %s -> 400 con mensaje interno (ver DEF-06)', async (_c, falla) => {
      fake.fallar = falla;
      const r = await http('POST', '/api/compras', { token: t(), body: { items: [item] } });
      expect(r.status).toBe(400);
      expect(r.json.message).toContain('fallo inyectado');
    });

    it('findOne con error de Supabase -> 400', async () => {
      fake.fallar = { tabla: 'compras', op: 'select' };
      const r = await http('GET', `/api/compras/${IDS.noExiste}`, { token: t() });
      expect(r.status).toBe(400);
    });

    it('GET /api/productos usa caché: la 2.ª petición no consulta Supabase', async () => {
      await http('GET', '/api/productos');
      const antes = fake.consultas;
      const r = await http('GET', '/api/productos');
      expect(r.status).toBe(200);
      expect(fake.consultas).toBe(antes);
      await http('GET', `/api/productos/${IDS.tenis}`);
      const antes2 = fake.consultas;
      await http('GET', `/api/productos/${IDS.tenis}`);
      expect(fake.consultas).toBe(antes2);
    });

    it('401 JWT bien firmado pero sin "sub" (JwtStrategy.validate)', async () => {
      const sinSub = jwt.sign({ email: 'x@chaac.mx', role: 'admin' });
      expect((await http('GET', '/api/auth/me', { token: sinSub })).status).toBe(401);
    });

    it('RolesGuard sin @Roles() deja pasar (camino requiredRoles = undefined)', () => {
      const guard = new RolesGuard(new Reflector());
      const ctx: any = { getHandler: () => () => 0, getClass: () => class {}, switchToHttp: () => ({ getRequest: () => ({}) }) };
      expect(guard.canActivate(ctx)).toBe(true);
    });

    it('buscarPorTermino(): sanitiza caracteres que alteran el filtro .or() de PostgREST', async () => {
      const svc = app.get(ProductosService);
      fake.filtrosOr = [];
      expect(await svc.buscarPorTermino('   ')).toEqual([]);
      expect(await svc.buscarPorTermino('%_\\,()')).toEqual([]); // sólo caracteres peligrosos
      await svc.buscarPorTermino('tenis),activo.eq.false,(name.ilike.%');
      expect(fake.filtrosOr).toHaveLength(1);
      expect(fake.filtrosOr[0]).not.toMatch(/activo\.eq\.false,\(|\)\s*,/);
      expect(fake.filtrosOr[0].split(',')).toHaveLength(2); // sólo name.ilike y description.ilike
      await svc.buscarPorTermino('x'.repeat(500));
      expect(fake.filtrosOr[1].length).toBeLessThan(260); // término truncado a 100
      const antes = fake.consultas;
      await svc.buscarPorTermino('x'.repeat(500)); // caché
      expect(fake.consultas).toBe(antes);
    });

    it('filtros: ?badge válido -> 200; ?badge inválido -> 400; ?categoria_slug -> 200', async () => {
      fake.tabla('productos')[0].badge = 'popular';
      const ok = await http('GET', '/api/productos?badge=popular');
      expect(ok.status).toBe(200);
      expect(ok.json.map((p: any) => p.id)).toEqual([IDS.tenis]);
      expect((await http('GET', '/api/productos?badge=gratis')).status).toBe(400);
      expect((await http('GET', '/api/productos?categoria_slug=running')).status).toBe(200);
    });
  });

  // ───────────────────────── Transacciones y concurrencia ───────────────────
  describe('DB-06 / transacciones en POST /api/compras', () => {
    it('DEFECTO DEF-03: dos compras simultáneas del último par -> ambas 201 (sobreventa)', async () => {
      fake.latenciaMs = 15; // viaje de red a Supabase
      const cuerpo = { items: [{ producto_id: IDS.ultimo, size: '27', quantity: 1 }] };
      const [a, b] = await Promise.all([
        http('POST', '/api/compras', { token: token(IDS.cliente, 'customer'), body: cuerpo }),
        http('POST', '/api/compras', { token: token(IDS.otro, 'customer'), body: cuerpo }),
      ]);
      const vendidas = fake.tabla('compras_items').filter((i) => i.producto_id === IDS.ultimo).length;
      expect([a.status, b.status]).toEqual([201, 201]);
      expect(vendidas).toBe(2); // se vendieron 2 piezas…
      expect(fake.tabla('productos').find((p) => p.id === IDS.ultimo)!.stock).toBe(0); // …de un stock de 1
    });

    it('DEFECTO DEF-01: el mismo POST repetido (reintento) crea 2 compras', async () => {
      const cuerpo = { items: [{ producto_id: IDS.tenis, size: '26', quantity: 1 }] };
      const t = token(IDS.cliente, 'customer');
      await http('POST', '/api/compras', { token: t, body: cuerpo });
      await http('POST', '/api/compras', { token: t, body: cuerpo });
      expect(fake.tabla('compras').filter((c) => c.user_id === IDS.cliente)).toHaveLength(2);
    });

    it('DEFECTO DEF-08: si falla el INSERT de compras_items queda una compra huérfana (sin transacción)', async () => {
      fake.fallar = { tabla: 'compras_items', op: 'insert' };
      const r = await http('POST', '/api/compras', {
        token: token(IDS.cliente, 'customer'), body: { items: [{ producto_id: IDS.tenis, size: '26', quantity: 1 }] },
      });
      expect(r.status).toBe(400);
      const huerfanas = fake.tabla('compras').filter((c) => c.user_id === IDS.cliente);
      expect(huerfanas).toHaveLength(1); // la cabecera SÍ se guardó
      expect(fake.tabla('compras_items')).toHaveLength(0); // sin renglones
      expect(fake.tabla('productos').find((p) => p.id === IDS.tenis)!.stock).toBe(5);
    });

    it('si falla el UPDATE de stock la compra se confirma igual (error ignorado)', async () => {
      fake.fallar = { tabla: 'productos', op: 'update' };
      const r = await http('POST', '/api/compras', {
        token: token(IDS.cliente, 'customer'), body: { items: [{ producto_id: IDS.tenis, size: '26', quantity: 2 }] },
      });
      expect(r.status).toBe(201);
      expect(fake.tabla('productos').find((p) => p.id === IDS.tenis)!.stock).toBe(5); // no se descontó
    });
  });
});
