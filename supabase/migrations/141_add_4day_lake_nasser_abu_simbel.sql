-- =====================================================================
-- Migration 141: Add 4-Day Lake Nasser Cruise from Abu Simbel Content
-- Description: Reverse Lake Nasser cruise Abu Simbel to Aswan, 4 tiers
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
    '4-Day Lake Nasser Cruise: Abu Simbel to Aswan',
    '4-day-lake-nasser-cruise-abu-simbel-aswan',
    'Begin your Lake Nasser odyssey at the most spectacular monument in all Egypt—the colossal temples of Abu Simbel—and sail northward through the vast Saharan waterscape to Aswan. This 4-day voyage reveals the rescued Nubian temples in reverse, from the grandest to the most intimate: Qasr Ibrim''s fortress ruins viewed from the water, the ancient paintings of Amada, the sphinx-lined avenue of Wadi al-Seboua reached by camel, and the relocated marvels of Kalabsha. A journey from wonder to wonder across Egypt''s inland sea.',
    'Abu Simbel to Aswan, Lake Nasser, Egypt',
    '4 days / 3 nights',
    ARRAY['lake-nasser', 'abu-simbel', 'aswan', 'nubian-temples', 'cruise', 'full-board', 'kalabsha', 'camel-ride'],
    jsonb_build_object(
      'route', 'Abu Simbel to Aswan (Lake Nasser)',
      'direction', 'north',
      'nights', 3,
      'days', 4,
      'embarkation', 'Abu Simbel',
      'disembarkation', 'Aswan',
      'water_body', 'Lake Nasser',
      'highlights', ARRAY[
        'Abu Simbel Temples',
        'Qasr Ibrim (from water)',
        'Amada Temple',
        'Al-Deir Temple',
        'Tomb of Pennut',
        'Wadi al-Seboua Temple',
        'Camel ride to Al-Dakka and Mehraka',
        'Kiosk of Kertassi',
        'Beit al-Wali',
        'Kalabsha Temple'
      ],
      'included_meals', 'Full board (all meals)',
      'cruise_type', 'lake_nasser_cruise',
      'camel_ride', true
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
    '4-Day Lake Nasser Cruise - Classic Discovery',
    E'**From Colossal to Intimate: Egypt''s Hidden Voyage**\n\nBegin where most journeys end—at the colossal temples of Abu Simbel, the most awe-inspiring monument in all Egypt—and sail northward across the vast stillness of Lake Nasser toward Aswan. This 4-day voyage reveals rescued Nubian temples in descending scale, from the overwhelming to the exquisite, each standing in splendid isolation on desert shores that few travelers ever reach. Cross the Sahara by camel, view a medieval fortress from the water, and discover an Egypt that exists beyond the guidebooks.\n\n---\n\n**Day 1: Abu Simbel – Beginning at the Summit**\n\nYour adventure begins in Abu Simbel, the heartland of ancient Nubia, where the most extraordinary monuments of the pharaonic world await.\n\nArrive at Abu Simbel and board your Lake Nasser cruise ship, moored within sight of the temples themselves. After settling into your cabin and enjoying a welcome lunch, the afternoon brings the journey''s first—and greatest—revelation.\n\nThe **Abu Simbel Temples** defy every expectation. Four colossal seated figures of Ramesses II—each 20 meters tall—are carved directly into the cliff face, their scale almost incomprehensible until you stand at their feet and realize that your entire body reaches only to the pharaoh''s shin. Built in the 13th century BC to project Egyptian power into Nubia and honor the gods, this is arguably the most impressive monument ever created by human hands.\n\nStep inside the **Great Temple** and discover the Hypostyle Hall, where eight Osiride statues of Ramesses support the carved ceiling. Continue deeper through progressively smaller chambers to the sanctuary, where four seated gods wait in eternal darkness. Your guide explains the extraordinary solar alignment: twice a year—on February 22 and October 22—the rising sun penetrates 60 meters of rock to illuminate three of the four statues, a feat of astronomical engineering that still functions after 3,200 years.\n\nBeside it stands the **Temple of Nefertari**, dedicated to Ramesses'' beloved queen and the goddess Hathor. Six standing figures grace the facade—four of Ramesses and two of Nefertari, depicted at the same monumental scale as her husband. Your guide explains the extraordinary rarity of this honor—a testament to a love that Ramesses wished to immortalize in stone.\n\nReturn to the ship for dinner as darkness falls and the temples are illuminated, their colossal figures reflected in the still waters of the lake. Above, the Saharan sky blazes with stars—no light pollution for hundreds of kilometers, the Milky Way burning with a brilliance the modern world has almost forgotten.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Qasr Ibrim, Amada, and the Ancient Frontier**\n\nThe ship sails northward through the dawn, and a unique morning experience awaits: viewing **Qasr Ibrim** from the sundeck. This is the only major archaeological site in Lower Nubia that was not relocated—the rising waters of Lake Nasser transformed it from a hilltop fortress into an island. For over 3,000 years, from pharaonic times through the Ottoman period, this strategic citadel controlled trade along the Nile. Landing is prohibited to protect ongoing excavations, but from the water, its weathered walls and tumbled columns tell a story of continuity unmatched anywhere in Egypt.\n\nThe ship moors and you step ashore to explore three remarkable sites. **Amada Temple**, the oldest surviving monument on Lake Nasser, was built by Thutmose III and Amenhotep II in the 15th century BC. Inside, the reliefs retain colors of astonishing vividness—delicate blues, rich reds, gleaming golds—that seem impossible after 3,500 years. Your guide translates inscriptions that reveal the inner workings of pharaonic Egypt: military campaigns, diplomatic triumphs, and the daily administration of an ancient empire.\n\nNearby, **Al-Deir** (the "Monastery") is a rock-cut temple built by Ramesses II, later converted to a Coptic church. Its carved figures of the pharaoh making offerings to the gods retain remarkable detail, while traces of Coptic crosses and saints create a fascinating palimpsest of Egyptian religious history.\n\nThe **Tomb of Pennut**, a local Nubian official, offers an intimate contrast to the monumental temples. His burial chamber''s painted scenes of daily life—harvesting, fishing, feasting—provide a vivid window into the world beyond the royal court.\n\nSail onward toward Wadi al-Seboua as the sun sets over the Saharan landscape. Dinner aboard is accompanied by the profound silence of Lake Nasser—a silence so deep it becomes its own kind of beauty.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua – Lions of the Desert**\n\nThe morning brings **Wadi al-Seboua**, the "Valley of the Lions," named for the avenue of sphinx-like figures that guard its entrance. This temple, built by Ramesses II, blends Egyptian and Nubian architectural traditions in fascinating ways. A Christian church was later built inside, creating one of Egypt''s most intriguing cultural layers—pharaonic gods and Coptic saints sharing the same ancient walls.\n\nThen comes the day''s adventure: a **camel ride** through the desert to the temples of **Al-Dakka** and **Mehraka**. The journey itself is unforgettable—rocking gently atop your camel as the vast Saharan landscape stretches to every horizon, the silence broken only by the animal''s footfalls and the whisper of wind across sand. Al-Dakka''s temple, with its well-preserved pylon, was built over several centuries by Ptolemaic and Roman rulers. Mehraka, though smaller, offers intimate charm and commanding views of the lake that seem to stretch to the edge of the world.\n\nReturn to the ship and set sail toward Aswan as the afternoon unfolds. Watch the landscape transform—still remote, still magnificent, but the signs of the approaching Nile Valley begin to appear. The shifting desert light paints the shores in endlessly changing shades of gold, amber, and rose.\n\nDinner aboard marks your final evening on Lake Nasser. The stars appear one last time in their full Saharan brilliance—a farewell gift from the desert.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Kalabsha, Beit al-Wali, and Farewell**\n\nYour final morning reveals three rescued monuments clustered near the High Dam—a fitting conclusion to your journey from the monumental to the intimate.\n\nThe **Kiosk of Kertassi** greets you first—a graceful Roman-era structure with Hathor-headed columns framing panoramic views of the lake. Its elegant simplicity offers a gentle beginning to the day, a reminder that ancient architecture didn''t always need to overwhelm in order to inspire.\n\n**Beit al-Wali**, a rock-cut temple built by a young Ramesses II, contains some of the most vivid and detailed reliefs in all Egypt. Battle scenes depict campaigns against Nubians and Libyans with extraordinary immediacy—charging horses, fleeing enemies, the young pharaoh standing tall in his chariot. Scenes of tribute and daily life provide a vivid counterpoint, capturing the richness of Nubian culture.\n\nThe morning concludes at **Kalabsha Temple**, the largest free-standing temple of Egyptian Nubia. Originally built during the reign of Augustus Caesar and dedicated to the Nubian god Mandulis, this impressive monument was relocated after the creation of the High Dam—dismantled into 13,000 blocks and reassembled at its present site. Its massive walls, carved with scenes of pharaohs making offerings to both Nubian and Egyptian gods, testify to the cultural fusion that made this region unique in the ancient world.\n\nReturn to the ship for a farewell breakfast, then transfer to Aswan Airport. You carry with you memories of a journey most travelers never make—from the colossal majesty of Abu Simbel to the intimate beauty of Nubian temples standing in desert solitude, and the vast, magnificent silence of Lake Nasser stretching between them.\n\n*Meals: Breakfast*',
    ARRAY[
      'Comfortable accommodation on Lake Nasser cruiser',
      'Full board dining throughout the voyage',
      'Professional English-speaking Egyptologist guide',
      'All temple entrance fees included',
      'Abu Simbel Temples exploration on arrival day',
      'Camel ride through the desert to Al-Dakka and Mehraka',
      'Scenic viewing of Qasr Ibrim from the water',
      'Transfer to Aswan Airport on departure'
    ],
    ARRAY[
      '3 nights accommodation in comfortable standard cabin',
      'Full board: 3 breakfasts, 3 lunches, 3 dinners',
      'Expert guided tours at all archaeological sites',
      'Entrance fees to Abu Simbel and all temples mentioned',
      'Camel ride to Al-Dakka and Mehraka',
      'Scenic cruise past Qasr Ibrim',
      'Transfer to Aswan Airport on departure',
      'Onboard entertainment and activities'
    ],
    'BUDGET TIER: Standard Lake Nasser cruise vessel, twin/double cabin, shared group tours. Reverse direction (Abu Simbel to Aswan) means clients arrive by air at Abu Simbel. Very limited vessel availability—only 3-4 ships operate Lake Nasser. Book well in advance.',
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
    '4-Day Lake Nasser Cruise - Premium Experience',
    E'**Beginning with Greatness**\n\nThis premium 4-day cruise reverses the traditional Lake Nasser route, beginning with the supreme climax—Abu Simbel—and sailing northward to Aswan through a corridor of rescued Nubian temples. Aboard a first-class vessel with refined dining and intimate touring groups, you''ll experience ancient monuments that most travelers never reach, cross the desert by camel, and discover an Egypt that exists far beyond the familiar Nile Valley.\n\n---\n\n**Day 1: Abu Simbel – The Grand Overture**\n\nYour premium Lake Nasser experience begins with the most dramatic possible opening: arrival at Abu Simbel, where the most spectacular monuments in all Egypt await.\n\nA representative greets you at Abu Simbel Airport and escorts you to your first-class cruise ship, moored within sight of the temples. A champagne welcome and gourmet lunch set the tone for the days ahead.\n\nThe afternoon brings the **Abu Simbel Temples** with your experienced Egyptologist leading your small group (maximum 16 guests). The **Great Temple of Ramesses II** stuns with its four colossal seated figures—each 20 meters tall—carved from the cliff face with a precision that defies the technology of 1250 BC. Step inside to discover the Hypostyle Hall, where Osiride statues of the pharaoh support a ceiling painted with sacred vultures. Your guide explains each chamber''s purpose and symbolism as you penetrate deeper into the mountain, finally reaching the sanctuary where four seated gods have waited in darkness for 32 centuries.\n\nThe science is as remarkable as the art. Your guide explains the solar alignment that twice yearly sends sunlight 60 meters into the rock to illuminate three deities��and the engineering miracle of the 1960s relocation, when the entire mountain was cut apart and reassembled 65 meters higher to escape Lake Nasser''s rising waters.\n\nThe **Temple of Nefertari** stands alongside, dedicated to Ramesses'' beloved queen. Your guide explains why Nefertari''s equal-sized depiction on the facade represents an extraordinary honor virtually unique in Egyptian history—a pharaoh declaring his queen his equal before the gods.\n\nReturn to the ship for dinner as the temples are illuminated against the night sky, their reflections shimmering in the dark water. Take in the Saharan starscape from the sundeck—a sight that humbles and inspires in equal measure.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Qasr Ibrim, Amada, and the Nubian Frontier**\n\nBreakfast accompanies a unique experience: viewing **Qasr Ibrim** from the water as your guide provides expert commentary. This fortress—the only major Nubian site not relocated—served as a military, religious, and administrative center from pharaonic times through the Ottoman period. Its crumbling walls tell 3,000 years of history in a single dramatic tableau.\n\nStep ashore to explore monuments that reveal Nubia''s extraordinary cultural richness. **Amada Temple**—the oldest on Lake Nasser—preserves interior paintings of remarkable beauty and historical inscriptions of immense scholarly value. Your guide spends considerable time here, translating texts that reveal military campaigns, diplomatic relationships, and the administrative genius of pharaonic Egypt.\n\n**Al-Deir**, a rock-cut temple of Ramesses II later converted to a Coptic church, offers a fascinating cultural palimpsest—pharaonic gods and Christian saints sharing walls in a way that captures millennia of Egyptian spiritual evolution. The **Tomb of Pennut**, a local Nubian official, provides intimate glimpses into daily life beyond the royal court—scenes of harvest, celebration, and the afterlife imagined in warm, human terms.\n\nSail toward Wadi al-Seboua as evening falls. Tonight''s dinner features Nubian-inspired specialties—the cuisine of a civilization that flourished alongside pharaonic Egypt for three millennia.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua – Desert Adventure**\n\n**Wadi al-Seboua**''s sphinx-lined entrance glows in the morning light as your guide reveals this temple''s remarkable story. Built by Ramesses II, it became a Christian church centuries later—pharaonic reliefs visible beneath Coptic paintings, creating a timeline of belief visible in a single space.\n\nThe morning''s highlight: a **camel ride** across the desert to the temples of **Al-Dakka** and **Mehraka**, with refreshments provided for the journey. The experience is timeless—vast Saharan landscapes, the soft rhythm of camel footfalls on sand, a silence so complete that the modern world ceases to exist. Al-Dakka''s Ptolemaic temple rewards the crossing with well-preserved reliefs and commanding architecture. Mehraka offers intimate beauty and views across the lake that stretch to infinity.\n\nReturn to the ship and sail northward toward Aswan. The afternoon unfolds at a leisurely pace—afternoon tea on the sundeck, the landscape growing gradually less remote as you approach the Nile Valley. Watch for crocodiles on the shores and birds of prey overhead.\n\nYour final dinner aboard celebrates three extraordinary days on Lake Nasser. Regional specialties, carefully selected wines, and the last Saharan sunset of your voyage paint a fitting farewell.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Kalabsha and Farewell to Nubia**\n\nYour final morning reveals three rescued monuments near the High Dam—a graceful conclusion to your journey.\n\nThe **Kiosk of Kertassi**, with its Hathor-headed columns framing lake views, provides a gentle opening. **Beit al-Wali**, Ramesses II''s rock-cut temple, astonishes with battle reliefs of extraordinary vividness—charging chariots and falling enemies depicted with an energy that rivals modern illustration.\n\n**Kalabsha Temple** concludes your exploration—the largest free-standing Nubian temple, dedicated to the Nubian god Mandulis and relocated in 13,000 blocks after the High Dam''s creation. Its walls, carved with offerings to both Nubian and Egyptian deities, encapsulate the cultural fusion that made this region unique.\n\nReturn to the ship for a farewell breakfast, then your private transfer to Aswan Airport. You leave carrying memories of a journey that most travelers never make—from the overwhelming majesty of Abu Simbel to the desert silence of Wadi al-Seboua, and the vast, beautiful emptiness of Lake Nasser between.\n\n*Meals: Breakfast*',
    ARRAY[
      'First-class cabin with panoramic lake views',
      'Gourmet dining with Egyptian and Nubian cuisine',
      'Experienced Egyptologist guide (small groups max 16)',
      'Abu Simbel extended visit on arrival day',
      'All temple entrance fees included',
      'Camel ride with refreshments to desert temples',
      'Scenic viewing of Qasr Ibrim with expert commentary',
      'Private transfer to Aswan Airport'
    ],
    ARRAY[
      '3 nights in superior first-class cabin with lake views',
      'Full board gourmet dining with welcome champagne',
      'Complimentary soft drinks, tea and coffee throughout',
      'Small group guided tours (maximum 16 guests)',
      'All entrance fees including Abu Simbel',
      'Camel ride with refreshments to Al-Dakka and Mehraka',
      'Guided cruise past Qasr Ibrim with commentary',
      'Nubian-themed dinner evening',
      'Private transfer to Aswan Airport',
      'Daily afternoon tea service',
      'Stargazing program on deck',
      'Complimentary Wi-Fi onboard (where available)'
    ],
    'STANDARD TIER: First-class Lake Nasser vessel, superior cabin, small group tours. Reverse route starts with Abu Simbel climax—clients arrive by air. Very limited availability—only 3-4 ships. Book 3-6 months ahead. Aswan Airport departure—easy connections to Cairo, Luxor.',
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
    '4-Day Lake Nasser Cruise - Deluxe Collection',
    E'**The Grandest Opening in Travel**\n\nNo other journey begins like this one. Step off a plane at Abu Simbel and within hours stand before the most colossal monuments ever carved by human hands. Then sail northward across Egypt''s inland sea, exploring rescued Nubian temples in pampered luxury—private balcony cabin, private Egyptologist, VIP access, champagne camel rides through the Sahara. This deluxe 4-day cruise distills the Lake Nasser experience into its purest, most extraordinary form.\n\n---\n\n**Day 1: Abu Simbel – A Beginning Beyond Compare**\n\nYour deluxe Lake Nasser journey opens with the most spectacular scene in all ancient Egypt.\n\nA private transfer from Abu Simbel Airport delivers you to your boutique cruise ship, moored directly before the temples. The crew welcomes you with champagne and chilled towels as you step aboard to your balcony cabin—a sanctuary of refined elegance with floor-to-ceiling windows opening to your private outdoor space. From here, you can see the colossal faces of Ramesses gazing across the water.\n\nAfter a gourmet lunch with premium wines, your private Egyptologist (guiding a maximum of 8 guests) leads you to the **Abu Simbel Temples** for an extended exploration that transcends ordinary visits.\n\nThe **Great Temple of Ramesses II** demands superlatives and defies them. Four seated figures—each 20 meters tall—are carved from the living rock with a precision that humbles modern engineering. Your guide spends over two hours revealing the temple''s secrets: the Hypostyle Hall''s Osiride statues, the astronomical chamber with its solar alignment (still functioning after 32 centuries), the sanctuary''s four seated gods, and the astonishing story of the 1960s relocation—how engineers cut an entire mountain apart and reassembled it 65 meters higher.\n\nThe **Temple of Nefertari** receives equal attention. Your guide reveals the extraordinary love story immortalized in stone—a pharaoh who honored his queen with a monument rivaling his own, an act of devotion virtually unique in 3,000 years of Egyptian history.\n\nReturn to the ship for a multi-course dinner on your balcony, the illuminated temples reflected in the dark water. The Saharan sky ablaze with stars completes a day that ranks among the most extraordinary in all travel.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Qasr Ibrim, Amada, and the Heart of Nubia**\n\nBreakfast on your private balcony accompanies the morning''s first experience: **Qasr Ibrim** gliding past as your Egyptologist provides expert commentary from beside you. This fortress, the only Nubian site left in situ, encapsulates 3,000 years of history—pharaonic, Meroitic, Christian, Ottoman—in its crumbling walls.\n\nStep ashore for private exploration of Nubia''s most remarkable sites. **Amada Temple**—the oldest on Lake Nasser—opens its wonders to your small group. Your guide spends unhurried time before paintings of impossible freshness, translating inscriptions that bring pharaonic administration, diplomacy, and warfare vividly to life.\n\n**Al-Deir''s** cultural layers—pharaonic gods beneath Coptic saints—gain new meaning under your Egyptologist''s expert eye. The **Tomb of Pennut** offers intimate scenes of Nubian daily life: harvesting, fishing, feasting, preparing for the afterlife—a warm, human counterpoint to the monumental temples.\n\nSail toward Wadi al-Seboua through the afternoon. Perhaps a spa treatment, a swim, or simply watching the magnificent emptiness of Lake Nasser from your balcony. Tonight''s seven-course tasting menu celebrates Nubian and Upper Egyptian culinary traditions, paired with premium wines.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua – A Royal Desert Crossing**\n\n**Wadi al-Seboua**''s sphinx avenue glows gold in the soft morning light. Your private guide reveals the temple''s extraordinary layering—pharaonic reliefs and Coptic paintings sharing walls, millennia of spiritual evolution visible in a single space.\n\nThe morning''s highlight: a **premium camel ride** through the Sahara to **Al-Dakka** and **Mehraka**. This is no ordinary desert crossing—vintage champagne, gourmet provisions, cushioned saddles, and Nubian guides whose families have navigated this terrain for centuries. The ride itself is transcendent: vast landscapes stretching to every horizon, silence so complete you can hear your own heartbeat, a connection to the ancient world impossible to find elsewhere.\n\nAl-Dakka''s Ptolemaic temple and Mehraka''s intimate sanctuary reward your crossing with architecture and views that belong to you alone—other visitors are hours away.\n\nReturn to the ship and sail northward. The afternoon unfolds on your balcony as the landscape slowly transforms toward Aswan. Your final dinner on Lake Nasser is a private affair on the top deck: the chef''s finest creations, champagne, and the last Saharan sunset of your voyage painting the sky in colors that no photograph can capture.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Kalabsha and Farewell**\n\nYour final morning reveals three rescued monuments near the High Dam—each a jewel of ancient architecture.\n\nThe **Kiosk of Kertassi''s** Hathor-headed columns frame infinite lake views with Roman-era elegance. **Beit al-Wali** astonishes with battle reliefs of extraordinary energy—the young Ramesses II at war, every detail vivid after 32 centuries. **Kalabsha Temple**, the largest free-standing Nubian temple, concludes your journey with the cultural fusion that defined this region—the Nubian god Mandulis honored in pharaonic style by Roman emperors.\n\nReturn for a farewell gourmet breakfast. Your luxury transfer delivers you to Aswan Airport with memories of a journey beyond the ordinary—from the overwhelming majesty of Abu Simbel through the desert silence of Lake Nasser to the intimate beauty of Nubia''s rescued temples.\n\n*Meals: Breakfast*',
    ARRAY[
      'Spacious balcony cabin with premium amenities',
      'Gourmet multi-course dining with premium wines',
      'Private Egyptologist guide (max 8 guests)',
      'Extended Abu Simbel visit on arrival day',
      'All temple entrance fees included',
      'Premium camel ride with champagne provisions',
      'Private top-deck farewell dinner',
      'Full spa access with complimentary treatment'
    ],
    ARRAY[
      '3 nights in deluxe balcony cabin (28-32 sqm)',
      'Butler-style service and premium amenities',
      'Full board gourmet cuisine with premium wine pairings',
      'Private Egyptologist guide (couples or max 8 guests)',
      'All entrance fees including Abu Simbel',
      'Extended 2+ hour Abu Simbel private exploration',
      'Premium camel ride with champagne and cushioned saddles',
      'Luxury vehicle transfers',
      'Full spa access with one complimentary treatment',
      'Seven-course Nubian tasting menu',
      'Complimentary premium beverages throughout',
      'Private farewell dinner on top deck',
      'Complimentary laundry service',
      'Stargazing with captain''s telescope'
    ],
    'DELUXE TIER: Premium Lake Nasser vessel, balcony cabin, private/semi-private tours. Reverse route starting at Abu Simbel is dramatic opening. Extremely limited availability. Book 4-6 months ahead. Aswan departure is easier logistics than Abu Simbel departure.',
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
    '4-Day Lake Nasser Cruise - Ultimate Luxury',
    E'**Where Civilization Meets the Infinite**\n\nThis is the journey that redefines what travel can be. Arrive by air at the most remote temple in Egypt. Stand before colossal monuments in the silence of the Sahara. Sail an inland sea with your own butler, your own PhD scholar, your own suite overlooking waters that submerged an entire civilization. Cross the desert by camel with Dom Pérignon. Explore temples that receive perhaps a hundred visitors a week. This ultra-luxury 4-day voyage from Abu Simbel to Aswan is not merely exclusive—it is an encounter with the sublime.\n\n---\n\n**Day 1: Abu Simbel – The Supreme Encounter**\n\nYour extraordinary journey begins with the most dramatic arrival in all travel: landing at Abu Simbel, where the Sahara meets Lake Nasser and the most colossal monuments of the ancient world await.\n\nYour private limousine delivers you from the airport to your ship, moored in the shadow of the temples. The captain greets you personally as you board to Dom Pérignon and traditional Nubian music. Your magnificent suite—50 square meters of refined elegance with panoramic windows, separate living area, private balcony, and marble bathroom—will be your floating palace for three extraordinary nights. Your personal butler has already arranged everything to your preferences.\n\nA private lunch on your balcony offers the surreal pleasure of dining while gazing at the colossal faces of Ramesses II across the water.\n\nThe afternoon brings the **Abu Simbel Temples** with **exclusive access** and your personal PhD-qualified Egyptologist—one of the foremost scholars of Nubian archaeology. The **Great Temple** reveals its secrets over a private exploration of three hours or more. Access chambers rarely visited. Examine reliefs in extraordinary detail. Stand in the sanctuary where four gods have waited 32 centuries in darkness, and understand—through your scholar''s expert illumination—why this mountain was carved, how it was saved, and what it means to human civilization.\n\nYour guide reveals the full story of the 1960s relocation with the authority of one who has studied the engineering files: how 1,036 blocks, each weighing up to 30 tons, were cut, numbered, and reassembled 65 meters higher. Evidence of this miracle is visible only to those who know where to look—and today, you do.\n\nThe **Temple of Nefertari** receives equally unhurried attention. The love story of Ramesses and Nefertari—told through the unprecedented honor of equal depiction—gains profound new dimensions through your scholar''s expertise.\n\nYour first evening sets the standard: a private starlight dinner on the top deck, Abu Simbel illuminated before you, Dom Pérignon flowing freely, the executive chef''s masterwork unfolding course by course. Above, the Saharan sky reveals more stars than you knew existed.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Qasr Ibrim, Amada, and the Secret Temples**\n\nBreakfast arrives on your balcony as **Qasr Ibrim** passes—your Egyptologist providing private commentary on this fortress that encapsulates 3,000 years of Nubian history in its crumbling walls.\n\nStep ashore for private exploration of sites that receive perhaps a dozen visitors a day. **Amada Temple''s** painted interior—the oldest monument on Lake Nasser—blazes with colors that defy their 3,500-year age. Your PhD guide, an authority on New Kingdom art, explains not merely what the paintings depict but how they were created, the pigments derived from desert minerals, the techniques that preserved them across millennia. Historical inscriptions reveal the inner workings of pharaonic Egypt with a scholarly depth unavailable to any other visitor.\n\n**Al-Deir''s** cultural layers unfold under expert analysis—pharaonic, Christian, and Islamic traces visible in a single space, a palimpsest of Egyptian spiritual evolution. The **Tomb of Pennut** opens intimate windows into Nubian daily life—harvest scenes, celebrations, the afterlife imagined in warmly human terms.\n\nReturn to your suite for lunch, then an afternoon of indulgence. A spa treatment using ancient Nubian botanical techniques. A private lecture from your Egyptologist on a topic of your choosing. Or simply watching the magnificent emptiness of Lake Nasser from your balcony, the silence so profound it becomes meditation.\n\nTonight''s ten-course tasting menu celebrates Nubian culinary heritage—dishes drawn from traditions stretching back millennia, paired with Grand Cru wines, served privately under stars that burn with Saharan intensity.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua – The Royal Desert Crossing**\n\n**Wadi al-Seboua** receives you in morning solitude—your private visit arranged before other guests arrive. The sphinx avenue, the cultural palimpsest of pharaonic and Coptic art, the desert light illuminating stone carved 32 centuries ago—all revealed through your scholar''s expert commentary.\n\nThen comes the journey''s most transcendent adventure: a **royal camel crossing** through the Sahara to **Al-Dakka** and **Mehraka**. This is the ultimate desert experience—Dom Pérignon and gourmet canapés served at a rest stop with views stretching to infinity, Nubian guides whose ancestors have navigated this terrain for millennia, the profound silence of the Sahara wrapping you like a cloak.\n\nAt Al-Dakka, explore a Ptolemaic temple in absolute privacy. At Mehraka, the views from the temple platform—desert and lake meeting at the edge of the world—may be the most remote panorama you will ever witness.\n\nReturn to the ship for a farewell worthy of the journey: a private dinner on the top deck as the last Saharan sunset of your voyage blazes across the sky. Dom Pérignon. The chef''s supreme creations. The knowledge that you have penetrated to Egypt''s most remote frontier and experienced it at the highest level of luxury the world can offer.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Kalabsha – The Gentle Farewell**\n\nYour final morning brings three rescued monuments near the High Dam—intimate gems that provide a gentle conclusion after the overwhelming experiences of the preceding days.\n\nThe **Kiosk of Kertassi''s** Hathor-headed columns frame lake views with Roman elegance. **Beit al-Wali''s** battle reliefs—the young Ramesses in his chariot, armies clashing with extraordinary energy—gain new dimensions under your scholar''s final commentary. **Kalabsha Temple**, the largest free-standing Nubian monument, reveals the cultural fusion of Egyptian and Nubian traditions: the god Mandulis honored in pharaonic style by Roman emperors, a testament to the region''s unique identity.\n\nReturn for a farewell breakfast in your suite. Your private limousine delivers you to Aswan Airport—or to arrangements for the next stage of your journey. A personalized departure gift accompanies you: a leather-bound journal and a Nubian keepsake, tangible mementos of four days that exist beyond the reach of ordinary experience.\n\nYou leave Lake Nasser carrying something more valuable than any souvenir: the knowledge that you have visited Egypt''s most remote temples in absolute privacy, crossed the Sahara in the style of a pharaoh, and stood before Abu Simbel in the silence of the desert—an experience available to perhaps a few dozen people each month on Earth.\n\n*Meals: Breakfast*',
    ARRAY[
      'Magnificent suite with panoramic views and private balcony',
      'Dedicated butler service throughout your voyage',
      'World-class dining with Dom Pérignon and Grand Cru wines',
      'Personal PhD-qualified Egyptologist (fully private)',
      'Exclusive 3+ hour private Abu Simbel exploration',
      'Royal desert camel crossing with Dom Pérignon',
      'Private starlight dinner before illuminated Abu Simbel',
      'Private limousine transportation throughout'
    ],
    ARRAY[
      '3 nights in magnificent suite (50+ sqm) with panoramic views',
      '24-hour dedicated butler service',
      'Full board world-class cuisine by executive chef',
      'Unlimited Dom Pérignon and Grand Cru wines',
      'Personal PhD Egyptologist guide (fully private)',
      'Exclusive 3+ hour Abu Simbel exploration (both temples)',
      'Private starlight dinner before illuminated Abu Simbel',
      'Royal camel crossing with Dom Pérignon and gourmet canapés',
      'Private limousine transfers',
      'Daily spa treatments of your choice',
      'Ten-course Nubian tasting menu with Grand Cru pairing',
      'In-suite champagne service throughout',
      'Complimentary premium laundry and pressing',
      'Personalized leather-bound journey journal',
      'Exclusive Nubian departure gift',
      'Private aviation transfers available'
    ],
    'LUXURY TIER: Premium Lake Nasser vessel suite or charter. Presidential suite with butler. Fully private tours with PhD Egyptologist. Reverse route has logistical advantage: Abu Simbel arrival (by air), Aswan departure (more flight options). For UHNW clients. Book 6+ months ahead—extreme scarcity.',
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
  RAISE NOTICE 'Migration 141 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for 4-Day Lake Nasser (Abu Simbel to Aswan):';
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
WHERE cl.slug = '4-day-lake-nasser-cruise-abu-simbel-aswan'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
