/**
 * Práctica 10 — Seguridad, autenticación y control de acceso a la base de datos compartida.
 *
 * La práctica original usa Firebase Auth + reglas de Firestore. Chaac Xanab usa NestJS + Supabase:
 * la "regla de seguridad" la aplica el backend, que es el único que habla con la base de datos.
 * Por eso la matriz SEG-01…SEG-10 se ejecuta contra la API por HTTP real, con dos usuarios
 * (A y B, como los dos dispositivos de la práctica), los guards y servicios REALES y una base en
 * memoria (FakeSupabase) en lugar de Supabase. Se comprueba que las operaciones no autorizadas
 * las rechaza el servidor, no solamente la interfaz.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
import { FakeSupabase } from '../practica11/fake-supabase';

const SECRET = 'secreto-de-pruebas-practica-10';
const PASS = 'Chaac#2026';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const TENIS = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const COMPRA_B = '55555555-5555-4555-8555-555555555555';
const DIRECCION = { calle: 'Calle 60', numero_ext: '123', colonia: 'Centro', ciudad: 'Mérida', estado: 'Yucatán', codigo_postal: '97000' };

describe('Práctica 10 — Matriz de pruebas de seguridad (SEG-01…SEG-10)', () => {
  let app: INestApplication;
  let base: string;
  const fake = new FakeSupabase();
  const hash = bcrypt.hashSync(PASS, 4);

  async function http(metodo: string, ruta: string, opts: { body?: unknown; token?: string } = {}) {
    const r = await fetch(`${base}${ruta}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    });
    const texto = await r.text();
    let json: any = null;
    try { json = texto ? JSON.parse(texto) : null; } catch { /* no JSON */ }
    return { status: r.status, json };
  }

  /** Inicia sesión como lo hace la app y devuelve el token. */
  async function login(email: string) {
    const r = await http('POST', '/api/auth/login', { body: { email, password: PASS } });
    expect(r.status).toBe(201);
    return r.json.token as string;
  }

  /** Registro de una tabla de la base en memoria (falla la prueba si no existe). */
  const fila = (tabla: string, id: string): any => {
    const f = fake.tablas[tabla].find((r: any) => r.id === id);
    if (!f) throw new Error(`No existe ${tabla}/${id}`);
    return f;
  };

  const uidDe = (token: string) => JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString()).sub;

  beforeAll(async () => {
    const mod = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true, load: [() => ({ JWT_SECRET: SECRET })] }),
        PassportModule,
        JwtModule.register({ secret: SECRET, signOptions: { expiresIn: '2h' } }),
      ],
      controllers: [AuthController, ProductosController, ComprasController, AdminProductosController],
      providers: [
        AuthService, JwtStrategy, RolesGuard, BitacoraService, ProductosService, ComprasService, AdminProductosService, CacheService,
        { provide: SupabaseService, useValue: fake },
        { provide: CloudinaryService, useValue: { uploadBuffer: jest.fn(), deleteByUrl: jest.fn() } },
        { provide: ElasticsearchService, useValue: { indexarProducto: jest.fn().mockResolvedValue(0), eliminarProducto: jest.fn().mockResolvedValue(0) } },
      ],
    }).compile();
    app = mod.createNestApplication({ logger: false });
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.listen(0, '127.0.0.1');
    base = `http://127.0.0.1:${(app.getHttpServer().address() as AddressInfo).port}`;
    mod.get(JwtService);
  });

  afterAll(() => app.close());

  beforeEach(() => {
    fake.tablas = {
      categorias: [{ id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee', slug: 'running', name: 'Running' }],
      productos: [{ id: TENIS, name: 'Chaac Runner', price: 2000, stock: 10, activo: true, image_url: 'a.jpg', sizes: ['26'], created_at: '2026-01-02' }],
      usuarios: [
        { id: A, email: 'a@chaac.mx', name: 'Usuario A', role: 'customer', password_hash: hash, email_verified: true, activo: true, failed_login_attempts: 0 },
        { id: B, email: 'b@chaac.mx', name: 'Usuario B', role: 'customer', password_hash: hash, email_verified: true, activo: true, failed_login_attempts: 0 },
      ],
      compras: [{ id: COMPRA_B, user_id: B, total: 2000, status: 'pendiente', created_at: '2026-02-01' }],
      compras_items: [], usuarios_direcciones: [], bitacora: [],
    };
    fake.latenciaMs = 0;
    fake.caida = false;
    fake.fallar = null;
    app.get(CacheService).delByPrefix('');
  });

  it('SEG-01 inicio de sesión válido: A y B obtienen tokens con UID distintos', async () => {
    const tA = await login('a@chaac.mx');
    const tB = await login('b@chaac.mx');
    expect(uidDe(tA)).toBe(A);
    expect(uidDe(tB)).toBe(B);
    expect(uidDe(tA)).not.toBe(uidDe(tB));
  });

  it('SEG-02 inicio de sesión inválido: contraseña incorrecta -> 401 con mensaje genérico', async () => {
    const r = await http('POST', '/api/auth/login', { body: { email: 'a@chaac.mx', password: 'Incorrecta#1' } });
    expect(r.status).toBe(401);
    expect(r.json.token).toBeUndefined();
    expect(JSON.stringify(r.json)).not.toMatch(/password_hash|\$2[aby]\$/);
  });

  it('SEG-03 creación propia: la compra de A queda con propietario A (lo asigna el servidor)', async () => {
    const tA = await login('a@chaac.mx');
    const r = await http('POST', '/api/compras', { token: tA, body: { items: [{ producto_id: TENIS, size: '26', quantity: 1 }], direccion: DIRECCION } });
    expect(r.status).toBe(201);
    expect(fila('compras', r.json.id).user_id).toBe(A);
  });

  it('SEG-04 suplantación: A intenta crear una compra con el UID de B -> 400 y no se guarda nada', async () => {
    const tA = await login('a@chaac.mx');
    const antes = fake.tablas.compras.length;
    const r = await http('POST', '/api/compras', {
      token: tA,
      body: { user_id: B, items: [{ producto_id: TENIS, size: '26', quantity: 1 }], direccion: DIRECCION },
    });
    expect(r.status).toBe(400);
    expect(JSON.stringify(r.json.message)).toContain('user_id');
    expect(fake.tablas.compras).toHaveLength(antes);
  });

  it('SEG-05 lectura de datos ajenos: A no puede leer la compra de B (403) ni la ve en su historial', async () => {
    const tA = await login('a@chaac.mx');
    const directa = await http('GET', `/api/compras/${COMPRA_B}`, { token: tA });
    expect(directa.status).toBe(403);
    const historial = await http('GET', '/api/compras/mis-compras', { token: tA });
    expect(historial.status).toBe(200);
    expect(historial.json.map((c: any) => c.id)).not.toContain(COMPRA_B);
    // B sí puede leer la suya.
    const tB = await login('b@chaac.mx');
    expect((await http('GET', `/api/compras/${COMPRA_B}`, { token: tB })).status).toBe(200);
  });

  it('SEG-06 actualización de datos ajenos: un cliente no puede modificar datos que no son suyos (403)', async () => {
    const tA = await login('a@chaac.mx');
    const r = await http('PUT', `/api/admin/productos/${TENIS}`, { token: tA, body: { price: 1 } });
    expect(r.status).toBe(403);
    expect(fake.tablas.productos[0].price).toBe(2000);
  });

  it('SEG-07 eliminación de datos ajenos: un cliente no puede eliminar (403) y el registro sigue activo', async () => {
    const tA = await login('a@chaac.mx');
    const r = await http('DELETE', `/api/admin/productos/${TENIS}`, { token: tA });
    expect(r.status).toBe(403);
    expect(fake.tablas.productos[0].activo).toBe(true);
  });

  it('SEG-08 actualización propia: A cambia su nombre y solo cambia el registro de A', async () => {
    const tA = await login('a@chaac.mx');
    const r = await http('PUT', '/api/auth/me', { token: tA, body: { name: 'A actualizado' } });
    expect(r.status).toBe(200);
    expect(fila('usuarios', A).name).toBe('A actualizado');
    expect(fila('usuarios', B).name).toBe('Usuario B');
  });

  it('SEG-09 cambio de propietario o de rol: campos no permitidos se rechazan (400) y nada cambia', async () => {
    const tA = await login('a@chaac.mx');
    const rol = await http('PUT', '/api/auth/me', { token: tA, body: { role: 'admin' } });
    expect(rol.status).toBe(400);
    const id = await http('PUT', '/api/auth/me', { token: tA, body: { id: B, name: 'Hackeo' } });
    expect(id.status).toBe(400);
    const dir = await http('PUT', '/api/auth/me/direccion', { token: tA, body: { ...DIRECCION, user_id: B } });
    expect(dir.status).toBe(400);
    expect(fila('usuarios', A).role).toBe('customer');
    expect(fila('usuarios', B).name).toBe('Usuario B');
  });

  it('SEG-10 acceso sin autenticación: leer o escribir sin token -> 401', async () => {
    expect((await http('GET', '/api/compras/mis-compras')).status).toBe(401);
    expect((await http('GET', `/api/compras/${COMPRA_B}`)).status).toBe(401);
    expect((await http('POST', '/api/compras', { body: { items: [{ producto_id: TENIS, size: '26', quantity: 1 }] } })).status).toBe(401);
    expect((await http('PUT', '/api/auth/me', { body: { name: 'x' } })).status).toBe(401);
    // El catálogo es público a propósito: lo consultan la app, la web y el reloj sin sesión.
    expect((await http('GET', '/api/productos')).status).toBe(200);
  });
});
