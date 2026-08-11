-- ============================================================
-- CHAAC XANAB — Prácticas 11 y 12
-- Roles y permisos (RBAC), bitácora de auditoría y controles
-- de seguridad sobre usuarios (estado, bloqueo, borrado lógico)
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Es idempotente: usa IF NOT EXISTS / ON CONFLICT DO NOTHING
-- Requiere haber corrido antes migration.sql
-- ============================================================

-- ─── ROLES ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT UNIQUE NOT NULL,
  descripcion TEXT,
  created_at  TIMESTAMPTZ DEFAULT now()
);

INSERT INTO roles (nombre, descripcion) VALUES
  ('admin',    'Administrador con acceso total al panel'),
  ('customer', 'Cliente de la tienda')
ON CONFLICT (nombre) DO NOTHING;

-- ─── PERMISOS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permisos (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo      TEXT UNIQUE NOT NULL,
  descripcion TEXT
);

INSERT INTO permisos (codigo, descripcion) VALUES
  ('usuarios.ver',        'Ver el listado de usuarios'),
  ('usuarios.crear',      'Crear nuevos usuarios'),
  ('usuarios.editar',     'Editar datos de usuarios'),
  ('usuarios.eliminar',   'Eliminar (lógicamente) usuarios'),
  ('usuarios.roles',      'Cambiar el rol de un usuario'),
  ('roles.gestionar',     'Crear roles y asignar permisos'),
  ('productos.gestionar', 'Alta/edición/baja de productos'),
  ('categorias.gestionar','Alta/edición/baja de categorías'),
  ('compras.gestionar',   'Ver y actualizar el estado de compras'),
  ('bitacora.ver',        'Consultar la bitácora de auditoría')
ON CONFLICT (codigo) DO NOTHING;

-- ─── ROLES_PERMISOS (N:M) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles_permisos (
  role_id    UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permiso_id UUID NOT NULL REFERENCES permisos(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permiso_id)
);

-- El rol admin obtiene todos los permisos existentes
INSERT INTO roles_permisos (role_id, permiso_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permisos p
WHERE r.nombre = 'admin'
ON CONFLICT DO NOTHING;

-- ─── USUARIOS: nuevas columnas de seguridad y estado ─────────
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;

ALTER TABLE usuarios
  ADD COLUMN IF NOT EXISTS activo                 BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS failed_login_attempts  INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until           TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'usuarios_role_fkey'
  ) THEN
    ALTER TABLE usuarios
      ADD CONSTRAINT usuarios_role_fkey FOREIGN KEY (role) REFERENCES roles(nombre);
  END IF;
END $$;

-- ─── BITÁCORA ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bitacora (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  usuario_email TEXT,
  accion        TEXT NOT NULL
                CHECK (accion IN (
                  'LOGIN', 'LOGIN_FALLIDO', 'CUENTA_BLOQUEADA', 'LOGOUT',
                  'CAMBIO_PASSWORD', 'ALTA_USUARIO', 'BAJA_USUARIO',
                  'CAMBIO_ROL', 'ACTIVAR_USUARIO', 'DESACTIVAR_USUARIO'
                )),
  detalle       TEXT,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bitacora_usuario
  ON bitacora(usuario_id);
CREATE INDEX IF NOT EXISTS idx_bitacora_accion
  ON bitacora(accion);
CREATE INDEX IF NOT EXISTS idx_bitacora_created_at
  ON bitacora(created_at DESC);
