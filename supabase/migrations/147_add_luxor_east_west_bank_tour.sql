-- =====================================================================
-- Migration 147: Add Luxor East Bank & West Bank Day Tour
-- Description: The Ultimate Luxor Day Tour – both banks in one day
-- with 4 tier variations
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
    'The Ultimate Luxor Day Tour: East Bank & West Bank',
    'luxor-east-west-bank-day-tour',
    'Experience the full magnificence of ancient Thebes in one extraordinary day—both banks of the Nile, six iconic sites, and 3,500 years of history from dawn to dusk. Begin on the East Bank with the colossal temples of Karnak and Luxor, where thirty centuries of pharaonic ambition are written in stone. Then cross to the West Bank—the land of the dead—to descend into the painted tombs of pharaohs in the Valley of the Kings (including Tutankhamun), marvel at Nefertari''s exquisite tomb in the Valley of the Queens, stand before the towering Colossi of Memnon, and explore the dramatic terraced temple of Hatshepsut at Deir el-Bahari. This is Luxor in its entirety: the living temples of the gods on the East Bank and the eternal resting places of kings on the West Bank, united in a single unforgettable day.',
    'Luxor, Egypt (East & West Banks)',
    '1 day (full day)',
    ARRAY['luxor', 'east-bank', 'west-bank', 'karnak', 'luxor-temple', 'valley-of-kings', 'tutankhamun', 'valley-of-queens', 'nefertari', 'hatshepsut', 'colossi-memnon', 'day-tour', 'new-kingdom', 'thebes', 'ultimate'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 11,
      'city', 'Luxor',
      'region', 'East Bank & West Bank',
      'highlights', ARRAY[
        'Luxor Temple',
        'Temple of Karnak & Great Hypostyle Hall',
        'Valley of the Kings (3 tombs + Tutankhamun)',
        'Valley of the Queens (Tomb of Nefertari)',
        'Colossi of Memnon',
        'Temple of Hatshepsut at Deir el-Bahari'
      ],
      'included_meals', 'Lunch included',
      'transport', true,
      'both_banks', true
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
    'Ultimate Luxor Day Tour - Classic Discovery',
    E'**Both Banks, One Day: The Complete Luxor Experience**\n\nAncient Thebes was divided by the Nile into two worlds. The East Bank—where the sun rose each morning—was the realm of the living, home to the great temples where gods were worshipped and pharaohs proclaimed their divine authority. The West Bank—where the sun set each evening into the desert hills—was the realm of eternity, where kings carved their tombs deep into the rock and built vast mortuary temples to ensure their immortality.\n\nThis comprehensive day tour bridges both worlds. From the colossal forest of columns at Karnak to the painted burial chambers of the Valley of the Kings, from the living temple of Luxor to the silent majesty of Hatshepsut''s terraced masterpiece—you experience Thebes as the ancients conceived it: a single sacred landscape spanning both banks of the Nile, where the living and the dead, gods and kings, existed in eternal dialogue.\n\n---\n\n**Early Morning: The West Bank – The Land of Eternity**\n\nYour day begins before dawn with a crossing to the West Bank—retracing the symbolic journey that funeral processions made three and a half thousand years ago, from the world of the living to the realm of the dead.\n\n*Valley of the Kings – The House of Eternity*\n\nThe **Valley of the Kings** in the early morning is at its most powerful—the air still cool, the shadows deep, the tourist crowds not yet arrived. This desolate wadi, hidden in the Theban Hills beneath the pyramid-shaped peak of al-Qurn, served as the secret royal cemetery for nearly 500 years, and sixty-three tombs have been discovered carved deep into its limestone bedrock.\n\nYour general admission includes entry to **three tombs**, and your guide selects the most rewarding combination available. Each tomb is a descent into corridors and chambers whose painted walls depict the pharaoh''s journey through the underworld—vivid blues, golds, reds, and greens preserved by the bone-dry desert air for over three millennia. Scenes of the pharaoh before Osiris, of serpents and demons guarding the twelve hours of the night, of the sun god Ra''s nightly voyage through darkness toward resurrection—each tomb is a theological masterpiece.\n\nYour tour includes the **Tomb of Tutankhamun** (KV62)—the most famous archaeological discovery in history. While smaller than many royal tombs, the painted burial chamber—where the boy king''s mummy still rests in its original sarcophagus—retains an intimate power that no museum can replicate. Your guide recounts the dramatic story of Howard Carter''s 1922 discovery: the sealed doorway, the famous first glimpse by candlelight, the golden treasures that lay undisturbed for 3,300 years.\n\n*Valley of the Queens – Nefertari''s Masterpiece*\n\nProceed to the **Valley of the Queens**, burial ground of royal consorts and princes. The **Tomb of Queen Nefertari** (QV66) is widely considered the most beautiful tomb in all of Egypt. The favourite wife of Ramesses II was honoured with a tomb whose every surface is covered in paintings of breathtaking quality: the queen in flowing white linen playing senet, led by Isis and Hathor through the gates of the underworld, receiving the breath of eternal life from the gods.\n\nThe colours are astonishingly vivid after 3,200 years—azure blues, brilliant whites, rich golds, and deep reds creating an atmosphere that feels less like a tomb and more like a jewel box. Your guide explains the symbolism of each scene and the extraordinary conservation effort that rescued these paintings from near-destruction.\n\n*Colossi of Memnon – Guardians of the Plain*\n\nTwo enormous quartzite statues—each 18 meters high, weighing approximately 720 tons—rise from the agricultural plain. The **Colossi of Memnon** are all that remain visible of the once-vast mortuary temple of **Amenhotep III**. Your guide explains their famous history: in antiquity, the northern statue emitted a haunting sound at dawn, a phenomenon Greeks attributed to the mythical hero Memnon greeting his mother, the dawn goddess Eos. The sound drew visitors from across the Roman Empire, including Emperor Hadrian.\n\n*Temple of Queen Hatshepsut – Majesty Against the Cliffs*\n\nThe **Mortuary Temple of Hatshepsut** at Deir el-Bahari is one of Egypt''s most visually dramatic monuments. Three ascending terraces of colonnades rise against the sheer limestone cliffs, an architectural vision centuries ahead of its time.\n\n**Hatshepsut**—Egypt''s first female pharaoh—ruled as king for over 20 years, adopting male regalia and titles while commissioning some of the finest art of the New Kingdom. Your guide leads you through the terraces, explaining the relief carvings chronicling her legendary **trading expedition to Punt**, her divine birth narrative, and the chapels dedicated to Hathor and Anubis.\n\n---\n\n**Midday: Crossing to the East Bank**\n\nAfter lunch at a quality restaurant, cross back to the East Bank—returning from the realm of the dead to the realm of the living, just as the ancient Egyptians did after funeral ceremonies.\n\n---\n\n**Afternoon: The East Bank – The Realm of the Living**\n\n*Luxor Temple – Where the Pharaoh Became a God*\n\n**Luxor Temple** rises from the heart of modern Luxor with a grandeur that has inspired visitors for millennia. Built primarily by **Amenhotep III** and **Ramesses II**, this temple was dedicated not to a specific deity but to the rejuvenation of kingship itself through the sacred **Opet Festival**.\n\nThe approach through the **First Pylon** of Ramesses II is magnificent—a towering facade flanked by a single remaining obelisk (its twin stands in the Place de la Concorde in Paris) and colossal statues of the pharaoh. Inside, the **Court of Ramesses II** opens into a peristyle courtyard of papyrus-bud columns covered in battle reliefs.\n\nThe **Colonnade of Amenhotep III**—fourteen massive papyrus columns lining a processional corridor—bears the most important relief carvings in the temple: the scenes of the **Opet Festival**, depicting the annual procession of Amun''s sacred barque from Karnak to Luxor Temple, accompanied by music, dancing, and the rejoicing of the entire city.\n\nYour guide reveals the temple''s extraordinary layers: pharaonic reliefs beneath Roman paintings, a medieval mosque built into the upper structure (the **Mosque of Abu el-Haggag**, still active today), and evidence of Christian worship—three faiths layered upon one sacred site.\n\n*Temple of Karnak – The Largest Religious Building on Earth*\n\nThe day''s climax is **Karnak**—the largest religious building ever constructed, covering over 200 acres, built and expanded by more than thirty pharaohs across 1,300 years. Dedicated to the **Theban Triad**—Amun-Ra, Mut, and Khonsu—it is not one temple but a city of temples, each pharaoh adding courts, pylons, obelisks, and chapels in a cumulative expression of devotion without parallel.\n\nThe monument that defines Karnak: the **Great Hypostyle Hall**. One hundred and thirty-four columns—the twelve central ones standing 21 meters high—create a forest of stone so vast that the eye cannot take it in at once. Every surface is carved with relief scenes: **Seti I** on the northern walls with reliefs of exquisite delicacy, **Ramesses II** on the southern walls with reliefs of robust power. Your guide explains the engineering, the theology, and the overwhelming aesthetic experience these columns were designed to produce.\n\nBeyond the Hypostyle Hall: the **obelisks of Hatshepsut and Thutmose I**, the **Sacred Lake** where priests purified themselves before performing rituals, and the **Festival Hall of Thutmose III** with its unique tent-pole columns.\n\nReturn to your hotel as the sun sets, having experienced both banks of the Nile—the living temples and the eternal tombs—in a single day that encompasses the full grandeur of ancient Thebes.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 3 tombs including Tutankhamun',
      'Valley of the Queens – Tomb of Nefertari',
      'Colossi of Memnon',
      'Temple of Hatshepsut at Deir el-Bahari',
      'Luxor Temple with Opet Festival reliefs',
      'Temple of Karnak & Great Hypostyle Hall',
      'Professional English-speaking Egyptologist guide',
      'Both banks of the Nile in one day',
      'Lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Valley of the Kings general admission (3 tombs)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fee to Hatshepsut Temple',
      'Colossi of Memnon visit',
      'Entrance fee to Luxor Temple',
      'Entrance fee to Karnak Temple complex',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel pickup and drop-off in Luxor',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. This is the MOST AMBITIOUS day tour—6 major sites across both banks. ESSENTIAL: Earliest possible start (5:30-6 AM) to fit everything in. West Bank first (cooler morning for tombs), East Bank afternoon. Nefertari tomb requires separate premium ticket (included—confirm availability, ~150 visitors/day). Physically very demanding—heat, walking, tomb stairs. Not recommended for guests with mobility issues. Lunch break between banks is essential for energy. Pacing is tight but achievable with experienced guide.',
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
    'Ultimate Luxor Day Tour - Premium Experience',
    E'**The Two Worlds of Thebes: A Premium Day Across Both Banks**\n\nThe Nile divided ancient Thebes into two realms—the East Bank of the living, where the great temples of Amun rose to the heavens, and the West Bank of eternity, where pharaohs carved their passage to the afterlife into the desert rock. No visit to Egypt is complete without experiencing both, and this premium day tour brings the full scope of Luxor''s treasure together with the expertise of an experienced Egyptologist, the comfort of a small group, and the pacing that allows each site to reveal its full power.\n\nSix iconic sites. Both banks. 3,500 years. One extraordinary day.\n\n---\n\n**Dawn: The West Bank – Into the Realm of Eternity**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle before dawn. The early start is essential—the West Bank''s tombs and temples are best experienced in the cool morning hours, and arriving before the main crowds transforms the experience.\n\n*Valley of the Kings – The Hidden Tombs*\n\nThe **Valley of the Kings** in the first light of morning retains its ancient atmosphere of sacred secrecy. Your Egyptologist has selected the optimal combination of **three tombs** for the day—this varies as tombs rotate, but your guide ensures you experience the finest available.\n\nPossibilities include the tombs of **Ramesses IV** (magnificent astronomical ceiling), **Ramesses IX** (vivid Book of the Dead illustrations), **Merenptah** (massive sarcophagus in situ), or **Thutmose III** (hidden in a cleft above the valley floor, its cartouche-shaped burial chamber decorated with the earliest complete Amduat). Each descent is narrated with expertise: the purpose of each corridor, the meaning of each religious text, the engineering of carving chambers deep into solid rock.\n\nThe **Tomb of Tutankhamun** (KV62) provides the emotional peak. Your guide tells the complete story with the nuance a small group allows: the boy king who died at 19, the hastily prepared tomb, Howard Carter''s legendary 1922 discovery, the famous words "wonderful things," and the ongoing scholarly debates about hidden chambers and cause of death. Standing in the burial chamber, where Tutankhamun''s mummy still rests in its outermost golden coffin, the power of the place is undeniable.\n\n*Valley of the Queens – Art of the Highest Order*\n\nThe **Tomb of Nefertari** (QV66) with an experienced guide becomes more than a visual spectacle—it becomes legible. Your Egyptologist explains the theological programme: each scene guides Nefertari through specific gates of the underworld, each deity plays a defined role in her transformation from mortal queen to divine being. The artistic techniques—the luminous white plaster backgrounds that amplify every colour, the confident brushwork, the sophisticated colour palette—are analyzed as achievements that place these painters among the greatest artists of the ancient world.\n\nYour guide explains the Getty Conservation Institute''s six-year restoration and why visitor numbers are strictly limited—making your presence in this tomb a genuine privilege.\n\n*Colossi of Memnon – Giants of the Flood Plain*\n\nThe **Colossi of Memnon**—18 meters of quartzite, 720 tons each—receive expert commentary: the "singing Memnon" phenomenon that drew Roman emperors across the Mediterranean, the ongoing archaeological excavation revealing the lost temple of Amenhotep III beneath the flood plain, and the engineering required to transport these statues over 600 kilometres from their Aswan quarry.\n\n*Temple of Hatshepsut – The Queen Who Became King*\n\nThe **Mortuary Temple of Hatshepsut** at Deir el-Bahari commands the landscape with its three ascending terraces set against vertical cliffs. Your guide tells Hatshepsut''s extraordinary story with the depth a small group allows: the political manoeuvring that brought a woman to the throne, the propaganda campaign that legitimised her rule, and the architectural genius of her designer **Senenmut**.\n\nThe temple''s relief carvings receive expert attention: the **Punt Expedition reliefs** (exotic animals, incense trees, the famously rotund Queen of Punt), the **Divine Birth reliefs** (Hatshepsut''s conception by Amun himself), and the chapels of **Hathor** and **Anubis** with their jewel-like painted decoration.\n\n---\n\n**Midday: Crossing the Nile**\n\nA quality lunch at a well-selected restaurant—perhaps with views of the Nile or the cultivation—provides essential rest and refreshment before the afternoon.\n\n---\n\n**Afternoon: The East Bank – The Living Temples**\n\n*Luxor Temple – The Sanctuary of Divine Kingship*\n\n**Luxor Temple** in the afternoon light is a study in architectural harmony. Your Egyptologist explains its unique purpose: this temple was dedicated to the **ka** of kingship—the divine spirit that passed from pharaoh to pharaoh, renewed annually through the sacred Opet Festival.\n\nThe **Colonnade of Amenhotep III** receives the attention its reliefs deserve—your guide walks you through the Opet Festival scenes: the preparation of the sacred barques, the procession from Karnak with musicians and dancers, the river journey, and the secret rites of renewal. These reliefs constitute our primary visual record of ancient Egypt''s most important annual ceremony.\n\nYour guide reveals the temple''s extraordinary layers: the **birth room** with its divine conception narrative, the **Roman shrine** painted over pharaonic reliefs, and the **Mosque of Abu el-Haggag** built into the upper structure—three religions upon one sacred site.\n\n*Temple of Karnak – The Climax*\n\nThe day''s crescendo: **Karnak** in the late afternoon, when the descending sun sends golden light into the Hypostyle Hall and the crowds begin to thin.\n\nYour Egyptologist provides the framework: 1,300 years of construction by thirty pharaohs, the largest religious building ever built, dedicated to the Theban Triad of Amun-Ra, Mut, and Khonsu.\n\nThe **Great Hypostyle Hall** in the late light is transcendent—134 columns creating shafts of golden illumination that pick out individual reliefs with dramatic precision. Your guide ensures you appreciate the contrast between **Seti I''s northern reliefs** (sunk relief of extraordinary refinement) and **Ramesses II''s southern reliefs** (raised relief of bold power), and explains the clerestory window system that later influenced Roman basilicas and Christian churches.\n\nBeyond the Hall: the **obelisk of Hatshepsut** (29.5 meters of solid granite, once tipped with electrum), the **Sacred Lake** with its priestly purification rituals, and the **Festival Hall of Thutmose III** with its unique tent-pole columns.\n\nReturn to your hotel as the evening call to prayer echoes across the Nile, having experienced both worlds of ancient Thebes in a single day—the living temples and the eternal tombs, the realm of the gods and the realm of the dead, united by the river that gave Egypt life.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 3 tombs with expert guide selection',
      'Tomb of Tutankhamun (KV62) with discovery narrative',
      'Tomb of Nefertari (QV66) with art interpretation',
      'Colossi of Memnon with archaeological context',
      'Temple of Hatshepsut with Punt and Divine Birth reliefs',
      'Luxor Temple with Opet Festival reliefs',
      'Karnak – Great Hypostyle Hall in golden afternoon light',
      'Sacred Lake and obelisks at Karnak',
      'Experienced Egyptologist (small group max 16)',
      'Premium vehicle and quality lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Valley of the Kings general admission (3 tombs)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fee to Hatshepsut Temple',
      'Colossi of Memnon visit',
      'Entrance fee to Luxor Temple',
      'Entrance fee to Karnak Temple complex',
      'Quality lunch at well-selected restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel pickup and drop-off in Luxor',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. CRITICAL: Pre-dawn start (5:30-6 AM) essential. West Bank first (cool morning, Valley of Kings before crowds), lunch break, East Bank afternoon (Karnak at golden hour). Nefertari ticket must be pre-booked (~150/day). This is the most physically demanding tour—full day in heat with tomb stairs and extensive walking. Not suitable for guests with limited mobility. Guide must manage pacing carefully—lunch break is essential. Karnak timed for late afternoon golden light in Hypostyle Hall.',
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
    'Ultimate Luxor Day Tour - Deluxe Collection',
    E'**Thebes Complete: A Private Day Across Both Banks of the Nile**\n\nThis is the definitive Luxor experience—both banks of the Nile, every essential site, experienced with a private Egyptologist, luxury vehicle, and the expanded access that transforms a day of sightseeing into a day of genuine discovery. Descend into four tombs in the Valley of the Kings (not the standard three). Experience Nefertari''s jewel-box tomb with expert art interpretation. Explore Hatshepsut''s sanctuary and Hathor Chapel beyond the standard terraces. Read the Opet Festival reliefs at Luxor Temple with a guide who translates the hieroglyphs. Then conclude at Karnak as the golden afternoon light illuminates the Hypostyle Hall—with access to the Open-Air Museum and the rarely visited Temple of Khonsu. Every site on both banks, experienced at its deepest.\n\n---\n\n**Dawn: The West Bank – Private Access to the Royal Necropolis**\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you before dawn in a luxury vehicle. Crossing to the West Bank in the pre-dawn light, your guide sets the stage: the Nile as the boundary between life and death, the Theban Hills as the realm of Meretseger, the serpent goddess who protected the royal tombs.\n\n*Valley of the Kings – Four Tombs, One Scholar*\n\nArriving at the **Valley of the Kings** at opening time, the wadi is cool and nearly deserted. Your deluxe tour includes **four tombs** (one more than standard admission), and your private guide has designed a route that tells the complete story of royal tomb art across the New Kingdom.\n\nYour guide reads hieroglyphs directly from the walls—the actual texts of the Amduat, the Book of Gates, and the Litany of Ra. In the tomb of **Ramesses VI** (KV9), the overwhelming astronomical ceiling—depicting the goddess Nut swallowing the sun each evening and giving birth to it each morning—is one of the supreme artistic achievements of the ancient world. Other tombs are selected for their unique qualities: **Thutmose III** for its hidden location and intimate chamber, **Merenptah** for its massive sarcophagus, or **Seti I** (if accessible, as a premium add-on).\n\nThe **Tomb of Tutankhamun** (KV62) receives unhurried private attention. Your guide reconstructs the tomb as Carter found it: the antechamber overflowing with golden chariots and thrones, the treasury with its canopic shrine, the burial chamber where three nested coffins—the innermost of solid gold—held the most famous mummy in history.\n\n*Valley of the Queens – Nefertari Illuminated*\n\nThe **Tomb of Nefertari** with a private Egyptologist becomes a revelation. Your guide ensures you understand the theological programme, the artistic innovations (luminous white backgrounds, sculptural modelling of figures), the identity of each deity, and the conservation history that saved these masterworks. Details invisible without expert knowledge emerge: preliminary red grid lines beneath paintings, differences between the two painting teams, the Getty Institute''s six-year restoration methodology.\n\n*Colossi of Memnon – The Vanished Temple*\n\nThe **Colossi of Memnon** with a private guide become a lesson in ancient engineering and modern archaeology. Your Egyptologist explains the ongoing excavation revealing Amenhotep III''s vanished temple—once the largest in Thebes—and the scientific explanation for the "singing" phenomenon: temperature-induced expansion of fractured quartzite producing audible vibrations at dawn.\n\n*Temple of Hatshepsut – Beyond the Terraces*\n\nAt **Deir el-Bahari**, your private guide provides the complete experience. Beyond the standard terraces, you visit the **sanctuary of Amun** carved into the cliff face, the **Hathor Chapel** with its painted reliefs of the goddess nursing the queen, and the **Anubis Chapel** with some of the finest preserved colours in Thebes.\n\nThe **Punt Expedition reliefs** receive extended attention—your guide identifies exotic flora and fauna, explains the scholarly debate about Punt''s location, and describes the trading relationship that made this expedition one of Hatshepsut''s proudest achievements.\n\n---\n\n**Midday: The Nile Crossing**\n\nA premium lunch at a carefully selected restaurant—overlooking the Nile or the cultivation—provides a refined pause between the two banks and their two contrasting worlds.\n\n---\n\n**Afternoon: The East Bank – Private Temple Experience**\n\n*Luxor Temple – The Private Masterclass*\n\nReturn to the East Bank for **Luxor Temple** experienced with scholarly depth. Your guide reads hieroglyphic inscriptions as you walk: the cartouches on the First Pylon, the offering formulae on column shafts, the Battle of Kadesh reliefs.\n\nThe **Opet Festival reliefs** on the Colonnade of Amenhotep III are decoded with the intimacy of a private seminar—individual figures identified, the processional sequence explained, musical instruments named, each scene connected to the broader theology of divine kingship.\n\nIn the inner sanctuaries, your guide reveals the **Alexander the Great shrine**, the **birth room** with its divine conception narrative, and the **Roman frescos** that once covered the pharaonic reliefs—the extraordinary layering of pharaonic, Ptolemaic, Roman, Christian, and Islamic sacred space.\n\n*Temple of Karnak – The Complete Complex at Golden Hour*\n\nThe day''s climax: **Karnak** in the late afternoon, when the golden light transforms the Hypostyle Hall into the most magnificent space in Egyptian architecture.\n\nYour private guide unfolds the complex chronologically—1,300 years of construction by thirty pharaohs, political rivalries encoded in the architecture, cartouches erased and re-carved, obelisks walled up by jealous successors.\n\nThe **Great Hypostyle Hall** in the golden hour is transcendent. Your guide selects the optimal moment when light enters the clerestory windows, illuminating the contrast between Seti I''s refined sunk reliefs and Ramesses II''s bold raised reliefs. Your guide reads specific inscriptions, explains the engineering, and reveals the hall''s function as a stone representation of the primeval marsh from which creation emerged.\n\nYour deluxe tour accesses areas beyond the standard route:\n\n• The **Open-Air Museum**—including the exquisite White Chapel of Senusret I and reconstructed shrines from earlier phases of Karnak''s history.\n\n• The **Temple of Khonsu**—a rarely visited but beautifully proportioned temple with some of the best-preserved reliefs in the complex.\n\n• The **Sacred Lake** with extended scholarly context and the **Festival Hall of Thutmose III** with its Botanical Garden chamber.\n\nReturn to your hotel as the evening call to prayer rises from Luxor''s minarets, having experienced the complete revelation of ancient Thebes—both banks, every essential site, at a depth most visitors never reach.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 4 tombs (expanded) with private guide',
      'Tomb of Tutankhamun with unhurried private visit',
      'Tomb of Nefertari with expert art interpretation',
      'Colossi of Memnon with excavation insights',
      'Hatshepsut Temple with sanctuary, Hathor Chapel, Anubis Chapel',
      'Luxor Temple with hieroglyphic reading and inner sanctuaries',
      'Karnak at golden hour – Hypostyle Hall illuminated',
      'Karnak Open-Air Museum and Temple of Khonsu',
      'Private Egyptologist (max 8 guests)',
      'Luxury vehicle and premium lunch'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Valley of the Kings expanded access (4 tombs)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fee to Hatshepsut Temple',
      'Colossi of Memnon visit',
      'Entrance fee to Luxor Temple',
      'Entrance fee to Karnak Temple complex',
      'Entrance fee to Karnak Open-Air Museum',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel pickup and drop-off in Luxor',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), luxury vehicle, premium lunch. 4 tombs in Valley of Kings (extra ticket pre-arranged). Nefertari pre-booked. Karnak Open-Air Museum included. CRITICAL LOGISTICS: Pre-dawn start (5:30 AM). West Bank 5:30-12:00 (Valley of Kings, Queens, Colossi, Hatshepsut). Lunch 12:00-13:30 (essential break). East Bank 13:30-18:00 (Luxor Temple then Karnak at golden hour). This is the most physically demanding tour offered—11+ hours with extensive walking and tomb stairs. Private vehicle allows flexible pacing. If Seti I accessible, offer as premium add-on.',
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
    'Ultimate Luxor Day Tour - Ultimate Luxury',
    E'**Thebes Unveiled: The Definitive Private Expedition Across Both Banks**\n\nThis is the single most comprehensive day of archaeology available in Egypt. Both banks of the Nile. Six tombs in the Valley of the Kings—including the legendary Tomb of Seti I. Nefertari''s painted masterpiece. Hatshepsut''s sanctuary carved into living rock. The Opet Festival reliefs read by a scholar who translates the hieroglyphs. The Great Hypostyle Hall at Karnak illuminated by the golden afternoon sun—with access to the Temple of Ptah and its intact Sekhmet statue. All conducted by a PhD Egyptologist whose published research transforms every site into a revelation. Travel by private limousine. Dine at Luxor''s finest. Conclude with Luxor Temple illuminated at night. This is Thebes as it has never been experienced before—the ultimate day for the ultimate traveller.\n\n---\n\n**Before Dawn: The West Bank – A Scholar''s Expedition**\n\nYour private limousine collects you before dawn, and your personal **PhD Egyptologist**—a published specialist in New Kingdom art, Theban archaeology, or mortuary temple architecture—begins the narrative as you cross the Nile in darkness, retracing the symbolic journey from life to eternity.\n\n*Valley of the Kings – Six Tombs, One Scholar*\n\nArriving at the **Valley of the Kings** at the earliest possible moment, your scholar provides a topographical reading—why this wadi was chosen, how the peak of al-Qurn served as a natural sacred pyramid, how each pharaoh''s tomb was positioned in relation to geology, theology, and secrecy.\n\nYour luxury tier includes **six tombs**—double the standard allocation—designed by your scholar as a complete narrative of royal tomb evolution.\n\nThe **Tomb of Seti I** (KV17) is the expedition''s crown jewel: 137 meters of corridors and chambers decorated from entrance to burial chamber with reliefs of unmatched quality—the Amduat, the Book of Gates, the Litany of Ra, and the Opening of the Mouth ceremony, executed with a precision that represents the absolute pinnacle of New Kingdom art. Your scholar reads the texts directly from the walls, explaining the theological journey through the twelve hours of the night and the pharaoh''s ultimate resurrection at dawn. The astronomical ceiling of the burial chamber is a masterpiece of ancient astronomical knowledge.\n\nAdditional tombs are curated for maximum impact: **Ramesses VI** (KV9) for its overwhelming ceiling; **Thutmose III** (KV34) for its hidden intimacy; **Ramesses III** (KV11) for its unique secular scenes; **Horemheb** (KV57) for its unfinished decoration revealing the painting process from sketch to masterpiece.\n\nThe **Tomb of Tutankhamun** (KV62) receives your scholar''s most nuanced interpretation: the theological significance of the burial chamber paintings, the latest scientific analysis (CT scans, DNA, cause of death debates), and the ongoing investigation of possible hidden chambers.\n\n*Valley of the Queens – A Scholar''s Masterclass*\n\nThe **Tomb of Nefertari** (QV66) with a PhD art historian becomes the most profound artistic experience in Egypt. Your scholar provides context unavailable to any other visitor: the innovations of Nefertari''s painters, the technical analysis of pigments, the relationship to broader New Kingdom funerary art traditions, and the Getty Conservation Institute''s restoration methodology explained in professional detail.\n\n*Colossi of Memnon – The Scholar''s Perspective*\n\nYour scholar transforms the **Colossi of Memnon** from a photo stop into a case study: the logistics of quarrying and transporting 720-ton statues from Aswan, the latest excavation discoveries revealing the vanished temple''s extraordinary scale, and the scientific explanation for the "singing" phenomenon.\n\n*Temple of Hatshepsut – The Complete Vision*\n\nAt **Deir el-Bahari**, your scholar provides the complete architectural, political, and artistic analysis. With VIP access, you visit the **inner sanctuary** carved into the cliff, the **solar altar** aligned to the winter solstice sunrise, and the **Hathor Chapel** with its intact painted reliefs among the most delicate in Thebes.\n\nYour scholar addresses the Hatshepsut erasure with scholarly nuance—not simple revenge but a complex theological act related to kingship institution integrity.\n\n---\n\n**Midday: The Royal Crossing**\n\nA refined lunch at Luxor''s finest restaurant—**Sofitel Winter Palace terrace**, **Al Moudira**, or a private arrangement—provides a moment of civilised comfort between the two banks.\n\n---\n\n**Afternoon: The East Bank – The Supreme Temple Experience**\n\n*Luxor Temple – The Scholar''s Reading*\n\n**Luxor Temple** with a PhD scholar becomes a text decoded in real time. The **Battle of Kadesh reliefs** are analyzed as historical document and propaganda. The **Opet Festival reliefs** are decoded scene by scene—priests identified by their hieroglyphic titles, musical instruments named, ritual actions explained, each scene connected to contemporary papyri descriptions.\n\nIn the inner sanctuaries: the **Alexander the Great shrine** in its Ptolemaic political context, the **birth room** as legitimacy propaganda, the **Roman frescos** revealing the temple''s transformation through successive civilizations.\n\nYour scholar may arrange **special access** to restricted areas: conservation workshops, recently excavated sections, or rooftop viewpoints providing a bird''s-eye perspective of the temple plan.\n\n*Temple of Karnak – The Scholar''s Expedition at Golden Hour*\n\nEnter **Karnak** in the late afternoon for the most intellectually rich and visually stunning temple experience available.\n\nYour scholar navigates chronologically—beginning at the Middle Kingdom core and working outward through 1,300 years of construction, each pharaoh''s contribution identified and explained.\n\nThe **Great Hypostyle Hall** at golden hour is the supreme experience: light entering the clerestory windows exactly as the original designers intended, illuminating the contrast between Seti I''s refined sunk reliefs and Ramesses II''s bold raised reliefs. Your scholar reads inscriptions directly from the walls—offering formulae, royal titles, and construction texts that document the human labour behind this superhuman achievement.\n\nWith VIP access:\n\n• The **Open-Air Museum** with the **White Chapel of Senusret I** and the **Red Chapel of Hatshepsut**—full scholarly interpretation of each reconstructed shrine.\n\n• The **Temple of Ptah** (northern Karnak)—a rarely visited gem with intact painted reliefs and the cult statue of **Sekhmet** still standing in her darkened sanctuary after three thousand years.\n\n• The **Akhmenu** with its **Botanical Garden** chamber—exotic plants analyzed as scientific illustration and imperial display.\n\n• The **Sacred Lake** with its astronomical alignments and cosmological significance explained.\n\n---\n\n**Evening: Luxor Temple Illuminated – The Private Finale**\n\nAs darkness falls, your limousine returns you to **Luxor Temple** for the day''s crowning moment. Illuminated by golden floodlights, the temple undergoes a complete transformation—columns glowing amber, shadows picking out reliefs invisible in daylight, the Colonnade of Amenhotep III becoming a cathedral of light.\n\nYour scholar provides the nighttime narrative: the temple as the ancient Egyptians experienced it during the Opet Festival—torchlit processions, sacred barques on priests'' shoulders, chanting echoing through colonnades. In the golden floodlight, with the obelisk piercing the night sky and the sounds of modern Luxor creating an extraordinary soundtrack, the ancient past feels not distant but present.\n\nA **private refreshment service** at a reserved terrace with temple views—chilled champagne or traditional hibiscus tea—provides the perfect conclusion to the most extraordinary day of archaeology available in Egypt.\n\nYour limousine returns you carrying memories of both banks, both worlds, both realms—the living temples and the eternal tombs united in a single day that encompasses the full grandeur of ancient Thebes.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 6 tombs including Tomb of Seti I (KV17)',
      'Tomb of Tutankhamun with advanced scholarly interpretation',
      'Tomb of Nefertari with conservation and art history analysis',
      'Colossi of Memnon with excavation insights',
      'Hatshepsut Temple with sanctuary, solar altar, Hathor Chapel',
      'Luxor Temple with hieroglyphic decoding and special access',
      'Karnak at golden hour – Hypostyle Hall, Temple of Ptah, Open-Air Museum',
      'Luxor Temple illuminated night visit with private refreshments',
      'Personal PhD Egyptologist (fully private)',
      'Fine dining lunch at Luxor''s finest',
      'Private luxury limousine throughout'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'Valley of the Kings expanded access (6 tombs)',
      'Tomb of Seti I entrance (KV17)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fee to Hatshepsut Temple',
      'Colossi of Memnon visit',
      'Entrance fee to Luxor Temple (day visit)',
      'Entrance fee to Luxor Temple (evening illuminated visit)',
      'Entrance fee to Karnak Temple complex',
      'Entrance fee to Karnak Open-Air Museum',
      'VIP access and special permits for restricted areas',
      'Private limousine (Mercedes S-Class or equivalent)',
      'Fine dining lunch at premium venue (Winter Palace, Al Moudira, or equivalent)',
      'Private refreshment service at temple-view terrace (evening)',
      'Hotel pickup and drop-off in Luxor',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Theban specialist), luxury limousine, VIP access everywhere. THE MOST AMBITIOUS AND EXPENSIVE DAY TOUR OFFERED. Seti I (KV17) requires special ticket (significant cost, limited). 6 Valley of Kings tombs require multiple ticket purchases. Nefertari pre-booked (~150/day). SCHEDULE: Pre-dawn start (5:00-5:30 AM). West Bank 5:30-12:30 (6 tombs KV, Nefertari, Colossi, Hatshepsut). Fine dining lunch 12:30-14:00 (Winter Palace/Al Moudira). East Bank 14:00-18:00 (Luxor Temple, Karnak at golden hour). Luxor Temple night visit 19:00-20:30 (after sunset). TOTAL: ~15 hours. Extremely physically demanding. Private limousine allows rest between sites. For UHNW clients with exceptional stamina and passion for archaeology. Consider suggesting 2-day split for guests who prefer a more relaxed pace.',
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
  RAISE NOTICE 'Migration 147 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Ultimate Luxor Day Tour:';
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
WHERE cl.slug = 'luxor-east-west-bank-day-tour'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
