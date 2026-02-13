-- =====================================================================
-- Migration 139: Add 5-Day Luxor to Aswan Nile Cruise Content
-- Description: One-way cruise with Karnak night tour, 4 tier variations
-- Date: 2026-02-05
-- =====================================================================

DO $$
DECLARE
  v_tenant_id UUID;
  v_category_id UUID;
  v_content_id UUID;
  v_user_id UUID;
BEGIN
  -- Get primary tenant
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

  -- Get a user for created_by
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
    '5-Day Nile Cruise: Luxor to Aswan',
    '5-day-nile-cruise-luxor-aswan',
    'Set sail on a magnificent 5-day voyage from Luxor to Aswan, beginning with the illuminated splendor of Karnak and Luxor Temples and culminating in Aswan''s island sanctuaries. This upstream journey reveals ancient Egypt at its most spectacular—the painted tombs of the Valley of the Kings, the perfectly preserved Temple of Horus at Edfu, the twin-deity temple of Kom Ombo, and the ethereal Philae Temple rising from the Nile. With enchanting evening entertainment and a horse-drawn carriage ride through illuminated Luxor, this cruise blends wonder with romance.',
    'Luxor to Aswan, Egypt',
    '5 days / 4 nights',
    ARRAY['nile-cruise', 'luxor', 'aswan', 'temples', 'full-board', 'valley-of-kings', 'karnak', 'felucca'],
    jsonb_build_object(
      'route', 'Luxor to Aswan',
      'direction', 'upstream',
      'nights', 4,
      'days', 5,
      'embarkation', 'Luxor',
      'disembarkation', 'Aswan',
      'highlights', ARRAY[
        'Karnak Temple Complex',
        'Luxor Temple (illuminated night tour)',
        'Horse-drawn carriage ride',
        'Valley of the Kings',
        'Temple of Hatshepsut',
        'Colossi of Memnon',
        'Edfu Temple (Temple of Horus)',
        'Kom Ombo Temple',
        'Felucca sailing at Kitchener Island',
        'Philae Temple',
        'Aswan High Dam',
        'Unfinished Obelisk'
      ],
      'included_meals', 'Full board (all meals)',
      'cruise_type', 'nile_cruise',
      'night_tour', true
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
  -- 2. BUDGET TIER - Classic Discovery
  -- =====================================================================

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
    '5-Day Nile Cruise - Classic Discovery',
    E'**From the Temples of Thebes to the Gates of Africa**\n\nFive days of wonder await on this captivating voyage from Luxor to Aswan. Beginning amid the illuminated grandeur of Karnak and ending in the island sanctuaries of Aswan, this upstream journey follows the ancient Nile through a corridor of monuments unmatched anywhere on Earth. Travel in comfort aboard a traditional Nile cruiser, with all meals included, expert guidance at every ancient site, and an enchanting horse-drawn carriage ride through Luxor by night.\n\n---\n\n**Day 1: Luxor – City of Light and Stone**\n\nWelcome to Luxor, the ancient city of Thebes, where every stone tells a story stretching back four millennia. Your adventure begins the moment you arrive at your Nile cruise ship, moored on the East Bank where pharaohs once paraded before adoring crowds.\n\nSettle into your comfortable cabin and enjoy a welcome lunch showcasing the flavors of Egyptian cuisine—fragrant spices, freshly baked bread, and the vibrant tastes of the Nile Valley.\n\nThe afternoon brings the staggering **Karnak Temple Complex**, the largest religious building ever constructed. For over 2,000 years, successive pharaohs competed to build grander halls and taller obelisks here, creating a sacred city of stone that defies comprehension. Walk through the Great Hypostyle Hall with its 134 massive columns, each carved with intricate hieroglyphs, and lose yourself in this forest of devotion. See the Sacred Lake where priests purified themselves at dawn, the towering obelisks that pierce the sky, the granite scarab that legend says brings luck to those who circle it seven times.\n\nAs darkness falls, something magical awaits. Board a **horse-drawn carriage** for an enchanting night tour of **Luxor Temple**, beautifully illuminated against the star-filled sky. The clip-clop of hooves on ancient stone, the warm glow of the illuminated columns, the massive statues of Ramesses II bathed in golden light—this is Luxor at its most romantic and unforgettable. Approach via the recently restored Avenue of Sphinxes, a 3-kilometer processional way lined with stone guardians that once connected the two greatest temples of ancient Egypt.\n\nReturn to the ship for dinner under the stars, your imagination fired by the wonders of the day.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Where Pharaohs Sleep**\n\nAwaken to the gentle rhythm of the Nile, its waters catching the first light of dawn. Today brings the legendary West Bank—the "Land of the Dead" where pharaohs prepared for their voyage to eternity.\n\nCross the river and enter the **Valley of the Kings**, a remote desert valley where 63 royal tombs were carved deep into the limestone hills over five centuries. Descend into painted chambers where every surface blazes with images of the afterlife—gods and demons, stars and serpents, the sun god''s nightly journey through the underworld. Your standard admission includes three tombs, each a masterpiece of ancient art, their colors still vivid after three millennia.\n\nNext, the magnificent **Temple of Hatshepsut** rises in elegant terraces against the golden cliffs of Deir el-Bahri. Egypt''s most successful female pharaoh commissioned this architectural wonder, and its clean, modern-feeling lines have inspired architects for 3,500 years. Your guide shares the remarkable story of this woman who declared herself pharaoh and ruled Egypt wisely for two decades.\n\nPause before the **Colossi of Memnon**, twin 18-meter statues of Pharaoh Amenhotep III that have guarded the West Bank since 1350 BC. In ancient times, one statue was famous for "singing" at dawn—a phenomenon caused by temperature changes that drew tourists from across the Roman Empire.\n\nReturn to the ship for lunch and a leisurely afternoon of sailing southward. Watch the timeless Nile landscape glide past as you sail upstream—green fields giving way to desert hills, villages nestled among date palms, fishermen casting nets as their ancestors did millennia ago. Dinner aboard is accompanied by the quiet satisfaction of a day that touched the eternal.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu and Kom Ombo – Temples of Falcon and Crocodile**\n\nToday brings two of Egypt''s most fascinating temples, each dedicated to gods who still seem to inhabit their ancient sanctuaries.\n\nThe morning reveals the **Temple of Horus at Edfu**, the best-preserved ancient temple in all Egypt. Pass through towering pylons 36 meters high, adorned with scenes of the falcon god''s divine victory. Inside, the Great Hypostyle Hall''s columns still support their original roof, creating the mysterious atmosphere ancient worshippers knew. In the sanctuary, the granite shrine where the golden statue of Horus once resided still stands, a silent witness to two millennia of worship.\n\nYour guide explains the mythology carved into every surface—the eternal battle between Horus and his uncle Set, the triumph of order over chaos, the festivals that drew pilgrims from across Egypt.\n\nAfter lunch aboard, continue upstream to **Kom Ombo**, where a unique double temple perches dramatically on a sandy promontory above the Nile. This is the only temple in Egypt dedicated to two gods simultaneously—Sobek, the crocodile deity of fertility, and Horus the Elder, the falcon-headed healer. Explore symmetrical corridors that served two separate priesthoods. Discover ancient surgical instruments carved into the walls, a nilometer that measured the river''s crucial floods, and in the adjacent museum, mummified crocodiles that stare back through millennia.\n\nAs the day softens, board a traditional **felucca** for a sailing experience around **Kitchener''s Island**, gliding past the famous botanical gardens as the sunset paints the Nile in shades of amber and rose. Return to the ship for dinner and a peaceful night on the river.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Island Sanctuaries and Modern Marvels**\n\nYou wake in Aswan, Egypt''s southernmost city, where Africa begins and the Nile flows at its bluest. Today reveals treasures both ancient and modern.\n\nBegin at the **Philae Temple**, the sanctuary of Isis that seems to float upon its sacred island. Board a motorboat to reach this ethereal complex, rescued from the rising waters of the Nile and relocated stone by stone to Agilkia Island. Wander through colonnaded courts where the last hieroglyphs were carved in 394 AD, marking the end of pharaonic Egypt. The temple''s intimate scale and island setting create an atmosphere of mystery unlike any other ancient site.\n\nNext, the **Aswan High Dam**, the engineering triumph that tamed the Nile''s annual floods and powers modern Egypt. Stand atop this monument to human ambition and contemplate Lake Nasser stretching to the horizon—one of the largest man-made lakes on Earth.\n\nThe morning concludes at the **Unfinished Obelisk**, still lying in its granite quarry where ancient stonemasons abandoned it 3,500 years ago when cracks appeared during carving. At 42 meters, it would have been the largest obelisk ever raised. See the ancient tool marks and imagine the thousands of workers who labored here, their ambition frozen forever in stone.\n\nReturn to the ship for your final dinner aboard, reflecting on four extraordinary days of temples, tombs, and timeless Nile beauty.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Farewell from Aswan**\n\nYour final morning on the Nile dawns golden over Aswan''s famous granite formations. Enjoy a leisurely breakfast as you reflect on a journey that has carried you through five thousand years of human history.\n\nFrom the illuminated columns of Luxor to the island sanctuaries of Aswan, you have walked where pharaohs walked, sailed where gods were believed to dwell, and witnessed monuments that have inspired awe since the dawn of civilization.\n\nAfter breakfast, transfer to Aswan International Airport for your onward journey. Should your flight depart later in the day, comfortable arrangements will be made to ensure you enjoy Aswan''s beauty until the moment of departure.\n\n*Meals: Breakfast*',
    ARRAY[
      'Comfortable accommodation on traditional Nile cruiser',
      'Full board dining throughout the voyage',
      'Professional English-speaking Egyptologist guide',
      'All temple and tomb entrance fees included',
      'Horse-drawn carriage night tour of Luxor Temple',
      'Scenic felucca sailing at Kitchener Island',
      'Air-conditioned transportation for excursions'
    ],
    ARRAY[
      '4 nights accommodation in comfortable standard cabin',
      'Full board: 4 breakfasts, 4 lunches, 4 dinners',
      'Expert guided tours at all archaeological sites',
      'Entrance fees to all temples and tombs (3 tombs in Valley of Kings)',
      'Horse-drawn carriage ride to Luxor Temple at night',
      'Traditional felucca sailing at Kitchener Island',
      'Airport transfer on departure from Aswan',
      'Onboard entertainment and activities'
    ],
    'BUDGET TIER: Standard 4-star cruise vessel, twin/double cabin, shared group tours (max 25). Good value 5-day option with unique night tour of Luxor Temple. One-way Luxor to Aswan means clients need Aswan departure arranged.',
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
  -- 3. STANDARD TIER - Premium Experience
  -- =====================================================================

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
    '5-Day Nile Cruise - Premium Experience',
    E'**Five Days of Refined Discovery**\n\nThis premium 5-day voyage from Luxor to Aswan elevates your Nile experience with first-class accommodations, refined dining, and intimate touring groups. From the moonlit magic of Luxor Temple by horse-drawn carriage to the island serenity of Philae at Aswan, every day brings wonders both ancient and personal. Sail upstream aboard a superior vessel, enjoying the perfect balance of authentic discovery and contemporary comfort.\n\n---\n\n**Day 1: Luxor – Temples by Day and Starlight**\n\nYour premium Nile experience begins as you arrive in Luxor, the ancient city Homer called "hundred-gated Thebes." A representative greets you at the airport and escorts you to your first-class cruise ship, where a champagne welcome sets the tone for the days ahead.\n\nSettle into your river-view cabin with its panoramic windows framing Egypt''s eternal landscape. Join fellow guests for a gourmet lunch showcasing the finest Egyptian and international cuisine—fresh herbs, aromatic spices, and the Nile Valley''s legendary produce.\n\nThe afternoon unfolds at the awe-inspiring **Karnak Temple Complex**. Your experienced Egyptologist leads your small group (maximum 16 guests) through this vast sacred city, spending nearly three hours exploring its wonders. Walk the same processional routes that pharaohs walked for two millennia. Stand in the Great Hypostyle Hall, its 134 massive columns creating a forest of carved stone that reduces visitors to reverent silence. Visit the Sacred Lake, the towering obelisks, and the famous scarab statue.\n\nAs darkness falls, the day''s second revelation awaits. Board an elegant **horse-drawn carriage** and clip-clop through Luxor''s lamp-lit streets to **Luxor Temple**, transformed by illumination into something almost supernatural. The recently restored Avenue of Sphinxes stretches before you, a corridor of stone guardians leading to the massive statues of Ramesses II, each one glowing against the night sky. Your guide shares the temple''s secrets in this intimate setting—the annual Opet Festival, the layers of history from pharaonic Egypt through Roman occupation to the medieval mosque still standing within its walls.\n\nReturn to the ship for dinner, the illuminated temple shimmering across the water as you dine.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Touching Eternity**\n\nAn early start brings rewards: you arrive at the West Bank before the midday heat, when the desert air is still cool and the light ideal for photography.\n\nThe **Valley of the Kings** unfolds its secrets in the morning silence. Your Egyptologist leads your small group into three painted tombs, explaining the symbolism of every scene with the passion of true scholarship: the night journey of the sun god Ra, the weighing of hearts by jackal-headed Anubis, the fields of paradise awaiting the righteous dead. Stand in chambers where pharaohs expected to sleep for eternity, their walls blazing with gold and lapis blue.\n\nThe **Temple of Hatshepsut** reveals Egypt''s most extraordinary ruler—a woman who declared herself pharaoh and led Egypt through two decades of peace and prosperity. Her mortuary temple, rising in elegant terraces against dramatic cliffs, remains an architectural triumph 3,500 years later. Your guide shares the remarkable story: her rise to power, her building achievements, and her successor''s failed attempt to erase her from history.\n\nThe **Colossi of Memnon** conclude your morning, their weathered faces still scanning the horizon after 34 centuries.\n\nReturn to the ship for a refreshing lunch and an afternoon of sailing southward through beautiful countryside. Take afternoon tea on the sundeck as the Nile''s timeless panorama unfolds—farmers in fields, children waving, water buffalo cooling in the shallows. Tonight''s dinner features regional specialties paired with carefully selected wines.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu and Kom Ombo – Sanctuaries of the Gods**\n\nThe ship arrives at Edfu in the cool morning hours. After a leisurely breakfast, travel to the **Temple of Horus** for a visit that transcends ordinary tourism.\n\nThis is Egypt''s best-preserved temple, and your guide spends nearly two hours revealing its secrets. The massive pylons still bear traces of original color. The hypostyle halls remain roofed, creating the atmospheric mystery ancient worshippers experienced. Stand in the sanctuary where the golden statue of Horus once resided, and imagine the awe of pilgrims who traveled from across Egypt to seek the falcon god''s blessing.\n\nAfter lunch aboard, the ship continues upstream to **Kom Ombo**, dramatically perched on a sandy bluff above the Nile. This unique double temple served two gods in perfect architectural symmetry—crocodile-headed Sobek and falcon-headed Horus. Your guide reveals fascinating details most visitors miss: ancient surgical instruments carved into the walls (evidence of sophisticated medicine), a nilometer that measured the river''s crucial annual flood, mummified crocodiles in the adjacent museum that were once pampered as living gods.\n\nAs the afternoon light softens, board a traditional **felucca** for a private sailing experience around **Kitchener''s Island** with refreshments. Glide past Aswan''s famous botanical gardens as the sunset paints the Nile in shades of amber, gold, and rose—a scene that has inspired poets and painters for centuries.\n\nReturn to the ship for dinner as the stars appear over Aswan.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Where Egypt Meets Africa**\n\nAswan has enchanted travelers for millennia with its beauty—the Nile at its bluest, islands of green against golden desert, the elegant sails of feluccas catching the breeze. Today you discover its greatest treasures.\n\nBegin at the captivating **Philae Temple** on its sacred island. Board a private motor launch to reach this sanctuary of Isis, where the last priests maintained ancient traditions until the temple was finally closed in 550 AD. Explore colonnaded courts and intimate chapels at a leisurely pace, your guide revealing the stories hidden in every carved relief—the devotion to Isis that outlasted the pharaohs themselves.\n\nThe **Aswan High Dam** demonstrates Egypt''s modern ambition—this engineering marvel tamed the Nile''s floods and powers the nation. Your guide shares the dramatic story of how ancient temples were rescued from the rising waters in history''s greatest archaeological salvage operation.\n\nThe morning concludes at the **Unfinished Obelisk**, where ancient Egyptian engineering lies bare. This 1,200-ton granite monolith was abandoned when cracks appeared during carving, but the tool marks reveal techniques that still inspire wonder today. At 42 meters, it would have been the tallest obelisk ever raised—pharaonic ambition frozen in time.\n\nReturn to the ship for your farewell dinner, a special celebration of four extraordinary days on the Nile. Regional delicacies, premium wines, and the quiet beauty of Aswan at night create the perfect conclusion to your journey.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Farewell from the Land of the Pharaohs**\n\nYour final morning dawns golden over Aswan''s famous granite formations. Take breakfast at leisure on the sundeck, watching feluccas catch the morning breeze one last time.\n\nThe journey from Luxor''s illuminated temples to Aswan''s island sanctuaries has carried you through five thousand years of human achievement. You''ve descended into pharaohs'' tombs, sailed the river of the gods, and watched sunsets that have inspired poets since civilization began.\n\nAfter breakfast, your private transfer delivers you to Aswan International Airport. Should your flight depart later, comfortable arrangements ensure your last hours in Egypt are as pleasant as the journey itself.\n\n*Meals: Breakfast*',
    ARRAY[
      'First-class cabin with panoramic river views',
      'Gourmet dining with international and Egyptian cuisine',
      'Experienced Egyptologist guide (small groups max 16)',
      'All entrance fees including premium sites',
      'Horse-drawn carriage night tour of Luxor Temple',
      'Private felucca sailing with refreshments',
      'Air-conditioned premium vehicles for transfers'
    ],
    ARRAY[
      '4 nights in superior first-class cabin with Nile views',
      'Full board gourmet dining with welcome champagne',
      'Complimentary soft drinks, tea and coffee throughout',
      'Small group guided tours (maximum 16 guests)',
      'All entrance fees to temples and tombs (3 tombs)',
      'Horse-drawn carriage ride to illuminated Luxor Temple',
      'Private felucca sailing with refreshments',
      'Private airport transfer on departure',
      'Daily afternoon tea service',
      'Complimentary Wi-Fi onboard',
      'Evening entertainment program'
    ],
    'STANDARD TIER: First-class 5-star vessel, superior cabin with large windows, small group tours. Popular mid-range option. 5-day Luxor-Aswan is ideal length for most travelers. Night carriage ride to Luxor Temple is unique selling point. Clients need Aswan departure flight.',
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
  -- 4. DELUXE TIER - Deluxe Collection
  -- =====================================================================

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
    '5-Day Nile Cruise - Deluxe Collection',
    E'**Where Ancient Grandeur Meets Uncompromising Elegance**\n\nThis deluxe 5-day cruise from Luxor to Aswan represents the finest way to experience Egypt''s golden corridor. From your private balcony cabin to VIP access at ancient sites, from the moonlit enchantment of Luxor Temple by carriage to champagne felucca sailing at sunset, every moment has been crafted for travelers who appreciate the extraordinary. Five days that distill the essence of ancient Egypt into an experience of uncompromising luxury.\n\n---\n\n**Day 1: Luxor – A Grand Overture**\n\nYour deluxe Nile journey begins with a private transfer from the airport to your boutique cruise ship, where the crew welcomes you with champagne and chilled towels.\n\nYour balcony cabin is a sanctuary of refined elegance—spacious accommodations with floor-to-ceiling windows that open to your private outdoor space. From here, you''ll watch the Nile''s ever-changing theatre of light, the ancient temples glowing at dusk, and the stars wheeling overhead each night.\n\nAfter a gourmet lunch with premium wines, the afternoon brings the vast **Karnak Temple Complex** with **VIP early access**. Your private Egyptologist (guiding a maximum of 8 guests) leads you through this sacred city with an authority born of decades of scholarship. The Great Hypostyle Hall''s 134 columns tower above you in the soft afternoon light. The Sacred Lake reflects obelisks that have pierced the sky for three millennia. Your guide reveals secrets invisible to casual visitors—hidden chambers, symbolic alignments, the astronomical significance of the temple''s orientation.\n\nAs night transforms Luxor, something extraordinary awaits. Board a private **horse-drawn carriage** adorned for the occasion and glide through lamp-lit streets to **Luxor Temple** at its most magical. The illuminated columns cast long shadows across the ancient courtyard. The massive statues of Ramesses II glow as if lit from within. The Avenue of Sphinxes stretches into the distance, a corridor of stone guardians leading into the heart of three thousand years. Your guide shares the temple''s secrets in near-solitude—a private viewing that transforms a monument into a personal revelation.\n\nReturn to the ship for a multi-course dinner where Egyptian and international cuisines are elevated to artistry. The illuminated temple shimmers across the water as you dine on your balcony.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Privileged Access to Eternity**\n\nAn early departure brings special rewards: your small group arrives at the West Bank with **VIP early access**, entering the Valley of the Kings before general opening.\n\nIn the cool morning silence, with no crowds and only birdsong for company, you descend into four tombs (one more than standard admission). Your private Egyptologist reveals secrets invisible to casual visitors: hidden symbolism in the artwork, the techniques that kept colors vivid for millennia, the stories behind each pharaoh''s preparation for eternity. Every chamber is a masterpiece—and you have the rare luxury of appreciating each one without the pressure of crowds.\n\nThe **Temple of Hatshepsut** unfolds its mysteries in the golden morning light. Your guide shares details most visitors never learn: the political intrigue behind this remarkable woman''s rise to power, the architectural innovations that made her temple revolutionary, the detective story of how her successor tried to erase her memory from every monument in Egypt—and failed.\n\nThe **Colossi of Memnon** conclude your morning. Learn the science behind their ancient "singing"—and why Roman tourists traveled from across the empire to hear it.\n\nReturn to the ship for a gourmet lunch and an afternoon of pampered relaxation as you sail southward. Perhaps a massage in the spa, a dip in the plunge pool, or simply watching from your balcony as timeless landscape glides past. Tonight''s dinner features a seven-course tasting menu showcasing Egypt''s diverse culinary heritage.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu and Kom Ombo – Temples Revealed**\n\nYour ship docks at Edfu in the serene early morning. After breakfast on your balcony, travel by private vehicle to the **Temple of Horus**.\n\nSpend over two hours exploring this architectural masterpiece with your private guide. Unlike crowded group tours, your deluxe experience allows time to linger before reliefs that catch your interest, to ask questions that arise organically, to feel the atmosphere of a sacred space that functioned for over four centuries. The temple''s mythology comes alive: Horus''s eternal battle against chaos, the rituals that maintained cosmic order, the festival calendar that drew worshippers from across ancient Egypt.\n\nAfter a gourmet lunch aboard with regional specialties paired with premium wines, continue upstream to **Kom Ombo**. This remarkable double temple—dedicated to both crocodile and falcon gods—perches dramatically above the Nile. Your private guide reveals the temple''s most fascinating secrets: surgical instruments carved into stone suggesting advanced medical knowledge, astronomical alignments that still function after two millennia, mummified crocodiles in the museum that were worshipped as living gods and buried with golden jewelry.\n\nAs the afternoon softens, a highlight awaits: a **private felucca sailing** around **Kitchener''s Island** with vintage champagne and gourmet canapés. The sunset over Aswan transforms the Nile into liquid gold as you glide past botanical gardens and granite formations, traditional Nubian music drifting across the water.\n\nReturn to the ship for dinner under the stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Treasures Ancient and Modern**\n\nAswan unfolds at your own pace, with private transport and a flexible schedule adapted to your preferences.\n\nThe captivating **Philae Temple** awaits on its sacred island. Arriving by private motor launch, you explore the sanctuary of Isis with an intimacy impossible in larger groups. Linger before reliefs that speak to you, ask questions as they arise, feel the atmosphere of a sacred space that outlasted every other temple in Egypt—the last priests serving Isis here until 550 AD.\n\nThe **Aswan High Dam** tells the story of modern Egypt''s transformation. Your guide contextualizes this engineering marvel within the sweep of Nile history—from pharaohs who worshipped the river''s floods to engineers who finally tamed them, and the dramatic international rescue of ancient temples from the rising waters.\n\nThe **Unfinished Obelisk** reveals ancient engineering at its most ambitious and vulnerable. Your guide demonstrates the exact techniques—dolerite pounding balls, copper and sand—that shaped granite with precision that amazes modern engineers. This 1,200-ton monument, abandoned when a crack appeared, offers an invaluable window into pharaonic ambition.\n\nReturn to the ship for a farewell dinner that celebrates four extraordinary days. The chef''s finest creations, premium wines, and the gentle beauty of Aswan at night create a fitting conclusion to your deluxe Nile experience.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Memories Eternal**\n\nYour final morning offers time to savor the Nile''s tranquility one last time. Breakfast on your balcony, watching feluccas catch the morning breeze against golden cliffs, becomes a meditation on five days that touched eternity.\n\nFrom the illuminated magic of Luxor by carriage to the island serenity of Philae, you''ve experienced Egypt at its finest—VIP access and private guides, gourmet cuisine and champagne sunsets, a balcony cabin and the timeless rhythm of the Nile.\n\nYour luxury transfer delivers you to Aswan International Airport. Should your flight depart later, the ship''s hospitality extends until you are ready to leave—because every moment in Egypt is worth savoring.\n\n*Meals: Breakfast*',
    ARRAY[
      'Spacious balcony cabin with premium amenities',
      'Gourmet multi-course dining with premium wines',
      'Private Egyptologist guide (max 8 guests)',
      'VIP early access to major archaeological sites',
      'Four tombs in Valley of the Kings',
      'Private horse-drawn carriage night tour of Luxor Temple',
      'Private felucca with champagne at Kitchener Island',
      'Full spa access with complimentary treatment'
    ],
    ARRAY[
      '4 nights in deluxe balcony cabin (28-32 sqm)',
      'Butler-style service and premium amenities',
      'Full board gourmet cuisine with premium wine pairings',
      'Private Egyptologist guide (couples or max 8 guests)',
      'VIP entrance and early access to temples',
      '4 tombs in Valley of the Kings (vs standard 3)',
      'Private horse-drawn carriage to illuminated Luxor Temple',
      'Private felucca sailing with vintage champagne and canapés',
      'Luxury vehicle transfers throughout',
      'Full spa access with one complimentary treatment',
      'Seven-course farewell tasting menu',
      'Complimentary premium beverages throughout',
      'Complimentary laundry service'
    ],
    'DELUXE TIER: Luxury boutique vessel (Sanctuary Sun Boat, Oberoi Philae class), balcony cabin, private/semi-private tours, VIP access. 5-day Luxor-Aswan is most popular deluxe cruise duration. Night carriage ride to Luxor Temple is a standout moment. Clients need Aswan departure.',
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
  -- 5. LUXURY TIER - Ultimate Luxury
  -- =====================================================================

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
    '5-Day Nile Cruise - Ultimate Luxury',
    E'**The Nile as Pharaohs Knew It**\n\nFor those who accept nothing but the absolute finest, this ultra-luxury 5-day cruise from Luxor to Aswan represents the pinnacle of Nile travel. Stay in a magnificent suite with your own butler. Explore ancient sites with exclusive permits that open doors closed to all other visitors. Experience Luxor Temple by private carriage in profound solitude. Sail a felucca with Dom Pérignon as the sun sets over Aswan. This is not merely a cruise—it is an immersion into the Egypt of pharaohs and poets, experienced with a level of luxury that matches the magnificence of the monuments themselves.\n\n---\n\n**Day 1: Luxor – A Journey Beyond Compare**\n\nYour extraordinary adventure begins the moment your private limousine arrives at the airport. Nothing about this journey will be ordinary.\n\nAt the dock, the ship''s captain greets you personally as you board to the strains of traditional music and the sparkle of Dom Pérignon. Your magnificent suite awaits—50 square meters of refined elegance with floor-to-ceiling windows, a separate living area, a private balcony with daybed, and a bathroom worthy of the finest hotel. Your personal butler has already arranged your cabin according to the preferences you shared before arrival.\n\nA private lunch on your balcony showcases the executive chef''s artistry—each dish a masterpiece of Egyptian and international cuisine, each wine pairing considered with the care of a sommelier.\n\nThe afternoon brings the vast **Karnak Temple Complex** with **exclusive early access**. Accompanied by your personal PhD-qualified Egyptologist—one of Egypt''s foremost scholars—you explore this sacred city in near-solitude. Access restricted areas closed to regular visitors. Stand in chambers where pharaohs were crowned and priests whispered prophecies. Your guide, with the authority of decades of scholarship, reveals secrets available nowhere else—symbolic alignments invisible to casual observers, the astronomical precision of the temple''s construction, the political intrigues carved into its walls.\n\nAs darkness descends, the evening''s crown jewel awaits. A **private horse-drawn carriage**, appointed with cushions and champagne, carries you through Luxor''s lamp-lit streets to **Luxor Temple** for an **exclusive after-hours visit**. The temple has been cleared of other visitors. In profound solitude, you walk among illuminated columns that have stood since the age of Ramesses, the massive statues glowing against the night sky, the Avenue of Sphinxes stretching into starlit darkness. Your Egyptologist shares the temple''s deepest secrets in this extraordinary setting—history, mythology, and architecture illuminated in every sense.\n\nReturn to the ship for a private dinner in the suite or on deck, the illuminated temple reflected in the Nile''s dark waters.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Ultimate Revelation**\n\nYour private limousine departs before dawn for an experience available to virtually no other visitors: **exclusive early access** to the Valley of the Kings, entering before the site opens to the public.\n\nIn the profound silence of early morning, you descend into six tombs—twice the standard allowance—selected by your Egyptologist for their artistic excellence and historical significance. Your **VIP permits** include restricted chambers: the magnificent tomb of Seti I, often called the "Sistine Chapel of ancient Egypt," whose detailed paintings took over a decade to complete; the legendary tomb of Tutankhamun, small but resonant with the magic of Howard Carter''s discovery; and four more chosen to provide the most comprehensive understanding of pharaonic beliefs about death and resurrection.\n\nThe **Temple of Hatshepsut** reveals its secrets in the soft morning light. Your Egyptologist—an authority on this remarkable ruler—shares insights unavailable in any publication: the political intrigues, the architectural genius, the mysteries that still puzzle scholars today.\n\nThe **Colossi of Memnon** conclude your morning, their weathered faces more expressive in the golden light than any photograph can capture.\n\nReturn to your suite for a private lunch, then spend the afternoon in pampered relaxation. Perhaps a spa treatment using ancient Egyptian botanical techniques, a private session with the chef, or simply reading on your balcony as the Nile landscape unfolds. Tonight''s dinner is a ten-course tasting menu paired with Grand Cru wines, served privately under the stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu and Kom Ombo – Temples in New Light**\n\nYour ship arrives at Edfu in the pearl-gray light of early morning. After breakfast in your suite, your private limousine transports you to the **Temple of Horus** for an experience beyond ordinary tourism.\n\nWith special access permits, you enter areas closed to regular visitors—inner sanctuaries, priest''s chambers, rooftop chapels where ancient ceremonies took place under the open sky. Your PhD Egyptologist reveals the temple''s deepest meanings with the authority of a lifetime of scholarship. Spend over three hours exploring at your own pace—asking questions, lingering before reliefs, feeling the atmosphere of a sacred space still alive with meaning.\n\nA gourmet lunch aboard features the finest regional ingredients, each dish paired with wines from your butler''s carefully curated selection.\n\nContinue upstream to **Kom Ombo** with **exclusive early access**—the temple yours alone in the soft afternoon light. This unique double sanctuary reveals its secrets to those with time and expert guidance. Your Egyptologist illuminates details invisible to casual visitors: the surgical instruments that suggest advanced medical knowledge, the astronomical alignments, the theology behind crocodile worship. In the museum, view sacred mummified crocodiles adorned with golden jewelry—creatures once worshipped as living gods.\n\nAs sunset approaches, a **private felucca sailing** experience awaits at **Kitchener''s Island**—perhaps the journey''s most magical moment. Dom Pérignon, gourmet canapés prepared by the ship''s executive chef, and a traditional Nubian captain whose family has sailed these waters for generations. As the sun transforms the Nile into liquid gold and Aswan''s granite formations glow like embers, you understand why this moment justifies any journey.\n\nReturn for a private dinner, the stars of Egypt blazing overhead.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Treasures Unveiled**\n\nAswan unfolds its treasures at your pace, with private transport and a schedule adapted entirely to your wishes.\n\n**Philae Temple** receives you like royalty. Arriving by private motor launch with **exclusive early access**, you explore the sanctuary of Isis in profound solitude before the public arrives. The morning light bathes hieroglyphs in gold as your guide reveals stories hidden in every carved relief—the devotion to Isis that outlasted pharaonic Egypt itself, the last hieroglyphs carved in 394 AD, the temple''s role as the final beacon of ancient Egyptian religion.\n\nThe **Aswan High Dam** tells the story of a nation''s transformation. Your guide, who participated in the international rescue of Abu Simbel, shares firsthand accounts of the greatest archaeological salvage operation in history—how engineers moved an entire mountain to save the pharaohs'' masterpiece.\n\nThe **Unfinished Obelisk** offers insights available nowhere else. Your Egyptologist demonstrates the exact techniques used 3,500 years ago, explaining mysteries that have puzzled scholars for generations—delivered with the authority of one who has spent decades studying these very questions.\n\nReturn to your suite for a farewell dinner that transcends cuisine: a private starlight banquet on the top deck, the executive chef''s finest creations, vintage champagne flowing freely, the gentle beauty of Aswan at night surrounding you. This is Egypt''s farewell—intimate, magnificent, and unforgettable.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Farewell to the Eternal**\n\nYour final morning offers time to savor the Nile''s tranquility one last time. Breakfast arrives in your suite—or on your balcony, watching the sun rise over Aswan''s famous formations.\n\nYou leave transformed. From the illuminated solitude of Luxor Temple by carriage to the island silence of Philae at dawn, you have experienced Egypt as virtually no other visitor can. The pharaohs built for millennia; having touched their world in this way, some portion of that eternity now lives in you.\n\nYour private limousine delivers you to Aswan International Airport—or to a private aviation terminal, should your journey continue in that manner. A personalized departure gift accompanies you: a leather-bound journal of your journey, a tangible memento of five days that touched the eternal.\n\n*Meals: Breakfast*',
    ARRAY[
      'Magnificent suite with panoramic views and private balcony',
      'Dedicated butler service throughout your voyage',
      'World-class dining with Dom Pérignon and Grand Cru wines',
      'Personal PhD-qualified Egyptologist',
      'Exclusive before-hours and after-hours temple access',
      'VIP permits for 6 tombs including Seti I',
      'Private carriage to Luxor Temple with exclusive after-hours access',
      'Private felucca with Dom Pérignon at Kitchener Island',
      'Private limousine transportation throughout'
    ],
    ARRAY[
      '4 nights in magnificent suite (50+ sqm) with panoramic views',
      '24-hour dedicated butler service',
      'Full board world-class cuisine by executive chef',
      'Unlimited Dom Pérignon and Grand Cru wines',
      'Personal PhD Egyptologist guide (fully private)',
      'Exclusive early/late access permits for all sites',
      'VIP access to 6 tombs including Seti I and Tutankhamun',
      'Private horse-drawn carriage to Luxor Temple (exclusive after-hours)',
      'Private felucca with Dom Pérignon and gourmet canapés',
      'Private limousine airport transfers',
      'Daily spa treatments of your choice',
      'Private starlight farewell dinner on deck',
      'In-suite champagne service throughout',
      'Complimentary premium laundry and pressing',
      'Personalized leather-bound journey journal',
      'Exclusive departure gift from Egypt',
      'Helicopter or private aviation transfers available'
    ],
    'LUXURY TIER: Ultra-luxury boutique vessel (Sanctuary Sun Boat IV, Steam Ship Sudan, or equivalent). Presidential/Royal suite with dedicated butler. Fully private tours with PhD Egyptologist. Private after-hours Luxor Temple is unique to this itinerary. For UHNW clients. Verify special tomb permits 2 weeks in advance. One-way means private aviation may be requested for return.',
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
  -- VERIFY RESULTS
  -- =====================================================================

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 139 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for 5-Day Luxor to Aswan:';
  RAISE NOTICE '  - Budget: Classic Discovery';
  RAISE NOTICE '  - Standard: Premium Experience';
  RAISE NOTICE '  - Deluxe: Deluxe Collection';
  RAISE NOTICE '  - Luxury: Ultimate Luxury';
  RAISE NOTICE '';

END $$;

-- Verify the content was created
SELECT
  cl.name,
  cl.slug,
  cl.duration,
  cv.tier,
  cv.title,
  LENGTH(cv.description) as description_length,
  array_length(cv.highlights, 1) as highlight_count,
  array_length(cv.inclusions, 1) as inclusion_count
FROM content_library cl
LEFT JOIN content_variations cv ON cv.content_id = cl.id
WHERE cl.slug = '5-day-nile-cruise-luxor-aswan'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
