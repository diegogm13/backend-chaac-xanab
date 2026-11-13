// Práctica 12 — crea / borra los datos de prueba en Supabase.
//   node practica12/datos_prueba.js crear    -> usuario y producto "P12"
//   node practica12/datos_prueba.js borrar   -> elimina todo lo creado por la práctica
// Todo lo creado lleva el prefijo p12 / "P12" para poder borrarlo sin tocar datos reales.
require('dotenv/config');
const bcrypt = require('bcryptjs');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const CORREO = 'p12.carga@example.invalid';
const PASSWORD = 'P12carga#2026';
const PRODUCTO = 'P12 PRUEBA DE CARGA (no comprar)';

async function crear() {
  const { data: cat } = await db.from('categorias').select('id').eq('slug', 'running').single();
  let { data: u } = await db.from('usuarios').select('id').eq('email', CORREO).maybeSingle();
  if (!u) {
    const r = await db.from('usuarios').insert({
      name: 'Usuario P12', email: CORREO, password_hash: bcrypt.hashSync(PASSWORD, 10),
      email_verified: true, role: 'customer',
    }).select('id').single();
    if (r.error) throw r.error;
    u = r.data;
  }
  let { data: p } = await db.from('productos').select('id, stock').eq('name', PRODUCTO).maybeSingle();
  if (!p) {
    const r = await db.from('productos').insert({
      categoria_id: cat.id, name: PRODUCTO, description: 'Producto temporal de la Práctica 12',
      price: 100, stock: 100000, sizes: ['26'], activo: true,
    }).select('id, stock').single();
    if (r.error) throw r.error;
    p = r.data;
  }
  console.log(JSON.stringify({ usuario_id: u.id, correo: CORREO, producto_id: p.id, stock: p.stock }, null, 2));
}

async function borrar() {
  const { data: u } = await db.from('usuarios').select('id').eq('email', CORREO).maybeSingle();
  const { data: p } = await db.from('productos').select('id').eq('name', PRODUCTO).maybeSingle();
  const res = {};
  if (u) {
    const { data: compras } = await db.from('compras').select('id').eq('user_id', u.id);
    const ids = (compras ?? []).map((c) => c.id);
    if (ids.length) res.compras_items = (await db.from('compras_items').delete().in('compra_id', ids).select('id')).data?.length;
    res.compras = (await db.from('compras').delete().eq('user_id', u.id).select('id')).data?.length;
    res.direcciones = (await db.from('usuarios_direcciones').delete().eq('user_id', u.id).select('id')).data?.length;
    res.bitacora = (await db.from('bitacora').delete().eq('usuario_id', u.id).select('id')).data?.length;
    res.usuario = (await db.from('usuarios').delete().eq('id', u.id).select('id')).data?.length;
  }
  if (p) {
    res.items_producto = (await db.from('compras_items').delete().eq('producto_id', p.id).select('id')).data?.length;
    res.producto = (await db.from('productos').delete().eq('id', p.id).select('id')).data?.length;
  }
  res.bitacora_correos_prueba = (await db.from('bitacora').delete().like('usuario_email', '%@example.invalid').select('id')).data?.length;
  console.log(JSON.stringify(res, null, 2));
}

(process.argv[2] === 'borrar' ? borrar : crear)().catch((e) => { console.error(e); process.exit(1); });
