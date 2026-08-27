-- ============================================================================
-- 294 — the destination catalog: the vocabulary becomes shared data
-- ============================================================================
--
-- P1 of docs/plans/productization-from-reference.md. The pricing engine has
-- always been destination-agnostic (rates key on free-text city); what is
-- hardcoded is the VOCABULARY — a 44-city Egypt list in lib/constants and the
-- Egypt framing in the AI prompts. This migration makes the vocabulary data,
-- in the SaaS-correct shape:
--
--   destination_catalog        GLOBAL countries — shared by every tenant,
--                              maintained self-serve (operator decision
--                              2026-08-27). One catalog is the product moat:
--                              new tenants onboard onto existing countries.
--   destination_cities         GLOBAL cities per country: coordinates,
--                              Japanese labels, free-text aliases and airport
--                              codes (the WhatsApp parser and tour matcher
--                              learn these).
--   tenant_destinations        which countries a TENANT operates, plus that
--                              tenant's own AI voice for the country
--                              (generation_brief, glossary) — two agencies
--                              selling Egypt write differently.
--
-- The dormant per-tenant `destinations` table from migration 007 is left
-- untouched on purpose: tour_templates.destination_id still references it,
-- and no code reads it. It folds into the catalog when tours gain catalog
-- awareness — not before, and never silently.
--
-- Egypt is seeded with its 44 cities (names, coordinates and Japanese labels
-- carried from the reference implementation), and EVERY existing tenant gets
-- Egypt selected — behaviour today is unchanged by construction. Five more
-- Middle East & Africa countries are seeded as empty shells (first market,
-- operator decision 2026-08-27) so onboarding demos are instant.
--
-- Idempotent: safe to run twice.

BEGIN;

