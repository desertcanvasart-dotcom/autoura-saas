-- =====================================================================
-- Migration 148: Add Abu Simbel Bus Day Tour from Aswan
-- Description: Full-day overland expedition to Abu Simbel temples
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
    'Abu Simbel Day Tour from Aswan',
    'abu-simbel-bus-day-tour-aswan',
    'Journey 280 kilometres into the Nubian desert to stand before the most awe-inspiring monuments in all of Egypt. The twin temples of Abu Simbel—carved directly into a mountainside by Ramesses II over 3,200 years ago—are ancient Egypt at its most monumental, most ambitious, and most breathtaking. Four colossal statues of the pharaoh, each standing 20 meters tall, guard the entrance to the Great Temple, while inside, the sacred sanctuary is engineered so that twice each year the rising sun penetrates 60 meters of solid rock to illuminate the faces of the gods within. The smaller Temple of Nefertari—dedicated to Ramesses'' beloved queen and the goddess Hathor—is one of only two temples in Egyptian history built by a pharaoh to honour his wife. Made doubly extraordinary by their 1960s UNESCO relocation—cut into blocks and reassembled on higher ground to save them from the rising waters of Lake Nasser—Abu Simbel is a monument to human achievement ancient and modern.',
    'Abu Simbel, Nubia, Egypt',
    '1 day (full day)',
    ARRAY['abu-simbel', 'ramesses-ii', 'nefertari', 'nubia', 'aswan', 'unesco', 'lake-nasser', 'day-tour', 'desert', 'sun-alignment', 'new-kingdom'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 12,
      'city', 'Aswan',
      'destination', 'Abu Simbel',
      'distance_km', 280,
      'drive_time_hours', 3.5,
      'highlights', ARRAY[
        'Great Temple of Ramesses II',
        'Temple of Nefertari (Hathor Temple)',
        'Four colossal seated statues (20m each)',
        'Inner sanctuary with solar alignment',
        'UNESCO relocation engineering marvel',
        'Lake Nasser desert landscape'
      ],
      'included_meals', 'Breakfast box and lunch included',
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
    'Abu Simbel Day Tour - Classic Discovery',
    E'**Abu Simbel: Egypt''s Most Spectacular Monument**\n\nSome monuments must be earned. Abu Simbel lies 280 kilometres south of Aswan, deep in the Nubian desert on the shores of Lake Nasser—a location so remote that it was virtually unknown to Europeans until 1813, when the Swiss explorer Johann Ludwig Burckhardt stumbled upon the colossal heads of Ramesses II protruding from the sand. What he had found was the single most spectacular monument in Egypt—four seated statues of a pharaoh, each 20 meters tall, carved directly into the living rock of a sandstone cliff, guarding the entrance to a temple that penetrates 60 meters into the mountain.\n\nThis full-day expedition from Aswan takes you across the Sahara to stand before these extraordinary monuments—and to understand why they represent the pinnacle of pharaonic ambition, ancient engineering, and modern archaeological rescue.\n\n---\n\n**The Journey: Across the Nubian Desert**\n\nYour day begins before dawn with departure from Aswan at approximately **3:30-4:00 AM**—an early start that serves two purposes: you arrive at Abu Simbel in the cool of the morning, and you experience the extraordinary desert landscape as the sun rises over the Sahara.\n\nThe 3.5-hour drive south follows the highway along the western shore of **Lake Nasser**—the vast reservoir created by the Aswan High Dam, stretching 500 kilometres into Sudan. The landscape is stark, magnificent, and otherworldly: golden sand, black rock, and the shimmering blue of the lake in the distance. A breakfast box is provided for the journey.\n\nAs you approach Abu Simbel, the terrain becomes increasingly dramatic—and then, from the road, the first glimpse: four colossal figures emerging from the cliff face, their scale defying comprehension even at a distance.\n\n---\n\n**The Great Temple of Ramesses II**\n\nNothing prepares you for the first encounter with the **Great Temple of Abu Simbel**. Four seated colossi of **Ramesses II**—each standing 20 meters tall (the height of a six-story building)—are carved directly into the sandstone cliff. Their faces, serene and impassive, have gazed across the Nubian desert for over 3,200 years. At their feet, smaller figures represent members of the royal family: Nefertari, the queen mother Tuya, princes, and princesses—themselves larger than life-size but dwarfed by the pharaoh''s monumental scale.\n\nAbove the entrance, a niche holds a statue of the sun god **Ra-Horakhty** (Ra of the Two Horizons), and the entire facade functions as a theological statement: Ramesses as the earthly manifestation of the sun god, his temple as the meeting point between the human and the divine.\n\nInside, the temple penetrates **60 meters into the mountain**—a feat of engineering that staggers the imagination. The first hall is supported by eight Osiride pillars—each a standing figure of Ramesses in the pose of Osiris, god of the afterlife—creating an atmosphere of overwhelming grandeur. The walls are covered in relief carvings depicting Ramesses'' military victories, most prominently the **Battle of Kadesh** (1274 BC) against the Hittite Empire—the same battle commemorated at Karnak, Luxor Temple, and the Ramesseum, but here depicted with a dramatic energy unmatched anywhere else.\n\nYour guide explains the reliefs in detail: the Egyptian camp surprised by the Hittite chariot charge, Ramesses single-handedly turning the battle (according to his own account), the counting of severed hands (the Egyptian method of tallying enemy dead), and the eventual conclusion—not the decisive victory Ramesses claimed, but a strategic draw that led to history''s first recorded peace treaty.\n\nDeeper chambers lead to the **inner sanctuary**, where four seated statues face the entrance: **Ra-Horakhty**, **Amun-Ra**, **Ptah** (god of Memphis), and **Ramesses II** himself—deified in his own lifetime, seated among the gods as their equal. Twice each year—on **February 22 and October 22**—the rising sun penetrates the full 60-meter length of the temple to illuminate the faces of Ra-Horakhty, Amun-Ra, and Ramesses, while Ptah (god of the underworld, associated with darkness) remains in shadow. This solar alignment, calculated with extraordinary precision 3,200 years ago, demonstrates an understanding of astronomy and engineering that still astonishes scientists.\n\n---\n\n**The Temple of Nefertari**\n\nBeside the Great Temple stands the **Temple of Hathor and Nefertari**—smaller in scale but equal in beauty, and unique in Egyptian history. This is one of only **two temples ever built by a pharaoh to honour his wife** (the other being Akhenaten''s temple to Nefertiti at Amarna, now destroyed).\n\nSix standing statues—four of Ramesses and two of Nefertari—flank the entrance, and significantly, Nefertari''s statues are the **same height as the pharaoh''s**—an extraordinary gesture of equality unparalleled in Egyptian art. At each figure''s feet stand their children, rendered at smaller scale.\n\nInside, the temple is dedicated to **Hathor**, goddess of love, beauty, and music. The pillared hall features Hathor-headed columns and painted relief carvings of exquisite quality: Nefertari making offerings to the gods, Nefertari crowned by Isis and Hathor, and scenes of the royal couple together in acts of devotion. The colours—where preserved—retain remarkable vibrancy, and the intimate scale of the temple contrasts beautifully with the overwhelming grandeur of its neighbour.\n\nYour guide explains the love story behind the stone: Ramesses'' devotion to Nefertari is documented in poetry and inscriptions throughout Egypt. On the facade of this temple, Ramesses had inscribed: *"She for whom the sun shines"*—a declaration of love carved into a mountainside and enduring for over three millennia.\n\n---\n\n**The UNESCO Rescue: A Modern Marvel**\n\nYour guide tells the extraordinary story of the temples'' **1960s relocation**—one of the greatest engineering achievements of the 20th century. When the construction of the Aswan High Dam threatened to submerge Abu Simbel beneath the rising waters of Lake Nasser, an international campaign led by **UNESCO** mobilised engineers and archaeologists from around the world.\n\nBetween 1964 and 1968, both temples were cut into over **1,000 blocks** (each weighing up to 30 tons), lifted from their original location, and reassembled on an artificial cliff **65 meters higher** and 200 meters back from the river—an operation that cost $40 million (equivalent to over $300 million today) and involved engineers from Italy, Sweden, Germany, France, and Egypt. The precision was extraordinary: the solar alignment of the inner sanctuary was preserved, and the reconstructed cliff face is virtually indistinguishable from the original.\n\nThis story adds a remarkable dimension to Abu Simbel: a monument that testifies to human ambition not once but twice—first in its 13th-century BC creation, and again in its 20th-century salvation.\n\n---\n\n**The Return Journey**\n\nAfter approximately 2-3 hours at the temples, return to your vehicle for the 3.5-hour drive back to Aswan, arriving in the late afternoon. The return journey offers different desert perspectives as the sun moves across the sky, and your guide may share additional context about Nubian culture, the Aswan Dam, and the rescue archaeology that saved numerous Nubian monuments.\n\n*Meals: Breakfast box, Lunch*',
    ARRAY[
      'Great Temple of Ramesses II – four 20m colossal statues',
      'Battle of Kadesh reliefs inside the Great Temple',
      'Inner sanctuary with solar alignment engineering',
      'Temple of Nefertari and Hathor',
      'UNESCO relocation story',
      'Saharan desert sunrise drive',
      'Lake Nasser landscape',
      'Professional Egyptologist guide',
      'Breakfast and lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Entrance fees to Abu Simbel temples',
      'Breakfast box for the morning journey',
      'Lunch at restaurant near Abu Simbel',
      'Air-conditioned vehicle with driver',
      'Hotel pickup and drop-off in Aswan',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus/bus, breakfast box + restaurant lunch near site. CRITICAL LOGISTICS: Departure 3:30-4:00 AM from Aswan hotels. All vehicles travel in a police convoy (security requirement—departure time is fixed). Drive 3-3.5 hrs each way. Allow 2-3 hrs at the temples. Return to Aswan by 1:00-2:00 PM typically. Total tour ~10-12 hrs. Early departure is non-negotiable (convoy schedule). Breakfast box essential—no food stops en route. The journey is long but the destination is unmissable.',
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
    'Abu Simbel Day Tour - Premium Experience',
    E'**Abu Simbel: A Premium Expedition to Egypt''s Greatest Monument**\n\nThe journey to Abu Simbel is itself an experience—280 kilometres across the Nubian desert, the landscape shifting from palm-fringed Nile to stark golden Sahara, the rising sun painting the sand in colours that photographers dream of. And then, at the journey''s end, the most spectacular sight in all of Egypt: four colossal statues of Ramesses II, each 20 meters tall, carved into a mountainside and guarding a temple that penetrates 60 meters into solid rock. With your experienced Egyptologist, small group, and premium vehicle, this expedition reveals Abu Simbel with the depth, comfort, and expert interpretation it demands.\n\n---\n\n**The Desert Crossing**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle at approximately **3:30-4:00 AM**—joining the convoy south from Aswan into the Nubian desert. The early start is rewarded: as you drive, the desert reveals itself in the rising light, and your guide uses the journey to set the historical stage.\n\nYour Egyptologist explains the context: **Nubia**—the region between Aswan and Khartoum—was both Egypt''s gateway to sub-Saharan Africa and its most contested frontier. Gold, ebony, ivory, incense, and exotic animals flowed north along the Nile from Nubia, making it a prize that every pharaoh sought to control. Abu Simbel was not merely a temple but a statement of dominion—Ramesses II''s declaration, carved into the very rock of Nubia, that Egypt''s power extended to the far reaches of the known world.\n\nThe landscape becomes your guide''s visual aid: the **Sahara** in its austere magnificence, **Lake Nasser** glimmering to the east (the world''s second-largest artificial lake, created by the Aswan High Dam), and the occasional Nubian settlement—mud-brick houses painted in vibrant blues, yellows, and whites—that punctuate the desert with unexpected colour.\n\nA quality breakfast box sustains you for the journey, and your guide shares the story of Abu Simbel''s modern rediscovery—Burckhardt''s 1813 encounter with the colossal heads protruding from the sand, and the subsequent excavation that revealed the most spectacular archaeological find in Nubia.\n\n---\n\n**The Great Temple of Ramesses II – The Colossus**\n\nArriving at Abu Simbel, the first view of the **Great Temple** is a moment that imprints itself permanently on memory. Your Egyptologist ensures you approach from the optimal angle—the four 20-meter colossi materialising gradually from behind a ridge, their scale increasing with every step until you stand directly before them, dwarfed to insignificance.\n\nYour guide provides the context that transforms spectacle into understanding. The temple was built between approximately **1264 and 1244 BC**, during the long reign of Ramesses II (67 years, the second-longest in Egyptian history). Its location was strategic: positioned at the southern frontier of Egypt, the colossal facade served as an unmistakable message to any Nubian approaching from the south—Egypt is powerful, its pharaoh is a god, and resistance is futile.\n\nThe **facade** is analyzed in detail: the four colossi''s serene expressions (identical, because they represent not the ageing pharaoh but the eternal concept of divine kingship), the smaller figures at their feet (identified by your guide: Nefertari, Queen Mother Tuya, favourite sons and daughters), the row of baboons above the entrance (sacred to Thoth, god of wisdom, and positioned to greet the rising sun), and the figure of **Ra-Horakhty** in the central niche.\n\nInside the temple, your guide navigates the sequence of halls and chambers with expert commentary:\n\n• The **first hall** with its eight Osiride pillars—each a 10-meter standing figure of Ramesses as Osiris—creating a corridor of monumental power. The walls bear the complete **Battle of Kadesh** narrative, and your guide walks you through the action: the Egyptian camp, the Hittite surprise attack, Ramesses'' single-handed chariot charge (propaganda, but magnificent propaganda), and the aftermath.\n\n• The **second hall**, smaller and more intimate, with reliefs showing Ramesses and Nefertari making offerings to the gods—a shift from military triumph to religious devotion.\n\n• The **inner sanctuary**, where four seated gods face the entrance. Your guide explains the solar phenomenon: twice yearly, on February 22 and October 22, the sun''s rays penetrate the full 60-meter length of the temple to illuminate three of the four statues—Ra-Horakhty, Amun-Ra, and the deified Ramesses—while Ptah, god of the underworld, remains appropriately in shadow. This feat of astronomical engineering, calculated over 3,200 years ago, demonstrates a level of scientific knowledge that continues to astonish.\n\n---\n\n**The Temple of Nefertari – A Love Letter in Stone**\n\nYour guide leads you to the **Temple of Hathor and Nefertari** with the story of the royal love that inspired it. Ramesses'' devotion to Nefertari pervades Egyptian monuments—poetry, inscriptions, and this extraordinary temple, one of only two ever built by a pharaoh to honour his wife.\n\nThe facade''s six standing statues are analyzed: Nefertari rendered at the **same height as Ramesses**—an act of artistic equality unprecedented in Egyptian art and deeply significant in a culture where scale expressed hierarchy. Your guide explains what this gesture meant in the theological language of pharaonic Egypt: Nefertari was not merely a queen but a divine partner.\n\nInside, the **Hathor-headed columns** of the first hall create an atmosphere of feminine grace and power. The reliefs—Nefertari crowned by Isis and Hathor, Nefertari offering to the gods, scenes of the royal couple in devotion—are among the most elegant in the New Kingdom. Where colours survive, they reveal the delicate palette of the original artists.\n\nYour guide reads the inscription on the temple''s exterior: *"She for whom the sun shines"*—Ramesses'' dedication to the woman he loved, carved into a Nubian mountainside to endure for eternity.\n\n---\n\n**The UNESCO Rescue**\n\nYour guide dedicates time to the extraordinary story of the temples'' relocation—an engineering achievement that rivals the original construction. Between 1964 and 1968, an international team cut both temples into over 1,000 blocks, lifted them 65 meters to higher ground, and reassembled them inside an artificial mountain—preserving the solar alignment with millimetric precision. Your guide explains the technical challenges, the international cooperation that made it possible, and the way this rescue operation launched the modern concept of World Heritage preservation.\n\n---\n\n**The Return**\n\nThe 3.5-hour return journey to Aswan provides time for reflection—and for your guide to share additional context about Nubian culture, the other rescued temples of Lake Nasser (Philae, Kalabsha, Wadi es-Sebua), and the ongoing relationship between modern Egypt and its Nubian heritage.\n\n*Meals: Breakfast box, Lunch*',
    ARRAY[
      'Premium vehicle with experienced Egyptologist (max 16)',
      'Great Temple facade analysis with guide',
      'Battle of Kadesh reliefs – narrative walkthrough',
      'Inner sanctuary solar alignment explanation',
      'Temple of Nefertari with royal love story context',
      'UNESCO relocation engineering narrative',
      'Nubian desert sunrise drive',
      'Lake Nasser landscape',
      'Quality breakfast and lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Entrance fees to Abu Simbel temples',
      'Quality breakfast box for the morning journey',
      'Lunch at quality restaurant near Abu Simbel',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel pickup and drop-off in Aswan',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality breakfast box + restaurant lunch. Same convoy logistics as budget—departure ~3:30-4:00 AM, fixed by police schedule. Premium vehicle is key comfort upgrade for 7+ hours of driving. Guide uses drive time for Nubia/Ramesses context. Allow 2.5-3 hrs at temples. Return Aswan by early-mid afternoon. Consider offering optional Philae Temple visit on return to Aswan (separate tour or add-on).',
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
    'Abu Simbel Day Tour - Deluxe Collection',
    E'**Abu Simbel: A Private Expedition to the Edge of Egypt**\n\nThis is Egypt''s most dramatic pilgrimage: 280 kilometres across the Nubian desert in a luxury vehicle with your private Egyptologist, to stand before the most spectacular monument the ancient world ever produced. Four colossal statues of Ramesses II—each 20 meters tall—carved into a mountainside at the very edge of the pharaonic empire. A temple that penetrates 60 meters into solid rock, its inner sanctuary engineered so precisely that twice each year the rising sun illuminates the faces of gods seated in perpetual darkness. And beside it, a temple of love—built by the most powerful man on Earth for the woman he adored. With private guidance, luxury transport, and the unhurried pace that this extraordinary site demands, Abu Simbel reveals itself completely.\n\n---\n\n**The Desert Crossing – A Private Journey**\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you in a luxury vehicle at approximately **3:30-4:00 AM**. The pre-dawn departure, while early, is transformed by private guidance: as the convoy heads south into the darkness, your guide begins the story of Nubia—Egypt''s golden frontier, its most coveted source of wealth, and the contested borderland where Ramesses chose to carve the most ambitious monument of his extraordinary reign.\n\nThe luxury vehicle makes the 3.5-hour journey significantly more comfortable than standard transport—reclining seats, climate control, ample legroom, and a premium breakfast box with quality provisions. As dawn breaks over the desert, your guide narrates the landscape: the geology of the Nubian sandstone, the ecology of Lake Nasser (home to Nile crocodiles, migratory birds, and the world''s second-largest population of Nile perch), and the Nubian communities whose culture—distinct from Egyptian, with its own language, music, and traditions—stretches back five thousand years.\n\nYour guide explains why Ramesses chose this specific location: the cliff face, perfectly oriented to catch the rising sun, stood at the southern boundary of Egyptian-controlled Nubia. Abu Simbel was not merely a temple but a weapon—a psychological instrument of imperial control, designed to awe and intimidate every Nubian who beheld it.\n\n---\n\n**The Great Temple – Private Encounter with the Colossus**\n\nArriving at Abu Simbel, your private guide orchestrates the approach for maximum impact—ensuring your first view of the four colossi is unobstructed and unhurried.\n\nThe **facade** receives the extended private attention it demands. Your guide analyzes each element with scholarly precision:\n\n• The four colossi''s **identical faces**—not portraits of the ageing Ramesses but idealised representations of eternal divine kingship, each detail (the nemes headdress, the double crown, the uraeus cobra, the false beard) carrying specific theological meaning.\n\n• The **smaller figures** at the colossi''s feet—your guide identifies each by name from the hieroglyphic cartouches: Nefertari (positioned beside the king''s legs, the most honoured position), Queen Mother Tuya, and favoured princes and princesses.\n\n• The **baboon frieze** along the cornice—22 baboons with raised arms greeting the rising sun, sacred to Thoth, positioned as the temple''s first line of solar worshippers.\n\n• The figure of **Ra-Horakhty** in the central niche—a rebus that spells out one of Ramesses'' throne names (User-Maat-Ra), making the entire facade a monumental royal signature.\n\nInside, your private guide reads the **Battle of Kadesh reliefs** with a depth unavailable to group tours. The narrative is traced scene by scene: the Egyptian intelligence failure (deceived by Hittite spies), the surprise chariot attack on the Egyptian camp, Ramesses'' personal courage (or self-aggrandizing propaganda—your guide presents both interpretations), and the aftermath that led to the first recorded peace treaty in human history. The artistic quality of these reliefs—their dynamic composition, the energy of charging horses and falling warriors—represents the finest battle art of the New Kingdom.\n\nThe **inner sanctuary** is experienced with your guide''s full astronomical and theological interpretation. The four seated figures—Ra-Horakhty, Amun-Ra, Ptah, and Ramesses himself—are identified and their significance explained: by placing his own image alongside the three greatest gods of Egypt, Ramesses claimed a status no pharaoh before him had asserted so boldly. The solar alignment is analyzed with scientific precision—the calculation required to ensure the sun''s rays would penetrate exactly 60 meters to strike precisely three of four statues on two specific dates demonstrates knowledge of solar mechanics that modern engineers find remarkable.\n\n---\n\n**The Temple of Nefertari – Love and Power**\n\nThe **Temple of Nefertari** with private guidance becomes one of the most moving experiences in Egyptian tourism.\n\nYour guide provides the full context of the Ramesses-Nefertari relationship: the poetry Ramesses composed for her (preserved on stelae and temple walls), the diplomatic role she played (her personal letter to the Hittite queen, discovered in the Hittite archives), and the unprecedented honour of this temple—where her statues stand at the same height as the pharaoh''s, a declaration of equality that was revolutionary in the rigidly hierarchical world of ancient Egypt.\n\nInside, the **Hathor-headed columns** and the painted reliefs are appreciated at leisure. Your guide explains the theological programme: Nefertari is not merely a queen making offerings but a divine figure in her own right—crowned by goddesses, participating in rituals normally reserved for pharaohs, and identified with Hathor herself. This is not decoration but deification—Ramesses elevating his wife to the status of a goddess.\n\nThe temple''s **colours**, where they survive, are pointed out by your guide—evidence of the original painted brilliance that once covered every surface of both temples.\n\n---\n\n**The UNESCO Rescue – The Full Story**\n\nWith private guidance and time, the relocation story receives the extended treatment it deserves. Your guide explains the political context (the Cold War dimensions of the Aswan Dam project, the Soviet and American involvement), the engineering challenges (cutting sandstone temples into blocks without damage, reassembling them inside an artificial mountain, preserving the solar alignment), and the legacy—the Abu Simbel rescue launched the UNESCO World Heritage programme and established the principle that cultural heritage belongs to all humanity.\n\nYour guide may point out the lines where the blocks were cut—visible on close inspection but invisible at normal viewing distance, a testament to the precision of the reconstruction.\n\n---\n\n**The Return Journey**\n\nThe luxury vehicle makes the return to Aswan a comfortable conclusion. Your guide uses the journey for additional context: the other rescued Nubian temples (Philae, Kalabsha, Amada, Wadi es-Sebua), the Nubian diaspora caused by the dam''s flooding, and the cultural renaissance now underway among Nubian communities in Aswan.\n\n*Meals: Breakfast box, Lunch*',
    ARRAY[
      'Private Egyptologist guide (max 8 guests)',
      'Great Temple facade analysis with hieroglyphic reading',
      'Battle of Kadesh reliefs – scene-by-scene narrative',
      'Inner sanctuary solar alignment with scientific analysis',
      'Temple of Nefertari with royal love story and deification context',
      'UNESCO relocation – full engineering story with visible cut lines',
      'Nubian cultural context throughout',
      'Luxury vehicle for 7+ hour round trip',
      'Premium breakfast and lunch'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Entrance fees to Abu Simbel temples',
      'Premium breakfast box with quality provisions',
      'Lunch at best available restaurant near Abu Simbel',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel pickup and drop-off in Aswan',
      'Complimentary refreshments throughout',
      'Neck pillows and comfort amenities for the journey',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), luxury vehicle (critical for 7+ hrs driving), premium breakfast box + best available lunch. Luxury vehicle is the single most important upgrade—reclining seats, ample legroom, climate control transform the journey. Same convoy logistics—departure ~3:30-4:00 AM. Private guide allows extended temple time (aim 3+ hours vs standard 2-2.5). Neck pillows/comfort amenities for pre-dawn drive. Guide should explain cut lines from UNESCO relocation. Consider offering Abu Simbel Sound & Light show as overnight add-on (requires staying overnight at Abu Simbel—separate product).',
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
    'Abu Simbel Day Tour - Ultimate Luxury',
    E'**Abu Simbel: A Private Scholarly Expedition to the Frontier of Empire**\n\nThis is not a day trip. It is an expedition—a private journey to the most remote and spectacular monument in all of Egypt, in the company of a PhD Egyptologist whose published research on Ramesses II, Nubian archaeology, or New Kingdom temple architecture transforms the experience from tourism into scholarship. Travel in a private luxury limousine fitted for long-distance comfort. Arrive at Abu Simbel to encounter the four colossi with a scholar who can read every hieroglyph on every surface. Experience the inner sanctuary''s astronomical engineering explained by someone who understands the mathematics behind it. Discover the Temple of Nefertari through the lens of royal theology and the most documented love story of the ancient world. This is Abu Simbel as it deserves to be experienced—at the highest level of comfort, knowledge, and exclusivity.\n\n---\n\n**Before Dawn: The Private Desert Crossing**\n\nYour private limousine—fitted for long-distance luxury with reclining seats, premium climate control, and a curated comfort package—collects you at approximately **3:30-4:00 AM**. Your personal **PhD Egyptologist** accompanies you throughout, and the 3.5-hour journey south becomes a private seminar on the world you are about to enter.\n\nAs the convoy departs Aswan and the city lights fall away, your scholar begins the story of **Ramesses II**—not the simplified legend but the complex reality: a pharaoh who reigned for 67 years, who fought the largest chariot battle in history to a draw and then claimed it as a victory, who fathered over 100 children, who built more monuments than any ruler in human history, and who lived so long that his own subjects believed he was immortal. By the time you reach Abu Simbel, you understand the man behind the monument—and the monument becomes immeasurably more meaningful.\n\nYour scholar explains **Nubia** with academic depth: the kingdom of Kush that threatened Egypt from the south, the gold mines that made Nubia the most valuable province in the empire (the Egyptian word for gold, *nub*, may be the origin of the name "Nubia"), the cultural exchange between Egyptian and Nubian civilizations, and the strategic calculus that led Ramesses to build his most spectacular monument at the empire''s furthest reach.\n\nA **gourmet breakfast hamper**—prepared to your dietary preferences—sustains you during the journey. The limousine ensures arrival refreshed and prepared for the experience ahead.\n\nAs the sun rises over the Sahara, your scholar points out geological features—the Nubian sandstone formation that provided the cliff face Ramesses'' sculptors carved, the evidence of ancient Nile channels (Lake Nasser covers the original river course), and the adaptation of desert flora and fauna to this extreme environment.\n\n---\n\n**The Great Temple – A Scholar''s Reading**\n\nYour PhD scholar orchestrates your first encounter with the **Great Temple** to maximise its impact—approaching from a vantage point that reveals the full facade in morning light, the four colossi emerging from the cliff with an authority that transcends time.\n\nThe **facade** becomes a text under your scholar''s interpretation:\n\n• Each of the four colossi is analyzed as a **theological statement**: the specific regalia depicted (each slightly different, representing different aspects of divine kingship), the inscriptions on the thrones (your scholar reads them directly), and the deliberate damage to one colossus (an earthquake shortly after construction—the fallen head still lies at the statue''s feet, too heavy to move).\n\n• The **central niche** is decoded: the figure of Ra-Horakhty is identified not merely as a sun god but as a cryptographic spelling of Ramesses'' throne name (User-Maat-Ra)—the entire facade is simultaneously a temple entrance and a monumental royal cartouche.\n\n• The **baboon frieze**, the **cornice decoration**, and the stelae flanking the entrance are read by your scholar—texts recording the temple''s dedication, Ramesses'' titles, and the divine mandate for its construction.\n\nInside, the **Battle of Kadesh reliefs** receive the fullest possible scholarly treatment. Your guide reads the hieroglyphic texts alongside the visual narrative—the two versions of the battle (the "Poem" and the "Bulletin") that are carved here, the diplomatic correspondence that followed (including letters between Ramesses and the Hittite king Hattusili III), and the peace treaty whose text survives in both Egyptian and Hittite versions. This was the ancient world''s first major diplomatic event, and your scholar explains its significance with reference to the latest research.\n\nThe **second hall''s reliefs** are read with equal precision: the offerings, the divine interactions, the ritual texts that reveal how the temple functioned on a daily basis—priests performing ceremonies before dawn, offerings of food and incense, hymns chanted in the darkness.\n\nThe **inner sanctuary** becomes the expedition''s intellectual climax. Your scholar explains the solar alignment not as a mystical curiosity but as a feat of applied astronomy: the precise calculation of solar declination, the orientation corrections required over 60 meters of tunneled rock, the possible calendrical significance of the February and October dates (possibly connected to Ramesses'' coronation and birthday, or to agricultural festivals), and the slight two-day shift caused by the temple''s relocation in the 1960s (the original alignment was February 21 and October 21). This discussion connects ancient Egyptian astronomical knowledge to the broader history of science.\n\nYour scholar also reveals details invisible without expert knowledge: mason''s marks on interior blocks (the signatures of work gangs), the evidence of ancient restoration (some reliefs were repaired in antiquity), and the technique of rock-cut temple construction—how sculptors worked from ceiling to floor, in total darkness, using only oil lamps and copper tools.\n\n---\n\n**The Temple of Nefertari – Theology and Love**\n\nThe **Temple of Nefertari** with a PhD scholar becomes a seminar on royal women in ancient Egypt.\n\nYour scholar provides the full documentary context: Nefertari''s origins (debated—possibly Theban nobility), her diplomatic skills (her letter to the Hittite queen Puduhepa, written in cuneiform, is one of the most remarkable documents of the ancient world), her role in the Kadesh peace negotiations, and the poetry Ramesses dedicated to her—preserved on stelae and temple walls across Egypt.\n\nThe temple''s theology is decoded: Nefertari''s identification with **Hathor** is not merely honorific but functional—she participates in rituals normally reserved for the pharaoh, acting as a divine mediator between the human and celestial realms. The equal-sized statues on the facade are placed in their art-historical context: in over 3,000 years of Egyptian art, a queen was almost never depicted at the same scale as the king. This temple broke the most fundamental rule of Egyptian iconography—and the fact that it was carved at the pharaoh''s own command makes it one of the most extraordinary declarations of love in human history.\n\nYour scholar reads the dedicatory inscriptions directly from the stone, including the famous *"She for whom the sun shines"*—placing these words in the context of ancient Egyptian love poetry, a literary tradition of remarkable sophistication and emotional depth.\n\n---\n\n**The UNESCO Rescue – Engineering and Ethics**\n\nYour scholar provides the definitive account of the 1960s relocation—with technical detail and political context unavailable from any other source. The Cold War dimensions (the Soviet-funded dam, the Western-funded rescue), the engineering innovations (how 30-ton blocks were cut with precision saws, how the artificial mountain was constructed to support the reassembled temples), and the ethical questions that arose (who owns cultural heritage? can a monument be "authentic" if moved?) are discussed with scholarly nuance.\n\nYour scholar identifies the **cut lines** visible on close inspection—demonstrating the extraordinary precision of the reconstruction—and explains the monitoring systems that ensure the temples'' structural integrity in their new location.\n\n---\n\n**The Return in Luxury**\n\nThe limousine ensures a comfortable return to Aswan. Your scholar continues the conversation: the broader story of Nubian rescue archaeology, the political dimensions of heritage preservation, and—if your interests extend there—the connections between ancient Nubian civilizations and the broader African context.\n\nA **gourmet lunch** is arranged either at the best available venue near Abu Simbel or at a premium restaurant upon return to Aswan, depending on your preference.\n\n*Meals: Gourmet breakfast hamper, Gourmet lunch*',
    ARRAY[
      'Personal PhD Egyptologist (fully private)',
      'Great Temple – hieroglyphic reading of facade and interiors',
      'Battle of Kadesh with diplomatic and military analysis',
      'Inner sanctuary solar alignment with astronomical precision',
      'Temple of Nefertari with royal women scholarship',
      'Nefertari love poetry and dedicatory inscriptions translated',
      'UNESCO relocation with engineering detail and cut line identification',
      'Mason''s marks and ancient restoration evidence',
      'Private luxury limousine for the full journey',
      'Gourmet breakfast hamper and fine dining lunch'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'Entrance fees to Abu Simbel temples',
      'Gourmet breakfast hamper (prepared to dietary preferences)',
      'Gourmet lunch at best available venue or premium Aswan restaurant',
      'Private luxury limousine (Mercedes S-Class or equivalent)',
      'Long-distance comfort package (neck pillows, blankets, amenities)',
      'Hotel pickup and drop-off in Aswan',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Ramesses II specialist or Nubian archaeologist), luxury limousine, gourmet provisions. The limousine is THE critical upgrade—7+ hours of driving requires genuine long-distance comfort (S-Class, V-Class VIP, or equivalent with reclining rear seats). Gourmet breakfast hamper prepared to dietary specifications. Lunch either at Abu Simbel (limited options—Eskaleh or Nefertari Hotel) or deferred to premium Aswan venue (Old Cataract, Mövenpick). Same convoy logistics—departure ~3:30-4:00 AM, non-negotiable. Scholar should allow 3+ hours at temples (private vehicle gives flexibility on return). ALTERNATIVE: For UHNW clients who want to avoid the 7-hour drive, offer Abu Simbel by private flight (EgyptAir or charter—separate product, 45 min each way). Mention flight option during booking.',
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
  RAISE NOTICE 'Migration 148 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Abu Simbel Day Tour:';
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
WHERE cl.slug = 'abu-simbel-bus-day-tour-aswan'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
