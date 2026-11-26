// Práctica 9 contra PRODUCCIÓN: dos sesiones (dispositivo A = app, dispositivo B = web) sobre la misma base.
// Usa la cuenta de prueba de la Práctica 12 y solo datos reversibles (dirección y nombre); al final restaura lo original.
// Uso: node p9_produccion.mjs <salida.json> <fase: probar|restaurar>   (credenciales en CX_EMAIL / CX_PASS)
import fs from 'node:fs';

const API = 'https://backend-chaac-xanab.vercel.app/api';
const [salida, fase = 'probar'] = process.argv.slice(2);
const estadoPath = salida.replace(/\.json$/, '_original.json');
const log = [];
const t0 = Date.now();
const linea = (s) => { const l = `[${String(Date.now() - t0).padStart(5)} ms] ${s}`; log.push(l); console.log(l); };

async function pedir(disp, metodo, ruta, token, body) {
  const ini = Date.now();
  const r = await fetch(API + ruta, {
    method: metodo,
    headers: {
      'content-type': 'application/json',
      'user-agent': disp === 'A' ? 'ChaacXanabMovil/1.0 (dispositivo A)' : 'ChaacXanabWeb/1.0 (dispositivo B)',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await r.json().catch(() => null);
  return { status: r.status, json, ms: Date.now() - ini };
}

async function sesion(disp) {
  const r = await pedir(disp, 'POST', '/auth/login', null, { email: process.env.CX_EMAIL, password: process.env.CX_PASS });
  if (r.status !== 201) throw new Error(`login ${disp}: ${r.status}`);
  linea(`Dispositivo ${disp}: inicio de sesión -> ${r.status} (${r.ms} ms)`);
  return r.json.token;
}

const tA = await sesion('A');
const tB = await sesion('B');
linea(`Sesiones distintas: ${tA !== tB ? 'sí (tokens diferentes)' : 'NO'}`);

if (fase === 'restaurar') {
  const orig = JSON.parse(fs.readFileSync(estadoPath, 'utf8'));
  const n = await pedir('A', 'PUT', '/auth/me', tA, { name: orig.nombre });
  linea(`Restaurar nombre "${orig.nombre}" -> ${n.status}`);
  if (orig.direccion) {
    const { calle, numero_ext, numero_int, colonia, ciudad, estado, codigo_postal } = orig.direccion;
    const d = await pedir('A', 'PUT', '/auth/me/direccion', tA, { calle, numero_ext, ...(numero_int ? { numero_int } : {}), colonia, ciudad, estado, codigo_postal });
    linea(`Restaurar dirección "${calle}" -> ${d.status}`);
  }
  const me = await pedir('B', 'GET', '/auth/me', tB);
  linea(`Comprobación desde B: nombre = "${me.json?.name}"`);
  fs.writeFileSync(salida, JSON.stringify({ log }, null, 2));
  process.exit(0);
}

// Estado inicial (para restaurarlo después)
const me0 = await pedir('A', 'GET', '/auth/me', tA);
const dir0 = await pedir('A', 'GET', '/auth/me/direccion', tA);
fs.writeFileSync(estadoPath, JSON.stringify({ nombre: me0.json.name, direccion: dir0.json }, null, 2));
linea(`Estado inicial guardado: nombre "${me0.json.name}", dirección "${dir0.json?.calle ?? '(ninguna)'}"`);

const resultados = {};

// DB-03: A escribe, B lee
const dirA = { calle: 'PRUEBA_A_001', numero_ext: '9', colonia: 'Centro', ciudad: 'Mérida', estado: 'Yucatán', codigo_postal: '97000' };
const w = await pedir('A', 'PUT', '/auth/me/direccion', tA, dirA);
linea(`DB-03  A guarda la dirección "PRUEBA_A_001" -> ${w.status} (${w.ms} ms)`);
const tEscrito = Date.now();
const rB = await pedir('B', 'GET', '/auth/me/direccion', tB);
const okB = rB.json?.calle === 'PRUEBA_A_001';
linea(`DB-03  B consulta la dirección -> ${rB.status}: calle = "${rB.json?.calle}" ${okB ? 'OK' : 'NO COINCIDE'} (visible ${Date.now() - tEscrito} ms después)`);
resultados['DB-03'] = okB;

// DB-05 / DB-06: B actualiza, A lo ve
const u = await pedir('B', 'PUT', '/auth/me', tB, { name: 'PRUEBA_B_001' });
linea(`DB-06  B cambia el nombre a "PRUEBA_B_001" -> ${u.status} (${u.ms} ms)`);
const tCambio = Date.now();
const rA = await pedir('A', 'GET', '/auth/me', tA);
const okA = rA.json?.name === 'PRUEBA_B_001';
linea(`DB-05  A consulta su perfil -> ${rA.status}: nombre = "${rA.json?.name}" ${okA ? 'OK' : 'NO COINCIDE'} (visible ${Date.now() - tCambio} ms después)`);
resultados['DB-05'] = okA; resultados['DB-06'] = okA;

// DB-07: los dos modifican el mismo registro al mismo tiempo
const [cA, cB] = await Promise.all([
  pedir('A', 'PUT', '/auth/me', tA, { name: 'CONFLICTO_A' }),
  pedir('B', 'PUT', '/auth/me', tB, { name: 'CONFLICTO_B' }),
]);
linea(`DB-07  A y B guardan a la vez "CONFLICTO_A" y "CONFLICTO_B" -> ${cA.status} / ${cB.status}`);
const fA = await pedir('A', 'GET', '/auth/me', tA);
const fB = await pedir('B', 'GET', '/auth/me', tB);
linea(`DB-07  Valor final visto por A: "${fA.json?.name}" · por B: "${fB.json?.name}" (${fA.json?.name === fB.json?.name ? 'consistente' : 'INCONSISTENTE'}; gana la última escritura)`);
resultados['DB-07'] = fA.json?.name === fB.json?.name;

// Deja un nombre reconocible para la captura de la app
await pedir('B', 'PUT', '/auth/me', tB, { name: 'PRUEBA_B_001' });
linea('Nombre "PRUEBA_B_001" puesto desde B para verlo en la app (dispositivo A)');

fs.writeFileSync(salida, JSON.stringify({ resultados, log }, null, 2));
