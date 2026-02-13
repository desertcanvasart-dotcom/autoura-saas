-- =====================================================================
-- Migration 138: Add 8-Day Luxor to Luxor Nile Cruise Content
-- Description: Comprehensive round-trip cruise with 4 tier variations
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
    '8-Day Nile Cruise: Luxor Round Trip',
    '8-day-nile-cruise-luxor-round-trip',
    'Experience the ultimate Nile odyssey on this magnificent 8-day round-trip voyage from Luxor. Sail through the heart of ancient Egypt, exploring the Valley of the Kings, the temples of Karnak, Edfu, and Kom Ombo, and the treasures of Aswan including Philae Temple. With a full day of leisure aboard your floating palace and enchanting evening entertainment including Galabia parties and belly dance shows, this is Egypt''s most comprehensive Nile cruise experience.',
    'Luxor to Luxor (Round Trip), Egypt',
    '8 days / 7 nights',
    ARRAY['nile-cruise', 'luxor', 'aswan', 'round-trip', 'temples', 'full-board', 'valley-of-kings', 'karnak'],
    jsonb_build_object(
      'route', 'Luxor to Luxor (Round Trip)',
      'direction', 'round-trip',
      'nights', 7,
      'days', 8,
      'embarkation', 'Luxor',
      'disembarkation', 'Luxor',
      'highlights', ARRAY[
        'Valley of the Kings',
        'Temple of Hatshepsut',
        'Colossi of Memnon',
        'Edfu Temple (Temple of Horus)',
        'Aswan High Dam',
        'Unfinished Obelisk',
        'Philae Temple',
        'Felucca sailing on the Nile',
        'Kom Ombo Temple',
        'Karnak Temple Complex',
        'Luxor Temple',
        'Galabia Party nights',
        'Belly dance entertainment'
      ],
      'included_meals', 'Full board (all meals)',
      'cruise_type', 'nile_cruise',
      'leisure_day', true
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
    '8-Day Nile Cruise - Classic Discovery',
    E'**The Complete Nile Experience**\n\nEight days. Seven nights. One unforgettable journey through the cradle of civilization. This comprehensive round-trip cruise from Luxor reveals ancient Egypt in all its glory—from the painted tombs of pharaohs to temples that have witnessed three millennia of human history. Travel in comfort aboard a traditional Nile cruiser, with all meals included and expert guidance at every ancient site.\n\n---\n\n**Day 1: Luxor – Where Your Journey Begins**\n\nWelcome to Luxor, the ancient city of Thebes, capital of Egypt''s golden age. Your adventure begins the moment you arrive at your Nile cruise ship, your floating home for the week ahead.\n\nSettle into your comfortable cabin and join fellow travelers for a welcome lunch that showcases the flavors of Egyptian cuisine. Spend the afternoon exploring the ship''s amenities—the sun deck with its panoramic views, the lounge where evening entertainment will unfold, the dining room where chefs prepare both international and local specialties.\n\nAs the sun sets over the Nile, painting the water in shades of amber and rose, enjoy your first dinner aboard. The ancient temples on the shore begin to glow with illumination, a preview of the wonders that await.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Into the Realm of the Pharaohs**\n\nToday brings the journey''s most anticipated destination: the legendary West Bank of Luxor, where pharaohs chose to rest for eternity.\n\nCross the Nile at dawn and enter the **Valley of the Kings**, a desert valley where 63 royal tombs were carved into the limestone hills over five centuries. Descend into painted chambers where vivid scenes depict the pharaoh''s journey through the underworld—gods and demons, stars and serpents, the eternal voyage of the sun. Your standard admission includes three tombs, each a masterpiece of ancient art.\n\nNext, the magnificent **Temple of Hatshepsut** rises in elegant terraces against golden cliffs. Egypt''s most successful female pharaoh built this architectural wonder, and its clean, modern-feeling lines have inspired architects for 3,500 years.\n\nPause at the **Colossi of Memnon**, twin 18-meter statues that have guarded the West Bank since 1350 BC. In ancient times, one statue was famous for "singing" at dawn, drawing tourists from across the Roman Empire.\n\nReturn to your ship for lunch and an afternoon of sailing, watching the timeless Nile landscape glide past. Dinner is accompanied by reflections on a day that touched the eternal.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu – Temple of the Falcon God**\n\nThe ship sails through the night, and you awaken approaching Edfu. After breakfast, disembark to explore the **Temple of Horus**, the best-preserved ancient temple in all Egypt.\n\nPass through towering pylons 36 meters high, adorned with scenes of divine victory. Inside, the Great Hypostyle Hall''s columns still support their original roof, creating an atmosphere of ancient mystery. In the sanctuary, the granite shrine where the golden statue of Horus once resided still stands, waiting for offerings that ceased two millennia ago.\n\nYour guide explains the mythology carved into every surface—the eternal battle between Horus and his uncle Set, the triumph of order over chaos that Egyptians believed must be reenacted eternally.\n\nReturn to the ship for lunch and a leisurely afternoon as you continue sailing southward. Tonight, the crew hosts a festive **Galabia Party**—don traditional Egyptian dress (available for purchase or loan onboard) and dance to local music under the stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Jewel of the Nile**\n\nYou wake in Aswan, Egypt''s southernmost city, where Africa and the Arab world meet in a symphony of color and culture. Today reveals both ancient treasures and modern marvels.\n\nBegin at the **Aswan High Dam**, the engineering triumph that tamed the Nile''s annual floods and powers modern Egypt. Stand atop this monument to human ambition and contemplate how it changed a nation forever.\n\nThe **Unfinished Obelisk** still lies in its granite quarry, abandoned 3,500 years ago when cracks appeared during carving. At 42 meters, it would have been the largest obelisk ever raised—a testament to pharaonic ambition frozen in time. See the ancient tool marks and imagine the thousands of workers who labored here.\n\nThe afternoon brings **Philae Temple**, the sanctuary of Isis that seems to float upon its island. Board a motorboat to reach this ethereal complex, rescued from the rising Nile and relocated stone by stone. Wander through colonnaded courts where the last hieroglyphs were carved in 394 AD, marking the end of pharaonic Egypt.\n\nAs the day softens, board a traditional **felucca** for a sailing experience unchanged since ancient times. Glide past Elephantine Island, watching the sunset paint Aswan''s famous granite formations in shades of gold and purple.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: A Day of Nile Serenity**\n\nToday, the river itself becomes your destination. No ancient sites, no schedules—just the timeless rhythm of the Nile.\n\nSleep late or rise early to watch the sunrise from the deck. After breakfast, the day unfolds at your own pace. Read in the lounge, sunbathe on deck, swim in the pool, or simply watch Egypt''s eternal landscape drift past—farmers working green fields, children playing on the banks, water buffalo cooling in the shallows, date palms swaying in the breeze.\n\nThe ship begins its journey northward, back toward Luxor. Optional onboard activities might include a cooking demonstration of Egyptian cuisine, a lecture on ancient history, or lessons in Arabic calligraphy. The spa offers traditional treatments for those seeking relaxation.\n\nThis day of leisure allows the experiences of the past days to settle into memory, preparing you for the wonders still to come. Dinner is followed by stargazing on deck, the Milky Way brilliant above the darkened desert.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 6: Kom Ombo – Temple of Two Gods**\n\nSailing northward, the ship docks at **Kom Ombo** in the cool of the morning. This unique double temple perches dramatically on a sandy promontory above the Nile, dedicated to two gods: Sobek, the crocodile deity of fertility and military might, and Horus the Elder, the falcon-headed healer.\n\nExplore symmetrical corridors that served two separate priesthoods—the left half for Sobek, the right for Horus. Your guide reveals fascinating details: ancient surgical instruments carved into the walls (evidence of sophisticated medicine), a nilometer that measured the river''s crucial annual flood, a calendar that still accurately tracks the seasons.\n\nIn the adjacent museum, mummified crocodiles stare back through millennia—some were sacred temple residents, pampered and mummified with full honors upon death.\n\nReturn to the ship for lunch as you continue sailing toward Luxor. Tonight brings the voyage''s highlight entertainment: an **Oriental Show** featuring traditional music and dance, followed by another **Galabia Party**. The festive evening celebrates your journey through Egypt''s ancient heartland.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 7: Karnak and Luxor – Temples of the Gods**\n\nYou arrive back in Luxor for a day exploring the East Bank''s magnificent temples—the greatest religious monuments the ancient world ever produced.\n\nThe **Karnak Temple Complex** defies superlatives. For over 2,000 years, successive pharaohs competed to build grander halls and taller obelisks here, creating the largest religious complex ever constructed. Walk through the Great Hypostyle Hall, its 134 massive columns carved with intricate hieroglyphs, and lose yourself in this forest of stone. See the Sacred Lake where priests purified themselves, the towering obelisks of Hatshepsut and Thutmose, the granite scarab that legend says brings luck in love to those who walk around it seven times.\n\nAfter lunch aboard, the afternoon brings **Luxor Temple**, connected to Karnak by the recently restored Avenue of Sphinxes. This elegant temple was the site of the annual Opet Festival, when the gods of Karnak were carried here in sacred procession. As the afternoon light softens, watch the massive statues of Ramesses II glow as if lit from within.\n\nYour final evening aboard features a **belly dance show**, providing a captivating cultural performance alongside a farewell dinner celebrating your week on the Nile.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 8: Farewell to the Nile**\n\nYour final morning dawns over Luxor. Enjoy a leisurely breakfast as you reflect on seven extraordinary days—pharaohs'' tombs and floating temples, crocodile gods and falcon deities, desert sunsets and starlit nights on deck.\n\nThe Nile has shared its secrets with you. The eternal river will continue flowing as it has for millennia, but you leave transformed, carrying memories that connect you to five thousand years of human history.\n\nAfter breakfast, transfer to Luxor International Airport for your onward journey. The pyramids may await in Cairo, the Red Sea beckons, or home calls—but the Nile will flow through your dreams forever.\n\n*Meals: Breakfast*',
    ARRAY[
      'Comfortable accommodation on traditional Nile cruiser',
      'Full board dining throughout the voyage',
      'Professional English-speaking Egyptologist guide',
      'All temple and tomb entrance fees included',
      'Scenic felucca sailing in Aswan',
      'Full day of leisure and relaxation',
      'Galabia parties and evening entertainment',
      'Air-conditioned transportation for excursions'
    ],
    ARRAY[
      '7 nights accommodation in comfortable standard cabin',
      'Full board: 7 breakfasts, 7 lunches, 7 dinners',
      'Expert guided tours at all archaeological sites',
      'Entrance fees to all temples and tombs (3 tombs in Valley of Kings)',
      'Traditional felucca sailing in Aswan',
      'Two Galabia Party evenings',
      'Oriental show and belly dance entertainment',
      'Airport transfer on departure',
      'Onboard activities and entertainment program'
    ],
    'BUDGET TIER: Standard 4-star cruise vessel, twin/double cabin, shared group tours (max 25). Best value for comprehensive Nile experience. 8 days allows thorough exploration at relaxed pace. Leisure day is key selling point.',
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
    '8-Day Nile Cruise - Premium Experience',
    E'**Where Timeless Wonder Meets Modern Comfort**\n\nThis premium 8-day journey elevates your Nile experience with first-class accommodations, refined dining, and smaller touring groups. Sail the complete Luxor round-trip route aboard a superior vessel, enjoying the perfect balance of authentic discovery and contemporary comfort. With a dedicated leisure day, evening entertainment, and expert Egyptologist guidance, this is the Nile cruise discerning travelers choose.\n\n---\n\n**Day 1: Luxor – A Grand Welcome**\n\nYour premium Nile experience begins as you arrive in Luxor, the ancient city Homer called "hundred-gated Thebes." A representative greets you and escorts you to your first-class cruise ship, where a champagne welcome awaits.\n\nSettle into your river-view cabin with its panoramic windows framing Egypt''s eternal landscape. Join fellow guests for a gourmet lunch showcasing the finest Egyptian and international cuisine. Spend the afternoon exploring your floating hotel—the elegant lounge, the sundeck with its plunge pool, the spa offering traditional treatments.\n\nAs evening descends, the temples along the shore begin to glow with golden illumination. Your first dinner aboard sets the tone for the week: attentive service, superb cuisine, and the soft lap of the Nile against the hull.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Touching Eternity**\n\nAn early start brings rewards: you arrive at the West Bank before the midday heat, when the desert air is still cool and the light ideal for photography.\n\nThe **Valley of the Kings** unfolds its secrets to those who seek them. Your experienced Egyptologist guide leads your small group (maximum 16) into three painted tombs, explaining the symbolism of every scene: the night journey of the sun god Ra, the weighing of hearts by Anubis, the fields of paradise awaiting the righteous dead. Stand in chambers where pharaohs expected to sleep for eternity, their walls blazing with gold and lapis blue.\n\nThe **Temple of Hatshepsut** reveals Egypt''s most extraordinary ruler—a woman who declared herself pharaoh and ruled wisely for two decades. Her mortuary temple, rising in elegant terraces against sheer cliffs, remains an architectural triumph 3,500 years later. Your guide shares the remarkable story of how her successor tried to erase her memory—and failed.\n\nThe **Colossi of Memnon** conclude your morning, these weathered giants still impressive after 34 centuries of Nile floods and desert winds.\n\nReturn to the ship for a refreshing lunch and an afternoon at leisure as you sail southward. Tonight''s dinner features regional specialties, followed by traditional music on deck.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu – In the Realm of Horus**\n\nThe ship arrives at Edfu in the cool morning hours. After a leisurely breakfast, horse-drawn carriages (or modern vehicles, your choice) transport you through the town to the **Temple of Horus**.\n\nThis is Egypt''s best-preserved temple, and it shows. The massive pylons still bear traces of their original colors. The hypostyle halls remain roofed, creating the mysterious atmosphere ancient worshippers knew. Your guide spends nearly two hours revealing the temple''s secrets—the mythology of Horus''s victory over chaos, the rituals that maintained cosmic order, the festival calendar that structured Egyptian life for centuries.\n\nReturn to the ship for lunch and an afternoon of sailing through beautiful countryside. Take afternoon tea on deck as you watch the eternal Nile landscape unfold.\n\nTonight, the crew hosts the voyage''s first **Galabia Party**. Don traditional Egyptian dress (complimentary loan from the ship) and join a festive evening of music, dancing, and celebration under the stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Where Egypt Meets Africa**\n\nAswan has enchanted travelers for millennia with its beauty—the Nile at its bluest, islands of green against golden desert, the elegant sails of feluccas catching the breeze. Today you discover its treasures.\n\nThe **Aswan High Dam** demonstrates Egypt''s modern ambition—this engineering marvel tamed the Nile''s floods and powers the nation. Your guide shares the dramatic story of how ancient temples were rescued from the rising waters in history''s greatest archaeological salvage operation.\n\nAt the **Unfinished Obelisk**, see ancient Egyptian engineering techniques laid bare. This 1,200-ton granite monolith was abandoned when cracks appeared during carving, but the tool marks reveal how such enormous monuments were created—techniques that still inspire wonder today.\n\n**Philae Temple** awaits on its sacred island. Board a private motor launch to reach this sanctuary of Isis, where the last priests maintained ancient traditions until 550 AD. Explore colonnaded courts and intimate chapels where the goddess was worshipped for over a thousand years.\n\nThe afternoon brings a highlight: a **private felucca sailing** experience with refreshments. Glide past Elephantine Island and Kitchener''s Botanical Garden as the sunset transforms the Nile into liquid gold. This is Aswan''s magic—timeless beauty that words cannot capture.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: A Day of Refined Leisure**\n\nNo alarms, no schedules—today belongs entirely to you and the timeless Nile.\n\nBegin with a leisurely breakfast, perhaps on the sundeck as the ship starts its northward journey. The day offers countless pleasures: a massage in the spa, a swim in the pool, a book in a shaded corner of the deck, or simply watching Egypt''s eternal landscape drift past.\n\nOptional activities enrich the day for those who seek them. The chef may demonstrate Egyptian cuisine secrets. A historian might lecture on topics the guided tours couldn''t cover. Language enthusiasts can try their hand at Arabic calligraphy or hieroglyphics.\n\nThe ship''s journey northward reveals the Nile''s quieter stretches—villages little changed in centuries, fishermen casting nets as their ancestors did, children waving from the banks, the call to prayer drifting across the water at sunset.\n\nTonight''s dinner celebrates the journey''s midpoint, followed by stargazing on deck. Away from city lights, the Milky Way blazes overhead—the same stars that guided pharaohs'' astronomers five thousand years ago.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 6: Kom Ombo – The Double Temple**\n\nMorning brings **Kom Ombo**, dramatically situated on a promontory where the Nile makes a sweeping bend. This unique temple served two gods and two priesthoods—the crocodile Sobek and the falcon Horus—in perfect architectural symmetry.\n\nYour guide reveals the temple''s fascinating details in the soft morning light. Ancient surgical instruments carved into the walls suggest sophisticated medical knowledge. A nilometer measured the river''s life-giving floods. The calendar accurately tracks seasons even today. In the museum, mummified crocodiles—sacred temple residents given full burial honors—stare back through three millennia.\n\nReturn to the ship for lunch and an afternoon of scenic sailing. As the landscape becomes increasingly familiar—you passed this way heading south—you appreciate it anew, seeing details you missed before.\n\nTonight brings the voyage''s entertainment highlight: an **Oriental Show** featuring traditional Egyptian music and dance, followed by another festive **Galabia Party**. The evening celebrates your journey through the heart of ancient Egypt.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 7: Karnak and Luxor – Crown Jewels of Ancient Egypt**\n\nYour final full day brings the East Bank''s magnificent temples—monuments that have awed visitors since the ancient Greeks called them the greatest wonders they had ever seen.\n\n**Karnak Temple Complex** demands time and attention, and you have both. Spend the entire morning exploring this vast sacred city, where pharaohs built and rebuilt for over 2,000 years. The Great Hypostyle Hall''s 134 massive columns create a forest of stone, each carved with intricate reliefs depicting kings before gods. The Sacred Lake still reflects obelisks and pylons. The famous scarab statue awaits those who seek luck in love.\n\nLunch aboard is followed by an afternoon at **Luxor Temple**, approached via the recently restored **Avenue of Sphinxes**—a 3-kilometer processional way lined with stone guardians, closed to traffic for the first time in millennia. The temple glows in the golden afternoon light, its statues of Ramesses II among the most photographed monuments in Egypt.\n\nYour farewell dinner is accompanied by a captivating **belly dance performance**, a fitting cultural finale to your week on the Nile.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 8: Until We Meet Again**\n\nYour final morning dawns golden over Luxor. Take breakfast at leisure, perhaps on deck for last views of the Nile''s morning tranquility.\n\nThe week has transformed ancient history from textbook abstraction into lived experience. You''ve walked where pharaohs walked, sailed where Cleopatra sailed, watched sunsets that have inspired poets since civilization began.\n\nAfter breakfast, your private transfer delivers you to Luxor International Airport. You leave Egypt changed—carrying memories that connect you to the eternal, and perhaps already planning your return.\n\n*Meals: Breakfast*',
    ARRAY[
      'First-class cabin with panoramic river views',
      'Gourmet dining with international and Egyptian cuisine',
      'Experienced Egyptologist guide (small groups max 16)',
      'All entrance fees including premium sites',
      'Private felucca sailing with refreshments',
      'Full day of leisure with optional activities',
      'Premium evening entertainment program',
      'Air-conditioned premium vehicles for transfers'
    ],
    ARRAY[
      '7 nights in superior first-class cabin with Nile views',
      'Full board gourmet dining with welcome champagne',
      'Complimentary soft drinks, tea and coffee throughout',
      'Small group guided tours (maximum 16 guests)',
      'All entrance fees to temples and tombs (3 tombs)',
      'Private felucca sailing with refreshments',
      'Complimentary Galabia costume loan',
      'Two Galabia Party evenings with open bar',
      'Oriental show and belly dance performances',
      'Private airport transfer',
      'Daily afternoon tea service',
      'Complimentary Wi-Fi onboard',
      'Onboard lecture program'
    ],
    'STANDARD TIER: First-class 5-star vessel (MS Nile Goddess, Sonesta class), superior cabin with large windows, small group tours. Most popular option for couples and discerning travelers. 8-day duration allows unhurried exploration.',
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
    '8-Day Nile Cruise - Deluxe Collection',
    E'**Exceptional Luxury Through Egypt''s Golden Heart**\n\nThis deluxe 8-day cruise represents the finest way to experience the complete Nile journey. From your private balcony cabin to VIP access at ancient sites, from gourmet dining with premium wines to exclusive evening events, every detail has been crafted for travelers who appreciate the extraordinary. Eight unhurried days allow deep immersion in Egypt''s wonders, with a full day of pampered leisure aboard your floating sanctuary.\n\n---\n\n**Day 1: Luxor – Where Legends Await**\n\nYour deluxe Nile journey begins with a private transfer to your boutique cruise ship, where the crew lines up to welcome you with champagne and chilled towels.\n\nYour balcony cabin is a sanctuary of refined elegance—spacious accommodations with floor-to-ceiling windows that open to your private outdoor space. From here, you''ll watch temples glow at sunset, stars wheel overhead at midnight, and the Nile''s first light paint the water each dawn.\n\nAfter settling in, join your fellow guests for a gourmet lunch that sets the tone for the week: fresh, locally-sourced ingredients prepared with international flair, paired with carefully selected wines. Spend the afternoon exploring the ship''s amenities—the spa with its traditional hammam, the sundeck with its plunge pool, the library stocked with Egyptological treasures.\n\nAs evening falls and the temples of Luxor begin to glow, your first dinner aboard reveals why this cruise is legendary: world-class cuisine, impeccable service, and the soft magic of the Nile surrounding you.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Privileged Access to Eternity**\n\nAn early departure brings special rewards: your small group (maximum 8 guests) arrives at the West Bank with **VIP early access**, entering the Valley of the Kings before general opening.\n\nIn the cool morning silence, with no crowds and only birdsong for company, you descend into four tombs (one more than standard admission). Your private Egyptologist—an expert with decades of experience—reveals secrets invisible to casual visitors: hidden symbolism in the artwork, the techniques that kept colors vivid for millennia, the stories behind each pharaoh''s journey to eternity.\n\nThe **Temple of Hatshepsut** unfolds its mysteries in the golden morning light. Your guide shares details most visitors never learn: the political intrigue behind this remarkable woman''s rise to power, the architectural innovations that made her temple revolutionary, the fascinating story of how it was rediscovered buried under centuries of sand.\n\nThe **Colossi of Memnon** conclude your morning, still impressive after 34 centuries. Learn why Greek and Roman tourists traveled thousands of miles to hear one statue "sing" at dawn—a phenomenon that ceased after earthquake repairs in 199 AD.\n\nReturn to the ship for a gourmet lunch and an afternoon of relaxation. Perhaps a massage in the spa, a dip in the pool, or simply watching from your balcony as the ship sails southward through timeless landscape.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu – The Complete Temple**\n\nYour ship docks at Edfu in the serene early morning. After breakfast, travel by private vehicle to the **Temple of Horus**—the best-preserved temple in Egypt, its mysteries revealed to you in exceptional detail.\n\nSpend over two hours exploring this architectural masterpiece with your private guide. Unlike crowded group tours, your deluxe experience allows time to linger before reliefs that catch your interest, to ask questions that arise organically, to feel the atmosphere of a sacred space that functioned for over 400 years.\n\nThe temple''s mythology comes alive: Horus''s eternal battle against chaos, the rituals that maintained cosmic order, the festivals that structured Egyptian life for millennia. Stand in the sanctuary where the golden statue of Horus once resided, and imagine the awe of ancient pilgrims.\n\nReturn to the ship for a gourmet lunch featuring regional specialties. The afternoon unfolds at a leisurely pace—afternoon tea on deck, the ship''s gentle progress southward, the landscape increasingly lush as you approach Aswan.\n\nTonight''s **Galabia Party** is elevated for deluxe guests: premium cocktails, gourmet canapés, and a celebration of Egyptian culture that feels like a private party rather than a ship event.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Treasures Ancient and Modern**\n\nAswan''s beauty has enchanted travelers since ancient times—the Nile at its most scenic, islands of green against golden desert, the graceful sails of feluccas gliding on the breeze. Today, this enchanting city reveals its greatest treasures.\n\nThe **Aswan High Dam** demonstrates Egypt''s modern ambition, but your guide contextualizes it within the sweep of Nile history—from pharaohs who worshipped the river''s floods to engineers who finally tamed them. The story of how ancient temples were rescued from the rising waters becomes vivid when told by an expert who participated in the salvage operations.\n\nThe **Unfinished Obelisk** offers unique insights into ancient engineering. Your guide demonstrates the exact techniques—dolerite pounding balls, copper and sand—that shaped granite with precision that still amazes modern engineers.\n\n**Philae Temple** awaits on its sacred island. Arriving by private motor launch, you explore the sanctuary of Isis at your own pace, lingering before reliefs that speak to you, asking questions as they arise. This intimate approach transforms tourism into genuine discovery.\n\nThe afternoon brings a **private felucca sailing** experience with vintage champagne and gourmet canapés. As the sun sets over Aswan''s famous granite formations, painting the Nile in shades of gold and rose, you understand why travelers have been enchanted by this place for millennia.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: A Day of Pampered Luxury**\n\nToday, the Nile itself becomes your destination—and your floating palace the perfect place to appreciate it.\n\nSleep late or rise early for a sunrise yoga session on deck. Breakfast arrives whenever you wish—in your cabin, on your balcony, or in the dining room with its panoramic views. The day belongs entirely to you.\n\nThe spa beckons with traditional treatments: a hammam ritual, an aromatic massage, a facial using Egyptian botanical ingredients. The pool offers refreshing dips between chapters of your book. The sundeck provides prime views of Egypt''s eternal landscape drifting past.\n\nOptional enrichment activities include a private cooking class with the executive chef, revealing secrets of Egyptian cuisine you can recreate at home. A historian offers an intimate lecture on topics the guided tours couldn''t cover. A calligraphy master demonstrates the ancient art of hieroglyphic writing.\n\nAs the ship continues northward, watch the landscape transform in the golden afternoon light. Tonight''s dinner is a seven-course tasting menu showcasing Egypt''s culinary heritage, followed by stargazing with the captain''s telescope—the Milky Way brilliant above the darkened desert.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 6: Kom Ombo – Temple of Dual Divinity**\n\nMorning brings **Kom Ombo**, dramatically situated where the Nile makes a sweeping bend. Your visit begins before the crowds arrive, allowing peaceful appreciation of this unique double temple.\n\nThe temple''s dual dedication—to crocodile-headed Sobek and falcon-headed Horus—creates fascinating architectural symmetry. Your guide reveals secrets most visitors never discover: sophisticated surgical instruments carved into the walls, a nilometer that measured the river''s crucial floods, a calendar still accurate after two millennia.\n\nThe crocodile museum offers intimate viewing of mummified sacred crocodiles, some still wearing golden jewelry. These weren''t ordinary reptiles—they were worshipped as living gods, pampered in temple pools, and mummified with full honors upon death.\n\nReturn to the ship for a gourmet lunch as you continue sailing toward Luxor. The afternoon offers time for spa treatments, reading, or simply appreciating views you''re seeing for the second time with fresh eyes.\n\nTonight brings the voyage''s entertainment highlight: an exclusive **Oriental Show** with traditional musicians and dancers, followed by a premium **Galabia Party** with champagne, gourmet canapés, and celebration under the stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 7: Karnak and Luxor – Monuments to the Gods**\n\nYour final full day brings the crown jewels of ancient Egypt: the East Bank''s magnificent temples, experienced with VIP privileges that transform good visits into extraordinary ones.\n\n**Karnak Temple Complex** opens early for your private group. For over two hours, explore this vast sacred city with virtually no crowds—walking the processional routes that pharaohs walked, standing in halls where priests chanted hymns at dawn, touching columns carved when Rome was a village and Athens a dream.\n\nThe Great Hypostyle Hall is overwhelming in the best sense: 134 massive columns, each carved with intricate reliefs, creating a forest of stone that reduces visitors to reverent silence. Your guide reveals the stories hidden in every carved surface—military victories, divine births, cosmic battles between order and chaos.\n\nAfter lunch aboard, the afternoon brings **Luxor Temple** via the recently restored **Avenue of Sphinxes**. This 3-kilometer processional way, closed to traffic for the first time since antiquity, creates an approach worthy of the temple it serves.\n\nAs the afternoon light softens, watch Luxor Temple transform—its massive statues of Ramesses II glowing as if lit from within, its obelisk pointing toward the first stars of evening. Stay for the illumination as darkness falls, a private viewing arranged exclusively for deluxe guests.\n\nYour farewell dinner on the top deck features the chef''s most exceptional creations, accompanied by a private **belly dance performance** that captivates with its artistry and grace.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 8: Memories Eternal**\n\nYour final morning offers time to savor the Nile''s morning tranquility one last time. Breakfast on your balcony, watching the temples glow in the first light, becomes a meditation on a week that touched eternity.\n\nYou''ve experienced Egypt at its finest—VIP access and private guides, gourmet cuisine and premium wines, a balcony cabin and a full day of pampered luxury. More importantly, you''ve connected with five thousand years of human history in ways that casual visitors cannot.\n\nYour luxury transfer delivers you to Luxor International Airport with time to spare. Egypt''s magic travels with you—in photographs and memories, in a deeper understanding of human achievement, and perhaps in plans for a return journey. The Nile flows eternal; so too does its hold on those fortunate enough to sail its waters in style.\n\n*Meals: Breakfast*',
    ARRAY[
      'Spacious balcony cabin with premium amenities',
      'Gourmet multi-course dining with premium wines',
      'Private Egyptologist guide (max 8 guests)',
      'VIP early access to major archaeological sites',
      'Four tombs in Valley of the Kings',
      'Private felucca with champagne service',
      'Full spa access with complimentary treatment',
      'Premium entertainment and Galabia parties'
    ],
    ARRAY[
      '7 nights in deluxe balcony cabin (28-32 sqm)',
      'Butler-style service and premium amenities',
      'Full board gourmet cuisine with premium wine pairings',
      'Private Egyptologist guide (couples or max 8 guests)',
      'VIP entrance and early access to temples',
      '4 tombs in Valley of the Kings (vs standard 3)',
      'Private felucca sailing with vintage champagne and canapés',
      'Luxury vehicle transfers throughout',
      'Full spa access with one complimentary treatment per guest',
      'Private cooking class with executive chef',
      'Premium Galabia parties with champagne',
      'Private belly dance performance at farewell dinner',
      'Complimentary premium beverages throughout',
      'Complimentary laundry service',
      'Private starlight dinner on deck'
    ],
    'DELUXE TIER: Luxury boutique vessel (Sanctuary Sun Boat, Oberoi Zahra class), balcony cabin, private/semi-private tours, VIP access, premium inclusions. For well-traveled clients expecting exceptional service. 8-day duration maximizes relaxation.',
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
    '8-Day Nile Cruise - Ultimate Luxury',
    E'**The Definitive Nile Experience**\n\nFor those who accept nothing less than perfection, this ultra-luxury 8-day cruise represents the absolute pinnacle of Nile travel. Stay in a magnificent suite with your own butler. Dine on world-class cuisine paired with Dom Pérignon and Grand Cru wines. Access ancient sites with exclusive permits that open doors closed to all other visitors. This is not merely a cruise—it is a private journey through the Egypt of pharaohs and poets, experienced with a level of luxury that matches the magnificence of the monuments themselves.\n\n---\n\n**Day 1: Luxor – A Royal Welcome**\n\nYour extraordinary journey begins the moment your private limousine arrives at your hotel or the airport. Nothing about this experience will be ordinary.\n\nAt the dock, the ship''s captain and crew form a welcoming line as you board to the strains of traditional music and the sparkle of Dom Pérignon. Your magnificent suite awaits—50 square meters of refined elegance with floor-to-ceiling windows, a separate living area, a private balcony with daybed, and a bathroom worthy of a five-star hotel. Your personal butler has already unpacked your luggage, chilled your preferred champagne, and arranged your cabin according to the preferences you shared before arrival.\n\nA private lunch in your suite or on your balcony showcases the chef''s artistry—each dish a small masterpiece, each wine pairing perfectly considered. Spend the afternoon in pampered relaxation: a massage in the spa, a dip in the plunge pool, or simply watching the Nile flow past from your private deck.\n\nAs sunset paints the temples gold, your first dinner sets expectations impossibly high—and somehow exceeds them. This is the Nile as pharaohs experienced it: every need anticipated, every desire fulfilled, eternity stretching before you.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Valley of the Kings – Privileged Access to Eternity**\n\nYour private limousine departs before dawn for an experience available to virtually no other visitors: **exclusive early access** to the Valley of the Kings, entering before the site opens to the public.\n\nIn the profound silence of early morning, accompanied only by your PhD-qualified Egyptologist—one of Egypt''s foremost scholars—you descend into tombs most tourists will never see. Your **VIP permits** grant access to six tombs including restricted chambers: the magnificent tomb of Seti I, often called the "Sistine Chapel of ancient Egypt," whose detailed paintings took over a decade to complete; the legendary tomb of Tutankhamun, small but resonant with discovery''s magic; and four more selected by your guide for their artistic excellence and historical significance.\n\nThe **Temple of Hatshepsut** reveals its secrets in the soft morning light. Your Egyptologist—an authority on this remarkable ruler—shares insights unavailable in any guidebook: the political intrigues behind her rise, the architectural innovations that made her temple revolutionary, the mysteries that still puzzle scholars today.\n\nThe **Colossi of Memnon** conclude your morning, their weathered faces more expressive in the golden light than any photograph can capture.\n\nReturn to your suite for a private lunch, then spend the afternoon in pampered relaxation as the ship begins its journey southward. Tonight''s dinner on your private balcony features the chef''s tasting menu, each course paired with exceptional wines.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Edfu – The Temple Revealed**\n\nYour ship arrives at Edfu in the pearl-gray light of early morning. After breakfast in your suite, your private limousine transports you to the **Temple of Horus** for an experience beyond ordinary tourism.\n\nWith special access permits, you enter areas closed to regular visitors—inner sanctuaries, priest''s chambers, rooftop chapels where ancient ceremonies took place under the open sky. Your PhD Egyptologist, an authority on Egyptian religion, reveals the temple''s deepest meanings: the cosmic significance of Horus''s eternal victory, the rituals that maintained universal order, the festivals that brought worshippers from across Egypt.\n\nSpend over three hours exploring at your own pace, asking questions that arise organically, lingering before reliefs that speak to you. This intimate approach transforms tourism into genuine scholarship.\n\nReturn to your suite for lunch, then an afternoon of leisurely sailing. Perhaps a treatment in the spa, a private session with the chef learning Egyptian culinary secrets, or simply reading on your balcony as the Nile landscape unfolds.\n\nTonight''s **Galabia Party** is transformed for you: a private event on the top deck, champagne and gourmet canapés, traditional musicians performing for your exclusive entertainment. The evening feels less like a ship event than a private celebration of Egyptian culture.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Aswan – Treasures Unveiled**\n\nAswan unfolds its treasures at your own pace, with private transport and a flexible schedule adapted to your wishes.\n\nThe **Aswan High Dam** tells the story of modern Egypt''s ambition. Your guide, who participated in the international effort to rescue ancient temples from the rising waters, shares firsthand accounts of the greatest archaeological salvage operation in history.\n\nThe **Unfinished Obelisk** reveals ancient engineering secrets. Your Egyptologist demonstrates techniques that have puzzled scholars for decades—how did they plan to transport a 1,200-ton monument, and why did they abandon it when a crack appeared?\n\n**Philae Temple** receives you like royalty. Arriving by private launch with **exclusive early access**, you explore the sanctuary of Isis in profound solitude. The morning light bathes hieroglyphs in gold as your guide reveals stories hidden in every carved relief—the last flowering of pharaonic culture, maintained here until 550 AD when the temple was finally closed.\n\nThe afternoon brings a **private felucca sailing** experience beyond imagination. Vintage Dom Pérignon, gourmet canapés prepared by the ship''s chef, and a traditional Nubian captain who shares stories of the river his family has sailed for generations. As sunset transforms the Nile into liquid gold, you understand why this moment is worth any journey.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: A Day of Absolute Luxury**\n\nToday, there is nowhere you must be, nothing you must see—only the Nile''s eternal rhythm and the pleasures of your floating palace.\n\nYour butler brings breakfast whenever you wish—in your suite, on your balcony, or in the dining room if you prefer company. The day unfolds according to your desires alone.\n\nThe spa offers treatments unavailable elsewhere on the Nile: a traditional hammam ritual using ancient techniques, a massage with oils blended to your preferences, beauty treatments using rare Egyptian botanicals. Book a private session or indulge in several throughout the day.\n\nThe ship''s facilities exist for your pleasure: the plunge pool with its Nile views, the library stocked with Egyptological treasures, the sundeck where staff anticipate every need. Optional enrichment awaits those who seek it: a private cooking class with the executive chef, an intimate lecture by your Egyptologist on topics of your choosing, a calligraphy session creating a personalized cartouche.\n\nAs evening approaches, join the captain on the bridge for sunset cocktails and navigation insights few visitors ever receive. Tonight''s dinner is a private affair on the top deck: a ten-course tasting menu paired with Grand Cru wines, the Nile spreading to the horizon, the Milky Way blazing overhead.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 6: Kom Ombo – Temple of Dual Divinity**\n\nMorning brings **Kom Ombo** with **exclusive early access**—the temple yours alone in the soft morning light.\n\nThis unique sanctuary, dedicated to both crocodile-headed Sobek and falcon-headed Horus, reveals its secrets to those with time and expert guidance. Your Egyptologist points out details invisible to casual visitors: surgical instruments suggesting advanced medical knowledge, a nilometer that measured the river''s crucial floods, astronomical alignments that still function after two millennia.\n\nThe crocodile museum offers intimate viewing of sacred creatures mummified with jewelry and full burial honors. Your guide explains the theology behind crocodile worship—why these fearsome creatures represented both danger and protection, chaos and fertility.\n\nReturn to your suite for lunch and an afternoon of scenic sailing. As the landscape grows familiar—you passed this way heading south—appreciate details you missed before, seeing the eternal Nile with fresh eyes.\n\nTonight brings the voyage''s grandest entertainment: a private **Oriental Show** on the top deck, traditional musicians and dancers performing exclusively for you and your party. The celebration continues with a premium **Galabia Party**—Dom Pérignon flowing freely, gourmet canapés circulating, the stars of Egypt blazing overhead.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 7: Karnak and Luxor – Monuments Eternal**\n\nYour final full day brings experiences reserved for royalty: private access to Egypt''s greatest temples, moments of solitude amid monuments that have awed humanity for millennia.\n\n**Karnak Temple Complex** opens its gates before dawn exclusively for you. Watch the sunrise illuminate the Great Hypostyle Hall—134 massive columns emerging from shadow into golden light, a sight photographers wait years to capture. For nearly two hours, one of history''s most sacred spaces belongs to you alone.\n\nYour PhD Egyptologist guides you through Karnak''s vast precincts with the authority of decades of scholarship. Access restricted areas closed to regular visitors. Stand in chambers where pharaohs were crowned, priests whispered prophecies, and the fate of empires was decided. Leave only when you are ready.\n\nAfter lunch in your suite, the afternoon brings **Luxor Temple** with **exclusive after-hours access**. When the day''s visitors have departed and the temple is illuminated against the darkening sky, you enter this 3,400-year-old sanctuary in profound solitude. Walk the Avenue of Sphinxes. Stand before the Colossus of Ramesses as stars appear overhead. Feel the weight of history in the evening silence.\n\nYour farewell dinner is an event beyond category: a private starlight banquet on the top deck, the illuminated temples of Luxor as your backdrop, a private **belly dance performance** of artistic excellence, vintage champagne flowing freely, memories being sealed for eternity.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 8: Farewell to the Eternal**\n\nYour final morning offers time to savor the Nile''s tranquility one last time. Breakfast arrives in your suite—or on your balcony, watching the temples glow in first light.\n\nYou leave transformed. Not merely by ancient monuments and luxury accommodation, but by an immersion in eternity that changes how you see the world. The pharaohs built for millennia; having touched their world, some portion of that eternity now lives in you.\n\nYour private limousine delivers you to Luxor International Airport—or to a private aviation terminal, should your journey continue in that manner. You carry with you memories beyond price: the silence of a pharaoh''s tomb at dawn, the Nile at sunset seen from your private balcony, the feeling of history alive and breathing around you.\n\nUntil you return—and you will return—the Nile flows on, eternal as the stars.\n\n*Meals: Breakfast*',
    ARRAY[
      'Magnificent suite with panoramic views and private balcony',
      'Dedicated butler service throughout your voyage',
      'World-class dining with Dom Pérignon and Grand Cru wines',
      'Personal PhD-qualified Egyptologist',
      'Exclusive before-hours and after-hours access to all sites',
      'VIP permits for 6 tombs including Seti I',
      'Private limousine transportation throughout',
      'Private events and entertainment'
    ],
    ARRAY[
      '7 nights in magnificent suite (50+ sqm) with panoramic views',
      '24-hour dedicated butler service',
      'Full board world-class cuisine by executive chef',
      'Unlimited Dom Pérignon and Grand Cru wines',
      'Personal PhD Egyptologist guide (fully private)',
      'Exclusive early/late access permits for all sites',
      'VIP access to 6 tombs including Seti I and Tutankhamun',
      'Private felucca sailing with Dom Pérignon and gourmet canapés',
      'Private limousine transfers throughout',
      'Unlimited spa treatments of your choice',
      'Private starlight dinners on deck',
      'Private Oriental show and belly dance performances',
      'Private Galabia party with champagne',
      'In-suite champagne service throughout',
      'Complimentary premium laundry and pressing',
      'Personalized leather-bound journey journal',
      'Exclusive departure gift from Egypt',
      'Helicopter or private aviation transfers available'
    ],
    'LUXURY TIER: Ultra-luxury boutique vessel (Sanctuary Sun Boat IV, Steam Ship Sudan, or Oberoi Zahra). Presidential/Royal suite with dedicated butler. Fully private tours with PhD Egyptologist. Maximum exclusivity and access. For UHNW clients, celebrities, royalty. Verify special tomb permits 2 weeks in advance. VIP airport services available.',
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
  RAISE NOTICE 'Migration 138 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for 8-Day Luxor Round Trip:';
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
WHERE cl.slug = '8-day-nile-cruise-luxor-round-trip'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
