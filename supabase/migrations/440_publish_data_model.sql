-- ============================================
-- 440: Publish — sites, pages, drafts, versions, media, enquiries
-- ============================================
-- Step 2 of docs/publish/PLAN.md (§4). What a company's website is made of,
-- apart from the facts: those are never stored here — prices, inclusions,
-- departures and terms are read from the Autoura records each time a page is
-- rendered. These tables hold page configuration, AI drafts, approved
-- narrative and its history, media, redirects, glossary, and the attribution
-- of each enquiry (the lead itself is a `clients` row — PLAN D4).
--
-- Every table carries tenant_id with row-level security. Who may do what:
--   read                       every member of the company
--   write drafts, glossary,    members who may write (owner/admin/manager/
--   media                      member — member_can_write, migration 424)
--   change the site, pages,    owners, admins and managers
--   domains, redirects, rules  (publish_can_manage, below)
--   approve, version, record   nobody signed in: the server does it, after
--   enquiries, enable a site   its own role check (service role)
--
-- A row can never point into another company: children carry (site_id,
-- tenant_id) / (page_id, tenant_id) foreign keys onto the parent's pair, and
-- the few links into existing tables (tour, client, brief, conversation) are
-- checked by a trigger.
--
-- Creating a site enrols the company in sync health (migration 439), so its
-- record changes start being logged; deleting the site stops it.
--
-- Languages: English plus at most one left-to-right language (PLAN D14).
-- Right-to-left languages are refused here as well as in the app.

BEGIN;

-- ---------- who manages a company's site ----------

CREATE OR REPLACE FUNCTION public.publish_can_manage(p_tenant UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM tenant_members
     WHERE user_id = auth.uid()
       AND tenant_id = p_tenant
       AND status = 'active'
       AND role IN ('owner', 'admin', 'manager')
  )
$$;
REVOKE ALL ON FUNCTION public.publish_can_manage(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_can_manage(UUID) TO authenticated;

-- ---------- sites ----------

CREATE TABLE IF NOT EXISTS public.publish_sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  archetype TEXT NOT NULL CHECK (archetype IN ('private_journeys', 'transparent_value')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'live', 'suspended')),
  languages TEXT[] NOT NULL DEFAULT ARRAY['en'],
  brand JSONB NOT NULL DEFAULT '{}'::jsonb,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Phase 1: one site per company (PLAN D16). Everything else keys by site_id.
  CONSTRAINT publish_sites_one_per_company UNIQUE (tenant_id),
  CONSTRAINT publish_sites_id_tenant UNIQUE (id, tenant_id),
  -- English first, then at most one more two-letter language; never RTL.
  CONSTRAINT publish_sites_languages CHECK (
    array_to_string(languages, ',') ~ '^en(,[a-z]{2})?$'
    AND languages[2] IS DISTINCT FROM 'en'
    AND NOT (languages && ARRAY['ar', 'he', 'fa', 'ur', 'yi', 'ps', 'sd', 'ug', 'dv', 'ku'])
  )
);

-- ---------- domains ----------

CREATE TABLE IF NOT EXISTS public.publish_domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  hostname TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'primary' CHECK (kind IN ('primary', 'alias_redirect', 'test')),
  status TEXT NOT NULL DEFAULT 'pending_dns' CHECK (status IN ('pending_dns', 'verifying', 'active', 'failed')),
  provider_ref TEXT,
  verified_at TIMESTAMPTZ,
  last_checked_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_id, tenant_id) REFERENCES public.publish_sites(id, tenant_id) ON DELETE CASCADE,
  -- One company per hostname, across every company.
  CONSTRAINT publish_domains_hostname_unique UNIQUE (hostname),
  CONSTRAINT publish_domains_hostname_shape CHECK (
    hostname = lower(hostname) AND hostname ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'
  )
);
CREATE UNIQUE INDEX IF NOT EXISTS publish_domains_one_primary
  ON public.publish_domains (site_id) WHERE kind = 'primary';

