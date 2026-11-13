// Práctica 12 — verifica la integridad del producto de prueba después de una prueba de estrés.
// Compara el stock real con el esperado = stock inicial − piezas vendidas (según compras_items).
//   node practica12/integridad.js [stockInicial=100000] [salida.json]
require('dotenv/config');
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const PRODUCTO = 'P12 PRUEBA DE CARGA (no comprar)';
const CORREO = 'p12.carga@example.invalid';

(async () => {
  const inicial = Number(process.argv[2] ?? 100000);
  const { data: p } = await db.from('productos').select('id, stock').eq('name', PRODUCTO).single();
  const { data: u } = await db.from('usuarios').select('id').eq('email', CORREO).single();
  let items = [], desde = 0;
  for (;;) {
    const { data } = await db.from('compras_items').select('quantity, compra_id').eq('producto_id', p.id).range(desde, desde + 999);
    items = items.concat(data ?? []);
    if (!data || data.length < 1000) break;
    desde += 1000;
  }
  const { count: compras } = await db.from('compras').select('id', { count: 'exact', head: true }).eq('user_id', u.id);
  const vendidas = items.reduce((s, i) => s + i.quantity, 0);
  const comprasConItems = new Set(items.map((i) => i.compra_id)).size;
  const r = {
    fecha: new Date().toISOString(), stock_inicial: inicial, piezas_vendidas: vendidas, stock_esperado: inicial - vendidas,
    stock_real: p.stock, diferencia: p.stock - (inicial - vendidas), compras_usuario_p12: compras,
    compras_con_renglones: comprasConItems, compras_huerfanas: compras - comprasConItems,
  };
  console.log(JSON.stringify(r, null, 2));
  if (process.argv[3]) fs.writeFileSync(process.argv[3], JSON.stringify(r, null, 2));
})();
