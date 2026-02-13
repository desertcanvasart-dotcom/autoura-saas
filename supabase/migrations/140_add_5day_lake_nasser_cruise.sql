-- =====================================================================
-- Migration 140: Add 5-Day Lake Nasser Cruise from Aswan Content
-- Description: Lake Nasser cruise to Abu Simbel with 4 tier variations
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
    '5-Day Lake Nasser Cruise: Aswan to Abu Simbel',
    '5-day-lake-nasser-cruise-aswan-abu-simbel',
    'Venture beyond the traditional Nile into the vast, otherworldly expanse of Lake Nasser on this extraordinary 5-day cruise from Aswan to Abu Simbel. Explore rescued Nubian temples that few travelers ever see—Kalabsha, Wadi al-Seboua, Amada—each relocated stone by stone after the creation of the High Dam. Ride camels through the desert to hidden sanctuaries. Gaze upon the fortress of Qasr Ibrim from the water. And culminate your journey at the colossal Abu Simbel Temples, Ramesses II''s supreme monument to power and love, rising from the shore of Egypt''s inland sea.',
    'Aswan to Abu Simbel, Lake Nasser, Egypt',
    '5 days / 4 nights',
    ARRAY['lake-nasser', 'abu-simbel', 'aswan', 'nubian-temples', 'cruise', 'full-board', 'kalabsha', 'camel-ride'],
    jsonb_build_object(
      'route', 'Aswan to Abu Simbel (Lake Nasser)',
      'direction', 'south',
      'nights', 4,
      'days', 5,
      'embarkation', 'Aswan',
      'disembarkation', 'Abu Simbel',
      'water_body', 'Lake Nasser',
      'highlights', ARRAY[
        'Kalabsha Temple',
        'Beit al-Wali',
        'Kiosk of Kertassi',
        'Wadi al-Seboua Temple',
        'Al-Dakka Temple',
        'Mehraka',
        'Amada Temple',
        'Qasr Ibrim (from water)',
        'Abu Simbel Temples',
        'Camel ride through the desert'
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
    '5-Day Lake Nasser Cruise - Classic Discovery',
    E'**Beyond the Nile: Egypt''s Hidden Frontier**\n\nLeave the familiar Nile behind and venture into the vast, otherworldly expanse of Lake Nasser—Egypt''s inland sea, stretching 500 kilometers into the Sahara. This extraordinary 5-day cruise reveals a side of ancient Egypt that few travelers ever witness: rescued Nubian temples standing in splendid isolation on desert shores, a medieval fortress rising from the water, and the awe-inspiring Abu Simbel Temples, perhaps the greatest monument ever built by human hands. Travel in comfort aboard your Lake Nasser cruiser, with all meals included and expert guidance at every ancient site.\n\n---\n\n**Day 1: Aswan – Setting Sail into the Unknown**\n\nYour adventure begins in Aswan, where the familiar Nile gives way to something altogether grander. Board your Lake Nasser cruise ship at the High Dam, crossing the threshold between the Egypt tourists know and the Egypt that remains largely undiscovered.\n\nSettle into your comfortable cabin and enjoy a welcome lunch as the ship navigates the first reaches of this immense lake. Unlike the narrow, cultivated Nile Valley, Lake Nasser spreads across a landscape of raw, elemental beauty—golden desert falling directly into turquoise water, no villages, no roads, no sound but the wind and the gentle churn of the ship.\n\nSpend the afternoon on deck, absorbing the profound silence and the scale of this artificial sea. Created by the Aswan High Dam in the 1960s, Lake Nasser submerged ancient Nubia—an entire civilization now resting beneath the waters. The temples you will visit in the coming days were rescued from that fate, relocated stone by stone in one of history''s greatest engineering feats.\n\nDinner is served as the sun sets behind the Saharan horizon, painting the sky in shades no artist could match—violet, crimson, gold—reflected perfectly in the lake''s glassy surface.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Kalabsha, Beit al-Wali, and the Kiosk of Kertassi**\n\nYour first full day reveals three rescued monuments, each offering a unique window into the ancient world.\n\nThe morning begins at **Kalabsha Temple**, the largest free-standing temple of Egyptian Nubia. Originally built during the reign of Augustus Caesar on the site of an earlier sanctuary, this impressive monument was relocated to its present position after the creation of the High Dam. Its massive walls, carved with scenes of pharaohs making offerings to Nubian and Egyptian gods, testify to the cultural fusion that made this region unique.\n\nSteps away, **Beit al-Wali** rewards close attention. This small rock-cut temple, built by Ramesses II early in his reign, contains some of the most vivid and detailed reliefs in all Egypt. Battle scenes depict campaigns against Nubians and Libyans with an immediacy that makes ancient warfare viscerally real—charging horses, fleeing enemies, the young pharaoh standing tall in his chariot.\n\nThe **Kiosk of Kertassi** completes your morning—a graceful Roman-era structure with Hathor-headed columns framing views of the lake. Its elegant simplicity contrasts beautifully with the larger temples, a reminder that not all ancient architecture needed to overwhelm to inspire.\n\nReturn to the ship for lunch and an afternoon of sailing toward Wadi al-Seboua. The landscape grows increasingly remote and dramatic—bare rock meeting bright water, the occasional crocodile basking on the shore, birds of prey circling overhead. Dinner aboard is followed by stargazing of extraordinary quality—with no light pollution for hundreds of kilometers, the night sky blazes with a brilliance that modern life has almost forgotten.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua, Al-Dakka, Mehraka, and Amada**\n\nToday brings four ancient sites in a landscape so remote it feels like the edge of the world—and perhaps, in ancient times, it was.\n\nThe morning reveals **Wadi al-Seboua**, the "Valley of the Lions," named for the avenue of sphinx-like figures that guard its entrance. This temple, built by Ramesses II, blends Egyptian and Nubian architectural traditions in fascinating ways. A Christian church was later built inside, and the juxtaposition of pharaonic reliefs and Coptic saints creates one of Egypt''s most intriguing cultural palimpsests.\n\nA **camel ride** through the desert carries you to the temples of **Al-Dakka** and **Mehraka**. The journey itself is unforgettable—rocking gently atop your camel as the vast Saharan landscape stretches to the horizon, the silence broken only by the animal''s footfalls and the whisper of wind across sand. Al-Dakka''s temple, with its well-preserved pylon, was built over several centuries by Ptolemaic and Roman rulers. Mehraka, though smaller, offers intimate charm and commanding views of the lake.\n\nThe afternoon brings **Amada Temple**, perhaps the day''s greatest reward. This is the oldest surviving temple on Lake Nasser, built by Thutmose III and Amenhotep II in the 15th century BC. Inside, the reliefs retain colors so vivid they seem painted yesterday—delicate blues, rich reds, gleaming golds. Your guide explains the historical inscriptions that make this temple invaluable to scholars: records of military campaigns, diplomatic achievements, and the daily workings of pharaonic administration.\n\nSail onward toward Abu Simbel as the sun sets, anticipation building for tomorrow''s climax.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Qasr Ibrim and Abu Simbel – Monuments Eternal**\n\nThe morning offers a unique experience: viewing **Qasr Ibrim** from the sundeck of your ship. This is the only major archaeological site in Lower Nubia that was not relocated—instead, the rising waters of Lake Nasser transformed it from a hilltop fortress into an island. For over 3,000 years, from pharaonic times through the Ottoman period, this strategic citadel controlled trade along the Nile. Today, landing is prohibited to protect ongoing excavations, but from the water, its weathered walls and tumbled columns tell a story of continuity unmatched in Egypt.\n\nThen comes the moment you''ve been sailing toward: **Abu Simbel**.\n\nNothing prepares you for the first sight of Ramesses II''s Great Temple, its four colossal seated figures—each 20 meters tall—carved directly into the cliff face. Built in the 13th century BC to intimidate Nubian enemies and honor the gods, this is arguably the most impressive monument in all Egypt. The relocation of these temples in the 1960s—cut into blocks and reassembled on higher ground as Lake Nasser rose—remains one of humanity''s greatest engineering achievements.\n\nStep inside and discover the Great Hypostyle Hall, where eight Osiride statues of Ramesses support the roof. Continue deeper into the mountain to the sanctuary, where four seated gods wait in eternal darkness. Twice a year—on February 22 and October 22—the rising sun penetrates 60 meters into the rock to illuminate three of the four statues, a feat of astronomical engineering that still functions perfectly after 3,200 years.\n\nBeside it, the smaller but exquisite **Temple of Nefertari**, dedicated to Ramesses'' beloved queen and the goddess Hathor. The facade features six standing figures—four of Ramesses and two of Nefertari—a rare honor, as queens were almost never depicted at the same scale as their pharaoh-husbands.\n\nReturn to the ship moored before these colossal monuments for your final dinner. As darkness falls and the temples are illuminated, their reflections shimmering in the lake, you witness a sight that ranks among the most extraordinary in all human experience.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Farewell at the Edge of the World**\n\nYour final morning offers one last gift: sunrise over Abu Simbel. Watch from the deck as the first light touches the colossal faces of Ramesses, painting them gold against the desert sky—the same sunrise that ancient architects calculated with such precision.\n\nAfter a farewell breakfast, disembark and transfer to Abu Simbel Airport for your departure. You leave carrying memories of a journey few travelers ever make—temples standing in desert solitude, camels crossing the Sahara, the vast silence of Lake Nasser, and the overwhelming majesty of Abu Simbel seen from the water. This is Egypt beyond the guidebooks, beyond the crowds, beyond anything you imagined.\n\n*Meals: Breakfast*',
    ARRAY[
      'Comfortable accommodation on Lake Nasser cruiser',
      'Full board dining throughout the voyage',
      'Professional English-speaking Egyptologist guide',
      'All temple entrance fees included',
      'Camel ride through the desert to Al-Dakka and Mehraka',
      'Scenic viewing of Qasr Ibrim from the water',
      'Abu Simbel Temples exploration',
      'Air-conditioned transportation for excursions'
    ],
    ARRAY[
      '4 nights accommodation in comfortable standard cabin',
      'Full board: 4 breakfasts, 4 lunches, 4 dinners',
      'Expert guided tours at all archaeological sites',
      'Entrance fees to all temples mentioned',
      'Camel ride to Al-Dakka and Mehraka',
      'Scenic cruise past Qasr Ibrim',
      'Full visit to Abu Simbel Great Temple and Temple of Nefertari',
      'Transfer to Abu Simbel Airport on departure',
      'Onboard entertainment and activities'
    ],
    'BUDGET TIER: Standard Lake Nasser cruise vessel, twin/double cabin, shared group tours. Lake Nasser cruises operate with fewer ships than Nile cruises—typically 3-4 vessels total. Book well in advance. Camel ride included at all tiers. Abu Simbel airport departure—clients need connecting flight or Abu Simbel extension.',
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
    '5-Day Lake Nasser Cruise - Premium Experience',
    E'**The Road Less Traveled, in Style**\n\nThis premium 5-day Lake Nasser cruise takes you beyond the familiar Nile into territory most travelers never reach. Sail Egypt''s vast inland sea aboard a first-class vessel, exploring rescued Nubian temples in near-solitude, riding camels through the Sahara, and arriving at Abu Simbel by water—the way the ancients intended. With intimate touring groups, refined dining, and the kind of silence modern life rarely offers, this is exploration elevated to art.\n\n---\n\n**Day 1: Aswan – Into the Great Beyond**\n\nYour premium Lake Nasser experience begins at the High Dam, where the familiar Nile gives way to something far more vast and mysterious. A representative greets you and escorts you to your first-class cruise ship, where a champagne welcome marks the beginning of an extraordinary journey.\n\nSettle into your river-view cabin with its panoramic windows framing a landscape utterly different from the cultivated Nile Valley. Here, golden desert plunges directly into turquoise water. No villages line the shore. No roads follow the bank. This is Egypt stripped to its elemental essence—water, rock, sky, and silence.\n\nJoin fellow guests for a gourmet lunch as the ship navigates the first reaches of this 500-kilometer lake. Your guide provides context over afternoon tea: the story of Nubia, the civilization submerged beneath these waters; the extraordinary international effort that rescued the temples you''ll visit; the unique ecology of a lake that harbors Nile crocodiles, Nile perch, and migratory birds by the thousands.\n\nDinner unfolds as the sun sets in a spectacle of color—the Saharan sky ablaze with shades of crimson and violet, reflected perfectly in the lake''s mirror-still surface. Away from city lights, the stars appear with a brilliance that takes your breath away.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Kalabsha, Beit al-Wali, and the Kiosk of Kertassi**\n\nThe morning reveals three remarkable rescued monuments, explored at a pace that allows genuine appreciation.\n\nYour experienced Egyptologist leads your small group (maximum 16 guests) to **Kalabsha Temple**, the largest free-standing temple of Egyptian Nubia. Built during Augustus Caesar''s reign on the site of an earlier sanctuary, this monument was dismantled into 13,000 blocks and rebuilt at its present site after the High Dam was completed. Your guide explains the fascinating blend of Egyptian and Nubian religious traditions visible in every carved relief.\n\n**Beit al-Wali**, a rock-cut temple built by a young Ramesses II, contains some of Egypt''s most vivid battle reliefs. Your guide brings these scenes to life—Nubian and Libyan campaigns depicted with an immediacy that rivals modern war photography. The colors, though faded, still hint at the brilliance of the original decoration.\n\nThe elegant **Kiosk of Kertassi**, with its Hathor-headed columns and panoramic lake views, provides a gentle counterpoint—Roman-era grace in the middle of the Sahara.\n\nReturn to the ship for a gourmet lunch, then spend the afternoon sailing toward Wadi al-Seboua. The landscape grows increasingly dramatic as you penetrate deeper into the desert. Take afternoon tea on deck, watching for crocodiles basking on distant shores and birds of prey circling overhead.\n\nTonight''s dinner features regional Nubian-inspired specialties, followed by stargazing that no planetarium can match—the Milky Way arcing overhead like a river of light.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua, the Desert Crossing, and Amada**\n\nToday combines ancient temples with desert adventure in a day unlike any other.\n\n**Wadi al-Seboua**—the "Valley of the Lions"—greets you with its avenue of sphinx figures, guardians turned golden in the morning light. This Ramesses II temple fascinates with its cultural layers: pharaonic reliefs partially covered by Coptic paintings when Christians converted it to a church, creating an accidental timeline of Egyptian religious history.\n\nThen comes the day''s unique adventure: a **camel ride** across the desert to the temples of **Al-Dakka** and **Mehraka**. With refreshments provided for the journey, you cross terrain that feels genuinely remote—vast expanses of golden sand and rock, the silence broken only by the soft thud of camel hooves. Al-Dakka''s well-preserved pylon and temple, built by Ptolemaic and Roman rulers, rewards the journey. Mehraka, though smaller, offers views across the lake that stretch to the edge of the world.\n\nThe afternoon brings **Amada Temple**, the oldest surviving monument on Lake Nasser. Built by Thutmose III and Amenhotep II in the 15th century BC, its interior preserves colors of extraordinary vividness—delicate blues and rich reds that seem impossibly fresh after 3,500 years. Your guide explains the historical inscriptions that make this temple invaluable: military records, diplomatic texts, and glimpses into the daily administration of an ancient empire.\n\nSail toward Abu Simbel as evening falls. Dinner is accompanied by the growing anticipation of tomorrow''s climax.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Qasr Ibrim and Abu Simbel – The Grand Climax**\n\nThe morning begins with **Qasr Ibrim**, viewed from the sundeck with commentary from your guide. This fortress—the only major Nubian site not relocated—served as a military, religious, and administrative center for over 3,000 years. From the water, its ruins tell a story of continuity from pharaonic times through Christian and Ottoman periods, a palimpsest of Egyptian history written in crumbling stone.\n\nThen, the moment your entire journey has been building toward: **Abu Simbel**.\n\nThe first sight from the water is unforgettable. Four colossal seated figures of Ramesses II—each 20 meters tall—emerge from the cliff face as your ship rounds the final bend. Built to project Egyptian power into Nubia and honor the gods Ra-Horakhty, Amun, and Ptah, this is arguably the most impressive monument in all antiquity.\n\nYour guide leads you inside the Great Temple, through the Hypostyle Hall where eight Osiride statues of Ramesses support the carved ceiling, into progressively smaller chambers, and finally to the sanctuary where four seated gods wait in eternal darkness. Learn about the solar alignment that twice yearly sends sunlight 60 meters into the rock to illuminate three of the four deities—a feat of astronomical precision that still functions perfectly after 32 centuries.\n\nThe **Temple of Nefertari** stands beside it, dedicated to Ramesses'' beloved queen and the goddess Hathor. Six standing figures grace the facade—and your guide explains the extraordinary significance of Nefertari''s equal-sized depiction, a tribute virtually unique in Egyptian history.\n\nReturn to the ship, moored directly before these colossal monuments. Your farewell dinner unfolds with Abu Simbel illuminated against the night sky, its reflections dancing on the water—a scene that ranks among the most extraordinary on Earth.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Sunrise at Abu Simbel**\n\nYour final morning offers a gift few visitors receive: sunrise over Abu Simbel, watched from the comfort of your ship. The first rays touch the colossal faces of Ramesses, painting them gold against the deep blue desert sky. Cameras click, but some moments are best stored only in memory.\n\nAfter a leisurely farewell breakfast, disembark and transfer to Abu Simbel Airport. You carry with you memories of a journey that most travelers never make—temples in desert solitude, camels crossing the Sahara, the vast silence of Lake Nasser, and the overwhelming majesty of Abu Simbel. For those wishing to extend their Egyptian adventure, arrangements for additional exploration can be made.\n\n*Meals: Breakfast*',
    ARRAY[
      'First-class cabin with panoramic lake views',
      'Gourmet dining with Egyptian and international cuisine',
      'Experienced Egyptologist guide (small groups max 16)',
      'All temple entrance fees included',
      'Camel ride with refreshments to desert temples',
      'Scenic viewing of Qasr Ibrim with expert commentary',
      'Extended Abu Simbel visit with expert guide',
      'Air-conditioned premium vehicles for transfers'
    ],
    ARRAY[
      '4 nights in superior first-class cabin with lake views',
      'Full board gourmet dining with welcome champagne',
      'Complimentary soft drinks, tea and coffee throughout',
      'Small group guided tours (maximum 16 guests)',
      'All entrance fees to temples mentioned',
      'Camel ride with refreshments to Al-Dakka and Mehraka',
      'Guided cruise past Qasr Ibrim with commentary',
      'Extended visit to Abu Simbel Great Temple and Nefertari Temple',
      'Transfer to Abu Simbel Airport',
      'Daily afternoon tea service',
      'Nubian-themed dinner evening',
      'Complimentary Wi-Fi onboard (where available)',
      'Stargazing program on deck'
    ],
    'STANDARD TIER: First-class Lake Nasser vessel (MS Prince Abbas or equivalent), superior cabin, small group tours. Very limited availability—only 3-4 ships operate Lake Nasser. Book 3-6 months in advance. Camel ride is highlight. Abu Simbel departure—arrange connecting flight.',
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
    '5-Day Lake Nasser Cruise - Deluxe Collection',
    E'**Egypt''s Last Great Secret, Experienced in Luxury**\n\nWhile the traditional Nile cruise follows well-trodden paths, this deluxe 5-day Lake Nasser voyage takes you to the frontier of ancient Egypt—where Nubian temples stand in magnificent isolation, camels cross desert landscapes unchanged since pharaonic times, and Abu Simbel rises from the water like a vision. From your private balcony cabin to intimate touring with a private Egyptologist, this is exploration without compromise—the extraordinary made exclusive.\n\n---\n\n**Day 1: Aswan – Crossing the Threshold**\n\nYour deluxe Lake Nasser journey begins at the High Dam with a private transfer to your boutique cruise ship—one of only a handful of vessels that sail these waters. The crew welcomes you with champagne and chilled towels as you step aboard.\n\nYour balcony cabin is a sanctuary of understated elegance—spacious accommodations with floor-to-ceiling windows opening to your private outdoor space. From here, you''ll watch a landscape unlike anything on the conventional Nile—raw desert meeting bright water under skies of impossible clarity.\n\nA gourmet lunch introduces the culinary journey ahead: fresh fish from the lake, Nubian-inspired specialties, international cuisine prepared with the region''s finest ingredients. Spend the afternoon on the sundeck absorbing the profound silence of Lake Nasser—500 kilometers of turquoise water stretching into the Sahara, crocodiles basking on distant shores, eagles circling overhead.\n\nYour private Egyptologist joins you for afternoon tea, setting the stage for the days ahead with the story of Nubia—the ancient civilization submerged beneath these waters—and the remarkable international rescue that saved its greatest monuments.\n\nDinner unfolds as the Saharan sunset blazes across the sky, reflected in the lake''s mirror surface. Later, step onto your balcony for stargazing of breathtaking quality—with no light pollution for hundreds of kilometers, the Milky Way burns with a brilliance that reconnects you with the cosmos.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Kalabsha, Beit al-Wali, and the Kiosk of Kertassi**\n\nThree rescued monuments, explored at a pace that transforms visits into genuine encounters.\n\nYour private Egyptologist (guiding a maximum of 8 guests) leads you to **Kalabsha Temple** in the cool morning air. This magnificent structure—13,000 blocks dismantled and reassembled after the High Dam—represents the fascinating fusion of Egyptian and Nubian religious traditions. Your guide reveals details invisible to casual visitors: the subtle differences between Egyptian and Nubian artistic conventions, the political significance of Augustus Caesar building in pharaonic style, the astronomical alignments embedded in the temple''s design.\n\n**Beit al-Wali** rewards close attention under expert guidance. Ramesses II built this rock-cut temple early in his reign, and its battle reliefs possess an energy and detail unmatched elsewhere. Your guide brings these scenes to vivid life—not merely describing what you see, but explaining the military tactics, the cultural context, and the propaganda purposes that shaped every carved figure.\n\nThe graceful **Kiosk of Kertassi**, with its Hathor-headed columns framing infinite lake views, provides a moment of quiet beauty—Roman elegance in the heart of the Sahara.\n\nReturn to the ship for a gourmet lunch featuring Nubian-inspired cuisine paired with premium wines. The afternoon sail toward Wadi al-Seboua reveals Lake Nasser''s increasingly remote beauty. Perhaps a spa treatment, a swim in the pool, or simply watching from your balcony as the desert landscape slides past.\n\nTonight''s dinner under the stars is accompanied by the profound silence of the Sahara—a silence so complete it becomes its own kind of music.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua, the Desert Crossing, and Amada**\n\nToday blends ancient discovery with desert adventure in a way no other cruise can match.\n\n**Wadi al-Seboua**''s sphinx-lined avenue glows gold in the morning light as your guide reveals the temple''s remarkable cultural layers—pharaonic reliefs beneath Coptic paintings, Egyptian gods and Christian saints sharing walls, millennia of belief visible in a single space.\n\nThe **camel ride** to **Al-Dakka** and **Mehraka** is elevated for deluxe guests with premium provisions: champagne refreshments, cushioned saddles, and a Nubian guide who shares desert knowledge passed down through generations. The journey itself feels like time travel—vast Saharan landscapes stretching to every horizon, the silence broken only by camel footfalls and wind across sand. Al-Dakka''s Ptolemaic temple and the intimate Mehraka sanctuary reward your desert crossing with architecture and views that belong to you alone.\n\n**Amada Temple** is the afternoon''s revelation—the oldest monument on Lake Nasser, its interior ablaze with colors that defy their 3,500-year age. Your guide spends over an hour here, translating inscriptions that reveal the inner workings of pharaonic Egypt: military campaigns, diplomatic victories, the administrative machinery of the world''s first great empire.\n\nSail toward Abu Simbel as the sun performs its nightly Saharan spectacular. Tonight''s seven-course tasting menu celebrates the culinary heritage of Upper Egypt and Nubia, followed by stargazing with the captain''s telescope.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Qasr Ibrim and Abu Simbel – The Ultimate Encounter**\n\nThe morning begins with **Qasr Ibrim**, viewed from your private balcony as your Egyptologist provides expert commentary. This fortress—the only major Nubian site left in its original position—tells 3,000 years of history through its crumbling walls: pharaonic, Meroitic, Christian, and Ottoman layers visible even from the water.\n\nThen, the journey''s climax: **Abu Simbel** revealed from the water.\n\nThe ship rounds the final bend and there they are—four colossal figures of Ramesses II, each 20 meters tall, carved into the living rock. The scale is almost incomprehensible. Your ship moors directly before the Great Temple, an approach reserved exclusively for Lake Nasser cruise passengers—most visitors arrive by road or air and never see Abu Simbel from this perspective.\n\nYour private guide leads an extended exploration of the **Great Temple**. Beyond the standard visit, your deluxe access allows unhurried time in each chamber—the Hypostyle Hall with its eight Osiride statues, the astronomical chamber where the solar alignment occurs, the sanctuary where four gods wait in eternal darkness. Your Egyptologist reveals the engineering genius of the original construction and the equally astonishing 1960s relocation.\n\nThe **Temple of Nefertari** receives equal attention. Your guide explains the extraordinary love story behind this monument—a pharaoh honoring his queen with a temple rivaling his own, an almost unprecedented gesture in Egyptian history.\n\nYour farewell dinner is served on the top deck, Abu Simbel illuminated before you, the colossal figures reflected in the dark water. Vintage champagne, the chef''s finest creations, and a night that no other destination on Earth can offer.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Dawn of the Pharaohs**\n\nRise before dawn for one final extraordinary experience: sunrise over Abu Simbel from your private balcony. Watch as the first light touches Ramesses'' face, painting stone gold against the desert blue—the same phenomenon ancient architects planned with mathematical precision 32 centuries ago.\n\nA farewell gourmet breakfast follows, then your luxury transfer to Abu Simbel Airport. You depart carrying memories of a journey that exists beyond the reach of ordinary tourism—temples in desert isolation, camels crossing the Sahara, the vast silence of an inland sea, and Abu Simbel seen as its builders intended: from the water, rising from the shore like a monument to eternity itself.\n\n*Meals: Breakfast*',
    ARRAY[
      'Spacious balcony cabin with premium amenities',
      'Gourmet multi-course dining with premium wines',
      'Private Egyptologist guide (max 8 guests)',
      'All temple entrance fees included',
      'Premium camel ride with champagne provisions',
      'Extended private Abu Simbel exploration',
      'Sunrise viewing from private balcony',
      'Full spa access with complimentary treatment'
    ],
    ARRAY[
      '4 nights in deluxe balcony cabin (28-32 sqm)',
      'Butler-style service and premium amenities',
      'Full board gourmet cuisine with premium wine pairings',
      'Private Egyptologist guide (couples or max 8 guests)',
      'All entrance fees to temples mentioned',
      'Premium camel ride with champagne and cushioned saddles',
      'Extended visit to Abu Simbel with unhurried exploration',
      'Luxury vehicle transfers',
      'Full spa access with one complimentary treatment',
      'Seven-course farewell tasting menu at Abu Simbel',
      'Complimentary premium beverages throughout',
      'Nubian cultural evening with traditional music',
      'Complimentary laundry service',
      'Stargazing program with captain''s telescope'
    ],
    'DELUXE TIER: Premium Lake Nasser vessel (MS Kasr Ibrim or Nubian Sea), balcony cabin, private/semi-private tours. Extremely limited availability—3-4 ships total. Book 4-6 months ahead. Premium camel experience is key differentiator. Abu Simbel departure—arrange connecting flight or extension.',
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
    '5-Day Lake Nasser Cruise - Ultimate Luxury',
    E'**The Journey Beyond All Others**\n\nIf the traditional Nile cruise is Egypt''s great introduction, the Lake Nasser voyage is its masterclass—and this ultra-luxury experience is its definitive statement. Sail Egypt''s vast inland sea in a magnificent suite with your own butler. Explore rescued Nubian temples in absolute privacy with a PhD Egyptologist. Cross the Sahara by camel with Dom Pérignon. And arrive at Abu Simbel by water, as only a handful of travelers do each week, to experience these colossal monuments with exclusive access. This is not merely a cruise—it is a passage into the most remote and magnificent corners of ancient Egypt, experienced with a level of luxury that matches the monuments'' own grandeur.\n\n---\n\n**Day 1: Aswan – Beyond the Known World**\n\nYour extraordinary journey begins as your private limousine delivers you to the High Dam, where your ship awaits at the threshold between the Nile and the unknown.\n\nThe captain greets you personally as you board to Dom Pérignon and traditional Nubian music. Your magnificent suite—50 square meters of refined elegance with floor-to-ceiling windows, separate living area, private balcony with daybed, and marble bathroom—will be your floating sanctuary for the next four nights. Your personal butler has already arranged everything according to your preferences.\n\nA private lunch on your balcony showcases the executive chef''s vision: Lake Nasser perch prepared three ways, Nubian-inspired specialties, international cuisine of the highest order, each course paired with exceptional wines.\n\nAs the ship enters the vast silence of Lake Nasser, the world you know falls away. No roads, no villages, no sounds but wind and water. Your PhD Egyptologist joins you for afternoon tea, sharing the story of ancient Nubia—a civilization of warrior queens and golden pyramids, now resting beneath the waters you sail. The context transforms the days ahead from tourism into genuine exploration.\n\nDinner unfolds as the Saharan sunset sets the sky ablaze. Later, your butler prepares the balcony for stargazing—with no light pollution for hundreds of kilometers, the night sky reveals itself as our ancestors knew it: overwhelming, humbling, infinite.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Kalabsha, Beit al-Wali, and the Kiosk of Kertassi**\n\nThree rescued monuments, explored in the most profound way possible—privately, with unlimited time and the finest Egyptological guidance available.\n\nYour personal PhD Egyptologist leads you to **Kalabsha Temple** in the cool morning air. In absolute privacy, explore this magnificent monument—the largest free-standing temple of Egyptian Nubia, dismantled into 13,000 blocks and rebuilt after the High Dam. Your guide''s expertise reveals layers invisible to other visitors: the political significance of Roman emperors building in pharaonic style, the Nubian religious traditions woven into Egyptian iconography, the astronomical alignments embedded in the architecture.\n\n**Beit al-Wali** becomes a masterclass in ancient Egyptian art under your scholar''s guidance. These battle reliefs—among the most detailed in all Egypt—gain new dimensions when examined with an expert who has published on their significance. The young Ramesses II''s military campaigns come alive with context and nuance unavailable in any guidebook.\n\nThe **Kiosk of Kertassi** offers moments of quiet beauty—Hathor-headed columns framing the infinite lake, Roman grace amid the Sahara. Your guide explains the religious significance of this small but elegant structure, built when the Roman Empire stretched to these remote shores.\n\nReturn to your suite for a private lunch, then an afternoon of pure indulgence. A spa treatment using ancient Nubian botanical techniques. A swim in the pool. Or simply watching from your balcony as the most remote landscape you''ve ever encountered slides past in magnificent silence.\n\nTonight''s dinner is a private affair on the top deck: a multi-course menu celebrating Nubian culinary traditions, Grand Cru wines, and the vast silence of the Sahara wrapping you like a blanket of stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Wadi al-Seboua, the Royal Desert Crossing, and Amada**\n\nToday combines private temple exploration with an adventure that money can''t ordinarily buy.\n\n**Wadi al-Seboua**''s sphinx avenue receives you in morning solitude—your private visit arranged before other ships'' guests arrive. Your Egyptologist reveals the temple''s extraordinary cultural palimpsest: pharaonic reliefs beneath Coptic paintings, one era of belief layered upon another, a timeline of Egyptian spirituality visible in a single space.\n\nThe **camel ride** to **Al-Dakka** and **Mehraka** is transformed into a royal desert crossing. Your Nubian camel drivers belong to families who have navigated this terrain for centuries. Dom Pérignon and gourmet canapés are served at a desert rest stop with views stretching to eternity. The ride itself is timeless—the creak of leather, the whisper of sand, the vast silence of the Sahara unbroken by any sound of modernity. At Al-Dakka, explore a Ptolemaic temple in absolute privacy. At Mehraka, the desert views from the temple platform may be the most remote you''ll ever witness.\n\n**Amada Temple** receives you for a private extended visit. The oldest monument on Lake Nasser, its interior retains colors of astonishing vividness after 3,500 years. Your PhD guide, an authority on New Kingdom art, explains not merely what the paintings depict but how they were made—the pigments derived from desert minerals, the techniques that have preserved them through millennia, the inscriptions that reveal the inner workings of pharaonic Egypt.\n\nSail toward Abu Simbel as evening falls. Tonight''s ten-course tasting menu is paired with exceptional wines, served privately under a sky ablaze with stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Qasr Ibrim and Abu Simbel – The Supreme Revelation**\n\nBreakfast arrives on your balcony as the ship approaches **Qasr Ibrim**. Your Egyptologist provides expert commentary on this fortress—the only major Nubian site left in place—its 3,000-year history visible in crumbling walls that span pharaonic, Christian, and Ottoman eras.\n\nThen comes the moment that justifies every journey: **Abu Simbel**, revealed from the water.\n\nThe ship rounds the final bend and there they are—four colossal seated figures of Ramesses II, each 20 meters tall, carved from the living rock face. Your private motor launch takes you ashore for an experience available to virtually no other visitors.\n\nWith **exclusive access permits**, your private exploration of the **Great Temple** extends beyond ordinary limits. Spend over three hours inside, examining every chamber, every relief, every astronomical alignment with your PhD guide. Stand in the sanctuary where four seated gods have waited in darkness for 32 centuries. Learn the science behind the solar alignment—how ancient engineers calculated that twice yearly, sunlight would penetrate 60 meters of rock to illuminate precisely three of the four deities. Examine the evidence of the 1960s relocation—one of humanity''s greatest engineering achievements—visible only to those who know where to look.\n\nThe **Temple of Nefertari** receives equal attention in your private visit. Your guide reveals the extraordinary love story behind this monument—a pharaoh honoring his queen with a temple rivaling his own, an almost unprecedented gesture in 3,000 years of Egyptian history.\n\nYour farewell dinner is an event beyond category: a private starlight banquet on the top deck, Abu Simbel illuminated before you, the colossal figures reflected in the dark water. Dom Pérignon flows freely. The executive chef''s masterwork unfolds course by course. And the knowledge that you have experienced one of the most magnificent sights on Earth in a way that virtually no one else ever will.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 5: Sunrise at the Edge of the World**\n\nYour butler wakes you before dawn for the journey''s final gift: sunrise over Abu Simbel from your private balcony. Watch as the first light touches the face of Ramesses—stone transformed to gold, shadow retreating from features carved 32 centuries ago. This is the same sunrise the ancient architects calculated with such precision. Today, it belongs to you.\n\nA farewell breakfast of your choosing, then your private limousine delivers you to Abu Simbel Airport—or to a private aviation terminal, should your journey continue in that manner. A personalized departure gift accompanies you: a leather-bound journal and a memento of Nubia, tangible keepsakes from a journey that exists beyond the reach of ordinary experience.\n\nYou leave carrying something more valuable than any souvenir: the knowledge that you have penetrated to the heart of ancient Egypt, beyond the crowds and the guidebooks, to places where the silence of millennia still reigns and the pharaohs'' monuments stand in desert solitude, as eternal as the stars overhead.\n\n*Meals: Breakfast*',
    ARRAY[
      'Magnificent suite with panoramic views and private balcony',
      'Dedicated butler service throughout your voyage',
      'World-class dining with Dom Pérignon and Grand Cru wines',
      'Personal PhD-qualified Egyptologist (fully private)',
      'Exclusive private access at all temple sites',
      'Royal desert camel crossing with Dom Pérignon',
      'Extended private Abu Simbel exploration (3+ hours)',
      'Private limousine transportation throughout'
    ],
    ARRAY[
      '4 nights in magnificent suite (50+ sqm) with panoramic views',
      '24-hour dedicated butler service',
      'Full board world-class cuisine by executive chef',
      'Unlimited Dom Pérignon and Grand Cru wines',
      'Personal PhD Egyptologist guide (fully private)',
      'Exclusive private access permits for all sites',
      'Royal camel crossing with Dom Pérignon and gourmet canapés',
      'Extended private Abu Simbel visit (3+ hours, both temples)',
      'Private limousine or aviation transfers',
      'Daily spa treatments of your choice',
      'Private starlight farewell dinner before Abu Simbel',
      'In-suite champagne service throughout',
      'Complimentary premium laundry and pressing',
      'Personalized leather-bound journey journal',
      'Exclusive Nubian departure gift',
      'Helicopter or private aviation transfers available'
    ],
    'LUXURY TIER: Premium Lake Nasser vessel suite or full charter option. Presidential suite with butler. Fully private tours with PhD Egyptologist. Extreme exclusivity—only 3-4 ships operate, often fully booked months ahead. For UHNW clients. Abu Simbel private aviation may be required for departure. Verify vessel availability 6+ months ahead.',
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
  RAISE NOTICE 'Migration 140 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for 5-Day Lake Nasser Cruise:';
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
WHERE cl.slug = '5-day-lake-nasser-cruise-aswan-abu-simbel'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
