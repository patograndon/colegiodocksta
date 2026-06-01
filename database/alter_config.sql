-- ============================================================
-- Migración: configuracion_colegio
-- Gestión de encargados y canales de orientación
-- ============================================================

DO $$ BEGIN
  CREATE TYPE rol_encargado_enum AS ENUM ('psicologo', 'orientador', 'convivencia');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS configuracion_colegio (
  id                 SERIAL PRIMARY KEY,
  telefono_asignado  VARCHAR(20),
  nombre_encargado   VARCHAR(100),
  rol_encargado      rol_encargado_enum NOT NULL DEFAULT 'orientador',
  email_alertas      VARCHAR(150),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_config_updated_at ON configuracion_colegio;
CREATE TRIGGER trg_config_updated_at
  BEFORE UPDATE ON configuracion_colegio
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Seed: una sola fila de configuración activa
INSERT INTO configuracion_colegio (telefono_asignado, nombre_encargado, rol_encargado, email_alertas)
VALUES (NULL, 'Orientador Docksta', 'orientador', NULL)
ON CONFLICT DO NOTHING;