CREATE TABLE IF NOT EXISTS destination_catalog (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ja TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS destination_cities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  catalog_id UUID NOT NULL REFERENCES destination_catalog(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_ja TEXT,
  aliases TEXT[] NOT NULL DEFAULT '{}',
  lat NUMERIC,
  lng NUMERIC,
  airport_codes TEXT[] NOT NULL DEFAULT '{}',
  timezone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (catalog_id, name)
);

CREATE INDEX IF NOT EXISTS idx_destination_cities_catalog
  ON destination_cities(catalog_id) WHERE is_active;

CREATE TABLE IF NOT EXISTS tenant_destinations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  catalog_id UUID NOT NULL REFERENCES destination_catalog(id) ON DELETE CASCADE,
  is_default BOOLEAN NOT NULL DEFAULT false,
  generation_brief TEXT,
  glossary JSONB,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, catalog_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_destinations_tenant
  ON tenant_destinations(tenant_id) WHERE is_active;

-- ── RLS ──
-- Catalog tables are GLOBAL reference data: readable by every signed-in
-- user; written only through the service-role API (self-serve additions go
-- through it too, so junk-code validation lives in one place).
ALTER TABLE destination_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE destination_cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_destinations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS destination_catalog_read ON destination_catalog;
CREATE POLICY destination_catalog_read ON destination_catalog
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS destination_catalog_service ON destination_catalog;
CREATE POLICY destination_catalog_service ON destination_catalog
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS destination_cities_read ON destination_cities;
CREATE POLICY destination_cities_read ON destination_cities
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS destination_cities_service ON destination_cities;
CREATE POLICY destination_cities_service ON destination_cities
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- A tenant sees its own selections only.
DROP POLICY IF EXISTS tenant_destinations_read ON tenant_destinations;
CREATE POLICY tenant_destinations_read ON tenant_destinations
  FOR SELECT TO authenticated
  USING (tenant_id = get_user_tenant_id());
DROP POLICY IF EXISTS tenant_destinations_service ON tenant_destinations;
CREATE POLICY tenant_destinations_service ON tenant_destinations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Seed: Egypt with its 44 cities ──
INSERT INTO destination_catalog (country_code, name, name_ja)
VALUES ('EG', 'Egypt', 'エジプト')
ON CONFLICT (country_code) DO NOTHING;

INSERT INTO destination_cities (catalog_id, name, name_ja, lat, lng, sort_order)
SELECT c.id, v.name, v.name_ja, v.lat::numeric, v.lng::numeric, v.sort_order
FROM destination_catalog c,
  (VALUES
    ('Abu Simbel', 'アブ・シンベル', 22.3372, 31.6258, 1),
    ('Abydos', 'アビドス', 26.1852, 31.9190, 2),
    ('Alamein', 'アラメイン', 30.8340, 28.9564, 3),
    ('Alexandria', 'アレクサンドリア', 31.2001, 29.9187, 4),
    ('Aswan', 'アスワン', 24.0889, 32.8998, 5),
    ('Asyut', 'アシュート', 27.1809, 31.1837, 6),
    ('Bahariya', 'バハレイヤ', 28.3486, 28.8628, 7),
    ('Beni Suef', 'ベニ・スエフ', 29.0661, 31.0994, 8),
    ('Cairo', 'カイロ', 30.0444, 31.2357, 9),
    ('Dahab', 'ダハブ', 28.5007, 34.5133, 10),
    ('Dakhla', 'ダフラ', 25.4948, 29.0009, 11),
    ('Dendera', 'デンデラ', 26.1424, 32.6700, 12),
    ('Edfu', 'エドフ', 24.9779, 32.8734, 13),
    ('El Arish', 'エル・アリーシュ', 31.1311, 33.7956, 14),
    ('El Balyana', 'エル・バルヤナ', 26.2350, 31.8994, 15),
    ('El Gouna', 'エル・グーナ', 27.1827, 33.6807, 16),
    ('El Quseir', 'エル・クセイル', 26.1000, 34.2800, 17),
    ('El Tor', 'エル・トール', 28.2406, 33.6192, 18),
    ('Esna', 'エスナ', 25.2919, 32.5540, 19),
    ('Farafra', 'ファラフラ', 27.0568, 27.9700, 20),
    ('Fayoum', 'ファイユーム', 29.3084, 30.8428, 21),
    ('Giza', 'ギザ', 30.0131, 31.2089, 22),
    ('Hurghada', 'ハルガダ', 27.2579, 33.8116, 23),
    ('Ismailia', 'イスマイリア', 30.5965, 32.2715, 24),
    ('Kharga', 'ハルガ', 25.4397, 30.5590, 25),
    ('Kom Ombo', 'コム・オンボ', 24.4520, 32.9457, 26),
    ('Luxor', 'ルクソール', 25.6872, 32.6396, 27),
    ('Marsa Alam', 'マルサ・アラム', 25.0633, 34.8980, 28),
    ('Memphis', 'メンフィス', 29.8516, 31.2545, 29),
    ('Minya', 'ミニヤ', 28.0871, 30.7500, 30),
    ('Nuweiba', 'ヌウェイバ', 29.0469, 34.6726, 31),
    ('Port Said', 'ポートサイド', 31.2653, 32.3019, 32),
    ('Qena', 'ケナ', 26.1551, 32.7180, 33),
    ('Rafah', 'ラファハ', 31.2747, 34.2383, 34),
    ('Rosetta (Rashid)', 'ロゼッタ（ラシード）', 31.4040, 30.4168, 35),
    ('Safaga', 'サファガ', 26.7472, 33.9360, 36),
    ('Saint Catherine', 'セント・キャサリン', 28.5588, 33.9385, 37),
    ('Saqqara', 'サッカラ', 29.8713, 31.2165, 38),
    ('Sharm El Sheikh', 'シャルム・エル・シェイク', 27.9158, 34.3300, 39),
    ('Sheikh Zuweid', 'シェイク・ズウェイド', 31.2156, 34.0925, 40),
    ('Siwa', 'シーワ', 29.2032, 25.5195, 41),
    ('Sohag', 'ソハーグ', 26.5591, 31.6948, 42),
    ('Suez', 'スエズ', 29.9668, 32.5498, 43),
    ('Taba', 'タバ', 29.4913, 34.8980, 44)
  ) AS v(name, name_ja, lat, lng, sort_order)
WHERE c.country_code = 'EG'
ON CONFLICT (catalog_id, name) DO NOTHING;

-- ── Seed: Middle East & Africa shells (names only — cities come self-serve) ──
INSERT INTO destination_catalog (country_code, name, name_ja) VALUES
  ('JO', 'Jordan', 'ヨルダン'),
  ('MA', 'Morocco', 'モロッコ'),
  ('AE', 'United Arab Emirates', 'アラブ首長国連邦'),
  ('KE', 'Kenya', 'ケニア'),
  ('TZ', 'Tanzania', 'タンザニア')
ON CONFLICT (country_code) DO NOTHING;

-- ── Every existing tenant operates Egypt, as their default ──
-- Today every tenant IS an Egypt tenant; making that explicit changes nothing.
INSERT INTO tenant_destinations (tenant_id, catalog_id, is_default)
SELECT t.id, c.id, true
FROM tenants t, destination_catalog c
WHERE c.country_code = 'EG'
ON CONFLICT (tenant_id, catalog_id) DO NOTHING;

COMMIT;
