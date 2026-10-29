-- ============================================
-- 445: the website template's Contact form answers
-- ============================================
-- Boards 11/12 (operator, 2026-10-29). The Contact page asks more than the
-- tour form: a WhatsApp number, the country the visitor travels from, arrival
-- date (publish_enquiries.dates already holds it), nights, adults, children,
-- what interests them, and their consent to be contacted. Each answer is kept
-- as its own column so it can be searched and used later; the country is
-- never used for pricing (one public price per tour, brief 2026-10-28).
--
-- Website photos (the About page's team photo and portraits) go into the
-- publish-media bucket that 440 already made, under the company's own folder.

BEGIN;

ALTER TABLE public.publish_enquiries
  ADD COLUMN IF NOT EXISTS whatsapp TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS nights INTEGER,
  ADD COLUMN IF NOT EXISTS adults INTEGER,
  ADD COLUMN IF NOT EXISTS children INTEGER,
  ADD COLUMN IF NOT EXISTS interests TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS consent_at TIMESTAMPTZ;

ALTER TABLE public.publish_enquiries
  DROP CONSTRAINT IF EXISTS publish_enquiries_counts_check;
ALTER TABLE public.publish_enquiries
  ADD CONSTRAINT publish_enquiries_counts_check CHECK (
    (nights IS NULL OR nights BETWEEN 1 AND 90)
    AND (adults IS NULL OR adults BETWEEN 1 AND 99)
    AND (children IS NULL OR children BETWEEN 0 AND 99)
  );

COMMIT;
