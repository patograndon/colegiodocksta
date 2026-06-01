-- ============================================================
-- Multi-Tenant Upgrade — Fundación Comunidad Viva
-- Transforma el esquema single-tenant a plataforma multi-escuela
-- Idempotente: seguro de ejecutar múltiples veces
-- ============================================================

-- ── 1. TABLA ESCUELAS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS escuelas (
  id               SERIAL PRIMARY KEY,
  nombre_escuela   VARCHAR(150) NOT NULL,
  comuna           VARCHAR(100),
  rbd              VARCHAR(20),
  whatsapp_oficial VARCHAR(30)  UNIQUE,   -- número WhatsApp propio
  vapi_phone_id    VARCHAR(100) UNIQUE,   -- phone_id de Vapi
  activa           BOOLEAN      NOT NULL DEFAULT true,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índices rápidos para enrutamiento telefónico (lookup en <5ms)
CREATE INDEX IF NOT EXISTS idx_escuelas_whatsapp
  ON escuelas (whatsapp_oficial)
  WHERE whatsapp_oficial IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_escuelas_vapi
  ON escuelas (vapi_phone_id)
  WHERE vapi_phone_id IS NOT NULL;

-- ── 2. SEED: Fundación Matriz (fallback id=1) + 2 escuelas de prueba ─
INSERT INTO escuelas (id, nombre_escuela, comuna, rbd, whatsapp_oficial, vapi_phone_id)
VALUES
  (1, 'Fundación Comunidad Viva', 'Santiago',    'FCV-000', '+56900000000', 'vapi-fundacion-matriz'),
  (2, 'Escuela República',        'Providencia', 'PV-12345', '+56911111111', 'vapi-republica-001'),
  (3, 'Colegio San José',         'Ñuñoa',       'NU-67890', '+56922222222', 'vapi-sanjose-001')
ON CONFLICT (id) DO NOTHING;

-- Resetear la secuencia para que el próximo id sea 4
SELECT setval('escuelas_id_seq', (SELECT MAX(id) FROM escuelas));

-- ── 3. MODIFICAR TABLA CONTACTOS ─────────────────────────────
ALTER TABLE contactos
  ADD COLUMN IF NOT EXISTS escuela_id INT REFERENCES escuelas(id) ON DELETE CASCADE;

-- Los contactos históricos sin escuela quedan en la Fundación Matriz
UPDATE contactos SET escuela_id = 1 WHERE escuela_id IS NULL;

CREATE INDEX IF NOT EXISTS idx_contactos_escuela
  ON contactos (escuela_id);

-- Índice compuesto para queries del dashboard por escuela + estado
CREATE INDEX IF NOT EXISTS idx_contactos_escuela_estado
  ON contactos (escuela_id, estado);

-- ── 4. TABLA CONFIGURACION_ESCUELAS ──────────────────────────
-- Renombramos configuracion_colegio → configuracion_escuelas y la vinculamos a escuela_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'configuracion_escuelas'
  ) THEN
    CREATE TABLE configuracion_escuelas (
      id                SERIAL PRIMARY KEY,
      escuela_id        INT NOT NULL REFERENCES escuelas(id) ON DELETE CASCADE,
      nombre_encargado  VARCHAR(100) NOT NULL DEFAULT 'Orientador',
      rol_encargado     rol_encargado_enum NOT NULL DEFAULT 'orientador',
      email_alertas     VARCHAR(150),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (escuela_id)
    );

    -- Migrar datos existentes de configuracion_colegio si existe
    INSERT INTO configuracion_escuelas (escuela_id, nombre_encargado, rol_encargado, email_alertas)
    SELECT 1, nombre_encargado, rol_encargado, email_alertas
    FROM configuracion_colegio
    ORDER BY id LIMIT 1
    ON CONFLICT (escuela_id) DO NOTHING;
  END IF;
END $$;

-- Seed: una config por cada escuela de prueba
INSERT INTO configuracion_escuelas (escuela_id, nombre_encargado, rol_encargado, email_alertas)
VALUES
  (2, 'Carmen Rojas',   'orientador',  'orientador@republica.cl'),
  (3, 'Pedro Morales',  'convivencia', 'convivencia@sanjose.cl')
ON CONFLICT (escuela_id) DO NOTHING;

-- Trigger updated_at para configuracion_escuelas
DROP TRIGGER IF EXISTS trg_cfg_escuelas_updated_at ON configuracion_escuelas;
CREATE TRIGGER trg_cfg_escuelas_updated_at
  BEFORE UPDATE ON configuracion_escuelas
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