-- Whether a hostname is free, without showing whose it is.
CREATE OR REPLACE FUNCTION public.publish_hostname_available(p_hostname TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NOT EXISTS (SELECT 1 FROM publish_domains WHERE hostname = lower(trim(p_hostname)))
$$;
REVOKE ALL ON FUNCTION public.publish_hostname_available(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_hostname_available(TEXT) TO authenticated;

-- ---------- pages and their language versions ----------

CREATE TABLE IF NOT EXISTS public.publish_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('tour', 'home', 'listing', 'about', 'how_we_work', 'contact', 'legal')),
  -- The product a tour page renders. NULL once the tour is deleted: the page
  -- then answers 410 (step 5) rather than vanishing from history.
  tour_template_id UUID REFERENCES public.tour_templates(id) ON DELETE SET NULL,
  -- Non-tour pages: the ordered blocks of the theme (keys, not content).
  blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_id, tenant_id) REFERENCES public.publish_sites(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT publish_pages_id_tenant UNIQUE (id, tenant_id),
  CONSTRAINT publish_pages_id_site_tenant UNIQUE (id, site_id, tenant_id),
  CONSTRAINT publish_pages_tour_needs_kind CHECK (tour_template_id IS NULL OR kind = 'tour')
);
CREATE UNIQUE INDEX IF NOT EXISTS publish_pages_one_per_tour
  ON public.publish_pages (site_id, tour_template_id) WHERE tour_template_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.publish_page_locales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  page_id UUID NOT NULL,
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2}$'),
  slug TEXT NOT NULL CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' OR slug = ''),
  is_published BOOLEAN NOT NULL DEFAULT false,
  current_version_id UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (page_id, site_id, tenant_id) REFERENCES public.publish_pages(id, site_id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT publish_page_locales_one_per_language UNIQUE (page_id, language),
  CONSTRAINT publish_page_locales_slug_unique UNIQUE (site_id, language, slug)
);

-- ---------- drafts and the published history ----------

CREATE TABLE IF NOT EXISTS public.publish_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id UUID NOT NULL,
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2}$'),
  kind TEXT NOT NULL CHECK (kind IN ('narrative', 'seo', 'blocks', 'faq')),
  -- Segments: text with source refs, or a fact slot by key (PLAN §9). Never a
  -- price, date or policy value.
  content JSONB NOT NULL DEFAULT '[]'::jsonb,
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  check_result JSONB,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'in_review', 'approved', 'rejected', 'superseded', 'failed_check')),
  origin TEXT NOT NULL DEFAULT 'user' CHECK (origin IN ('engine', 'user')),
  model TEXT,
  prompt_version TEXT,
  fact_fingerprint TEXT,
  reviewer_note TEXT,
  reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (page_id, tenant_id) REFERENCES public.publish_pages(id, tenant_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS publish_drafts_page ON public.publish_drafts (page_id, language, status);

CREATE TABLE IF NOT EXISTS public.publish_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  page_id UUID NOT NULL,
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2}$'),
  version_no INTEGER NOT NULL CHECK (version_no > 0),
  content JSONB NOT NULL,
  -- Read-only audit copy of the facts as rendered (PLAN D15). Never read back
  -- to render a page.
  facts_snapshot JSONB,
  reason TEXT NOT NULL CHECK (reason IN ('approved_draft', 'fact_refresh', 'rule_auto')),
  draft_id UUID REFERENCES public.publish_drafts(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Who approved, as they were named then: survives their login being deleted.
  approver_name TEXT,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (page_id, tenant_id) REFERENCES public.publish_pages(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT publish_versions_numbered UNIQUE (page_id, language, version_no),
  CONSTRAINT publish_versions_id_page_language UNIQUE (id, page_id, language),
  -- AI text reaches the public only through a person's approval.
  CONSTRAINT publish_versions_approved_by_a_person CHECK (reason <> 'approved_draft' OR approver_name IS NOT NULL)
);

-- The live version of a language must be a version of that page, in that language.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'publish_page_locales_current_version') THEN
    ALTER TABLE public.publish_page_locales
      ADD CONSTRAINT publish_page_locales_current_version
      FOREIGN KEY (current_version_id, page_id, language)
      REFERENCES public.publish_versions(id, page_id, language);
  END IF;
END $$;

-- History is never rewritten: a published version cannot be edited by anyone.
-- The one change let through is a link going blank because what it pointed
-- at was deleted (the draft, or the approver's login) — ON DELETE SET NULL.
CREATE OR REPLACE FUNCTION public.publish_versions_immutable()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (to_jsonb(NEW) - 'draft_id' - 'approved_by') = (to_jsonb(OLD) - 'draft_id' - 'approved_by')
     AND (NEW.draft_id IS NULL OR NEW.draft_id = OLD.draft_id)
     AND (NEW.approved_by IS NULL OR NEW.approved_by = OLD.approved_by) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'a published version cannot be changed; publish a new one instead';
END;
$$;
DROP TRIGGER IF EXISTS publish_versions_no_update ON public.publish_versions;
CREATE TRIGGER publish_versions_no_update BEFORE UPDATE ON public.publish_versions
  FOR EACH ROW EXECUTE FUNCTION public.publish_versions_immutable();

-- ---------- rules, glossary, media, redirects ----------

CREATE TABLE IF NOT EXISTS public.publish_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('auto_publish_fact_only')),
  enabled BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_id, tenant_id) REFERENCES public.publish_sites(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT publish_rules_one_per_type UNIQUE (site_id, rule_type)
);

