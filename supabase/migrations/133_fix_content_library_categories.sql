-- =====================================================================
-- Migration 133: Fix Content Library Categories
-- Description: Links cruise content to Experiences category
-- Date: 2026-02-04
-- =====================================================================

-- =====================================================================
-- 1. ENSURE EXPERIENCES AND ATTRACTIONS CATEGORIES EXIST
-- =====================================================================

DO $$
DECLARE
  v_tenant_id UUID;
BEGIN
  -- Get tenant_id from tenants table
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No tenant found in tenants table';
  END IF;

  RAISE NOTICE 'Using tenant_id: %', v_tenant_id;

  -- 1. Experiences (for cruises, activities, tours)
  INSERT INTO content_categories (tenant_id, name, slug, icon, is_active, sort_order)
  VALUES (v_tenant_id, 'Experiences', 'experiences', 'Sparkles', true, 1)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET
    is_active = true,
    sort_order = 1;

  -- 2. Attractions (for sites, monuments, landmarks)
  INSERT INTO content_categories (tenant_id, name, slug, icon, is_active, sort_order)
  VALUES (v_tenant_id, 'Attractions', 'attractions', 'Landmark', true, 2)
  ON CONFLICT (tenant_id, slug) DO UPDATE SET
    is_active = true,
    sort_order = 2;

  RAISE NOTICE 'Created/updated Experiences and Attractions categories';
END $$;

-- =====================================================================
-- 2. LINK CRUISE CONTENT TO EXPERIENCES CATEGORY
-- =====================================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_experiences_category_id UUID;
  v_updated_count INTEGER;
BEGIN
  -- Get tenant_id
  SELECT id INTO v_tenant_id FROM tenants LIMIT 1;

  -- Get the Experiences category id
  SELECT id INTO v_experiences_category_id
  FROM content_categories
  WHERE tenant_id = v_tenant_id AND slug = 'experiences';

  IF v_experiences_category_id IS NULL THEN
    RAISE EXCEPTION 'Experiences category not found';
  END IF;

  RAISE NOTICE 'Experiences category_id: %', v_experiences_category_id;

  -- Update cruise content to use Experiences category
  UPDATE content_library
  SET
    category_id = v_experiences_category_id,
    is_active = true,
    updated_at = NOW()
  WHERE tenant_id = v_tenant_id
    AND (
      name ILIKE '%cruise%'
      OR name ILIKE '%nile%'
      OR slug ILIKE '%cruise%'
      OR slug ILIKE '%nile%'
    )
    AND (category_id IS NULL OR category_id != v_experiences_category_id);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % cruise items to Experiences category', v_updated_count;

  -- Ensure all content has is_active = true
  UPDATE content_library
  SET is_active = true
  WHERE tenant_id = v_tenant_id AND is_active IS NOT true;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Activated % content items', v_updated_count;
END $$;

-- =====================================================================
-- 3. VERIFY RESULTS
-- =====================================================================

DO $$
DECLARE
  v_category_count INTEGER;
  v_content_count INTEGER;
  v_experiences_count INTEGER;
  v_variation_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_category_count FROM content_categories WHERE is_active = true;
  SELECT COUNT(*) INTO v_content_count FROM content_library WHERE is_active = true;
  SELECT COUNT(*) INTO v_experiences_count
  FROM content_library cl
  JOIN content_categories cc ON cl.category_id = cc.id
  WHERE cc.slug = 'experiences' AND cl.is_active = true;
  SELECT COUNT(*) INTO v_variation_count FROM content_variations;

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 133 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Categories: % active', v_category_count;
  RAISE NOTICE 'Content Items: % active', v_content_count;
  RAISE NOTICE 'Experiences (incl. cruises): % items', v_experiences_count;
  RAISE NOTICE 'Variations: % total', v_variation_count;
  RAISE NOTICE '';
END $$;
