-- =====================================================================
-- Migration 146: Add Karnak & Luxor Temple Day Tour
-- Description: Half/full-day tour of Luxor's East Bank temples with 4 tier variations
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
    'Karnak & Luxor Temple Day Tour',
    'karnak-luxor-temple-day-tour',
    'Experience the monumental heart of ancient Thebes on Luxor''s East Bank—two of the greatest temple complexes ever built by human hands. At Karnak, walk through the largest religious building in the world: 1,300 years of pharaonic ambition expressed in towering pylons, colossal obelisks, and the breathtaking Great Hypostyle Hall with its forest of 134 massive columns. Then follow the ancient processional route—the recently restored Avenue of Sphinxes—to Luxor Temple, where the sacred Opet Festival once brought the gods themselves in procession from Karnak to renew the pharaoh''s divine power. Together, these two temples tell the complete story of Egyptian religion, royal authority, and architectural genius across thirty centuries.',
    'Luxor East Bank, Egypt',
    '1 day (half to full day)',
    ARRAY['luxor', 'karnak', 'luxor-temple', 'east-bank', 'avenue-of-sphinxes', 'hypostyle-hall', 'opet-festival', 'amun', 'day-tour', 'new-kingdom', 'thebes'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 6,
      'city', 'Luxor',
      'region', 'East Bank',
      'highlights', ARRAY[
        'Temple of Karnak',
        'Great Hypostyle Hall',
        'Sacred Lake at Karnak',
        'Obelisks of Hatshepsut and Thutmose I',
        'Avenue of Sphinxes',
        'Luxor Temple',
        'Colonnade of Amenhotep III'
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
    'Karnak & Luxor Temple Tour - Classic Discovery',
    E'**The Temples of Thebes: Karnak and Luxor Revealed**\n\nFor over three thousand years, ancient Thebes—modern Luxor—was the religious capital of Egypt, the city of the god Amun, and the site of the most ambitious temple-building programme in human history. Two monumental complexes on the East Bank preserve this legacy in stone of staggering scale and beauty: Karnak, the largest religious building ever constructed, and Luxor Temple, the sacred sanctuary of the Opet Festival where pharaohs renewed their divine right to rule.\n\nThis tour brings you face to face with the full power and artistry of ancient Egyptian temple architecture—from forests of colossal columns to delicate painted reliefs, from towering obelisks to the intimate chambers where priests performed rituals unchanged for millennia.\n\n---\n\n**Luxor Temple – Where the Pharaoh Became a God**\n\nYour day begins at **Luxor Temple**, rising from the heart of modern Luxor like a vision from another age. Built primarily during the reigns of two of Egypt''s greatest pharaohs—**Amenhotep III** (18th Dynasty) and **Ramesses II** (19th Dynasty)—this temple was not dedicated to a cult image or funeral rites but to the rejuvenation of kingship itself.\n\nThe approach is magnificent. The great **First Pylon** of Ramesses II—a towering facade 24 meters high—is flanked by a single remaining **obelisk** (its twin stands in the Place de la Concorde in Paris, a gift to France in 1833). Six colossal statues of Ramesses guard the entrance, their scale designed to overwhelm and inspire awe in all who approached.\n\nBeyond the pylon, the **Court of Ramesses II** opens before you—a peristyle courtyard surrounded by a double row of papyrus-bud columns, their surfaces covered in relief carvings depicting the pharaoh''s military victories and religious offerings. Your guide explains how this court was designed as a public space, where ordinary Egyptians could approach the sacred precinct during festivals.\n\nThe architectural mood shifts dramatically as you enter the **Colonnade of Amenhotep III**—fourteen massive papyrus columns, each standing 16 meters tall, lining a processional corridor whose walls bear the most important relief carvings in the temple: the scenes of the **Opet Festival**. Your guide explains this pivotal ceremony: each year during the Nile flood season, the sacred barque (ceremonial boat) of Amun was carried in grand procession from Karnak to Luxor Temple, accompanied by music, dancing, and the rejoicing of the entire city. Here, in the innermost sanctuary, the pharaoh communed with Amun and emerged reborn—his divine authority renewed for another year.\n\nThe **Court of Amenhotep III**—a graceful peristyle surrounded by double rows of clustered papyrus columns—leads to the inner sanctuaries where the mystery of the Opet was performed. Your guide reveals the temple''s extraordinary layers: a Roman-era shrine painted over pharaonic reliefs, a medieval mosque built into the upper structure (the **Mosque of Abu el-Haggag**, still active today), and the evidence of the temple''s use as a Christian church in the 6th century—three religions layered upon one sacred site.\n\n*The Avenue of Sphinxes*\n\nStep outside and walk along the recently restored **Avenue of Sphinxes**—a 2.7-kilometre processional road lined with sphinx statues that once connected Luxor Temple to Karnak. For over a thousand years, this sacred avenue carried festival processions between the two great temples. Buried for centuries beneath the modern city, its dramatic excavation and restoration is one of the greatest archaeological achievements of the 21st century. Your guide explains the avenue''s theological significance: it was not merely a road but a sacred corridor, each sphinx a guardian of the divine passage between Amun''s two great houses.\n\n---\n\n**Temple of Karnak – The Largest Religious Building on Earth**\n\nNo preparation fully readies you for **Karnak**. This is the largest religious building ever constructed—a vast complex covering over 200 acres, built, expanded, modified, and embellished by more than thirty pharaohs across a span of 1,300 years (c. 2000–700 BC). It is not one temple but many: a city of temples dedicated to the **Theban Triad**—the god **Amun-Ra**, his consort **Mut**, and their son **Khonsu**—each pharaoh adding courts, pylons, obelisks, and chapels in a cumulative expression of devotion and power that has no parallel in architecture.\n\nYour guide navigates the complex with expertise, ensuring you experience the highlights that convey Karnak''s full grandeur.\n\nThe **First Pylon**—the last and largest built (by the 30th Dynasty, never completed)—frames your entrance. Beyond it, the **Great Court** opens into an immense space flanked by the Temple of Seti II and the Barque Shrine of Ramesses III.\n\nThen, the monument that defines Karnak: the **Great Hypostyle Hall**. Nothing in the ancient or modern world quite compares. One hundred and thirty-four columns—the twelve central ones standing 21 meters high and 3.5 meters in diameter, the remaining 122 each standing 13 meters—create a forest of stone so vast and so dense that the eye cannot take it in at once. The columns were originally painted in vivid colours and supported a roof that plunged the hall into a mysterious twilight pierced by clerestory windows. Every surface is carved with relief scenes of pharaohs making offerings to the gods—**Seti I** on the northern walls (with reliefs of exquisite delicacy) and **Ramesses II** on the southern walls (with reliefs of robust power).\n\nYour guide explains the engineering: how these columns were erected, how the roof was placed, how the hall functioned as a ritual space where only priests could enter—a stone representation of the primeval marsh from which the ancient Egyptians believed creation emerged.\n\nBeyond the Hypostyle Hall, your tour continues through the heart of the complex: the **obelisks of Hatshepsut and Thutmose I** (the former at 29.5 meters, one of the tallest surviving obelisks in Egypt), the **Sacred Lake** (where priests purified themselves before performing rituals), and the **Festival Hall of Thutmose III** (with its unique tent-pole columns, designed to resemble the pharaoh''s military campaign tent).\n\nKarnak is overwhelming by design. It was meant to be: a monument to the absolute power of Amun-Ra, king of the gods, and to the pharaohs who served as his earthly representatives. Standing in the Hypostyle Hall, surrounded by columns that dwarf you into insignificance, you experience exactly what the ancient builders intended—a visceral encounter with the divine scale of Egyptian civilization.\n\n*Meals: Lunch*',
    ARRAY[
      'Luxor Temple with Opet Festival reliefs',
      'Colonnade of Amenhotep III',
      'Avenue of Sphinxes processional route',
      'Temple of Karnak – largest religious complex ever built',
      'Great Hypostyle Hall (134 columns)',
      'Obelisks of Hatshepsut and Thutmose I',
      'Sacred Lake at Karnak',
      'Professional English-speaking Egyptologist guide',
      'Lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Entrance fee to Luxor Temple',
      'Entrance fee to Karnak Temple complex',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel pickup and drop-off in Luxor',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. Tour order can be flexible—Luxor Temple first (morning light) or Karnak first (to beat crowds). Avenue of Sphinxes is a walk-through (no entrance fee). Karnak is vast—allow minimum 2 hours. Luxor Temple is stunning at both day and night (night visit possible as alternative—illuminated temple is spectacular). Comfortable walking shoes essential.',
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
    'Karnak & Luxor Temple Tour - Premium Experience',
    E'**The Sacred East Bank: A Premium Journey Through Egypt''s Greatest Temples**\n\nKarnak and Luxor Temple are not merely ancient monuments—they are the most complete surviving expression of Egyptian religious thought, royal ideology, and architectural ambition. Experienced with an expert Egyptologist, a small group, and the time to absorb their grandeur, these two temples reveal the full depth of a civilization that built on a scale no other culture has matched. This premium tour provides the expertise, comfort, and pacing that these extraordinary sites demand.\n\n---\n\n**Morning: Luxor Temple – The Sanctuary of Divine Kingship**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle and begins the story of Thebes as you drive—the city that Homer called "hundred-gated," the religious capital of the New Kingdom, and the home of Amun-Ra, king of the gods.\n\n**Luxor Temple** in the morning light is a study in architectural harmony. Your guide explains the temple''s unique purpose: unlike most Egyptian temples, which were dedicated to the worship of a specific deity, Luxor Temple was dedicated to the **ka** (divine spirit) of kingship itself—the mystical force that passed from pharaoh to pharaoh, linking each ruler to the gods and to all who came before.\n\nThe approach through the **First Pylon** of Ramesses II is narrated with expert context: the battle reliefs depicting the **Battle of Kadesh** (1274 BC)—the first battle in history for which we have detailed accounts from both sides (Egyptian and Hittite)—and the colossal seated statues whose idealized features express not individual portraiture but the eternal concept of divine kingship.\n\nInside, the **Court of Ramesses II** is analyzed as political architecture: your guide explains how Ramesses appropriated earlier structures, repositioned statues, and inscribed his cartouches with deliberate depth to prevent future pharaohs from erasing them (a practice he himself freely employed on his predecessors'' monuments).\n\nThe **Colonnade of Amenhotep III** receives the extended attention its reliefs deserve. Your Egyptologist walks you through the **Opet Festival scenes** panel by panel: the preparation of the sacred barques, the procession from Karnak (musicians, dancers, acrobats, soldiers, and priests), the river journey on the Nile, the arrival at Luxor Temple, and the secret rites within the sanctuary where the pharaoh emerged renewed. These reliefs—carved with extraordinary detail and originally painted in vivid colours—constitute our primary visual record of ancient Egypt''s most important annual festival.\n\nThe **Court of Amenhotep III** is appreciated as one of the finest examples of New Kingdom architecture: perfectly proportioned, its clustered papyrus columns creating rhythms of light and shadow that architects still study. Your guide leads you to the inner sanctuaries, including the **birth room** where reliefs depict the divine conception of Amenhotep III by the god Amun—a theological claim that directly parallels the later Christian nativity narrative.\n\nYour guide also explains the temple''s remarkable layers: the **Roman shrine** with its painted imperial figures, the evidence of the building''s use as a **Christian church** (crosses carved into pharaonic reliefs), and the **Mosque of Abu el-Haggag** perched above the courtyard—a living place of worship whose annual festival echoes the ancient Opet procession it unknowingly continues.\n\n*The Avenue of Sphinxes – Walking the Sacred Road*\n\nYour group walks a section of the restored **Avenue of Sphinxes**, and your guide explains the extraordinary archaeological project that uncovered this 2.7-kilometre processional way from beneath modern Luxor—houses, shops, and mosques carefully relocated to reveal the sphinx-lined road that once connected Egypt''s two greatest temples.\n\nYour guide identifies the different phases of sphinx statues along the route: ram-headed sphinxes near Karnak (representing Amun), human-headed sphinxes near Luxor Temple (representing pharaonic authority), and the points where the avenue crossed ancient canals and streets.\n\n---\n\n**Afternoon: Temple of Karnak – Layer Upon Layer of Grandeur**\n\nAfter a quality lunch, enter the **Temple of Karnak** with the preparation and pacing it demands.\n\nYour Egyptologist provides the historical framework: Karnak was not planned as a single building but grew organically over 1,300 years, each pharaoh adding to the complex in an unending competition of piety and ambition. The result is a labyrinth of courts, halls, pylons, obelisks, and chapels that collectively constitute the most comprehensive archive of Egyptian religious architecture in existence.\n\nThe **Great Hypostyle Hall** receives the time it demands—your guide ensures you appreciate not just the scale (134 columns, the largest standing 21 meters high) but the artistry. The **northern wall reliefs** by Seti I are masterpieces of sunk relief: intricate, delicate, and deeply carved, their quality visible in every feather of Ma''at''s wings, every detail of the pharaoh''s offerings. The **southern wall reliefs** by Ramesses II offer a contrasting style: bold, confident raised relief that conveys power rather than refinement. Your guide explains why this stylistic shift occurred and what it reveals about the different artistic philosophies of these two great pharaohs.\n\nYour guide draws attention to the **clerestory window system**: the central columns are taller than the flanking columns, creating a gap through which light entered the otherwise dark hall—a lighting technique later adopted by Roman basilicas and, through them, by Christian churches. The Hypostyle Hall is thus not merely an ancient monument but a direct ancestor of Western sacred architecture.\n\nBeyond the Hypostyle Hall, your tour deepens: the **obelisk of Hatshepsut** (29.5 meters of solid granite, originally tipped with electrum—a gold-silver alloy—that caught the sun and was visible for miles), the **Sacred Lake** (where your guide explains the priestly purification rituals performed here three times daily), and the **Festival Hall of Thutmose III** with its extraordinary tent-pole columns—a design unique in Egyptian architecture, replicating in permanent stone the mobile military tent of Egypt''s greatest warrior-pharaoh.\n\nYour guide may also lead you to the lesser-visited **Temple of Khonsu** and the **Open-Air Museum** (if time permits), where reconstructed shrines and chapels from earlier periods of Karnak''s history provide intimate encounters with some of the complex''s finest relief carvings.\n\nReturn to your hotel with a transformed understanding of what ancient Egyptian temples were: not mere buildings but cosmic machines, designed to maintain the order of the universe through perpetual ritual and divine interaction.\n\n*Meals: Lunch*',
    ARRAY[
      'Luxor Temple with extended Opet Festival relief tour',
      'Colonnade of Amenhotep III with panel-by-panel narrative',
      'Birth Room and inner sanctuaries at Luxor Temple',
      'Avenue of Sphinxes with archaeological context',
      'Karnak Temple with historical framework',
      'Great Hypostyle Hall – Seti I and Ramesses II relief comparison',
      'Obelisk of Hatshepsut and Sacred Lake',
      'Festival Hall of Thutmose III',
      'Experienced Egyptologist (small group max 16)',
      'Premium vehicle and quality lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Entrance fee to Luxor Temple',
      'Entrance fee to Karnak Temple complex',
      'Quality lunch at well-selected restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel pickup and drop-off in Luxor',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Tour order flexible—Luxor Temple morning (good light for photography), Karnak afternoon (fewer crowds late afternoon). Allow 1.5-2 hrs at Luxor Temple, 2.5-3 hrs at Karnak. Avenue of Sphinxes walk is partially along public road—guide manages the experience. Open-Air Museum at Karnak requires separate ticket (optional). Consider offering evening return to Luxor Temple for illuminated night visit (separate ticket, spectacular).',
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
    'Karnak & Luxor Temple Tour - Deluxe Collection',
    E'**The Temples of Amun: A Private Exploration of the Sacred East Bank**\n\nWith your private Egyptologist, luxury vehicle, and unhurried pace, Karnak and Luxor Temple reveal themselves as no group tour can show them. Enter the Great Hypostyle Hall when the light angles through the clerestory windows. Read the Opet Festival reliefs at Luxor Temple with a guide who translates the hieroglyphs in real time. Access Karnak''s Open-Air Museum and the rooftop views most visitors never see. Then return at sunset for a private visit to Luxor Temple illuminated at night—the single most atmospheric experience in Egyptian tourism. This is the East Bank experienced at its deepest and most beautiful.\n\n---\n\n**Morning: Luxor Temple – The Private Experience**\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you in a luxury vehicle, and the day begins with a scholarly introduction to Thebes—not the simplified narrative of a standard tour but a scholar''s understanding of how this city functioned as the religious engine of an empire.\n\n**Luxor Temple** under private guidance becomes a masterclass in Egyptian theology and architecture.\n\nYour guide reads the hieroglyphic inscriptions as you walk—the cartouches of Ramesses II on the First Pylon, the offering formulae carved into column shafts, the Opet Festival texts that describe the rituals performed within these walls. This is not decoration but documentation: every carved surface served a theological purpose, and your guide explains the system.\n\nThe **Court of Ramesses II** is analyzed with an architect''s eye: the deliberate asymmetry (the court''s axis shifts to accommodate the pre-existing Mosque of Abu el-Haggag), the reuse of blocks from earlier structures visible in the foundations, and the way Ramesses integrated the earlier Barque Chapel of Thutmose III into his grand design.\n\nThe **Colonnade of Amenhotep III** receives extended private attention. Your guide walks you through the Opet Festival reliefs with the intimacy of a private seminar—identifying individual figures, explaining the processional sequence, decoding the musical instruments depicted, and connecting these scenes to the broader theology of divine kingship. These reliefs, your guide explains, are the single most important visual source for understanding how ancient Egyptian festivals actually functioned.\n\nIn the inner sanctuaries, your guide reveals details invisible to casual visitors: the **Alexander the Great shrine** (rebuilt in the conqueror''s name after he claimed to be Amun''s son), the **birth room** with its divine conception narrative, and traces of the **Roman frescos** that once covered the pharaonic reliefs when the temple''s hypostyle hall was converted into a Roman legion''s shrine.\n\nThe temple''s extraordinary layering—pharaonic, Ptolemaic, Roman, Christian, Islamic—is presented as a single continuous narrative of sacred space: the same location revered as holy for over three thousand years, each civilization recognizing the power of the place and building upon what came before.\n\n*Avenue of Sphinxes – The Scholarly Walk*\n\nYour private guide walks a section of the **Avenue of Sphinxes** with archaeological commentary: the excavation methodology, the controversies surrounding the modern restoration, and the original construction phases that created this extraordinary processional way. Your guide points out where the avenue crossed ancient canals (by bridge), where it passed through Ptolemaic-era gates (the foundations still visible), and where the different sphinx styles mark boundaries between pharaonic building programmes.\n\n---\n\n**Midday: Temple of Karnak – The Complete Complex**\n\nAfter a premium lunch at a carefully selected restaurant, enter **Karnak** with the time and expertise it truly demands.\n\nYour private Egyptologist begins at the **First Pylon** and unfolds the complex chronologically—explaining how each pharaoh''s contribution relates to the previous one, how the temple grew outward from its Middle Kingdom core like rings on a tree, and how political rivalries between pharaohs are encoded in the architecture (obelisks walled up by jealous successors, cartouches erased and re-carved, entire structures demolished and their blocks reused as fill).\n\nThe **Great Hypostyle Hall** with a private guide is a transformative experience. Your Egyptologist selects the optimal time of day when light enters through the clerestory windows—creating shafts of illumination that pick out individual reliefs with dramatic precision. The contrast between **Seti I''s northern reliefs** (sunk relief of extraordinary refinement—your guide explains how the stone was first smoothed, then incised, then carved inward, creating shadows that make figures appear to emerge from the wall) and **Ramesses II''s southern reliefs** (raised relief carved outward from the surface, bolder and faster to execute) becomes a lesson in artistic philosophy as much as technique.\n\nYour guide reads specific inscriptions: the **Battle of Kadesh** texts on the exterior walls (the same battle depicted at Luxor Temple, Abu Simbel, and the Ramesseum—Ramesses considered it his greatest triumph, though modern historians call it a draw), offering formulae that reveal the daily rituals performed in the hall, and construction texts that document the human labour behind this superhuman achievement.\n\nBeyond the Hypostyle Hall, your private tour accesses areas most visitors miss:\n\n• The **Open-Air Museum** (separate ticket, included in your deluxe tour)—a curated collection of reconstructed shrines, chapels, and architectural elements from earlier phases of Karnak''s history, including the exquisite **White Chapel of Senusret I** (Middle Kingdom, c. 1950 BC), whose relief carvings are among the finest to survive from any period of Egyptian art.\n\n• The **Sacred Lake** with extended scholarly context—your guide explains the lake''s role in daily temple ritual (priestly purification three times daily), the giant scarab statue on its shore (dedicated by Amenhotep III and believed to bring good fortune), and the archaeological evidence for the lakeside structures that once surrounded it.\n\n• The **Botanical Garden** of Thutmose III—a small chamber within the Festival Hall whose walls are carved with the exotic plants and animals the pharaoh encountered during his military campaigns in Syria—one of the earliest surviving attempts at scientific botanical illustration.\n\n• The **Temple of Khonsu**—a rarely visited but beautifully proportioned temple within the Karnak complex, dedicated to the moon god and built by Ramesses III, with some of the best-preserved reliefs and paintwork in the entire complex.\n\n---\n\n**Evening: Luxor Temple by Night**\n\nThe day''s climax—and perhaps the single most memorable experience available in Luxor—is a return to **Luxor Temple after dark**.\n\nIlluminated by carefully placed golden floodlights, the temple undergoes a complete transformation. Columns glow like amber. Shadows deepen dramatically, picking out relief carvings invisible in daylight. The Colonnade of Amenhotep III becomes a cathedral of light, its papyrus columns rising into darkness above. The obelisk of Ramesses II catches the light against the night sky. And the sounds of modern Luxor—call to prayer, traffic, the hum of the living city—create a soundtrack that connects the ancient to the present in a way no museum can replicate.\n\nYour guide provides a different narrative at night: the temple as the ancient Egyptians experienced it during the Opet Festival—torchlit processions, the sacred barque carried on priests'' shoulders, the chanting and music that echoed through these same colonnades three thousand years ago. In the golden light, with shadows dancing on carved stone, the ancient past feels extraordinarily close.\n\n*Meals: Lunch*',
    ARRAY[
      'Luxor Temple with hieroglyphic reading and inner sanctuaries',
      'Alexander the Great shrine and Roman frescoes',
      'Avenue of Sphinxes with archaeological commentary',
      'Karnak with chronological private guide',
      'Great Hypostyle Hall with optimal lighting visit',
      'Open-Air Museum including White Chapel of Senusret I',
      'Botanical Garden of Thutmose III',
      'Temple of Khonsu',
      'Luxor Temple illuminated night visit',
      'Private Egyptologist (max 8 guests)',
      'Luxury vehicle and premium lunch'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Entrance fee to Luxor Temple (day visit)',
      'Entrance fee to Luxor Temple (evening illuminated visit)',
      'Entrance fee to Karnak Temple complex',
      'Entrance fee to Karnak Open-Air Museum',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel pickup and drop-off in Luxor',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), luxury vehicle, premium lunch. Key upgrades: Karnak Open-Air Museum (separate ticket—included), Temple of Khonsu, Botanical Garden. MAJOR DIFFERENTIATOR: Evening return to Luxor Temple for illuminated night visit (separate entrance ticket—included). Night visit is the most atmospheric experience in Luxor—arrange timing for after sunset. Photography spectacular at night. Allow 2 hrs at Luxor Temple (day), 2.5-3 hrs at Karnak, 1-1.5 hrs at Luxor Temple (night). Full day with evening component—ensure guests are prepared for long day.',
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
    'Karnak & Luxor Temple Tour - Ultimate Luxury',
    E'**The Houses of Amun: A Private Scholarly Expedition Through Egypt''s Greatest Temples**\n\nThis is not a temple visit. It is a private audience with 3,000 years of sacred architecture, conducted by a PhD Egyptologist whose published research on Theban temples, New Kingdom religion, or Egyptian art transforms every column, every relief, every inscription into a revelation. Read the hieroglyphs with a scholar who has spent years studying these walls. Access areas closed to the general public. Experience the Great Hypostyle Hall in conditions of near-solitude. Witness Luxor Temple''s transformation at sunset and under floodlights with a scholar''s narrative. Travel by private limousine. Dine at Luxor''s finest. This is the East Bank experienced at its absolute pinnacle—for those who accept nothing less than the extraordinary.\n\n---\n\n**Morning: Luxor Temple – The Scholar''s Reading**\n\nYour private limousine collects you at your preferred time, and your personal **PhD Egyptologist**—a published specialist in New Kingdom temples, Egyptian religion, or Theban archaeology—begins what will be the most intellectually rich temple visit of your life.\n\n**Luxor Temple** with a PhD scholar becomes a text to be read—every surface carries meaning, and your guide decodes it in real time.\n\nThe **First Pylon''s Battle of Kadesh reliefs** are analyzed as both historical document and propaganda: your scholar explains Ramesses'' strategic situation (ambushed by the Hittite army, nearly killed, saved by the timely arrival of reinforcements), the literary versions of the battle (written as both an epic poem and a prose report), and the political reality that led to history''s first recorded peace treaty between Egypt and Hatti. The reliefs are read as a visual narrative—your scholar traces the action from the Egyptian camp through the surprise attack to the pharaoh''s single-handed chariot charge, identifying individual units, weapons, and tactical formations.\n\nInside the temple, your scholar provides readings unavailable to any other visitor:\n\n• The **Opet Festival reliefs** on the Colonnade of Amenhotep III are decoded scene by scene—your scholar identifies the priests by their titles (visible in the hieroglyphs), names the musical instruments depicted (sistrum, menat, harp, double clarinet), explains the ritual actions being performed, and connects each scene to the textual descriptions of the Opet from contemporary papyri. The theological purpose of the festival—the renewal of the pharaoh''s ka through communion with Amun—is explained with scholarly precision.\n\n• The **birth room** is interpreted as a political document: the narrative of divine conception (the god Amun visiting the queen in the form of the pharaoh, the divine child nursed by goddesses, the presentation to the court) is a visual argument for the legitimacy of the pharaoh''s rule—a claim your scholar connects to similar narratives at Hatshepsut''s temple and to the later Christian nativity story.\n\n• The **Alexander the Great sanctuary** is placed in its Ptolemaic context: the Macedonian conqueror''s calculated decision to present himself as Amun''s son, the political implications of this theological claim, and the remarkable continuity it represents—a Greek king performing the same rituals in the same space as his pharaonic predecessors.\n\n• The **Roman shrine** is revealed beneath layers of paint and modification: your scholar explains the transformation of the temple''s hypostyle hall into a shrine of the imperial cult, the painted figures of Roman emperors and gods that overlay pharaonic reliefs, and the evidence of early Christian use (carved crosses, scratched prayers) that followed.\n\nYour scholar may also arrange **special access** to areas normally restricted: conservation workshops, recently excavated areas within the temple precinct, or rooftop viewpoints that provide a bird''s-eye perspective of the temple''s plan and its relationship to the Nile and the modern city.\n\n*Avenue of Sphinxes – The Archaeological Narrative*\n\nWalking the **Avenue of Sphinxes** with a PhD archaeologist transforms a pleasant stroll into a lesson in urban archaeology. Your scholar explains the excavation challenges (relocating an entire neighbourhood), the dating evidence for different construction phases, and the political context that drove the avenue''s original construction and its modern restoration.\n\n---\n\n**Afternoon: Temple of Karnak – A Scholar''s Expedition**\n\nA refined lunch at Luxor''s finest restaurant—**Sofitel Winter Palace**, **1886 Restaurant**, or a private arrangement—provides a moment of comfort before the afternoon''s intellectual immersion.\n\nEnter **Karnak** with a scholar who has spent years studying its architecture, and the complex becomes something it can never be for an ordinary visitor: legible.\n\nYour scholar navigates the complex not by the standard tourist route but by a chronological journey through Karnak''s construction—beginning at the **Middle Kingdom core** (the oldest surviving structure, buried within the later complex) and working outward through the successive building phases of the New Kingdom, the Third Intermediate Period, and the Ptolemaic era. Each pharaoh''s contribution is identified, dated, and explained in terms of the political and religious motivations that drove it.\n\nThe **Great Hypostyle Hall** with your scholar becomes the supreme experience. Your guide has timed the visit for optimal conditions—late afternoon, when the descending sun sends golden light through the western clerestory windows, illuminating the Seti I reliefs with the same light that the hall''s original designers intended.\n\nYour scholar reads the reliefs directly from the walls: offering formulae, royal titles, theological texts, and the military campaign records carved on the exterior walls. The distinction between Seti I''s sunk relief (carved into the stone, creating subtle shadows—a technique that took longer but produced more refined results) and Ramesses II''s raised relief (carved outward from the surface, faster to execute, visible at greater distances) is explained as a deliberate artistic and political choice, not merely a difference in quality.\n\nWith VIP access arranged by your scholar, you explore areas of Karnak closed to the general public or rarely visited:\n\n• The **Open-Air Museum** with full scholarly interpretation—your guide explains the reconstruction methodology and the significance of each shrine, with special attention to the **White Chapel of Senusret I** (whose relief quality is among the finest in all of Egyptian art) and the **Red Chapel of Hatshepsut** (whose reassembled blocks tell the story of a queen''s erasure and a chapel''s destruction and resurrection).\n\n• The **Akhmenu (Festival Hall of Thutmose III)** with its extraordinary tent-pole columns and the **Botanical Garden** chamber—where your scholar explains the reliefs of exotic Syrian and Levantine plants as both a scientific record and a display of imperial power over the natural world.\n\n• The **Temple of Ptah** (northern Karnak)—a rarely visited gem with intact painted reliefs and a cult statue of the goddess Sekhmet still standing in her darkened sanctuary, where priests placed offerings for over a thousand years.\n\n• The **Sacred Lake** with your scholar''s full explanation of the daily purification rituals, the astronomical alignments of the lake precinct, and the relationship between the lake''s orientation and the temple''s cosmological plan.\n\n• If accessible, your scholar may arrange a visit to the **rooftop of the First Pylon**—providing a breathtaking aerial view of the entire Karnak complex and its axial relationship to Luxor Temple to the south.\n\n---\n\n**Sunset & Evening: Luxor Temple Illuminated – The Private Finale**\n\nAs the sun descends toward the Western Hills, your limousine returns you to **Luxor Temple** for the day''s culminating experience.\n\nArriving at the **golden hour**, you experience the temple''s transformation from daylight to darkness. The columns of the Hypostyle Hall glow amber as the sun sets. The reliefs, raked by the low light, spring into three-dimensional life. Then, as darkness falls and the floodlights gradually illuminate the temple, the entire complex undergoes a metamorphosis—from archaeological site to living sanctuary.\n\nYour scholar provides a different narrative at night: the temple as the ancient Egyptians knew it during the **Opet Festival**—torchlit processions winding through these same colonnades, the sacred barque of Amun carried on the shoulders of shaven-headed priests, the chanting of hymns that echoed off these very columns, the music and dancing that accompanied the gods on their journey from Karnak. In the golden floodlight, with the obelisk of Ramesses II piercing the night sky and the sounds of modern Luxor creating an extraordinary soundtrack, the ancient past feels not distant but present—separated from you by time but not by space.\n\nA **private refreshment service** may be arranged at a rooftop terrace with temple views—chilled champagne or traditional hibiscus tea as you absorb the most atmospheric archaeological experience in Egypt.\n\nYour limousine returns you to your hotel, carrying memories of a day that revealed the East Bank in its fullest depth—the houses of Amun-Ra experienced at the level of their original creators: with awe, understanding, and the recognition that these are not ruins but the greatest sacred spaces the ancient world produced.\n\n*Meals: Lunch*',
    ARRAY[
      'Personal PhD Egyptologist (fully private)',
      'Luxor Temple with hieroglyphic decoding and special access',
      'Opet Festival reliefs – scene-by-scene scholarly reading',
      'Alexander sanctuary and Roman shrine with archaeological layers',
      'Avenue of Sphinxes with excavation narrative',
      'Karnak – chronological scholarly expedition',
      'Great Hypostyle Hall at golden hour with relief reading',
      'Open-Air Museum with White Chapel and Red Chapel',
      'Temple of Ptah with Sekhmet statue',
      'Botanical Garden and Festival Hall of Thutmose III',
      'Luxor Temple sunset and illuminated night visit',
      'Private limousine and fine dining lunch'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'VIP access and special permits for restricted areas',
      'Entrance fee to Luxor Temple (day and evening visits)',
      'Entrance fee to Karnak Temple complex',
      'Entrance fee to Karnak Open-Air Museum',
      'Private limousine (Mercedes S-Class or equivalent)',
      'Fine dining lunch at premium venue (Winter Palace, 1886, or equivalent)',
      'Hotel pickup and drop-off in Luxor',
      'Private rooftop refreshment service with temple views (evening)',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Theban temple specialist), luxury limousine, VIP access. Scholar should have published research on Karnak/Luxor Temple and connections for restricted access. Key upgrades: Open-Air Museum, Temple of Ptah (rarely visited, intact Sekhmet statue), possible First Pylon rooftop access. MAJOR DIFFERENTIATOR: Sunset-to-evening Luxor Temple visit—arrive golden hour, experience illumination transition. Private rooftop refreshment service arranged in advance (Nile-view terrace or temple-view location). Fine dining at Winter Palace or equivalent. Full day with evening component—long but paced with lunch break. For UHNW clients, art historians, and serious Egypt enthusiasts.',
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
  RAISE NOTICE 'Migration 146 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Karnak & Luxor Temple Tour:';
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
WHERE cl.slug = 'karnak-luxor-temple-day-tour'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
