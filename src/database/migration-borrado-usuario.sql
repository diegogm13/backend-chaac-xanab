-- ============================================================
-- CHAAC XANAB — Borrado permanente de usuarios
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- Es idempotente
-- Requiere haber corrido antes migration.sql y migration-practicas-11-12.sql
-- ============================================================

-- El botón "Eliminar" del admin ahora borra al usuario por completo (DELETE
-- real), ya no solo lo desactiva. Sin este cambio, borrar a un usuario que
-- tiene compras registradas truena por la llave foránea compras.user_id.
-- Con ON DELETE CASCADE, al eliminar el usuario también se eliminan sus
-- compras (y por cascada ya existente, los items de esas compras).
ALTER TABLE compras DROP CONSTRAINT IF EXISTS compras_user_id_fkey;

ALTER TABLE compras
  ADD CONSTRAINT compras_user_id_fkey FOREIGN KEY (user_id) REFERENCES usuarios(id) ON DELETE CASCADE;