CREATE TABLE IF NOT EXISTS public.publish_glossary (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  term_key TEXT NOT NULL CHECK (length(term_key) BETWEEN 1 AND 200),
  kind TEXT NOT NULL CHECK (kind IN ('site', 'hotel', 'cruise', 'house')),
  language TEXT NOT NULL CHECK (language ~ '^[a-z]{2}$'),
  spelling TEXT NOT NULL CHECK (length(spelling) BETWEEN 1 AND 300),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT publish_glossary_one_spelling UNIQUE (tenant_id, term_key, language)
);

CREATE TABLE IF NOT EXISTS public.publish_media (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  -- In the publish-media bucket, under the company's own folder.
  storage_path TEXT NOT NULL,
  width INTEGER CHECK (width > 0),
  height INTEGER CHECK (height > 0),
  alt JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_placeholder BOOLEAN NOT NULL DEFAULT false,
  checksum TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_id, tenant_id) REFERENCES public.publish_sites(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT publish_media_path_unique UNIQUE (storage_path),
  CONSTRAINT publish_media_in_own_folder CHECK (split_part(storage_path, '/', 1) = tenant_id::text)
);

CREATE TABLE IF NOT EXISTS public.publish_redirects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID NOT NULL,
  from_path TEXT NOT NULL CHECK (from_path ~ '^/'),
  to_path TEXT NOT NULL CHECK (to_path ~ '^(/|https://)'),
  status_code INTEGER NOT NULL DEFAULT 301 CHECK (status_code IN (301, 302)),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  FOREIGN KEY (site_id, tenant_id) REFERENCES public.publish_sites(id, tenant_id) ON DELETE CASCADE,
  CONSTRAINT publish_redirects_from_unique UNIQUE (site_id, from_path)
);

-- ---------- enquiries (attribution; the lead is the clients row) ----------

