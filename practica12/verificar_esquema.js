// Comprueba que la base de Supabase tenga lo que necesita el backend de la rama "correcciones"
// antes de desplegarlo: función crear_compra, columnas nuevas e idempotencia. Solo lee; no modifica datos.
//   node practica12/verificar_esquema.js
require('dotenv/config');
const { createClient } = require('@supabase/supabase-js');

const db = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

async function columna(tabla, cols) {
  const { error } = await db.from(tabla).select(cols).limit(1);
  return error ? `FALTA (${error.code}: ${error.message})` : 'OK';
}

(async () => {
  const res = {};
  res['usuarios.failed_login_attempts, locked_until'] = await columna('usuarios', 'failed_login_attempts, locked_until');
  res['compras.idempotency_key'] = await columna('compras', 'idempotency_key');
  // Llamada con un usuario inexistente y sin artículos: si la función existe, responde con un error de negocio,
  // no con "función no encontrada" (PGRST202). No crea nada.
  const { error } = await db.rpc('crear_compra', {
    p_user_id: '00000000-0000-4000-8000-000000000000', p_items: [], p_direccion: null, p_direccion_id: null, p_idempotency_key: null,
  });
  res['función crear_compra'] = !error ? 'OK (respondió sin error)' : error.code === 'PGRST202' ? `FALTA (${error.message})` : `OK (existe; error de negocio esperado: ${error.code})`;
  console.log(JSON.stringify(res, null, 2));
})().catch((e) => { console.error(e.message); process.exit(1); });
