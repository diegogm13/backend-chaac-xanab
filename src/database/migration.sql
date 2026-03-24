-- ============================================================
-- CHAAC XANAB — Migración completa
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Es idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING
-- ============================================================

-- ─── EXTENSIONES ─────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── USUARIOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer'
                CHECK (role IN ('customer', 'admin')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── DIRECCIONES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios_direcciones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  calle          TEXT NOT NULL,
  numero_ext     TEXT NOT NULL,
  numero_int     TEXT,
  colonia        TEXT NOT NULL,
  ciudad         TEXT NOT NULL,
  estado         TEXT NOT NULL,
  codigo_postal  TEXT NOT NULL,
  pais           TEXT NOT NULL DEFAULT 'México',
  es_principal   BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── CATEGORIAS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS categorias (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug      TEXT UNIQUE NOT NULL
            CHECK (slug IN ('running','lifestyle','basquetbol','nuevo',
                            'hombre','mujer','ninos','ofertas','snkrs')),
  name      TEXT NOT NULL,
  subtitle  TEXT,
  image_url TEXT,
  orden     INTEGER DEFAULT 0
);

-- ─── PRODUCTOS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS productos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id   UUID NOT NULL REFERENCES categorias(id),
  name           TEXT NOT NULL,
  description    TEXT,
  price          NUMERIC(10,2) NOT NULL CHECK (price >= 0),
  original_price NUMERIC(10,2) CHECK (original_price >= 0),
  stock          INTEGER NOT NULL DEFAULT 0 CHECK (stock >= 0),
  image_url      TEXT,
  sizes          TEXT[] NOT NULL DEFAULT '{}',
  badge          TEXT CHECK (badge IN ('new','popular','sale') OR badge IS NULL),
  activo         BOOLEAN DEFAULT true,
  created_at     TIMESTAMPTZ DEFAULT now()
);

-- ─── COMPRAS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES usuarios(id),
  direccion_id UUID REFERENCES usuarios_direcciones(id),
  total        NUMERIC(10,2) NOT NULL CHECK (total >= 0),
  status       TEXT NOT NULL DEFAULT 'pendiente'
               CHECK (status IN ('pendiente','confirmado','enviado','entregado','cancelado')),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- ─── ITEMS DE COMPRA ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS compras_items (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  compra_id   UUID NOT NULL REFERENCES compras(id) ON DELETE CASCADE,
  producto_id UUID NOT NULL REFERENCES productos(id),
  name        TEXT NOT NULL,
  price       NUMERIC(10,2) NOT NULL,
  size        TEXT NOT NULL,
  quantity    INTEGER NOT NULL CHECK (quantity > 0),
  image_url   TEXT
);

-- ─── LINKS EXTERNOS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS links_externos (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name  TEXT NOT NULL,
  url   TEXT NOT NULL,
  orden INTEGER DEFAULT 0
);

-- Datos iniciales de links externos (idempotente)
INSERT INTO links_externos (name, url, orden) VALUES
  ('Nike',        'https://www.nike.com',        1),
  ('Adidas',      'https://www.adidas.com',      2),
  ('Puma',        'https://www.puma.com',        3),
  ('Reebok',      'https://www.reebok.com',      4),
  ('New Balance', 'https://www.newbalance.com',  5)
ON CONFLICT DO NOTHING;

-- ─── WEBAUTHN CHALLENGES ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS webauthn_challenges (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email      TEXT NOT NULL,
  challenge  TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- Índice para limpiar expirados eficientemente
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_email
  ON webauthn_challenges(email);
CREATE INDEX IF NOT EXISTS idx_webauthn_challenges_expires
  ON webauthn_challenges(expires_at);

-- ─── CREDENCIALES BIOMETRICAS ────────────────────────────────
CREATE TABLE IF NOT EXISTS credenciales_biometricas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key    TEXT NOT NULL,
  counter       BIGINT DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

-- ─── ÍNDICES DE PERFORMANCE ──────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_productos_categoria
  ON productos(categoria_id) WHERE activo = true;
CREATE INDEX IF NOT EXISTS idx_compras_user
  ON compras(user_id);
CREATE INDEX IF NOT EXISTS idx_compras_items_compra
  ON compras_items(compra_id);
