-- =====================================================================
-- Migration 134: Fix Content Library Tenant ID
-- Description: Updates cruise content to correct tenant
-- Date: 2026-02-05
-- =====================================================================

-- The cruise content was inserted with tenant_id: 60c617d5-14ec-4003-9dfc-066988e786ff
-- But the actual user tenant is: 9d5d4373-3e41-494b-bd19-c9750621b99a

-- =====================================================================
-- 1. UPDATE CONTENT_LIBRARY - Move to correct tenant and fix category_id
-- =====================================================================

DO $$
DECLARE
  v_correct_tenant_id UUID := '9d5d4373-3e41-494b-bd19-c9750621b99a';
  v_wrong_tenant_id UUID := '60c617d5-14ec-4003-9dfc-066988e786ff';
  v_correct_experiences_id UUID;
  v_updated_count INTEGER;
BEGIN
  -- Get the Experiences category ID for the CORRECT tenant
  SELECT id INTO v_correct_experiences_id
  FROM content_categories
  WHERE tenant_id = v_correct_tenant_id AND slug = 'experiences';

  IF v_correct_experiences_id IS NULL THEN
    -- Create it if it doesn't exist
    INSERT INTO content_categories (tenant_id, name, slug, icon, is_active, sort_order)
    VALUES (v_correct_tenant_id, 'Experiences', 'experiences', 'Sparkles', true, 1)
    RETURNING id INTO v_correct_experiences_id;
    RAISE NOTICE 'Created Experiences category: %', v_correct_experiences_id;
  ELSE
    RAISE NOTICE 'Using existing Experiences category: %', v_correct_experiences_id;
  END IF;

  -- Update content_library records: fix tenant_id AND category_id
  UPDATE content_library
  SET
    tenant_id = v_correct_tenant_id,
    category_id = v_correct_experiences_id,
    updated_at = NOW()
  WHERE tenant_id = v_wrong_tenant_id;

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % content_library records to correct tenant and category', v_updated_count;

  -- Clean up orphaned categories from wrong tenant (optional)
  DELETE FROM content_categories
  WHERE tenant_id = v_wrong_tenant_id
    AND id NOT IN (SELECT DISTINCT category_id FROM content_library WHERE category_id IS NOT NULL);

  GET DIAGNOSTICS v_updated_count = ROW_COUNT;
  RAISE NOTICE 'Removed % orphaned categories from wrong tenant', v_updated_count;
END $$;

-- =====================================================================
-- 2. VERIFY RESULTS
-- =====================================================================

DO $$
DECLARE
  v_correct_tenant_id UUID := '9d5d4373-3e41-494b-bd19-c9750621b99a';
  v_content_count INTEGER;
  v_category_count INTEGER;
  v_variation_count INTEGER;
  v_cruise_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_content_count
  FROM content_library
  WHERE tenant_id = v_correct_tenant_id;

  SELECT COUNT(*) INTO v_category_count
  FROM content_categories
  WHERE tenant_id = v_correct_tenant_id;

  SELECT COUNT(*) INTO v_variation_count
  FROM content_variations cv
  JOIN content_library cl ON cv.content_id = cl.id
  WHERE cl.tenant_id = v_correct_tenant_id;

  SELECT COUNT(*) INTO v_cruise_count
  FROM content_library
  WHERE tenant_id = v_correct_tenant_id
    AND (name ILIKE '%cruise%' OR name ILIKE '%nile%');

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 134 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Tenant: %', v_correct_tenant_id;
  RAISE NOTICE 'Content items: %', v_content_count;
  RAISE NOTICE 'Categories: %', v_category_count;
  RAISE NOTICE 'Variations: %', v_variation_count;
  RAISE NOTICE 'Cruise items: %', v_cruise_count;
  RAISE NOTICE '';
END $$;
