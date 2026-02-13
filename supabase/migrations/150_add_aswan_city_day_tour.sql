-- =====================================================================
-- Migration 150: Add Aswan City Day Tour
-- Description: Day tour of Aswan's key sites – Unfinished Obelisk,
-- High Dam, and Philae Temple – with 4 tier variations
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
    'Aswan City Day Tour: Unfinished Obelisk, High Dam & Philae Temple',
    'aswan-city-day-tour',
    'Discover the three essential landmarks of Egypt''s southernmost city in one captivating day. At the ancient granite quarries, stand beside the colossal Unfinished Obelisk—a 1,200-ton monolith abandoned mid-carve 3,500 years ago, offering the world''s clearest window into how the Egyptians created their most iconic monuments. At the Aswan High Dam, witness the 20th-century engineering marvel that tamed the Nile, created Lake Nasser, and transformed Egypt''s economy—while forcing the rescue of ancient temples from the rising waters. Then take a motorboat to the enchanting island sanctuary of Philae Temple, dedicated to the goddess Isis—the last place in Egypt where the ancient religion was practised, and one of the most beautiful temple settings in the country. From a quarry that reveals how the ancients built to a dam that reshaped modern Egypt, and a temple that bridges the pharaonic and Greco-Roman worlds, this tour tells the complete story of Aswan—ancient, modern, and eternal.',
    'Aswan, Egypt',
    '1 day (half to full day)',
    ARRAY['aswan', 'unfinished-obelisk', 'high-dam', 'philae-temple', 'isis', 'granite-quarries', 'lake-nasser', 'agilika-island', 'day-tour', 'nasser', 'unesco'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 6,
      'city', 'Aswan',
      'highlights', ARRAY[
        'Unfinished Obelisk in the granite quarries',
        'Aswan High Dam',
        'Lake Nasser viewpoint',
        'Philae Temple (Temple of Isis) on Agilika Island',
        'Motorboat ride to Philae'
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
    'Aswan City Tour - Classic Discovery',
    E'**Aswan''s Ancient Marvels: Obelisk, Dam, and the Temple of Isis**\n\nAswan has always been Egypt''s gateway—the frontier where the cultivated Nile Valley meets the granite wilderness of Nubia, where pharaohs quarried the stone for their greatest monuments, and where the goddess Isis held her most sacred sanctuary. This day tour reveals Aswan''s three essential landmarks: a 3,500-year-old quarry that unlocks the secrets of Egyptian engineering, a 20th-century dam that reshaped an entire nation, and a temple of such beauty that it was worshipped for longer than any other in Egypt.\n\n---\n\n**Morning: The Unfinished Obelisk – How the Ancients Built**\n\nYour day begins at the **ancient granite quarries** of Aswan—the source of the hardest, most prized building stone in Egypt, quarried here for over three thousand years and transported the length of the Nile to become obelisks, colossi, sarcophagi, and temple columns.\n\nThe star attraction is the **Unfinished Obelisk**—a colossal monolith that, had it been completed, would have been the largest obelisk ever erected in Egypt. Commissioned during the **New Kingdom** (most likely by **Hatshepsut**, c. 1470 BC), it measures approximately **42 meters long** and would have weighed an estimated **1,200 tons**—roughly the weight of 200 adult elephants.\n\nBut the obelisk was never finished. During the carving process, a crack appeared in the granite, and the project was abandoned—leaving the monolith still attached to the bedrock, exactly as the ancient workers left it 3,500 years ago. This "failure" is archaeology''s greatest gift: the Unfinished Obelisk provides the clearest surviving evidence of how the ancient Egyptians quarried and shaped stone on a monumental scale.\n\nYour guide explains the process revealed by the quarry marks still visible in the rock: **dolerite pounders** (balls of hard stone, harder than granite) were used to pound channels around the intended obelisk, gradually isolating it from the surrounding rock. Workers then carved beneath the monolith to separate it from the bedrock—a process that would have employed hundreds of labourers working in coordinated shifts over many months.\n\nThe scale is staggering. Standing in the trench carved around the obelisk, you appreciate the ambition: this single piece of stone was intended to be extracted, transported to the Nile, floated downstream to Thebes (modern Luxor) or even further, erected vertically, and inscribed with hieroglyphs—all without modern machinery. The Unfinished Obelisk makes the completed obelisks standing in Karnak, the Vatican, Paris, London, and New York seem even more miraculous.\n\n---\n\n**The Aswan High Dam – Engineering That Changed a Nation**\n\nFrom ancient engineering to modern. The **Aswan High Dam** (*as-Sadd al-ʿĀlī*) is one of the most significant infrastructure projects of the 20th century—a massive rock-fill dam that, upon its completion in 1970, fundamentally transformed Egypt.\n\nBuilt under the direction of **President Gamal Abdel Nasser** beginning in 1960, with Soviet engineering support, the dam is a monument to post-colonial ambition: 3,830 meters long, 111 meters high, and containing 43 million cubic meters of material—seventeen times the volume of the Great Pyramid of Giza.\n\nYour guide explains the dam''s transformative impact:\n\n• **Flood control**: For millennia, Egypt''s agriculture depended on the annual Nile flood—bountiful in some years, catastrophic in others, absent in devastating droughts. The dam ended this uncertainty, storing floodwaters in **Lake Nasser** (one of the world''s largest artificial lakes, stretching 500 kilometres into Sudan) and releasing them in controlled flows year-round.\n\n• **Electricity**: The dam''s twelve turbines generate approximately 2,100 megawatts of hydroelectric power—at the time of construction, this provided roughly half of Egypt''s entire electricity supply and electrified villages across the country for the first time.\n\n• **Irrigation**: The controlled water release enabled the conversion of vast tracts of desert into farmland and allowed year-round cultivation rather than seasonal planting—dramatically increasing Egypt''s agricultural output.\n\nBut the dam came at a cost. Your guide also explains the consequences: the loss of the nutrient-rich silt that had fertilised the Nile Valley for millennia (requiring artificial fertilisers), the displacement of over 100,000 Nubians whose villages were submerged beneath Lake Nasser, and the extraordinary international campaign to rescue ancient monuments—including Abu Simbel and Philae—from the rising waters.\n\nFrom the dam''s crest, you enjoy panoramic views: **Lake Nasser** stretching south into the desert haze, and the Nile flowing north through Aswan toward its 900-kilometre journey to the Mediterranean.\n\n---\n\n**Afternoon: Philae Temple – The Last Sanctuary of Isis**\n\nThe day''s climax is the most beautiful temple setting in Egypt. A **motorboat ride** from the dock near the dam carries you across the shimmering waters to **Agilika Island**, where the **Temple of Philae** stands in an idyllic setting of palm trees, blue water, and golden stone.\n\nDedicated to **Isis**—goddess of magic, healing, motherhood, and the most widely worshipped deity of the ancient world—Philae is extraordinary for many reasons. Chief among them: this was the **last functioning pagan temple in Egypt**. Long after Christianity had swept the Roman Empire and Egypt''s other temples had been abandoned or converted, the priests of Isis at Philae continued to perform the ancient rituals. The temple was not officially closed until **535 AD** by order of Emperor Justinian—making it the last place on Earth where the religion of the pharaohs was practised, nearly a thousand years after Alexander the Great had conquered Egypt.\n\nThe temple complex was built primarily during the **Ptolemaic period** (305–30 BC) and the early **Roman era**, giving it a distinctive architectural character that blends Egyptian temple forms with Greco-Roman elegance. The **First Pylon**—decorated with colossal relief carvings of Ptolemaic pharaohs smiting enemies in the traditional Egyptian manner—frames your entrance.\n\nBeyond it, the **Court of the Temple** opens before you, surrounded by colonnades whose columns display a remarkable variety of floral capitals—no two alike, each a unique botanical fantasy carved in stone. Your guide explains the Ptolemaic innovation: where pharaonic temples used standardised column designs, Ptolemaic architects introduced creative variation that gave their buildings a decorative richness unmatched in earlier periods.\n\nThe **Hypostyle Hall** and the inner chambers lead you deeper into the temple''s sacred heart—rooms dedicated to the myth of **Osiris and Isis**: the murder of Osiris by his brother Seth, the devoted search by Isis for her husband''s scattered body, her magical reassembly and resurrection of the god, and the conception and birth of their son Horus. This myth—of love conquering death, of resurrection through devotion—was the most powerful religious narrative in the ancient world, and Philae was its holiest shrine.\n\nYour guide points out the **Christian crosses** carved into some of the pharaonic reliefs—evidence of the temple''s conversion to a church after its closure, and a poignant reminder of the religious transition that ended over three millennia of Egyptian pagan worship.\n\nThe temple''s own rescue story mirrors that of Abu Simbel. When the original Philae Island was partially submerged by the first Aswan Dam (1902) and later threatened with permanent submersion by the High Dam, UNESCO coordinated the temple''s dismantling and reassembly on nearby **Agilika Island**—which was landscaped to match the original island''s topography. Today, the temple stands exactly as it did on its original island, surrounded by water and palm trees, in a setting of extraordinary tranquillity.\n\nThe motorboat return across the water provides a final view of the temple in its island setting—one of the most photographed scenes in Egypt.\n\n*Meals: Lunch*',
    ARRAY[
      'Unfinished Obelisk – 1,200-ton monolith and quarry techniques',
      'Aswan High Dam with Lake Nasser panoramic views',
      'Motorboat ride to Agilika Island',
      'Philae Temple (Temple of Isis) – last pagan temple in Egypt',
      'Osiris and Isis mythology',
      'UNESCO relocation story',
      'Professional English-speaking Egyptologist guide',
      'Lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Entrance fee to the Unfinished Obelisk / granite quarries',
      'Entrance fee to the Aswan High Dam',
      'Entrance fee to Philae Temple',
      'Motorboat to Agilika Island (Philae) and return',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel pickup and drop-off in Aswan',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. This is a half-to-full-day tour (typically 5-6 hours). Logical order: Unfinished Obelisk first (morning, before heat builds in the open quarry), High Dam second (quick visit, 30-45 min), Philae Temple third (afternoon, beautiful light). Motorboat to Philae is shared (standard). Philae Sound & Light show available as optional evening add-on (separate ticket). Comfortable walking shoes needed at quarry site (uneven rocky terrain).',
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
    'Aswan City Tour - Premium Experience',
    E'**The Stones of Aswan: A Premium Journey Through Ancient Quarries, Modern Engineering, and the Last Temple of Isis**\n\nAswan is where Egypt begins—the First Cataract of the Nile, the ancient frontier between Egypt and Nubia, the granite quarries that supplied the stone for pharaonic civilisation''s greatest monuments. This premium day tour, with an experienced Egyptologist, small group, and comfortable vehicle, reveals the three sites that together tell Aswan''s complete story: an abandoned obelisk that unlocks the secrets of ancient construction, a dam that remade modern Egypt, and a temple so sacred that its priests refused to stop worshipping the old gods for a thousand years after the rest of the world had moved on.\n\n---\n\n**Morning: The Unfinished Obelisk – The Engineer''s Classroom**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle and begins the story of Aswan as you drive: the city''s position at the First Cataract, where the granite bedrock of Nubia rises to the surface and blocks navigation, creating the natural frontier that defined Egypt''s southern boundary for three millennia.\n\nAt the **granite quarries**, your guide transforms the Unfinished Obelisk from a curiosity into a revelation. This is not merely an abandoned monument—it is an **open-air textbook** of ancient Egyptian stone-working technology.\n\nYour Egyptologist explains the complete quarrying process with reference to the evidence visible in the rock:\n\n• The **dolerite pounders**—balls of extremely hard stone (harder than granite) used to pound trenches around the intended obelisk. Some of these pounders, abandoned by ancient workers, are still visible in the quarry.\n\n• The **channel system**—the narrow trenches carved around the obelisk''s perimeter, their surfaces showing the characteristic curved marks of dolerite pounding. Your guide explains how workers sat in these channels, pounding rhythmically in coordinated teams.\n\n• The **separation technique**—wooden wedges inserted into slots along the base, then soaked with water. As the wood swelled, the resulting pressure cracked the granite along a controlled line, separating the obelisk from the bedrock.\n\n• The **transport logistics**—how a 1,200-ton monolith would have been dragged on sledges to the Nile, loaded onto a barge, and floated downstream to its destination—possibly Karnak, where it would have been the largest obelisk ever erected.\n\nYour guide also points out the **other quarry evidence**: tool marks, abandoned blocks, and the remains of ramps and trackways that reveal the scale of industrial activity that once operated here. The quarries were not a single project but a millennia-long industrial complex supplying granite to construction sites across Egypt.\n\n---\n\n**The Aswan High Dam – Context and Consequence**\n\nAt the **Aswan High Dam**, your Egyptologist provides the political and engineering context that transforms a concrete structure into a pivotal moment in modern Egyptian history.\n\nThe dam is placed in its Cold War context: Nasser''s nationalisation of the Suez Canal (1956), the withdrawal of Western funding for the dam, the Soviet Union''s decision to finance and engineer the project, and the geopolitical implications of one of the developing world''s most ambitious infrastructure projects.\n\nYour guide explains the dam''s engineering with precision: 43 million cubic meters of material (rock, clay, sand, and cement), twelve 175-megawatt turbines, and a reservoir (**Lake Nasser**) that can store two full years of Nile flooding—a buffer against the droughts that had periodically devastated Egypt for millennia.\n\nThe consequences—both positive and transformative—are presented with nuance: electrification, year-round irrigation, flood control, but also silt deprivation (the fertile mud that built Egypt''s delta over millennia now settles behind the dam), coastal erosion, and the submersion of Nubia—displacing over 100,000 people and drowning villages, temples, and a way of life stretching back thousands of years.\n\nFrom the dam''s crest, panoramic views encompass Lake Nasser to the south and the Nile flowing north through Aswan—two worlds created by a single wall of engineered stone.\n\n---\n\n**Afternoon: Philae Temple – The Island Sanctuary**\n\nAfter a quality lunch, proceed to the boat dock for the **motorboat crossing** to Agilika Island—itself a pleasure, the blue water, granite outcrops, and palm-fringed island creating one of the most picturesque approaches in Egyptian tourism.\n\nThe **Temple of Philae** with an experienced guide reveals layers most visitors never see.\n\nYour Egyptologist explains the temple''s unique position in Egyptian religious history: Philae was the centre of the **Cult of Isis**, the most popular and enduring religious movement of the ancient world. Isis worship spread far beyond Egypt—to Greece, Rome, and throughout the Mediterranean—and Philae was its holiest shrine. When Christianity became the Roman Empire''s official religion and pagan temples were closed across the empire, Philae''s priests continued to worship Isis under a special treaty with the Blemmyes and Nobatae tribes of Nubia, who made pilgrimages to the island. The temple finally closed in **535 AD**—the last active temple of the ancient Egyptian religion.\n\nYour guide walks you through the complex with architectural and mythological expertise:\n\n• The **Kiosk of Trajan** (the "Pharaoh''s Bed")—an elegant open-roofed pavilion on the island''s eastern shore, one of the most photographed monuments in Egypt and a masterpiece of Romano-Egyptian architecture.\n\n• The **First Pylon** with its colossal reliefs of Ptolemaic pharaohs performing traditional Egyptian rituals—your guide explains the Ptolemaic strategy of adopting Egyptian religious practices to legitimise their rule.\n\n• The **Birth House (Mammisi)** of Isis—where reliefs depict the divine birth of Horus, son of Isis and Osiris, in scenes that scholars have compared to later Christian nativity iconography.\n\n• The **Hypostyle Hall** with its varied floral capitals—your guide points out the Ptolemaic innovation of unique column designs, each a different botanical fantasy.\n\n• The **inner sanctuary** where the cult statue of Isis once stood—the holiest point in the temple, where priests performed daily rituals for over a millennium.\n\n• The **Gate of Hadrian**—a small but significant structure bearing reliefs that depict the source of the Nile (shown as a god pouring water from a cave beneath the rocks of the First Cataract) and scenes of the Osiris myth.\n\nYour guide also explains the temple''s rescue: UNESCO''s dismantling and reassembly on Agilika Island between 1977 and 1980, including the remarkable landscaping of the island to match the original Philae''s topography.\n\nThe motorboat return provides the iconic final view: the temple rising from its island setting, framed by water and palm trees, in a tableau that has inspired artists and travellers for centuries.\n\n*Meals: Lunch*',
    ARRAY[
      'Unfinished Obelisk with complete quarrying process explained',
      'Ancient tool marks, dolerite pounders, and transport evidence',
      'Aswan High Dam with Cold War and engineering context',
      'Lake Nasser panoramic views and Nubian displacement story',
      'Motorboat to Philae with scenic approach',
      'Philae Temple with Isis cult and last-temple-in-Egypt narrative',
      'Kiosk of Trajan, Birth House, Gate of Hadrian',
      'Experienced Egyptologist (small group max 16)',
      'Premium vehicle and quality lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Entrance fee to the Unfinished Obelisk / granite quarries',
      'Entrance fee to the Aswan High Dam',
      'Entrance fee to Philae Temple',
      'Motorboat to Agilika Island (Philae) and return',
      'Quality lunch at well-selected restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel pickup and drop-off in Aswan',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Half-to-full-day tour (5-6 hours). Order: Obelisk (morning, before heat), Dam (30-45 min), lunch, Philae (afternoon light is beautiful for photography). Motorboat to Philae is shared (standard). Kiosk of Trajan is a highlight—ensure guide includes it. Philae Sound & Light show available as evening add-on. Consider recommending felucca sail or Nubian village visit as afternoon extension if guests have energy.',
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
    'Aswan City Tour - Deluxe Collection',
    E'**Aswan Unveiled: A Private Journey from Ancient Quarries to the Island of Isis**\n\nWith your private Egyptologist, luxury vehicle, and private motorboat to Philae, Aswan''s three essential landmarks reveal themselves with a depth and intimacy unavailable to group tours. Walk the granite quarries with a guide who explains the engineering with scientific precision. Experience the High Dam through the lens of modern Egyptian history and geopolitics. Then glide across the water on a private boat to the Temple of Isis—the last sanctuary of the ancient religion—and explore it at your own pace with expert interpretation of every relief, every myth, and every architectural innovation. This is Aswan experienced as it deserves: unhurried, expert, and profoundly rewarding.\n\n---\n\n**Morning: The Unfinished Obelisk – A Private Engineering Seminar**\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you in a luxury vehicle, and the journey to the granite quarries becomes an introduction to Aswan''s geological and historical significance: the First Cataract as the natural boundary of Egypt, the granite as the pharaohs'' most prized building material, and the quarries as an industrial complex that operated for over two millennia.\n\nAt the **Unfinished Obelisk**, your private guide provides the complete technical analysis:\n\n• The **quarrying methodology** is explained step by step: the selection of the granite face, the marking of the obelisk''s outline, the teams of workers pounding with dolerite balls (your guide locates examples still lying in the quarry), the channelling process (months of rhythmic pounding in coordinated shifts), and the planned separation using wooden wedges and water expansion.\n\n• The **crack that doomed the project** is examined: your guide explains the geological cause (a natural fissure in the granite, invisible during initial assessment), the evidence that workers attempted to save the obelisk by modifying its dimensions, and the decision to abandon—a pragmatic choice that reveals the ancient Egyptians'' quality control standards.\n\n• The **broader quarry landscape** is explored beyond the obelisk: your guide points out the extraction sites for other monuments, the remains of ancient ramps and trackways, the tool marks that reveal different quarrying techniques across different periods, and the evidence of the labour force''s organisation (worker''s marks, supply depots, the logistics of feeding and housing hundreds of quarry workers).\n\n• Your guide connects the quarry evidence to the finished products: the obelisks at Karnak, the colossi of Memnon (quarried from a different stone but using similar techniques), and the granite sarcophagi of the Valley of the Kings—each one quarried here, shaped here, and transported hundreds of kilometres by Nile barge.\n\n---\n\n**The Aswan High Dam – The Full Picture**\n\nAt the **High Dam**, your private Egyptologist delivers the comprehensive narrative:\n\nThe **political drama**: Nasser''s vision of a modern Egypt, the initial World Bank loan, the American and British withdrawal of funding (over Egypt''s recognition of Communist China and arms purchases from Czechoslovakia), Nasser''s retaliatory nationalisation of the Suez Canal, the Suez Crisis of 1956, and the Soviet Union''s decision to fund and engineer the dam—a Cold War chess move that reshaped the Middle East.\n\nThe **engineering achievement**: your guide explains the construction in phases—the coffer dams, the diversion channels, the rock-fill core, the clay and concrete facing—and the statistics that convey the dam''s scale (enough material to build seventeen Great Pyramids).\n\nThe **consequences**, presented with scholarly balance: the economic transformation (electricity, irrigation, flood control), the ecological costs (silt deprivation, coastal erosion, soil salination), and the human cost—the displacement of Nubia''s population and the flooding of villages, temples, and a culture stretching back five thousand years.\n\nYour guide connects the dam''s story to the afternoon''s destination: it was the High Dam''s construction that threatened Philae Temple, necessitating the UNESCO rescue that preserved it on Agilika Island.\n\n---\n\n**Afternoon: Philae Temple – The Private Island Experience**\n\nAfter a premium lunch at a carefully selected restaurant—perhaps overlooking the Nile—proceed to the dock for a **private motorboat** crossing to Agilika Island.\n\nThe private boat transforms the approach: no waiting, no crowds, and the freedom to circle the island for the perfect first view of the temple rising from the water—columns, pylons, and the elegant Kiosk of Trajan reflected in the still surface.\n\nYour private Egyptologist provides the definitive Philae experience:\n\nThe **Kiosk of Trajan** is visited first—your guide explains this elegant, open-roofed pavilion as a ceremonial landing stage where the sacred barque of Isis arrived during festivals, and its Romano-Egyptian architectural style as a fusion of Roman imperial taste with Egyptian religious function.\n\nThe **main temple** is explored in scholarly depth:\n\n• The **First Pylon''s reliefs** are decoded: Ptolemaic pharaohs performing traditional Egyptian rituals—your guide explains the political calculation of Greek kings adopting Egyptian religion to legitimise their rule, and the artistic evidence of both Egyptian and Greek hands at work on the same reliefs.\n\n• The **Birth House (Mammisi)** becomes a theological seminar: the divine conception and birth of Horus (Isis conceiving by her resurrected husband Osiris, nursing the divine child in the marshes, the young Horus avenging his father) is told as both myth and political allegory—each Ptolemaic pharaoh identifying himself with Horus, the legitimate heir.\n\n• The **Hypostyle Hall''s unique columns** receive individual attention: your guide identifies the botanical species depicted in each capital (papyrus, lotus, palm, grape vine) and explains the Ptolemaic innovation of creating a "stone garden" of unique designs.\n\n• The **inner sanctuary** is experienced as the temple''s spiritual heart: the room where the cult statue of Isis stood, where priests performed daily rituals for over a millennium, and where the last worshippers of the ancient religion came to pray before the doors were finally closed in 535 AD.\n\n• The **Gate of Hadrian** is read by your guide: the reliefs depicting the Nile''s source (a god pouring water from a cave), the Osiris myth scenes, and the Roman emperor''s dedication—a European ruler paying homage to an Egyptian goddess.\n\n• The **Coptic crosses** carved into pharaonic reliefs are explained as evidence of the temple''s conversion to a church in the 6th century—the end of the ancient religion and the beginning of a new faith on the same sacred ground.\n\nYour guide tells the UNESCO rescue story with engineering detail: the cofferdam built around the original island, the dismantling and reassembly of 40,000 stone blocks, and the remarkable landscaping of Agilika Island to match Philae''s original topography.\n\nThe **private motorboat return** allows a final circumnavigation of the island—the temple receding against the water in the golden afternoon light, a view that has defined Aswan for travellers since the earliest tourists arrived in the 19th century.\n\n*Meals: Lunch*',
    ARRAY[
      'Private Egyptologist guide (max 8 guests)',
      'Unfinished Obelisk with complete quarrying analysis',
      'Broader quarry landscape exploration',
      'Aswan High Dam with Cold War political narrative',
      'Private motorboat to and around Philae',
      'Philae Temple – Kiosk of Trajan, Birth House, inner sanctuary',
      'Gate of Hadrian with Nile source reliefs',
      'Last pagan temple in Egypt narrative',
      'Luxury vehicle and premium lunch'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Entrance fee to the Unfinished Obelisk / granite quarries',
      'Entrance fee to the Aswan High Dam',
      'Entrance fee to Philae Temple',
      'Private motorboat to Agilika Island and return (with island circumnavigation)',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel pickup and drop-off in Aswan',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), luxury vehicle, premium lunch. KEY UPGRADE: Private motorboat to Philae (not shared)—allows island circumnavigation and flexibility. Private guide allows extended time at each site. Order: Obelisk (morning), Dam (mid-morning), lunch, Philae (afternoon—beautiful light for photography). Private boat can circle island for photography before landing. Kiosk of Trajan and Gate of Hadrian are highlights often rushed by group tours—ensure guide includes both. Consider offering Philae Sound & Light show as evening add-on or Nubian village visit.',
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
    'Aswan City Tour - Ultimate Luxury',
    E'**Aswan: A Private Scholarly Journey from Pharaonic Quarries to the Last Temple of the Old Gods**\n\nThis is not a city tour. It is a private archaeological and historical expedition through three sites that together span the full arc of Aswan''s significance—from the pharaohs'' greatest engineering secrets to the 20th century''s most consequential dam to the last place on Earth where the ancient Egyptian gods were worshipped. Your personal PhD Egyptologist transforms each site into a revelation: the quarry becomes a masterclass in ancient technology, the dam becomes a geopolitical thriller, and Philae becomes the most moving temple experience in Egypt. Travel by private limousine. Cross to Philae by private boat. Dine at Aswan''s finest. This is Aswan experienced at the level it deserves—for those who accept nothing less than the extraordinary.\n\n---\n\n**Morning: The Granite Quarries – A Scholar''s Laboratory**\n\nYour private limousine collects you at your preferred time, and your personal **PhD Egyptologist**—a published specialist in Egyptian construction technology, Ptolemaic temples, or Aswan''s archaeological landscape—begins the day''s narrative as you drive.\n\nAt the **Unfinished Obelisk**, your scholar provides the definitive technical analysis—not the simplified explanation of standard tours but a forensic reading of the quarry evidence:\n\n• The **geological context**: the Aswan granite formation (technically granodiorite) is analyzed—its mineral composition (quartz, feldspar, hornblende, biotite), its hardness (6-7 on the Mohs scale), and why this specific stone was prized above all others for monumental sculpture.\n\n• The **quarrying process** is reconstructed from the physical evidence with scientific precision: dolerite pounder marks measured and compared, the pounding technique analyzed (experiments have shown that skilled workers could remove approximately 5mm of granite per hour per worker), the channel dimensions calculated, and the estimated labour force computed (your scholar explains the archaeological and experimental evidence).\n\n• The **fatal crack** is examined as a case study in ancient quality control: the geological cause (a pre-existing micro-fissure, invisible on the surface), the evidence of attempted rescue (the obelisk appears to have been reduced in size after the crack was discovered), and the economic implications of abandonment (hundreds of thousands of person-hours of labour invested, then written off).\n\n• The **broader quarry complex** is explored with your scholar''s expert eye: extraction sites for specific monuments identified by their dimensions, ancient roadways and slipways traced, workers'' graffiti and marks decoded, and the evidence of the quarry''s logistics infrastructure—water supply, tool storage, supervisors'' stations—reconstructed from archaeological survey data.\n\n• Your scholar connects the quarry to the wider world of Egyptian construction: the Aswan obelisks at Karnak and Luxor, the Vatican obelisk (originally from Heliopolis, but of Aswan granite), Cleopatra''s Needles in London and New York, and the granite sarcophagi, temple columns, and colossal statues that were quarried here and transported across Egypt for three thousand years.\n\n---\n\n**The Aswan High Dam – The Geopolitical Narrative**\n\nAt the **High Dam**, your PhD scholar delivers the full narrative—engineering, politics, and consequences intertwined:\n\nThe **geopolitical thriller**: your scholar reconstructs the sequence with the drama it deserves—Nasser''s post-revolutionary vision, the Eisenhower administration''s initial support, the Czech arms deal that alarmed Washington, the dramatic withdrawal of funding, Nasser''s nationalisation of the Suez Canal on live radio (July 26, 1956—your scholar may quote the speech), the Franco-British-Israeli invasion, American and Soviet intervention, and the eventual Soviet financing that turned the dam into a Cold War monument.\n\nThe **engineering analysis**: construction phases, materials science, turbine specifications, and the dam''s ongoing role in Egypt''s power grid and water management.\n\nThe **Nubian story**: your scholar tells the human cost with the sensitivity it demands—the 100,000+ Nubians displaced, the villages and temples submerged, the cultural disruption, and the ongoing Nubian identity movement in modern Egypt. This is not merely historical context but a living issue, and your scholar presents it with scholarly balance and human empathy.\n\nThe view from the dam''s crest—Lake Nasser south, the Nile north—is narrated by your scholar as a visual summary of the dam''s duality: modernity and loss, control and consequence, the power to reshape a nation and the price of doing so.\n\n---\n\n**Afternoon: Philae Temple – The Scholar''s Pilgrimage**\n\nA refined lunch at Aswan''s finest restaurant—the **Old Cataract Hotel terrace**, **Mövenpick**, or a private arrangement with Nile views—provides a moment of civilised pleasure.\n\nProceed to the dock, where a **private motorboat** awaits. Your scholar narrates the approach—circling Agilika Island to reveal the temple from its most dramatic angles, the Kiosk of Trajan catching the afternoon light, the colonnades reflected in the still water.\n\nThe **Temple of Philae** with a PhD scholar becomes the most complete temple experience available in Aswan:\n\nThe **Kiosk of Trajan** is analyzed as a masterpiece of Romano-Egyptian architecture: your scholar explains the hybrid design (Egyptian temple form with Roman decorative vocabulary), the debate about its original function (ceremonial landing stage or open-air shrine), and its later fame as the "Pharaoh''s Bed" in 19th-century European romantic art.\n\nThe **main temple** is decoded in full:\n\n• Your scholar reads the **hieroglyphic and demotic inscriptions** directly from the walls���the latest phase of the Egyptian language visible here, showing the evolution of the script over millennia.\n\n• The **Isis mythology** is told with scholarly depth: not the simplified version but the full theological system—Isis as healer, magician, mother, protector of the dead, model wife, and cosmic power. Your scholar explains how the Isis cult spread from Philae to become the most popular religion in the Roman Empire, with temples from Britain to Afghanistan, and how scholars have identified echoes of Isis worship in the later development of the cult of the Virgin Mary.\n\n• The **Birth House** reliefs are read as both mythology and political propaganda: each Ptolemaic pharaoh identifying himself with Horus to claim divine legitimacy, the iconographic parallels with later Christian nativity imagery examined with scholarly nuance.\n\n• The **inner sanctuary** is experienced as the temple''s spiritual core: your scholar reconstructs the daily rituals performed here—the opening of the shrine, the anointing of the statue, the offering of food and incense, the hymns—and explains the extraordinary continuity of a religious practice maintained for over a thousand years in this single room.\n\n• The **Gate of Hadrian** is read in full: the Nile source reliefs decoded, the Osiris narrative scenes interpreted, and the Roman emperor''s relationship with Egyptian religion explained.\n\n• The **Coptic evidence** is presented as the closing chapter: the crosses carved into pharaonic reliefs, the altar installed in the hypostyle hall, and the edict of Justinian that finally closed the temple in 535 AD—the end of a religious tradition stretching back to before the pyramids were built.\n\nThe UNESCO rescue is told with engineering precision: the cofferdam methodology, the block-by-block dismantling, the Agilika Island landscaping, and the monitoring systems that ensure the temple''s preservation.\n\nYour **private motorboat** returns you with a final circumnavigation—the temple golden in the late afternoon light, its reflection perfect in the water, a scene of extraordinary beauty that your scholar may connect to the 19th-century artists and travellers (David Roberts, Amelia Edwards, Florence Nightingale) who made Philae famous in the European imagination.\n\nYour limousine returns you to your hotel carrying memories of a day that revealed Aswan at its deepest—from the pharaohs'' quarries to the last prayers to the old gods.\n\n*Meals: Lunch*',
    ARRAY[
      'Personal PhD Egyptologist (fully private)',
      'Unfinished Obelisk – forensic quarrying analysis with geological context',
      'Broader quarry complex exploration with workers'' evidence',
      'Aswan High Dam – Cold War geopolitical narrative',
      'Nubian displacement story told with scholarly depth',
      'Private motorboat with island circumnavigation',
      'Philae Temple – complete hieroglyphic and demotic reading',
      'Isis cult with Mediterranean spread and Marian parallels',
      'Kiosk of Trajan, Birth House, Gate of Hadrian, inner sanctuary',
      'Last pagan temple narrative with Coptic transition',
      'Private limousine and fine dining lunch'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'Entrance fees to Unfinished Obelisk, High Dam, and Philae Temple',
      'Private motorboat to Agilika Island with island circumnavigation',
      'Private limousine (Mercedes S-Class or equivalent)',
      'Fine dining lunch at premium venue (Old Cataract, Mövenpick, or equivalent)',
      'Hotel pickup and drop-off in Aswan',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Ptolemaic temple specialist, construction technology expert, or Aswan archaeology specialist), private limousine, private motorboat, fine dining. KEY UPGRADES: Private boat (essential—allows circumnavigation, flexible timing, no sharing), limousine, fine dining (Old Cataract terrace is iconic—book in advance for Nile-view table). Scholar should be able to read hieroglyphic AND demotic inscriptions at Philae. Philae afternoon timing ideal for photography—golden light on the temple. Consider offering Philae Sound & Light show as evening add-on (spectacular, separate ticket) or Nubian village visit with traditional tea as cultural extension. For UHNW clients and serious cultural travellers.',
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
  RAISE NOTICE 'Migration 150 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Aswan City Day Tour:';
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
WHERE cl.slug = 'aswan-city-day-tour'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
