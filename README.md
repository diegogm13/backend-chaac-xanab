# CHAAC XANAB - Backend

API REST desarrollada con **NestJS** que da servicio a la tienda CHAAC XANAB. Maneja usuarios, productos, categorías, compras, bitácora, autenticación (JWT + WebAuthn), búsqueda inteligente y correo de contacto. Usa **Supabase (Postgres)** como base de datos principal.

Este backend no tiene interfaz propia: quien lo consume es el frontend Angular (`chaac-xanab-dg`), que le hace peticiones a `/api/...`.

## Instrucciones de desarrollo

```bash
npm install
npm run start:dev
```

La API queda disponible en `http://localhost:3000/api`. Copia `.env.example` a `.env` y llena tus propias credenciales antes de arrancar.

## Estructura de carpetas

```
backend-chaac-xanab/
├── api/
│   └── index.ts                 # Punto de entrada para Vercel (envuelve la app de Nest como función serverless)
│
├── src/
│   ├── main.ts                  # Arranque de Nest en local (helmet, CORS, prefijo /api, ValidationPipe)
│   ├── app.module.ts             # Módulo raíz: importa y conecta todos los módulos de abajo
│   │
│   ├── supabase/                 # Cliente de Supabase (conexión a la base de datos Postgres)
│   ├── auth/                     # Login, registro, JWT, guards de autenticación y de roles
│   │   ├── decorators/           # @CurrentUser, @Roles
│   │   ├── dto/                  # Validación de login/registro/perfil
│   │   ├── guards/                # JwtAuthGuard, RolesGuard
│   │   └── strategies/            # Estrategia JWT de Passport
│   ├── webauthn/                 # Login/registro con llave de acceso (passkey / huella / Windows Hello)
│   ├── roles/                    # Gestión de roles de usuario
│   │
│   ├── productos/                 # CRUD público de productos (catálogo)
│   ├── categorias/                # CRUD público de categorías (Running, Básquetbol, Lifestyle, etc.)
│   ├── compras/                   # Carrito → checkout → historial de compras
│   ├── admin/                     # Todo lo que solo puede tocar un admin: productos, categorías, compras, usuarios
│   │   └── dto/
│   ├── bitacora/                  # Registro de actividad/auditoría (quién hizo qué y cuándo)
│   │
│   ├── busqueda/                  # Orquesta el buscador: intenta Elasticsearch → Supabase → Channel3, en ese orden
│   │   └── dto/
│   ├── elasticsearch/             # Búsqueda inteligente: sinónimos, fuzzy search, boosting por marca/género/color
│   ├── channel3/                  # Búsqueda de productos en tiendas externas (Nike, Vans, etc.) vía Channel3 API
│   │
│   ├── contacto/                  # Formulario de contacto (/contacto en el frontend)
│   │   └── dto/
│   ├── email/                     # Envío de correos reales por Gmail SMTP (nodemailer)
│   ├── cloudinary/                # Subida/gestión de imágenes de producto
│   ├── links-externos/            # Links a redes sociales / recursos externos que muestra el menú
│   ├── cache/                     # Caché en memoria para respuestas frecuentes
│   ├── common/                    # Utilidades compartidas (ej. obtener IP real del cliente)
│   ├── database/                  # Scripts .sql de migración de la base de datos
│   └── seed/                      # Script para crear el usuario admin inicial
│
├── docker-compose.elasticsearch.yml  # Elasticsearch local para desarrollo (en producción se usa Bonsai.io)
├── vercel.json                    # Config de despliegue: todo el tráfico va a api/index.ts
├── .env.example                   # Lista de todas las variables de entorno necesarias, documentadas
└── .env                           # Credenciales reales (nunca se sube al repositorio)
```

## Cómo se comunica con el frontend

El frontend Angular vive en un proyecto de Vercel aparte y le hace `fetch`/`HttpClient` a rutas relativas como `/api/productos`. Su propio `vercel.json` reescribe (`rewrites`) cualquier `/api/*` hacia este backend desplegado. En desarrollo local, `chaac-xanab-dg/proxy.conf.json` hace lo mismo apuntando a `http://localhost:3000`.

## Diseño con degradación segura

Todas las integraciones externas (Elasticsearch/Bonsai, Channel3, Gmail) están diseñadas para **nunca tumbar la API** si no están configuradas o están caídas: cada servicio revisa su propia disponibilidad y regresa un resultado vacío/`false` en vez de lanzar una excepción, con el fallback correspondiente (por ejemplo, si Elasticsearch no responde, la búsqueda cae a un `ILIKE` normal contra Supabase).
