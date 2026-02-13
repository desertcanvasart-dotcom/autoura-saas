-- =====================================================================
-- Migration 149: Add Abu Simbel Day Excursion by Plane from Aswan
-- Description: Flight-based day tour to Abu Simbel temples
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
    'Abu Simbel Day Excursion by Plane from Aswan',
    'abu-simbel-flight-day-tour-aswan',
    'Fly to the most spectacular monument in Egypt—arriving refreshed, with maximum time at the temples and none of the fatigue of a seven-hour desert drive. A 45-minute flight from Aswan carries you over the Nubian desert and the shimmering expanse of Lake Nasser to land at Abu Simbel, where the four colossal statues of Ramesses II—each 20 meters tall—await carved into a mountainside at the frontier of the ancient empire. Explore both the Great Temple, with its Battle of Kadesh reliefs and twice-yearly solar alignment miracle, and the Temple of Nefertari, one of only two temples ever built by a pharaoh for his queen. With seamless airport transfers at both ends and your Egyptologist guide meeting you at the temples, this flight excursion delivers the full Abu Simbel experience in a fraction of the travel time—leaving you fresh to absorb every detail of these extraordinary monuments.',
    'Abu Simbel, Nubia, Egypt',
    '1 day (half day)',
    ARRAY['abu-simbel', 'ramesses-ii', 'nefertari', 'nubia', 'aswan', 'unesco', 'lake-nasser', 'flight', 'day-tour', 'sun-alignment', 'new-kingdom'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 6,
      'city', 'Aswan',
      'destination', 'Abu Simbel',
      'transport_mode', 'flight',
      'flight_time_minutes', 45,
      'highlights', ARRAY[
        'Great Temple of Ramesses II',
        'Temple of Nefertari (Hathor Temple)',
        'Four colossal seated statues (20m each)',
        'Inner sanctuary with solar alignment',
        'UNESCO relocation engineering marvel',
        'Aerial views over Lake Nasser'
      ],
      'included_meals', 'Lunch included (select tiers)',
      'transport', true,
      'flights_included', true
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
    'Abu Simbel by Plane - Classic Discovery',
    E'**Abu Simbel by Air: Egypt''s Greatest Monument Without the Desert Drive**\n\nAbu Simbel is the single most spectacular monument in Egypt—but at 280 kilometres south of Aswan, deep in the Nubian desert, reaching it by road requires a seven-hour round trip that begins before dawn. The flight alternative transforms the experience: a 45-minute hop over Lake Nasser delivers you to Abu Simbel refreshed and ready, with maximum time at the temples and the entire afternoon free upon your return to Aswan.\n\nThe monuments themselves lose nothing in the airborne approach—if anything, arriving by plane heightens the drama. One moment you are in bustling Aswan; the next, you are standing before four colossal statues of Ramesses II, each 20 meters tall, carved into a mountainside at the edge of the ancient world.\n\n---\n\n**Morning: Aswan to Abu Simbel**\n\n*Airport Transfer and Flight*\n\nYour day begins with a comfortable transfer from your hotel to **Aswan Airport**, where your representative ensures a smooth check-in for the short flight south. The **45-minute flight** itself is a highlight—crossing the Nubian desert at low altitude, with aerial views of **Lake Nasser** stretching to the horizon, its blue waters cutting through golden sand and black rock. On clear days, the temples of Abu Simbel are visible from the air as the plane descends—a tantalising preview of what awaits.\n\nUpon landing at Abu Simbel''s small airport, a local representative meets you and transfers you the short distance to the temple complex.\n\n---\n\n**The Great Temple of Ramesses II**\n\nThe first encounter with the **Great Temple** is a moment that transcends expectation. Four seated colossi of **Ramesses II**—each 20 meters tall, the height of a six-story building—are carved directly into the sandstone cliff face. Their serene, impassive faces have gazed across the Nubian desert for over 3,200 years, and their scale defies comprehension even when you stand directly at their feet.\n\nAt the base of the colossi, smaller figures represent members of the royal family—Nefertari, the queen mother Tuya, princes, and princesses—themselves larger than life-size but dwarfed by the pharaoh''s monumental presence. Above the entrance, a niche holds a statue of the sun god **Ra-Horakhty**, and the entire facade functions as both a temple entrance and a colossal theological statement.\n\nInside, the temple penetrates **60 meters into the mountain**. The first hall is supported by eight **Osiride pillars**—each a standing figure of Ramesses in the pose of Osiris—creating an atmosphere of overwhelming power. The walls bear detailed relief carvings of Ramesses'' military campaigns, most prominently the **Battle of Kadesh** (1274 BC) against the Hittite Empire, depicted with a dramatic energy unmatched in Egyptian art.\n\nYour guide explains the reliefs: the Egyptian camp ambushed by Hittite chariots, Ramesses'' single-handed counterattack, and the eventual outcome—not the decisive victory the pharaoh claimed but a strategic draw that led to history''s first recorded peace treaty.\n\nThe journey culminates at the **inner sanctuary**, where four seated statues face the entrance: **Ra-Horakhty**, **Amun-Ra**, **Ptah**, and **Ramesses II** himself—the pharaoh deified in his own lifetime, seated among the gods as their equal. Your guide explains the extraordinary solar phenomenon: twice each year—on **February 22 and October 22**—the rising sun penetrates the full 60-meter length of the temple to illuminate three of the four statues, while Ptah, god of the underworld, remains appropriately in shadow. This feat of astronomical engineering, calculated 3,200 years ago, still astonishes modern scientists.\n\n---\n\n**The Temple of Nefertari**\n\nBeside the Great Temple stands the **Temple of Hathor and Nefertari**—smaller in scale but equal in beauty and unique in Egyptian history. One of only **two temples ever built by a pharaoh to honour his wife**, it is a monument to the love between Ramesses and his queen.\n\nSix standing statues flank the entrance—four of Ramesses, two of Nefertari—and significantly, Nefertari''s statues are the **same height as the pharaoh''s**: an extraordinary gesture of equality unparalleled in over 3,000 years of Egyptian art. In a civilization where scale expressed divine hierarchy, this was a revolutionary statement.\n\nInside, the temple is dedicated to **Hathor**, goddess of love, beauty, and music. Hathor-headed columns support the first hall, and painted relief carvings of exquisite quality depict Nefertari making offerings to the gods, being crowned by Isis and Hathor, and appearing alongside Ramesses in acts of devotion. On the facade, Ramesses had inscribed his famous declaration: *"She for whom the sun shines"*—a love letter carved into a mountainside to endure for eternity.\n\n---\n\n**The UNESCO Rescue**\n\nYour guide shares the extraordinary story of the temples'' **1960s relocation**. When the Aswan High Dam threatened to submerge Abu Simbel beneath Lake Nasser, an international UNESCO campaign cut both temples into over **1,000 blocks** (each up to 30 tons), lifted them **65 meters higher**, and reassembled them on an artificial cliff—preserving the solar alignment with extraordinary precision. This $40 million operation (over $300 million in today''s terms) launched the modern concept of World Heritage preservation.\n\n---\n\n**Return Flight to Aswan**\n\nAfter exploring the temples, your representative escorts you to Abu Simbel airport for the **return flight to Aswan** (approximately 45 minutes). Upon landing, an air-conditioned transfer returns you to your hotel—typically by early afternoon, leaving the rest of your day free to explore Aswan, visit Philae Temple, or simply relax on the Nile.\n\n*Meals: Light refreshments*',
    ARRAY[
      'Return flights Aswan–Abu Simbel–Aswan',
      'Great Temple of Ramesses II – four 20m colossal statues',
      'Battle of Kadesh reliefs',
      'Inner sanctuary with solar alignment',
      'Temple of Nefertari and Hathor',
      'UNESCO relocation story',
      'Aerial views over Lake Nasser',
      'Professional Egyptologist guide at Abu Simbel',
      'Seamless airport transfers both ends'
    ],
    ARRAY[
      'Return flights Aswan–Abu Simbel–Aswan (economy class)',
      'Airport transfers in Aswan (hotel to airport and return)',
      'Airport transfer at Abu Simbel (airport to temples and return)',
      'Professional English-speaking Egyptologist guide at Abu Simbel',
      'Entrance fees to Abu Simbel temples',
      'All air-conditioned transfers',
      'Bottled water'
    ],
    'BUDGET TIER: Shared group at temples (max 20), economy flights, standard transfers. CRITICAL: Flights are on EgyptAir (typically 1-2 daily flights each way). Flight times vary by season—typically depart Aswan 07:30-08:30, return Abu Simbel 10:30-11:30. Total temple time approximately 2-2.5 hours. Book flights well in advance—limited seats, high demand especially Oct-Apr peak season. Flights can be cancelled in low season or bad weather—have contingency (bus tour backup). No meal included at budget tier—guests can buy at Abu Simbel cafeteria. Guests return to Aswan by early afternoon—can combine with afternoon Aswan activities.',
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
    'Abu Simbel by Plane - Premium Experience',
    E'**Abu Simbel by Air: The Premium Temple Experience**\n\nThe flight to Abu Simbel is not merely convenient—it is the civilised way to experience Egypt''s most spectacular monument. A 45-minute flight replaces a seven-hour desert drive, delivering you to the temples refreshed, alert, and ready to absorb every detail of Ramesses II''s extraordinary creation. With your experienced Egyptologist, small group, and the unhurried pace that flight-based timing allows, Abu Simbel reveals itself with a depth that exhausted overland travellers rarely achieve.\n\n---\n\n**Morning: The Flight South**\n\nYour experienced Egyptologist coordinates with your small group (maximum 16 guests) at your hotel for the transfer to **Aswan Airport**. The check-in process is managed smoothly, and the **45-minute flight** south provides aerial perspectives unavailable from the ground: the granite islands of the First Cataract, the vast blue expanse of **Lake Nasser** cutting through golden desert, and—as the plane descends—a bird''s-eye glimpse of the Abu Simbel temples themselves, their colossal facades visible from the air.\n\nYour Egyptologist uses the pre-flight and flight time to set the historical context: Ramesses II''s 67-year reign, his strategic reasons for building at the Nubian frontier, and the significance of Abu Simbel as both a religious monument and an instrument of imperial power.\n\nUpon landing, a comfortable transfer delivers you to the temple complex within minutes.\n\n---\n\n**The Great Temple – Expert Interpretation**\n\nYour Egyptologist orchestrates the approach to the **Great Temple** for maximum impact—the four 20-meter colossi materialising gradually as you round the pathway, their scale increasing with every step.\n\nThe **facade** receives expert analysis: the four colossi''s identical idealised faces (representing eternal divine kingship, not individual portraiture), the smaller royal family figures identified by name from their hieroglyphic cartouches, the 22 baboons greeting the rising sun along the cornice, and the figure of **Ra-Horakhty** in the central niche—decoded by your guide as a cryptographic spelling of Ramesses'' throne name, making the entire facade a monumental royal signature.\n\nInside, the **Battle of Kadesh reliefs** are narrated scene by scene: the intelligence failure, the Hittite ambush, Ramesses'' legendary chariot charge, and the diplomatic aftermath that produced history''s first peace treaty. Your guide presents both the pharaonic propaganda version and the modern historical reassessment—giving you the full picture.\n\nThe **inner sanctuary** receives the attention it deserves. Your Egyptologist explains the solar alignment with precision: the astronomical calculation required to direct sunlight 60 meters through solid rock to illuminate three specific statues on two specific dates, the possible calendrical significance of the February and October dates, and the slight two-day shift caused by the 1960s relocation.\n\n---\n\n**The Temple of Nefertari – The Love Story**\n\nYour guide leads you to the **Temple of Nefertari** with the story of the royal love that inspired it. The equal-sized statues on the facade are placed in their art-historical context—unprecedented in Egyptian art and deeply significant in a culture where scale expressed hierarchy.\n\nInside, the **Hathor-headed columns** and painted reliefs are appreciated with expert commentary: Nefertari''s theological elevation from queen to divine figure, her identification with Hathor, and the exquisite quality of the relief carvings. Your guide reads the famous inscription: *"She for whom the sun shines"*—and explains the tradition of ancient Egyptian love poetry that gives these words their full resonance.\n\n---\n\n**The UNESCO Rescue**\n\nYour Egyptologist provides a detailed account of the 1960s relocation: the political context of the Aswan Dam, the international mobilisation, the engineering challenge of cutting temples into blocks and reassembling them 65 meters higher while preserving the solar alignment, and the legacy that launched the World Heritage movement.\n\n---\n\n**Return to Aswan**\n\nA comfortable transfer returns you to Abu Simbel airport, and the **45-minute return flight** delivers you back to Aswan—typically by early afternoon. Your guide may recommend afternoon activities: a visit to **Philae Temple**, a felucca sail on the Nile, or a walk through the colourful **Aswan Souk**.\n\n*Meals: Lunch*',
    ARRAY[
      'Return flights with small group Egyptologist (max 16)',
      'Aerial views over Lake Nasser',
      'Great Temple facade with hieroglyphic decoding',
      'Battle of Kadesh – historical and propaganda analysis',
      'Inner sanctuary solar alignment with astronomical context',
      'Temple of Nefertari with love story and art-historical context',
      'UNESCO relocation engineering narrative',
      'Lunch included',
      'Seamless transfers throughout'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Return flights Aswan–Abu Simbel–Aswan (economy class)',
      'Airport transfers in Aswan (hotel to airport and return)',
      'Airport transfer at Abu Simbel (airport to temples and return)',
      'Entrance fees to Abu Simbel temples',
      'Lunch at quality restaurant near Abu Simbel',
      'All air-conditioned transfers',
      'Bottled water and refreshments'
    ],
    'STANDARD TIER: Small group (max 16), economy flights, quality transfers, lunch included. Guide accompanies group on flights and at temples. Lunch at Eskaleh or Nefertari Hotel near Abu Simbel (best available options). Same flight logistics as budget—book well in advance. Flight schedule typically allows 2.5-3 hrs at temples. Return to Aswan by early afternoon. Guide may offer optional afternoon Aswan activities (Philae, felucca—separate cost). Premium over budget tier: experienced guide throughout (not just at temples), lunch included, refreshments.',
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
    'Abu Simbel by Plane - Deluxe Collection',
    E'**Abu Simbel by Air: A Private Flight to the Frontier of Empire**\n\nFly to the most spectacular monument in Egypt with your private Egyptologist, luxury transfers, and the unhurried pace that transforms a temple visit into a genuine encounter. The 45-minute flight from Aswan eliminates the gruelling desert drive, delivering you refreshed to the four colossal statues of Ramesses II—each 20 meters tall, carved into a mountainside 3,200 years ago at the very edge of the pharaonic world. With private guidance (maximum 8 guests), every hieroglyph is read, every relief decoded, and the full story of Ramesses, Nefertari, and the extraordinary UNESCO rescue unfolds with scholarly depth and personal attention.\n\n---\n\n**Morning: The Private Flight**\n\nYour private Egyptologist (guiding a maximum of 8 guests) accompanies you from hotel to Aswan Airport in a luxury vehicle. The seamless transfer and assisted check-in ensure a stress-free departure.\n\nThe **45-minute flight** over the Nubian desert is a spectacle in itself: the granite landscape of the First Cataract gives way to the vast blue mirror of **Lake Nasser**, islands and peninsulas stretching to the horizon, the desert coast alternating between golden sand dunes and black volcanic rock. Your guide points out features visible from the air: the drowned sites of ancient Nubian settlements, the approximate location of the original Abu Simbel cliff (now submerged), and—as the plane descends—the temples themselves, their massive facades visible from altitude.\n\nA luxury vehicle meets you at Abu Simbel airport for the short transfer to the temples.\n\n---\n\n**The Great Temple – A Private Reading**\n\nWith your private Egyptologist, the **Great Temple of Ramesses II** reveals layers invisible to standard tours.\n\nThe **facade** is analyzed as a multi-layered text. Your guide reads hieroglyphic inscriptions directly from the stone: the cartouches on each colossus''s throne, the dedicatory texts flanking the entrance, the stelae recording the temple''s founding and Ramesses'' divine mandate. The central niche figure of Ra-Horakhty is decoded as a cryptographic spelling of Ramesses'' throne name—making the entire 33-meter-wide facade simultaneously a temple entrance and a monumental royal cartouche.\n\nYour guide draws attention to details most visitors miss: the damage to the second colossus (an earthquake shortly after construction—the fallen head and torso still lie at its feet, too heavy to move even in antiquity), the precision of the sculptors'' work (the colossi are carved from the living rock, not assembled from blocks), and the traces of original paint visible in protected crevices.\n\nInside, the **Battle of Kadesh reliefs** receive extended private attention. Your guide reads the two hieroglyphic versions of the battle carved on these walls—the *Poem* (a literary account in first person) and the *Bulletin* (a prose narrative)—alongside the visual narrative. The diplomatic correspondence that followed—letters between Ramesses and the Hittite king, the peace treaty whose text survives in both Egyptian and Hittite versions—is explained as the ancient world''s first major diplomatic event.\n\nThe **Osiride pillars** of the first hall are analyzed: their specific regalia decoded, the subtle differences between the four pairs noted, and the theological function of the Osiris pose explained (the pharaoh identified with the god of resurrection, promising his own eternal return).\n\nThe **inner sanctuary** becomes the visit''s intellectual climax. Your guide explains the solar alignment in full: the astronomical knowledge required, the engineering precision of tunnelling 60 meters into rock while maintaining exact orientation, the possible significance of the dates (Ramesses'' coronation? birthday? the agricultural calendar?), and the two-day shift caused by the 1960s relocation. Standing in this chamber, with your guide''s explanation transforming the darkness into meaning, is one of the most profound experiences available in Egyptian archaeology.\n\n---\n\n**The Temple of Nefertari – The Full Story**\n\nThe **Temple of Nefertari** with private guidance becomes a seminar on royal women, divine love, and the art of the New Kingdom.\n\nYour guide provides the complete documentary record: Nefertari''s possible origins, her diplomatic role (including her remarkable letter to the Hittite queen Puduhepa), the poetry Ramesses dedicated to her, and the theological innovation of this temple—where a queen is elevated to divine status, depicted at the pharaoh''s own height, and identified with the goddess Hathor.\n\nThe relief carvings inside receive close attention: their artistic quality, their theological programme (Nefertari participating in rituals normally reserved for the pharaoh), and the surviving colours that reveal the original painted brilliance. Your guide reads the famous dedication directly from the facade: *"She for whom the sun shines."*\n\n---\n\n**The UNESCO Rescue – Engineering Masterclass**\n\nWith private guidance and unhurried time, the relocation story is told in full: the Cold War politics of the Aswan Dam, the international UNESCO campaign, the engineering challenge of cutting 1,000 blocks and reassembling them inside an artificial mountain 65 meters higher, and the ethical questions about authenticity and cultural ownership. Your guide identifies the **cut lines** visible on close inspection—a testament to the reconstruction''s precision—and explains the monitoring systems that ensure ongoing structural integrity.\n\n---\n\n**Return in Comfort**\n\nA luxury vehicle returns you to Abu Simbel airport, and the **return flight** delivers you to Aswan in 45 minutes. A luxury transfer returns you to your hotel—typically by early afternoon.\n\nA **quality lunch** is arranged either near the temples before departure or at a premium restaurant in Aswan upon your return, depending on flight timing and your preference.\n\n*Meals: Lunch*',
    ARRAY[
      'Private Egyptologist guide (max 8 guests)',
      'Return flights with luxury airport transfers',
      'Aerial views over Lake Nasser',
      'Great Temple – hieroglyphic reading of facade and interiors',
      'Battle of Kadesh with Poem and Bulletin text analysis',
      'Osiride pillar analysis and theological decoding',
      'Inner sanctuary solar alignment – full astronomical explanation',
      'Temple of Nefertari with diplomatic and theological context',
      'UNESCO cut lines identification and engineering detail',
      'Luxury transfers and quality lunch'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Return flights Aswan–Abu Simbel–Aswan (economy class)',
      'Luxury airport transfers in Aswan (hotel to airport and return)',
      'Luxury transfer at Abu Simbel (airport to temples and return)',
      'Entrance fees to Abu Simbel temples',
      'Quality lunch (near temples or premium Aswan restaurant)',
      'All transfers in luxury vehicles',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), economy flights but luxury transfers at both ends. Private guide is the key upgrade—allows extended temple time, hieroglyphic reading, cut line identification. Luxury vehicles for all ground transfers (Mercedes E-Class or equivalent). Lunch flexibility—if flight timing allows, lunch near Abu Simbel (Eskaleh preferred); otherwise defer to premium Aswan venue (Old Cataract, Philae Restaurant). Flight schedule determines temple time—typically 2.5-3 hrs. Guide accompanies throughout including flights. Book flights early—peak season sells out months ahead.',
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
    'Abu Simbel by Plane - Ultimate Luxury',
    E'**Abu Simbel by Air: A Private Scholarly Flight to the Edge of the Ancient World**\n\nThis is Abu Simbel experienced at the highest possible level: a PhD Egyptologist at your side from departure to return, a private limousine to the airport, a flight over the Nubian desert, luxury transfers at Abu Simbel, and the most intellectually rich encounter with these monuments available anywhere. Your scholar reads every hieroglyph, decodes every relief, explains the astronomical engineering of the solar alignment with mathematical precision, and places the Temple of Nefertari in the context of royal theology and ancient love poetry. No desert fatigue. No convoy schedule. Maximum time at the temples. Maximum depth of understanding. This is Abu Simbel as Ramesses himself would have wished it experienced—with awe, knowledge, and the recognition that these are among the supreme achievements of human civilization.\n\n---\n\n**Morning: The Luxury Departure**\n\nYour private limousine collects you at your preferred time and delivers you to **Aswan Airport**, where a VIP assistance service ensures seamless check-in and boarding. Your personal **PhD Egyptologist**—a published specialist in Ramesses II, Nubian archaeology, or New Kingdom temple architecture—accompanies you throughout.\n\nThe **45-minute flight** becomes a private aerial seminar. As the plane crosses the First Cataract and Lake Nasser unfolds below, your scholar narrates the landscape: the drowned villages of Old Nubia (submerged when the dam was built), the approximate locations of rescued temples now on the lake''s shores (Kalabsha, Wadi es-Sebua, Amada), and the geological formation of the Nubian sandstone plateau that provided the cliff face Ramesses'' sculptors carved 3,200 years ago.\n\nYour scholar uses the flight to deliver the essential context: Ramesses II as a historical figure (not the simplified legend), Nubia as Egypt''s richest and most contested frontier, and Abu Simbel as the intersection of religion, politics, and art at the highest level of pharaonic ambition.\n\nA **private luxury vehicle** meets you at Abu Simbel airport.\n\n---\n\n**The Great Temple – The Scholar''s Complete Reading**\n\nWith a PhD Egyptologist, the **Great Temple of Abu Simbel** becomes legible—every surface carrying meaning that your scholar decodes in real time.\n\nThe **facade** is read as a multi-layered document:\n\n• Each colossus''s **throne inscriptions** are translated—different for each statue, recording different titles and aspects of Ramesses'' divine and earthly authority.\n\n• The **central niche** is decoded at the scholarly level: the Ra-Horakhty figure holding a *user* sceptre and standing on a *maat* hieroglyph, with a sun disk (*ra*) above—together spelling User-Maat-Ra, Ramesses'' throne name. The entire 33-meter facade is a monumental cryptogram.\n\n• The **stelae** flanking the entrance are read in full: texts recording the temple''s founding, the divine command that authorised its construction, and Ramesses'' claim of personal involvement in its design.\n\n• Your scholar explains the **earthquake damage** to the second colossus with geological and archaeological precision: the probable date, the evidence of ancient repair attempts, and the engineering implications for the remaining colossi.\n\nInside, your scholar provides the **definitive reading** of the Kadesh reliefs:\n\n• The two textual versions—the *Poem* and the *Bulletin*—are read from the walls, with your scholar explaining the literary conventions, the propaganda techniques, and the historical reality behind the bombastic claims. The Hittite version of events (from the archives discovered at Hattusa in modern Turkey) provides the counterpoint.\n\n• The **peace treaty** between Ramesses and Hattusili III—history''s first recorded peace treaty, preserved in both Egyptian and Hittite versions—is explained in full diplomatic context: the mutual defence clause, the extradition provisions, the guarantee of the Hittite princess who became Ramesses'' wife, and the remarkable fact that this treaty held for the rest of both empires'' existence.\n\n• The **Osiride pillars** are analyzed as theological artefacts: each figure''s specific regalia decoded, the crook and flail symbolism explained, and the function of the Osiris identification in the pharaoh''s quest for eternal resurrection.\n\nThe **inner sanctuary** receives your scholar''s most detailed attention. The solar alignment is explained not as mystique but as applied mathematics: the calculation of solar declination at this latitude, the precision required over 60 meters of tunnelled rock, the engineering technique of sighting through the temple axis during construction, and the comparison with other Egyptian temples that demonstrate similar (though less dramatic) solar orientations. Your scholar explains the two-day shift (from February 21/October 21 to February 22/October 22) caused by the 1960s relocation, and the debate about whether this shift could have been avoided.\n\nYour scholar also reveals what most visitors never see: **mason''s marks** on interior blocks (the signatures of work gangs, some humorous), evidence of **ancient repairs** (sections where sculptors corrected mistakes or repaired damage), and the technique of **rock-cut construction**—how the entire temple was carved top-down from the cliff face, with sculptors working in total darkness by oil lamp.\n\n---\n\n**The Temple of Nefertari – A Scholar''s Meditation on Love and Power**\n\nThe **Temple of Nefertari** with a PhD scholar becomes the most moving monument in Egypt.\n\nYour scholar provides the complete Nefertari dossier: her probable origins (evidence suggests Theban aristocracy, possibly connected to the family of Ay, Tutankhamun''s successor), her children (at least six, including the crown prince Amun-her-khepeshef), her diplomatic correspondence (the letter to Queen Puduhepa of Hatti, written in Akkadian cuneiform—one of the most remarkable documents of the ancient world), and the poetry Ramesses dedicated to her on monuments across Egypt.\n\nThe facade''s equal-height statues are analyzed in their full art-historical significance: in over 3,000 years of Egyptian art, across thousands of monuments, a queen was almost never depicted at the pharaoh''s scale. Your scholar explains what this meant in the semiotic language of Egyptian art—not merely honour but a claim of divine co-equality that challenged the fundamental principles of pharaonic iconography.\n\nInside, the **relief programme** is decoded: Nefertari''s identification with Hathor as a functional theological role (not merely an honour), her participation in rituals normally reserved for the king, and the artistic quality that places these reliefs among the finest of the New Kingdom.\n\nYour scholar reads the dedicatory inscription in full—*"Ramesses II made this temple by cutting in the mountain of eternal workmanship in Nubia, for the Great Royal Wife Nefertari, beloved of Mut, she for whom the sun shines"*—and places these words in the context of ancient Egyptian love poetry, explaining the literary conventions and emotional depth of a tradition that produced some of the most beautiful love lyrics of the ancient world.\n\n---\n\n**The UNESCO Rescue – The Definitive Account**\n\nYour scholar provides the full story with technical precision and political context: the Soviet-funded dam, the Western-funded rescue, the engineering innovation of VKE (Vattenbyggnadsbyrån) and Hochtief who designed the relocation, the 1,035 blocks (the heaviest 30 tons), the artificial mountain constructed from reinforced concrete domes, and the ethical debates that transformed international heritage law.\n\nYour scholar identifies **cut lines**, points out the **internal dome structure** visible from certain angles, and explains the ongoing monitoring programme that ensures the temples'' preservation in their new location.\n\n---\n\n**Return in Ultimate Comfort**\n\nA private luxury vehicle returns you to Abu Simbel airport. The **return flight** delivers you to Aswan in 45 minutes, where your limousine awaits.\n\nA **fine dining lunch** is arranged at Aswan''s finest venue—the **Old Cataract Hotel terrace**, **Mövenpick**, or a private arrangement—where the Nile views provide a serene conclusion to the morning''s extraordinary experience.\n\nYour limousine returns you to your hotel carrying memories of a monument experienced at its fullest depth—and personalised scholarly briefing notes for future reference.\n\n*Meals: Fine dining lunch*',
    ARRAY[
      'Personal PhD Egyptologist (fully private)',
      'Return flights with VIP airport assistance',
      'Private limousine transfers throughout',
      'Aerial views with scholarly Nubian landscape narration',
      'Great Temple – complete hieroglyphic reading of facade',
      'Battle of Kadesh with Poem, Bulletin, and Hittite counterpoint',
      'Peace treaty context – history''s first diplomatic agreement',
      'Inner sanctuary solar alignment with mathematical analysis',
      'Temple of Nefertari with Puduhepa letter and love poetry',
      'UNESCO rescue with engineering precision and cut line identification',
      'Mason''s marks and ancient repair evidence',
      'Fine dining lunch at Old Cataract or equivalent'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'Return flights Aswan–Abu Simbel–Aswan',
      'VIP airport assistance at Aswan',
      'Private limousine transfers in Aswan (Mercedes S-Class or equivalent)',
      'Private luxury vehicle transfers at Abu Simbel',
      'Entrance fees to Abu Simbel temples',
      'Fine dining lunch at premium Aswan venue (Old Cataract or equivalent)',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Ramesses II or Nubian specialist), private limousine in Aswan, luxury vehicle at Abu Simbel, VIP airport assistance. FLIGHTS: Economy class on EgyptAir (no business class on this route). For clients who want private aviation, charter flights can be arranged (significantly higher cost—enquire separately). Fine dining lunch at Old Cataract Hotel terrace (book in advance—prime Nile-view table). Scholar should have published on Ramesses II/Abu Simbel/Nubia. Flight schedule dictates temple time—aim 3+ hours. Return to Aswan by early afternoon, leaving time for optional afternoon activities (Philae Temple, felucca—can be added). For UHNW clients who want maximum comfort with minimum travel fatigue.',
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
  RAISE NOTICE 'Migration 149 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Abu Simbel Flight Tour:';
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
WHERE cl.slug = 'abu-simbel-flight-day-tour-aswan'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
