-- =====================================================================
-- Migration 142: Add Cairo Day Tour - Pyramids, Museum, Khan el-Khalili
-- Description: Full-day Cairo experience with 4 tier variations
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
    'Cairo Day Tour: Pyramids, Sphinx, Egyptian Museum & Khan el-Khalili',
    'cairo-day-tour-pyramids-museum-khan-el-khalili',
    'Experience the essential wonders of Cairo in one magnificent day. Stand before the last surviving Wonder of the Ancient World at the Giza Pyramids, gaze into the enigmatic face of the Sphinx, explore the treasures of King Tutankhamun at the Egyptian Museum, and lose yourself in the aromatic labyrinth of Khan el-Khalili bazaar. From the monumental to the intimate, from 4,500-year-old stone to the living pulse of modern Cairo, this tour captures the full spectrum of Egypt''s capital city.',
    'Cairo & Giza, Egypt',
    '1 day (full day)',
    ARRAY['cairo', 'pyramids', 'giza', 'sphinx', 'egyptian-museum', 'khan-el-khalili', 'day-tour', 'tutankhamun'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 10,
      'city', 'Cairo',
      'highlights', ARRAY[
        'Great Pyramid of Khufu (Cheops)',
        'Pyramid of Khafre (Chephren)',
        'Pyramid of Menkaure (Mycerinus)',
        'The Great Sphinx',
        'Egyptian Museum',
        'Tutankhamun Collection',
        'Khan el-Khalili Bazaar'
      ],
      'included_meals', 'Lunch included',
      'transport', true
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
    'Cairo Day Tour - Classic Discovery',
    E'**Cairo''s Ancient Marvels: Pyramids, Museum, and Market Exploration**\n\nFour and a half thousand years of human achievement unfold in a single extraordinary day. From the last surviving Wonder of the Ancient World to the golden treasures of a boy king, from monumental stone to the living heartbeat of one of the world''s greatest cities—this is Cairo at its most essential and awe-inspiring.\n\n---\n\n**Morning: The Pyramids of Giza – Where History Began**\n\nYour Cairo adventure begins at the place where civilization itself seems to have begun: the **Pyramids of Giza**, rising from the desert plateau on the edge of the modern city like mountains built by gods.\n\nThe **Great Pyramid of Khufu (Cheops)** defies comprehension. Standing 146 meters tall when completed around 2560 BC, it was the tallest structure on Earth for nearly 4,000 years. Composed of approximately 2.3 million stone blocks, each weighing an average of 2.5 tons, its construction remains one of the greatest achievements in human history. How did ancient Egyptians—without wheels, pulleys, or iron tools—build something so vast, so precise, and so enduring? Your guide shares the latest theories and lets you draw your own conclusions.\n\nBeside it stands the **Pyramid of Khafre (Chephren)**, appearing taller than the Great Pyramid thanks to its elevated position—and still retaining a cap of the original white limestone casing that once covered all three pyramids, making them gleam like jewels in the desert sun. The smaller **Pyramid of Menkaure (Mycerinus)** completes the trio, its relative modesty belying the extraordinary craftsmanship of its interior chambers.\n\nThen, the monument that has launched a thousand mysteries: the **Great Sphinx**. Carved from a single ridge of limestone, this enigmatic guardian with the body of a lion and the face of a pharaoh has watched over the Giza plateau for 4,500 years. Stand before its weathered gaze and feel the weight of millennia pressing down—the Sphinx was already ancient when Cleopatra was born, already a mystery when the Greeks first visited.\n\nYour guide explains the latest archaeological discoveries, the theories about the Sphinx''s original appearance (it was once painted in vivid colors), and the ongoing debate about its true age and purpose.\n\n---\n\n**Midday: The Egyptian Museum – Treasury of the Pharaohs**\n\nAfter lunch, enter the **Egyptian Museum** in Tahrir Square—home to the most extraordinary collection of ancient artifacts on Earth.\n\nWith over 120,000 items spanning five millennia of Egyptian civilization, this legendary museum offers an overwhelming immersion in ancient achievement. Your guide navigates the highlights with expertise, ensuring you see the treasures that matter most.\n\nThe undisputed crown jewel: the **Treasures of Tutankhamun**. The golden death mask—11 kilograms of solid gold, inlaid with lapis lazuli and turquoise—is perhaps the most recognizable artifact in the world. But the full collection extends far beyond this single masterpiece: golden shrines, jeweled pectorals, alabaster canopic jars, a solid gold coffin, and thousands of objects that accompanied the boy king into eternity. Your guide explains the dramatic story of Howard Carter''s 1922 discovery—the sealed doorway, the famous first glimpse, the seven years required to catalogue the tomb''s contents.\n\nBeyond Tutankhamun, the museum holds treasures spanning the entire arc of Egyptian civilization: the Narmer Palette recording Egypt''s unification around 3100 BC, royal mummies that allow you to gaze upon the actual faces of pharaohs, delicate jewelry that rivals modern craftsmanship, and everyday objects that reveal the humanity behind the monuments.\n\n---\n\n**Afternoon: Khan el-Khalili – Cairo''s Living Heart**\n\nYour day concludes at **Khan el-Khalili**, Cairo''s legendary bazaar and one of the oldest markets in the Middle East, established in 1382 during the Mamluk era.\n\nStep through its arched gateways and enter a world of sensory overload—the aromatic clouds of freshly ground spices, the glint of brass and copper lamps, the kaleidoscope of hand-woven textiles, the musical calls of merchants inviting you to browse their wares. Navigate narrow alleyways lined with shops selling everything from exquisite gold and silver jewelry to alabaster vases, papyrus paintings, and hand-stitched leather goods.\n\nThis is not a tourist fabrication but a living, breathing marketplace where Cairenes have shopped, socialized, and done business for over six centuries. Artisans still practice crafts unchanged since the Mamluk sultans—coppersmiths hammering intricate patterns, jewelers setting stones by hand, perfumers blending essential oils from ancient recipes.\n\nPause at the historic **El-Fishawi Café**, operating continuously since 1773, for traditional mint tea amid the bazaar''s electric atmosphere. Watch the theatre of Cairo life unfold around you—a fitting conclusion to a day that has spanned 4,500 years of human civilization.\n\n*Meals: Lunch*',
    ARRAY[
      'Visit to all three Giza Pyramids and the Great Sphinx',
      'Guided tour of the Egyptian Museum',
      'Tutankhamun treasures collection',
      'Exploration of Khan el-Khalili bazaar',
      'Professional English-speaking Egyptologist guide',
      'Lunch included at local restaurant',
      'Air-conditioned transportation throughout'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Entrance fees to Giza Pyramids complex and Sphinx',
      'Entrance fee to the Egyptian Museum',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. Good value full-day Cairo experience. Note: Egyptian Museum may be the Grand Egyptian Museum (GEM) at Giza if fully opened. Confirm which museum at time of booking.',
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
    'Cairo Day Tour - Premium Experience',
    E'**The Definitive Cairo Experience**\n\nSee Cairo''s greatest treasures with the insight of an expert Egyptologist, the comfort of a premium vehicle, and the intimacy of a small group. From the Pyramids of Giza to the golden mask of Tutankhamun to the vibrant alleyways of Khan el-Khalili, this premium day tour reveals the full spectrum of Egypt''s magnificent capital—ancient wonders and living culture woven into one unforgettable day.\n\n---\n\n**Morning: The Pyramids of Giza – Monuments to Eternity**\n\nYour premium Cairo experience begins with an early start—arriving at the **Pyramids of Giza** before the midday crowds, when the desert air is cool and the morning light ideal for photography.\n\nYour experienced Egyptologist leads your small group (maximum 16 guests) to the **Great Pyramid of Khufu**, the last surviving Wonder of the Ancient World. Standing at its base, the scale becomes personal—each stone block reaches your waist, and 2.3 million of them rise to a height equivalent to a 48-story building. Your guide shares the latest archaeological theories about its construction, the workforce that built it (not slaves, but organized labor teams who left graffiti recording their pride), and the mathematical precision that still astonishes engineers.\n\nThe **Pyramid of Khafre** retains a dramatic cap of original white limestone casing at its summit—a tantalizing glimpse of how all three pyramids once appeared: gleaming white against the desert blue, visible for miles in every direction. The **Pyramid of Menkaure**, smallest of the three, reveals the evolution of pyramid construction and the intimate grandeur of its burial chambers.\n\nThen, the enigmatic **Great Sphinx**—4,500 years of silent vigil over the Giza plateau. Your guide explains the ongoing scholarly debates about its age, purpose, and the identity of the pharaoh whose face it may bear. Stand before it long enough to appreciate what the ancient Egyptians achieved: a monument so powerful that it still compels silence and wonder after nearly five millennia.\n\nTime is allowed for photographs from the famous panoramic viewpoint, where all three pyramids align against the desert sky.\n\n---\n\n**Midday: The Egyptian Museum – Treasures Unveiled**\n\nAfter a gourmet lunch at a quality restaurant with views of the pyramids or the Nile, enter the **Egyptian Museum** for a curated tour of its greatest treasures.\n\nYour Egyptologist has selected a route through the museum''s 120,000 artifacts that tells the complete story of Egyptian civilization—from the earliest dynastic period to the twilight of the pharaohs.\n\nThe **Tutankhamun Collection** anchors your visit. Your guide spends considerable time here, explaining not just what you see but what each object means: the golden death mask''s symbolism (each stripe of the nemes headdress, each inlaid stone carries meaning), the story of the tomb''s discovery by Howard Carter in 1922 (the suspense, the controversy, the "curse"), and the remarkable insight these 5,000 objects provide into a pharaoh who died at just 19 years of age.\n\nBeyond Tutankhamun, your guide highlights masterpieces most visitors walk past without knowing their significance: the Narmer Palette (recording Egypt''s unification 5,000 years ago), the Seated Scribe (whose rock-crystal eyes still seem to follow you), the Royal Mummy Room (where you can look upon the actual face of Ramesses the Great), and exquisite jewelry that demonstrates craftsmanship rivaling—and sometimes surpassing—anything produced today.\n\n---\n\n**Afternoon: Khan el-Khalili – The Senses Ignited**\n\nYour day culminates at **Khan el-Khalili**, Cairo''s 14th-century bazaar and one of the most atmospheric markets in the Islamic world.\n\nYour guide leads you through the labyrinthine alleyways with insider knowledge—pointing out the finest artisans, the most authentic shops, the hidden courtyards where craftsmen practice techniques unchanged for centuries. The sensory experience is extraordinary: mountains of saffron, cumin, and hibiscus; the ring of coppersmiths'' hammers; the shimmer of gold and silver in jewelers'' windows; the kaleidoscope of handwoven fabrics.\n\nPause at the legendary **El-Fishawi Café**, serving mint tea and Turkish coffee continuously since 1773. Nobel laureate Naguib Mahfouz wrote here; your guide shares stories of the literary and political figures who have gathered in this atmospheric space over the centuries.\n\nYour guide offers shopping advice for those who wish to purchase—how to identify quality, what constitutes fair prices, and where to find the best examples of Egyptian craftsmanship.\n\n*Meals: Lunch*',
    ARRAY[
      'Giza Pyramids with panoramic viewpoint photo stop',
      'Great Sphinx with extended visit time',
      'Curated Egyptian Museum tour with Tutankhamun focus',
      'Khan el-Khalili bazaar with insider guide',
      'Experienced Egyptologist guide (small groups max 16)',
      'Quality lunch with views',
      'Premium air-conditioned vehicle'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Entrance fees to Giza Pyramids complex, Sphinx, and Egyptian Museum',
      'Gourmet lunch at quality restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Panoramic viewpoint photo stop at Giza',
      'Bottled water and refreshments throughout',
      'Shopping guidance at Khan el-Khalili'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Curated museum route focuses on highlights. Guide provides shopping advice at Khan el-Khalili. Popular option for couples and discerning travelers.',
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
    'Cairo Day Tour - Deluxe Collection',
    E'**Cairo Revealed: A Private Journey Through Five Millennia**\n\nExperience Cairo''s greatest wonders with the exclusivity and depth they deserve. Your private Egyptologist, luxury vehicle, and VIP access transform a day of sightseeing into a day of genuine discovery. Enter the Great Pyramid itself. Spend unhurried time before Tutankhamun''s golden mask. Navigate Khan el-Khalili with an insider who knows every artisan by name. This is Cairo without compromise—ancient wonders experienced with modern luxury.\n\n---\n\n**Morning: The Pyramids of Giza – Intimate Encounters with Eternity**\n\nYour deluxe Cairo experience begins with early morning pickup in a luxury vehicle. Your private Egyptologist (guiding a maximum of 8 guests) shares Cairo''s story as you approach Giza—the city''s evolution from pharaonic Memphis to modern megalopolis, visible in layers as you drive.\n\nArriving at the **Pyramids of Giza** before the crowds, the plateau belongs almost to you alone. The morning light gilds the ancient stone, and the desert air carries a clarity that sharpens every detail.\n\nThe **Great Pyramid of Khufu** towers above you—and today, you go inside. Your deluxe tour includes **entrance to the Great Pyramid''s interior**, ascending the Grand Gallery to the King''s Chamber deep within the monument. Stand inside the granite sarcophagus chamber, the only sound your own breathing and the profound silence of 4,500 years of stone above you. This is an experience that changes your relationship with ancient Egypt—from admiration at a distance to visceral, physical encounter.\n\nOutside, your guide leads you to the panoramic viewpoint where all three pyramids align—**Khufu**, **Khafre** (its summit still capped with original white limestone), and **Menkaure**. Photography time is generous; your guide knows the angles that professionals use.\n\nThe **Great Sphinx** receives unhurried attention. Your Egyptologist shares insights unavailable to casual visitors: the ongoing debate about its age (some scholars argue it predates the pyramids by millennia), the evidence of water erosion on its flanks, and the story of its missing nose—not Napoleon''s fault, despite the legend.\n\n---\n\n**Midday: The Egyptian Museum – Behind the Glass**\n\nLunch at a premium restaurant—perhaps with terrace views of the pyramids or the Nile—features the best of Egyptian and international cuisine paired with refreshments.\n\nThe **Egyptian Museum** reveals its deepest treasures to those with expert guidance and time. Your private Egyptologist has designed a route that tells the complete story of Egyptian civilization while lingering at masterpieces that reward close attention.\n\nThe **Tutankhamun Collection** becomes a revelation under your guide''s scholarship. Beyond the famous golden mask (11 kg of solid gold, each detail laden with religious symbolism), discover objects that bring the boy king to life: his childhood throne, his hunting chariots, his golden sandals, the floral wreaths placed on his coffin—still recognizable after 3,300 years. Your guide shares Howard Carter''s own account of the discovery, making the drama of November 1922 feel immediate.\n\nThe **Royal Mummy Room** offers an extraordinary encounter—gazing upon the actual preserved faces of pharaohs whose monuments you''ve seen throughout Egypt: Ramesses II, Seti I, Hatshepsut. Your guide provides the historical context that transforms these preserved remains from curiosities into human connections across millennia.\n\nYour guide also reveals the museum''s hidden gems: exquisite Middle Kingdom jewelry that surpasses modern craftsmanship, the Fayum portraits (hauntingly realistic Roman-era paintings), and artifacts that illuminate daily life in ancient Egypt—cosmetics, games, love letters, medical instruments.\n\n---\n\n**Afternoon: Khan el-Khalili – The Insider''s Bazaar**\n\nYour day culminates at **Khan el-Khalili**, experienced as few visitors ever do—with a guide who knows the bazaar intimately.\n\nBypass the tourist shops and enter the real Khan: hidden workshops where **coppersmiths** hammer intricate geometric patterns using techniques unchanged since the Mamluk era. Watch **gold and silver artisans** create jewelry by hand, their methods identical to those depicted in pharaonic tomb paintings. Visit a **perfumer** who blends essential oils from recipes passed down through generations—jasmine, sandalwood, amber, lotus.\n\nYour guide navigates the labyrinth with insider knowledge, introducing you to master craftsmen and ensuring fair prices for any purchases. This is not shopping—it is cultural immersion, the living continuation of traditions stretching back centuries.\n\nPause at **El-Fishawi Café** for mint tea, its mirrored walls and brass lanterns creating an atmosphere that hasn''t changed since the 18th century. Your guide shares the stories of Nobel laureates, revolutionaries, and artists who have gathered here over the centuries.\n\n*Meals: Lunch*',
    ARRAY[
      'Entry inside the Great Pyramid of Khufu',
      'Private Egyptologist guide (max 8 guests)',
      'VIP panoramic viewpoint at Giza',
      'Extended Tutankhamun collection tour',
      'Royal Mummy Room visit',
      'Insider Khan el-Khalili with artisan workshops',
      'Premium lunch with views',
      'Luxury vehicle transportation'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Entrance fees to Giza complex, Sphinx, and Egyptian Museum',
      'Entry inside the Great Pyramid of Khufu',
      'Royal Mummy Room entrance',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel/airport pickup and drop-off',
      'Panoramic photo stop with professional angles guidance',
      'Artisan workshop visits at Khan el-Khalili',
      'Complimentary refreshments throughout',
      'Shopping assistance and fair-price guidance'
    ],
    'DELUXE TIER: Private/semi-private tour (max 8), luxury vehicle, premium lunch venue. Entry inside Great Pyramid is key upgrade. Royal Mummy Room included. Artisan workshop visits at Khan el-Khalili arranged in advance. For well-traveled clients. Note: Great Pyramid interior tickets are limited—book ahead.',
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
    'Cairo Day Tour - Ultimate Luxury',
    E'**Cairo as No One Else Experiences It**\n\nThis is not a tour. It is a private audience with 4,500 years of civilization, conducted by one of Egypt''s foremost scholars, in conditions of absolute exclusivity. Enter the Great Pyramid at a reserved time with no crowds. Stand before Tutankhamun''s treasures with a PhD Egyptologist who has published on their significance. Navigate Khan el-Khalili with a personal guide who introduces you to master artisans in their private workshops. Travel in a luxury limousine. Dine at Cairo''s finest. This is Cairo revealed to its depths—for those who accept nothing less than the extraordinary.\n\n---\n\n**Morning: The Pyramids of Giza – A Private Audience with Eternity**\n\nYour private limousine collects you at dawn for the most exclusive Giza experience available. Your personal PhD-qualified Egyptologist—one of Egypt''s foremost scholars of Old Kingdom architecture—accompanies you throughout.\n\nArriving at the **Pyramids of Giza** with **VIP early access**, the plateau is virtually empty. In the soft morning light, the three pyramids stand exactly as they have for 45 centuries—and for these first moments, they stand for you alone.\n\nThe **Great Pyramid of Khufu** receives the attention it demands. Your guide shares insights available only from decades of scholarly research: the internal ramp theory of construction, the precision of the base (level to within 2.1 centimeters across 230 meters), the astronomical alignments that connect the pyramid to the stars of Orion. Then, at your **reserved entry time**, you enter the pyramid itself—ascending the Grand Gallery with its corbelled ceiling to the King''s Chamber, where a granite sarcophagus has rested in silence for over four millennia. With controlled visitor numbers at your reserved time, the experience is intimate and profound.\n\nThe **Pyramid of Khafre** and **Pyramid of Menkaure** receive expert attention, your guide revealing architectural details and historical context that transform monuments into stories. At the panoramic viewpoint, your driver has arranged a private refreshment station—chilled champagne and gourmet canapés with all three pyramids as your backdrop.\n\nThe **Great Sphinx** commands a private extended visit. Your scholar shares the latest research findings, ongoing restoration efforts, and the profound questions this monument still poses to archaeology. Stand before its face in unhurried contemplation—an encounter with one of humanity''s most enigmatic creations.\n\n---\n\n**Midday: The Egyptian Museum – A Scholar''s Journey**\n\nLunch at Cairo''s finest restaurant—a venue where the cuisine matches the day''s extraordinary standard—provides a moment of refined pleasure.\n\nThe **Egyptian Museum** becomes a private masterclass under your PhD guide''s direction. This is not a highlights tour but a scholarly journey through the full arc of Egyptian civilization, the pace and focus adapted entirely to your interests.\n\nThe **Tutankhamun Collection** is experienced as its discoverer Howard Carter experienced it—with wonder, patience, and the cumulative revelation of one extraordinary object after another. Your guide, who has published on the collection, reveals the symbolism of the golden mask''s every detail, the story behind the curse legend (and its debunking), the objects that illuminate the boy king as a human being rather than a myth.\n\nThe **Royal Mummy Room** becomes a private encounter with the actual faces of Egypt''s greatest rulers. Your guide identifies each pharaoh, shares their biography, and connects their preserved remains to the monuments and temples you may have visited elsewhere in Egypt.\n\nYour scholar also curates a private route through the museum''s lesser-known treasures: the **Amarna collection** revealing Akhenaten''s revolutionary art, the **Fayum portraits** with their haunting psychological realism, Middle Kingdom jewelry of breathtaking sophistication, and artifacts that reveal the daily reality of ancient Egyptian life.\n\n---\n\n**Afternoon: Khan el-Khalili – The Private Bazaar**\n\nThe legendary **Khan el-Khalili** opens its secrets to those with the right introduction—and your guide has been arranging private artisan visits in this bazaar for decades.\n\nBypass the public market entirely and enter private workshops: a **master goldsmith** who creates jewelry using techniques depicted in pharaonic tomb paintings, demonstrating his craft as you watch and creating bespoke pieces on commission. A **traditional perfumer** whose family has blended essential oils for five generations, creating a personal fragrance from ancient recipes. A **master coppersmith** whose geometric patterns follow mathematical principles established in the Islamic Golden Age.\n\nEach artisan is a personal introduction, not a tourist stop—conversations over tea, demonstrations of craft, the opportunity to commission one-of-a-kind pieces.\n\nPause at a private corner of **El-Fishawi Café** or a more exclusive tea house arranged for you, where traditional mint tea, Turkish coffee, and shisha (if desired) accompany the gentle close of an extraordinary day.\n\nYour limousine returns you to your hotel, carrying memories and perhaps treasures from a day that revealed Cairo in its fullest depth and brilliance.\n\n*Meals: Lunch*',
    ARRAY[
      'VIP early access to Giza Pyramids',
      'Reserved entry inside the Great Pyramid',
      'Champagne refreshments at panoramic viewpoint',
      'Personal PhD-qualified Egyptologist',
      'Scholarly Egyptian Museum tour with Royal Mummy Room',
      'Private artisan workshop visits at Khan el-Khalili',
      'Lunch at Cairo''s finest restaurant',
      'Private luxury limousine throughout'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'VIP early access to Giza Pyramids complex',
      'Reserved-time entry inside the Great Pyramid of Khufu',
      'Entrance to Royal Mummy Room',
      'All entrance fees to Giza, Sphinx, and Egyptian Museum',
      'Private champagne and canapés at Giza panoramic viewpoint',
      'Lunch at Cairo''s top-rated fine dining restaurant',
      'Private luxury limousine (Mercedes S-Class or equivalent)',
      'Hotel/airport pickup and drop-off',
      'Private artisan workshop visits at Khan el-Khalili',
      'Personal shopping assistance with bespoke commissioning',
      'Complimentary premium refreshments throughout',
      'Private tea service at historic café'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist, luxury limousine, VIP access everywhere. Reserved Great Pyramid entry (limited tickets—book 2+ weeks ahead). Private artisan introductions at Khan el-Khalili arranged in advance. Fine dining lunch at top venue (Mena House, Nile Ritz, or equivalent). For UHNW clients who want absolute exclusivity.',
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
  RAISE NOTICE 'Migration 142 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Cairo Day Tour:';
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
WHERE cl.slug = 'cairo-day-tour-pyramids-museum-khan-el-khalili'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