CREATE TABLE IF NOT EXISTS public.publish_enquiries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  -- The agency keeps its enquiries if a page or the site goes: SET NULL.
  site_id UUID REFERENCES public.publish_sites(id) ON DELETE SET NULL,
  page_id UUID REFERENCES public.publish_pages(id) ON DELETE SET NULL,
  client_id UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  source TEXT NOT NULL CHECK (source IN ('web_form', 'concierge_bot', 'whatsapp')),
  landing_url TEXT,
  campaign TEXT,
  utm JSONB NOT NULL DEFAULT '{}'::jsonb,
  language TEXT CHECK (language ~ '^[a-z]{2}$'),
  tour_template_id UUID REFERENCES public.tour_templates(id) ON DELETE SET NULL,
  dates JSONB,
  travellers INTEGER CHECK (travellers > 0),
  message TEXT,
  concierge_brief_id UUID REFERENCES public.concierge_briefs(id) ON DELETE SET NULL,
  whatsapp_conversation_id UUID REFERENCES public.whatsapp_conversations(id) ON DELETE SET NULL,
  ref_token TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS publish_enquiries_tenant_created ON public.publish_enquiries (tenant_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.publish_wa_refs (
  token TEXT PRIMARY KEY CHECK (token ~ '^[A-Za-z0-9]{6,16}$'),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  site_id UUID REFERENCES public.publish_sites(id) ON DELETE SET NULL,
  page_id UUID REFERENCES public.publish_pages(id) ON DELETE SET NULL,
  landing_url TEXT,
  campaign TEXT,
  language TEXT CHECK (language ~ '^[a-z]{2}$'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  matched_at TIMESTAMPTZ
);

-- ---------- links into existing tables stay inside the company ----------

CREATE OR REPLACE FUNCTION public.publish_same_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j JSONB := to_jsonb(NEW);
  old_j JSONB := CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) END;
  link RECORD;
  v_owner UUID;
  v_found INTEGER;
BEGIN
  FOR link IN
    SELECT * FROM (VALUES
      ('tour_template_id', 'tour_templates'),
      ('site_id', 'publish_sites'),
      ('page_id', 'publish_pages'),
      ('client_id', 'clients'),
      ('concierge_brief_id', 'concierge_briefs'),
      ('whatsapp_conversation_id', 'whatsapp_conversations')
    ) AS l(col, tbl)
  LOOP
    -- Only a link being set or changed is checked: an UPDATE that leaves it
    -- alone (or a cascade blanking another link) has nothing new to prove.
    IF j ? link.col AND j ->> link.col IS NOT NULL
       AND (old_j IS NULL OR (old_j ->> link.col) IS DISTINCT FROM (j ->> link.col)) THEN
      EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', link.tbl) INTO v_owner USING (j ->> link.col)::uuid;
      GET DIAGNOSTICS v_found = ROW_COUNT;
      -- Not found: the foreign key reports that, in its own words.
      IF v_found > 0 AND v_owner IS DISTINCT FROM NEW.tenant_id THEN
        RAISE EXCEPTION '% belongs to another company', link.col USING ERRCODE = '23514';
      END IF;
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_same_company() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS publish_pages_same_company ON public.publish_pages;
CREATE TRIGGER publish_pages_same_company BEFORE INSERT OR UPDATE ON public.publish_pages
  FOR EACH ROW EXECUTE FUNCTION public.publish_same_company();
DROP TRIGGER IF EXISTS publish_enquiries_same_company ON public.publish_enquiries;
CREATE TRIGGER publish_enquiries_same_company BEFORE INSERT OR UPDATE ON public.publish_enquiries
  FOR EACH ROW EXECUTE FUNCTION public.publish_same_company();
DROP TRIGGER IF EXISTS publish_wa_refs_same_company ON public.publish_wa_refs;
CREATE TRIGGER publish_wa_refs_same_company BEFORE INSERT OR UPDATE ON public.publish_wa_refs
  FOR EACH ROW EXECUTE FUNCTION public.publish_same_company();

-- ---------- a site enrols its company in sync health ----------

CREATE OR REPLACE FUNCTION public.publish_site_enrolment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO publish_sync_health (tenant_id) VALUES (NEW.tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
    INSERT INTO publish_rules (tenant_id, site_id, rule_type, enabled)
      VALUES (NEW.tenant_id, NEW.id, 'auto_publish_fact_only', true) ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM publish_sites WHERE tenant_id = OLD.tenant_id) THEN
    DELETE FROM publish_sync_health WHERE tenant_id = OLD.tenant_id;
  END IF;
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.publish_site_enrolment() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS publish_sites_enrolment ON public.publish_sites;
CREATE TRIGGER publish_sites_enrolment AFTER INSERT OR DELETE ON public.publish_sites
  FOR EACH ROW EXECUTE FUNCTION public.publish_site_enrolment();

-- ---------- updated_at ----------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'publish_sites', 'publish_domains', 'publish_pages', 'publish_page_locales',
    'publish_drafts', 'publish_rules', 'publish_glossary', 'publish_media'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I_updated_at ON public.%I', t, t);
    EXECUTE format('CREATE TRIGGER %I_updated_at BEFORE UPDATE ON public.%I
                      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()', t, t);
  END LOOP;
END $$;

-- ---------- row-level security ----------

DO $$
DECLARE
  t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'publish_sites', 'publish_domains', 'publish_pages', 'publish_page_locales',
    'publish_drafts', 'publish_versions', 'publish_rules', 'publish_glossary',
    'publish_media', 'publish_redirects', 'publish_enquiries', 'publish_wa_refs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', t);
    EXECUTE format('DROP POLICY IF EXISTS "Members read" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Writers write" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Managers write" ON public.%I', t);
    EXECUTE format('DROP POLICY IF EXISTS "Managers update" ON public.%I', t);
  END LOOP;

  -- Read: the company's members. (publish_wa_refs: server only — no policy.)
  FOREACH t IN ARRAY ARRAY[
    'publish_sites', 'publish_domains', 'publish_pages', 'publish_page_locales',
    'publish_drafts', 'publish_versions', 'publish_rules', 'publish_glossary',
    'publish_media', 'publish_redirects', 'publish_enquiries'
  ]
  LOOP
    EXECUTE format('CREATE POLICY "Members read" ON public.%I FOR SELECT TO authenticated
                      USING (tenant_id = (SELECT public.get_user_tenant_id()))', t);
  END LOOP;

  -- Write: managers (site configuration).
  FOREACH t IN ARRAY ARRAY['publish_pages', 'publish_page_locales', 'publish_redirects', 'publish_rules']
  LOOP
    EXECUTE format('CREATE POLICY "Managers write" ON public.%I FOR ALL TO authenticated
                      USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.publish_can_manage(tenant_id))
                      WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.publish_can_manage(tenant_id))', t);
  END LOOP;

  -- Write: anyone who may write (content work).
  FOREACH t IN ARRAY ARRAY['publish_glossary', 'publish_media']
  LOOP
    EXECUTE format('CREATE POLICY "Writers write" ON public.%I FOR ALL TO authenticated
                      USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id))
                      WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id))', t);
  END LOOP;
