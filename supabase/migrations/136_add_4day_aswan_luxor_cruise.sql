-- =====================================================================
-- Migration 136: Add 4-Day Aswan to Luxor Cruise Content
-- Description: Adds Nile cruise content with 4 tier variations
-- Date: 2026-02-05
-- =====================================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_category_id UUID;
  v_content_id UUID;
  v_user_id UUID;
BEGIN
  -- Get primary tenant (use the new function)
  SELECT get_primary_tenant_id() INTO v_tenant_id;

  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'No primary tenant found';
  END IF;

  RAISE NOTICE 'Using tenant_id: %', v_tenant_id;

  -- Get or create Experiences category
  SELECT id INTO v_category_id
  FROM content_categories
  WHERE tenant_id = v_tenant_id AND slug = 'experiences';

  IF v_category_id IS NULL THEN
    INSERT INTO content_categories (tenant_id, name, slug, icon, is_active, sort_order)
    VALUES (v_tenant_id, 'Experiences', 'experiences', 'Sparkles', true, 1)
    RETURNING id INTO v_category_id;
    RAISE NOTICE 'Created Experiences category: %', v_category_id;
  END IF;

  -- Get a user for created_by (optional, can be null)
  SELECT user_id INTO v_user_id
  FROM tenant_members
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  -- =====================================================================
  -- 1. CREATE CONTENT ITEM
  -- =====================================================================

  INSERT INTO content_library (
    tenant_id,
    category_id,
    name,
    slug,
    short_description,
    location,
    duration,
    tags,
    metadata,
    is_active,
    created_by,
    updated_by
  ) VALUES (
    v_tenant_id,
    v_category_id,
    '4-Day Nile Cruise: Aswan to Luxor',
    '4-day-nile-cruise-aswan-luxor',
    'A magical 4-day journey sailing from Aswan to Luxor, visiting the most iconic temples along the Nile including Philae, Kom Ombo, Edfu, Karnak, and the Valley of the Kings.',
    'Aswan to Luxor, Egypt',
    '4 days / 3 nights',
    ARRAY['nile-cruise', 'aswan', 'luxor', 'temples', 'full-board', 'guided-tours'],
    jsonb_build_object(
      'route', 'Aswan to Luxor',
      'direction', 'downstream',
      'nights', 3,
      'days', 4,
      'embarkation', 'Aswan',
      'disembarkation', 'Luxor',
      'highlights', ARRAY[
        'High Dam & Unfinished Obelisk',
        'Philae Temple',
        'Felucca sailing at Kitchener''s Island',
        'Kom Ombo Temple',
        'Edfu Temple (Temple of Horus)',
        'Karnak Temple Complex',
        'Luxor Temple',
        'Valley of the Kings',
        'Temple of Hatshepsut',
        'Colossi of Memnon'
      ],
      'included_meals', 'Full board (all meals)',
      'cruise_type', 'nile_cruise'
    ),
    true,
    v_user_id,
    v_user_id
  )
  ON CONFLICT (tenant_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    short_description = EXCLUDED.short_description,
    location = EXCLUDED.location,
    duration = EXCLUDED.duration,
    tags = EXCLUDED.tags,
    metadata = EXCLUDED.metadata,
    is_active = true,
    updated_at = NOW()
  RETURNING id INTO v_content_id;

  RAISE NOTICE 'Created/updated content: %', v_content_id;

  -- =====================================================================
  -- 2. CREATE TIER VARIATIONS
  -- =====================================================================

  -- BUDGET TIER
  INSERT INTO content_variations (
    content_id,
    tier,
    title,
    description,
    highlights,
    inclusions,
    internal_notes,
    is_active,
    created_by,
    updated_by
  ) VALUES (
    v_content_id,
    'budget',
    '4-Day Nile Cruise - Standard Class',
    E'**4-Day Cruise from Aswan to Luxor**\n\n**Day 1: Aswan''s Architectural Marvels and Felucca Sailing**\nWelcome to Aswan! Your adventure begins with a visit to the awe-inspiring High Dam, where you''ll soak in panoramic views that are simply epic. Next, delve into the mysteries of the Unfinished Obelisk and the enchanting Philae Temple, each telling tales of ancient engineering and devotion. Then, it''s time to board your Nile cruise. Settle in with a delightful lunch before embarking on a serene felucca sail around the lush Kitchener''s Island. As the sun sets, savor dinner onboard and toast to the adventures that lie ahead.\n\n**Day 2: Kom Ombo and Edfu Temples**\nRise with the river tide and set sail to Kom Ombo. Here, you''ll explore a temple unlike any other, dedicated to two gods, which makes it a fascinating stop. After a refreshing lunch back on the cruise, we''ll continue to Edfu. Step ashore to discover the majestic Temple of Horus, one of the best-preserved ancient monuments in Egypt. As evening falls, relax on deck as we cruise towards Luxor, basking in the Nile''s timeless tranquility under the starlit sky.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 3: Karnak and Luxor Temples**\nToday, prepare to be dazzled by Luxor, starting with the sprawling Karnak Temple Complex. Wander amidst this vast forest of stone, feeling the pulse of history under your feet. Later, the elegant Luxor Temple awaits, where the echoes of pharaohs past still resonate. Spend your day immersed in these architectural wonders, with meals served onboard amidst views of the Nile''s scenic banks.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 4: West Bank of Luxor - Departure**\nAfter breakfast, your journey takes you to the iconic Valley of the Kings. Here, enter the ancient tombs of Egypt''s royalty, including the legendary Tutankhamun. Visit the towering Colossi of Memnon and the breathtaking Temple of Hatshepsut, a tribute to one of Egypt''s most extraordinary rulers. Each site is steeped in stories waiting to be told. As your cruise comes to an end, we''ll escort you to Luxor International Airport.\n\nMeals: Breakfast',
    ARRAY[
      'Comfortable standard cabin accommodation',
      'All meals included (full board)',
      'English-speaking tour guide',
      'All temple entrance fees',
      'Felucca sailing experience',
      'Air-conditioned transportation'
    ],
    ARRAY[
      '3 nights accommodation in standard cabin',
      'Full board meals (3 breakfasts, 3 lunches, 3 dinners)',
      'Guided tours to all mentioned sites',
      'Entrance fees to all temples and tombs',
      'Felucca ride at Kitchener''s Island',
      'Airport transfer on departure'
    ],
    'Budget tier: Standard class vessel, basic cabin, group tours. Good value option for budget-conscious travelers.',
    true,
    v_user_id,
    v_user_id
  )
  ON CONFLICT (content_id, tier) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    highlights = EXCLUDED.highlights,
    inclusions = EXCLUDED.inclusions,
    internal_notes = EXCLUDED.internal_notes,
    is_active = true,
    updated_at = NOW();

  -- STANDARD TIER
  INSERT INTO content_variations (
    content_id,
    tier,
    title,
    description,
    highlights,
    inclusions,
    internal_notes,
    is_active,
    created_by,
    updated_by
  ) VALUES (
    v_content_id,
    'standard',
    '4-Day Nile Cruise - First Class',
    E'**4-Day Cruise from Aswan to Luxor**\n\n**Day 1: Aswan''s Architectural Marvels and Felucca Sailing**\nWelcome to Aswan! Your adventure begins with a visit to the awe-inspiring High Dam, where you''ll soak in panoramic views that are simply epic. Next, delve into the mysteries of the Unfinished Obelisk and the enchanting Philae Temple, each telling tales of ancient engineering and devotion. Then, it''s time to board your first-class Nile cruise. Settle in with a delightful lunch before embarking on a serene felucca sail around the lush Kitchener''s Island. As the sun sets, savor a delicious dinner onboard and toast to the adventures that lie ahead.\n\n**Day 2: Kom Ombo and Edfu Temples**\nRise with the river tide and set sail to Kom Ombo. Here, you''ll explore a temple unlike any other, dedicated to two gods, which makes it a fascinating stop. After a refreshing lunch back on the cruise, we''ll continue to Edfu. Step ashore to discover the majestic Temple of Horus, one of the best-preserved ancient monuments in Egypt. As evening falls, relax on deck as we cruise towards Luxor, basking in the Nile''s timeless tranquility under the starlit sky.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 3: Karnak and Luxor Temples**\nToday, prepare to be dazzled by Luxor, starting with the sprawling Karnak Temple Complex. Wander amidst this vast forest of stone, feeling the pulse of history under your feet. Later, the elegant Luxor Temple awaits, where the echoes of pharaohs past still resonate. Spend your day immersed in these architectural wonders, with meals served onboard amidst views of the Nile''s scenic banks. As night descends, enjoy another peaceful slumber aboard your floating hotel.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 4: West Bank of Luxor - Departure**\nAfter breakfast, your journey takes you to the iconic Valley of the Kings. Here, enter the ancient tombs of Egypt''s royalty, including the legendary Tutankhamun. Visit the towering Colossi of Memnon and the breathtaking Temple of Hatshepsut, a tribute to one of Egypt''s most extraordinary rulers. Each site is steeped in stories waiting to be told. As your cruise comes to an end, we''ll escort you to Luxor International Airport, carrying with you memories of a lifetime etched in the sands of Egypt.\n\nMeals: Breakfast',
    ARRAY[
      'First-class cabin with river views',
      'Superior dining experience',
      'Professional Egyptologist guide',
      'All temple entrance fees',
      'Private felucca sailing',
      'Comfortable air-conditioned transportation'
    ],
    ARRAY[
      '3 nights in first-class cabin with panoramic windows',
      'Full board gourmet meals with drink package',
      'Private guided tours with Egyptologist',
      'Entrance fees to all temples and tombs',
      'Private felucca ride at Kitchener''s Island',
      'Private airport transfer on departure',
      'Welcome drink and afternoon tea daily'
    ],
    'Standard tier: First-class vessel with upgraded cabin, semi-private tours. Popular choice for most travelers.',
    true,
    v_user_id,
    v_user_id
  )
  ON CONFLICT (content_id, tier) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    highlights = EXCLUDED.highlights,
    inclusions = EXCLUDED.inclusions,
    internal_notes = EXCLUDED.internal_notes,
    is_active = true,
    updated_at = NOW();

  -- DELUXE TIER
  INSERT INTO content_variations (
    content_id,
    tier,
    title,
    description,
    highlights,
    inclusions,
    internal_notes,
    is_active,
    created_by,
    updated_by
  ) VALUES (
    v_content_id,
    'deluxe',
    '4-Day Nile Cruise - Deluxe Class',
    E'**4-Day Cruise from Aswan to Luxor**\n\n**Day 1: Aswan''s Architectural Marvels and Felucca Sailing**\nWelcome to Aswan! Your adventure begins with a visit to the awe-inspiring High Dam, where you''ll soak in panoramic views that are simply epic. Next, delve into the mysteries of the Unfinished Obelisk and the enchanting Philae Temple, each telling tales of ancient engineering and devotion. Then, it''s time to board your deluxe Nile cruise. Settle in with a gourmet lunch before embarking on a serene private felucca sail around the lush Kitchener''s Island with refreshments. As the sun sets, savor an exquisite dinner onboard and toast to the adventures that lie ahead with premium beverages.\n\n**Day 2: Kom Ombo and Edfu Temples**\nRise with the river tide and set sail to Kom Ombo. Here, you''ll explore a temple unlike any other, dedicated to two gods, which makes it a fascinating stop. After a refreshing gourmet lunch back on the cruise, we''ll continue to Edfu. Step ashore to discover the majestic Temple of Horus, one of the best-preserved ancient monuments in Egypt. As evening falls, relax on the sundeck with cocktails as we cruise towards Luxor, basking in the Nile''s timeless tranquility under the starlit sky.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 3: Karnak and Luxor Temples**\nToday, prepare to be dazzled by Luxor, starting with the sprawling Karnak Temple Complex. Wander amidst this vast forest of stone with your private Egyptologist, feeling the pulse of history under your feet. Later, the elegant Luxor Temple awaits, where the echoes of pharaohs past still resonate. Spend your day immersed in these architectural wonders, with gourmet meals served onboard amidst views of the Nile''s scenic banks. As night descends, enjoy another peaceful slumber aboard your floating hotel.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 4: West Bank of Luxor - Departure**\nAfter a leisurely breakfast, your journey takes you to the iconic Valley of the Kings. Here, enter the ancient tombs of Egypt''s royalty, including the legendary Tutankhamun. Visit the towering Colossi of Memnon and the breathtaking Temple of Hatshepsut, a tribute to one of Egypt''s most extraordinary rulers. Each site is steeped in stories waiting to be told. As your cruise comes to an end, we''ll escort you in a private vehicle to Luxor International Airport, carrying with you memories of a lifetime etched in the sands of Egypt.\n\nMeals: Breakfast',
    ARRAY[
      'Spacious deluxe cabin with private balcony',
      'Gourmet dining with premium beverages',
      'Private Egyptologist guide',
      'All temple entrance fees including special access',
      'Private felucca sailing with refreshments',
      'Luxury air-conditioned transportation'
    ],
    ARRAY[
      '3 nights in deluxe cabin with private balcony',
      'Full board gourmet cuisine with premium beverage package',
      'Private guided tours with senior Egyptologist',
      'Entrance fees to all temples including special tomb access',
      'Private felucca ride with champagne and canapés',
      'Private luxury vehicle airport transfer',
      'Welcome champagne and daily afternoon tea',
      'Spa access onboard',
      'Nightly entertainment program'
    ],
    'Deluxe tier: Premium vessel with balcony cabin, private tours, premium inclusions. Excellent choice for discerning travelers.',
    true,
    v_user_id,
    v_user_id
  )
  ON CONFLICT (content_id, tier) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    highlights = EXCLUDED.highlights,
    inclusions = EXCLUDED.inclusions,
    internal_notes = EXCLUDED.internal_notes,
    is_active = true,
    updated_at = NOW();

  -- LUXURY TIER
  INSERT INTO content_variations (
    content_id,
    tier,
    title,
    description,
    highlights,
    inclusions,
    internal_notes,
    is_active,
    created_by,
    updated_by
  ) VALUES (
    v_content_id,
    'luxury',
    '4-Day Nile Cruise - Ultra Luxury',
    E'**4-Day Cruise from Aswan to Luxor**\n\n**Day 1: Aswan''s Architectural Marvels and Felucca Sailing**\nWelcome to Aswan! Your extraordinary adventure begins with a private visit to the awe-inspiring High Dam, where you''ll soak in panoramic views that are simply epic. Next, delve into the mysteries of the Unfinished Obelisk and the enchanting Philae Temple with exclusive early access, each telling tales of ancient engineering and devotion. Then, it''s time to board your ultra-luxury Nile cruise. Settle into your magnificent suite before enjoying a champagne welcome reception. Embark on a private felucca sail around the lush Kitchener''s Island with gourmet canapés and vintage champagne. As the sun sets, savor an exquisite multi-course dinner onboard and toast to the adventures that lie ahead.\n\n**Day 2: Kom Ombo and Edfu Temples**\nRise with the river tide and set sail to Kom Ombo. Here, you''ll explore a temple unlike any other, dedicated to two gods, with exclusive morning access before other tourists arrive. After an exceptional gourmet lunch back on the cruise, we''ll continue to Edfu. Step ashore to discover the majestic Temple of Horus, one of the best-preserved ancient monuments in Egypt. As evening falls, relax in the exclusive lounge with premium cocktails as we cruise towards Luxor, basking in the Nile''s timeless tranquility under the starlit sky.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 3: Karnak and Luxor Temples**\nToday, prepare to be dazzled by Luxor, starting with the sprawling Karnak Temple Complex. Enjoy exclusive early access with your personal Egyptologist, feeling the pulse of history under your feet. Later, the elegant Luxor Temple awaits at sunset for a magical experience, where the echoes of pharaohs past still resonate. Spend your day immersed in these architectural wonders, with world-class cuisine served onboard amidst views of the Nile''s scenic banks. Enjoy a private dinner under the stars on deck.\n\nMeals: Breakfast, Lunch, Dinner\n\n**Day 4: West Bank of Luxor - Departure**\nAfter a leisurely gourmet breakfast, your journey takes you to the iconic Valley of the Kings with special access permits. Enter the ancient tombs of Egypt''s royalty, including chambers not open to the general public. Visit the towering Colossi of Memnon and the breathtaking Temple of Hatshepsut, a tribute to one of Egypt''s most extraordinary rulers. Each site is steeped in stories waiting to be told. As your cruise comes to an end, we''ll escort you in a luxury limousine to Luxor International Airport or private aviation terminal.\n\nMeals: Breakfast',
    ARRAY[
      'Magnificent suite with panoramic windows and butler service',
      'World-class dining with Dom Pérignon and fine wines',
      'Personal Egyptologist and private guide',
      'VIP access to all sites with special permits',
      'Private felucca with champagne and gourmet canapés',
      'Luxury limousine transportation throughout'
    ],
    ARRAY[
      '3 nights in luxury suite with panoramic windows',
      'Dedicated butler service throughout',
      'Full board world-class cuisine with unlimited premium beverages',
      'Private Egyptologist with PhD credentials',
      'VIP entrance fees with exclusive early/late access',
      'Special tomb access in Valley of the Kings',
      'Private felucca with Dom Pérignon and gourmet canapés',
      'Luxury limousine airport transfers',
      'In-suite champagne welcome',
      'Daily spa treatment included',
      'Private starlight dinner on deck',
      'Personalized departure gift'
    ],
    'Luxury tier: Ultra-luxury vessel, suite accommodation, butler service, exclusive access, top-tier everything. For clients who demand the absolute best.',
    true,
    v_user_id,
    v_user_id
  )
  ON CONFLICT (content_id, tier) DO UPDATE SET
    title = EXCLUDED.title,
    description = EXCLUDED.description,
    highlights = EXCLUDED.highlights,
    inclusions = EXCLUDED.inclusions,
    internal_notes = EXCLUDED.internal_notes,
    is_active = true,
    updated_at = NOW();

  -- =====================================================================
  -- 3. VERIFY RESULTS
  -- =====================================================================

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 136 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations:';
  RAISE NOTICE '  - Budget (Standard Class)';
  RAISE NOTICE '  - Standard (First Class)';
  RAISE NOTICE '  - Deluxe (Deluxe Class)';
  RAISE NOTICE '  - Luxury (Ultra Luxury)';
  RAISE NOTICE '';

END $$;

-- Verify the content was created
SELECT
  cl.name,
  cl.slug,
  cl.duration,
  COUNT(cv.id) as variation_count
FROM content_library cl
LEFT JOIN content_variations cv ON cv.content_id = cl.id
WHERE cl.slug = '4-day-nile-cruise-aswan-luxor'
GROUP BY cl.id, cl.name, cl.slug, cl.duration;
