// Práctica 12 — Fase 4: pruebas avanzadas de base de datos contra Supabase (PostgREST).
//   node practica12/db_pruebas.js antes   <salida.json>
//   node practica12/db_pruebas.js despues <salida.json>   (usa crear_compra / paginación)
// Tiempo medido desde este equipo = red + PostgREST + ejecución en PostgreSQL.
require('dotenv/config');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MODO = process.argv[2] ?? 'antes';
const SALIDA = process.argv[3];
const PRODUCTO = 'P12 PRUEBA DE CARGA (no comprar)';
const CORREO = 'p12.carga@example.invalid';
const r2 = (n) => Math.round(n * 100) / 100;

async function medir(nombre, veces, fn) {
  const t = [];
  let ultimo;
  for (let i = 0; i < veces; i++) {
    const t0 = performance.now();
    ultimo = await fn();
    t.push(performance.now() - t0);
    if (ultimo.error) throw new Error(`${nombre}: ${ultimo.error.message}`);
  }
  t.sort((a, b) => a - b);
  const filas = Array.isArray(ultimo.data) ? ultimo.data.length : ultimo.data ? 1 : 0;
  const r = {
    prueba: nombre, repeticiones: veces, filas, bytes: Buffer.byteLength(JSON.stringify(ultimo.data ?? null)),
    promedio_ms: r2(t.reduce((s, x) => s + x, 0) / veces), min_ms: r2(t[0]),
    p95_ms: r2(t[Math.min(Math.ceil(0.95 * veces) - 1, veces - 1)]), max_ms: r2(t.at(-1)),
  };
  console.log(`${nombre.padEnd(46)} filas=${String(r.filas).padStart(5)}  bytes=${String(r.bytes).padStart(8)}  prom=${r.promedio_ms} ms  p95=${r.p95_ms} ms`);
  return r;
}

(async () => {
  const { data: p } = await db.from('productos').select('id, stock').eq('name', PRODUCTO).single();
  const { data: u } = await db.from('usuarios').select('id').eq('email', CORREO).single();
  const res = { modo: MODO, fecha: new Date().toISOString(), consultas: [] };

  // 1-4: lecturas
  res.consultas.push(await medir('1. por identificador (productos.id)', 30, () =>
    db.from('productos').select('id, name, price, stock').eq('id', p.id).single()));
  res.consultas.push(await medir('2. conjunto pequeño (10 productos recientes)', 30, () =>
    db.from('productos').select('id, name, price').eq('activo', true).order('created_at', { ascending: false }).limit(10)));
  res.consultas.push(await medir('3. conjunto grande: historial completo P12', 10, () =>
    db.from('compras').select('id, total, status, created_at, compras_items (id, name, price, size, quantity, image_url)')
      .eq('user_id', u.id).order('created_at', { ascending: false })));
  res.consultas.push(await medir('3b. historial P12 paginado (20, índice)', 10, () =>
    db.from('compras').select('id, total, status, created_at, compras_items (id, name, price, size, quantity, image_url)')
      .eq('user_id', u.id).order('created_at', { ascending: false }).limit(20)));
  res.consultas.push(await medir('4. con filtros (activo, precio, nombre, orden)', 30, () =>
    db.from('productos').select('id, name, price').eq('activo', true).gte('price', 500).lte('price', 4000)
      .ilike('name', '%a%').order('price', { ascending: true })));

  // 5: 50 actualizaciones concurrentes del mismo registro (descuento de stock)
  const N = 50;
  const antes = (await db.from('productos').select('stock').eq('id', p.id).single()).data.stock;
  const t0 = performance.now();
  let errores = 0;
  if (MODO === 'antes') {
    // Mismo patrón que ComprasService original: leer → calcular → escribir.
    await Promise.all(Array.from({ length: N }, async () => {
      const { data } = await db.from('productos').select('stock').eq('id', p.id).single();
      const { error } = await db.from('productos').update({ stock: data.stock - 1 }).eq('id', p.id);
      if (error) errores++;
    }));
  } else {
    // Descuento atómico en una sola sentencia (lo que hace crear_compra).
    await Promise.all(Array.from({ length: N }, async () => {
      const { error } = await db.rpc('descontar_stock', { p_producto_id: p.id, p_cantidad: 1 });
      if (error) errores++;
    }));
  }
  const despues = (await db.from('productos').select('stock').eq('id', p.id).single()).data.stock;
  res.concurrencia = {
    prueba: '5. 50 descuentos de stock simultáneos sobre el mismo producto',
    metodo: MODO === 'antes' ? 'SELECT + UPDATE stock = valor_leído − 1' : 'UPDATE … SET stock = stock − 1 WHERE stock >= 1 (atómico)',
    stock_inicial: antes, stock_final: despues, descuentos_esperados: N, descuentos_aplicados: antes - despues,
    actualizaciones_perdidas: N - (antes - despues), errores, duracion_ms: r2(performance.now() - t0),
  };
  console.log(JSON.stringify(res.concurrencia));
  // Se devuelve el stock al valor inicial para no alterar la prueba de integridad de compras.
  await db.from('productos').update({ stock: antes }).eq('id', p.id);

  // 6: dos escrituras simultáneas sobre el MISMO registro (estado de una compra)
  const { data: c } = await db.from('compras').select('id, status').eq('user_id', u.id).limit(1).single();
  await Promise.all([
    db.from('compras').update({ status: 'confirmado' }).eq('id', c.id),
    db.from('compras').update({ status: 'enviado' }).eq('id', c.id),
  ]);
  const { data: c2 } = await db.from('compras').select('status').eq('id', c.id).single();
  res.escrituras_simultaneas = {
    prueba: '6. dos UPDATE simultáneos del estado de la misma compra',
    resultado_final: c2.status, valido: ['confirmado', 'enviado'].includes(c2.status),
    nota: 'PostgreSQL bloquea la fila: la segunda escritura espera a la primera y gana la última (sin corrupción).',
  };
  await db.from('compras').update({ status: c.status }).eq('id', c.id);
  console.log(JSON.stringify(res.escrituras_simultaneas));

  if (SALIDA) fs.writeFileSync(SALIDA, JSON.stringify(res, null, 2));
})().catch((e) => { console.error(e); process.exit(1); });