END $$;

-- Sites: managers change brand/settings; enabling (insert) and removing a
-- site is the platform's call, through the server.
CREATE POLICY "Managers update" ON public.publish_sites FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.publish_can_manage(tenant_id))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.publish_can_manage(tenant_id));

-- Domains: managers add and remove; status, verification and provider ids
-- are written only by the server's domain checks.
DROP POLICY IF EXISTS "Managers add" ON public.publish_domains;
DROP POLICY IF EXISTS "Managers remove" ON public.publish_domains;
CREATE POLICY "Managers add" ON public.publish_domains FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.publish_can_manage(tenant_id)
              AND status = 'pending_dns' AND verified_at IS NULL AND provider_ref IS NULL);
CREATE POLICY "Managers remove" ON public.publish_domains FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.publish_can_manage(tenant_id));

-- Drafts: writers create and edit drafts, but only as draft/in_review — an
-- approval, a rejection or an engine draft is recorded by the server after
-- its role check. An approved draft can no longer be touched.
DROP POLICY IF EXISTS "Writers draft" ON public.publish_drafts;
DROP POLICY IF EXISTS "Writers edit drafts" ON public.publish_drafts;
DROP POLICY IF EXISTS "Writers discard drafts" ON public.publish_drafts;
CREATE POLICY "Writers draft" ON public.publish_drafts FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id)
              AND status IN ('draft', 'in_review') AND origin = 'user' AND reviewed_by IS NULL);
CREATE POLICY "Writers edit drafts" ON public.publish_drafts FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id)
         AND status IN ('draft', 'in_review', 'failed_check'))
  WITH CHECK (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id)
              AND status IN ('draft', 'in_review') AND reviewed_by IS NULL);
CREATE POLICY "Writers discard drafts" ON public.publish_drafts FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.get_user_tenant_id()) AND public.member_can_write(tenant_id)
         AND status IN ('draft', 'in_review', 'failed_check', 'rejected'));

-- Versions and enquiries: read-only to members (policies above); written by
-- the server only. publish_wa_refs: no access at all from the browser.
REVOKE INSERT, UPDATE, DELETE ON public.publish_versions, public.publish_enquiries FROM authenticated;
REVOKE ALL ON public.publish_wa_refs FROM authenticated;

-- ---------- media bucket ----------
-- Public by design: these are the images on a published website. Writes only
-- into the company's own folder (<tenant_id>/…), by members who may write.
-- No SELECT policy, so nobody can LIST another company's files.

INSERT INTO storage.buckets (id, name, public)
VALUES ('publish-media', 'publish-media', true)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'storage' AND table_name = 'buckets' AND column_name = 'allowed_mime_types'
  ) THEN
    UPDATE storage.buckets
       SET allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']::text[],
           file_size_limit = 10485760
     WHERE id = 'publish-media';
  END IF;
END $$;

DROP POLICY IF EXISTS "Publish media: upload to own company" ON storage.objects;
CREATE POLICY "Publish media: upload to own company" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'publish-media'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.tenant_members
     WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'member')
  )
);

DROP POLICY IF EXISTS "Publish media: replace in own company" ON storage.objects;
CREATE POLICY "Publish media: replace in own company" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'publish-media'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.tenant_members
     WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'member')
  )
)
WITH CHECK (
  bucket_id = 'publish-media'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.tenant_members
     WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'member')
  )
);

DROP POLICY IF EXISTS "Publish media: delete in own company" ON storage.objects;
CREATE POLICY "Publish media: delete in own company" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'publish-media'
  AND split_part(name, '/', 1) IN (
    SELECT tenant_id::text FROM public.tenant_members
     WHERE user_id = auth.uid() AND status = 'active' AND role IN ('owner', 'admin', 'manager', 'member')
  )
);

COMMIT;
