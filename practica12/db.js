// Práctica 12 — consultas de diagnóstico a Supabase con las credenciales de .env.
// Uso: node practica12/db.js "<tabla>" '<filtro JSON {"col":"valor"}>' [limite]
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

(async () => {
  const [tabla, filtro = '{}', limite = '20'] = process.argv.slice(2);
  let q = db.from(tabla).select('*', { count: 'exact' }).limit(Number(limite));
  for (const [k, v] of Object.entries(JSON.parse(filtro))) q = q.eq(k, v);
  const { data, error, count } = await q;
  if (error) { console.error('ERROR', error); process.exit(1); }
  console.log(JSON.stringify({ count, filas: data }, null, 2));
})();
