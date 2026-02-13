-- =====================================================================
-- Migration 151: Add Kom Ombo & Edfu Temples Day Tour
-- Description: Day tour from Aswan to Luxor visiting Kom Ombo and
-- Edfu temples – with 4 tier variations
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
    'Kom Ombo & Edfu Temples Day Tour: Aswan to Luxor',
    'kom-ombo-edfu-temples-day-tour',
    'Travel the ancient Nile corridor from Aswan to Luxor, stopping at two of Egypt''s most remarkable Ptolemaic temples. At Kom Ombo, perched dramatically on a bend of the Nile, discover the only double temple in Egypt—a symmetrical sanctuary dedicated simultaneously to Horus the Elder (the falcon god of the sky) and Sobek (the crocodile god of the Nile), with fascinating reliefs depicting ancient surgical instruments, a Nilometer, and a collection of mummified crocodiles that once lived in the temple precinct. At Edfu, enter the best-preserved temple in all of Egypt—a colossal monument dedicated to Horus the falcon-headed god, whose towering pylons, shadowy hypostyle halls, and intact sanctuary offer the most complete picture of what an ancient Egyptian temple looked like in its working glory. Together, these two Ptolemaic masterpieces reveal the final flowering of Egyptian temple architecture: Greek rulers building in the pharaonic tradition, creating monuments of astonishing beauty and theological sophistication two thousand years ago. The journey itself is part of the experience—the drive follows the Nile Valley through landscapes of sugar cane fields, rural villages, and the timeless rhythm of Egyptian agricultural life, arriving in Luxor as the day ends.',
    'Aswan to Luxor, Egypt',
    '1 day (full day, approx. 8-10 hours)',
    ARRAY['kom-ombo', 'edfu', 'horus', 'sobek', 'ptolemaic', 'nile-valley', 'aswan', 'luxor', 'day-tour', 'crocodile-museum', 'falcon-god', 'temples', 'inter-city'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 9,
      'departure_city', 'Aswan',
      'arrival_city', 'Luxor',
      'route', 'Aswan → Kom Ombo → Edfu → Luxor',
      'highlights', ARRAY[
        'Temple of Kom Ombo – dual temple of Horus & Sobek',
        'Crocodile Museum at Kom Ombo',
        'Temple of Edfu – best-preserved temple in Egypt',
        'Nile Valley drive through rural Upper Egypt',
        'Arrival in Luxor at journey''s end'
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
    'Kom Ombo & Edfu Temples - Classic Discovery',
    E'**Ancient Temples Along the Nile: From Aswan to Luxor Through the Heartland of Upper Egypt**\n\nThe 200-kilometre drive from Aswan to Luxor follows one of the oldest trade routes in human history—the Nile Valley corridor that connected the frontier of Nubia to the great capital of Thebes for three thousand years. Along this route, two Ptolemaic temples stand as monuments to the final great age of Egyptian temple building: Kom Ombo, the unique double sanctuary perched above the Nile, and Edfu, the best-preserved temple in all of Egypt. This day tour visits both, with an Egyptologist guide who brings the reliefs, myths, and architectural innovations to life.\n\n---\n\n**Morning: Departure from Aswan & The Temple of Kom Ombo**\n\nYour day begins with an early morning pickup at your Aswan hotel. The drive north follows the Nile through landscapes that have scarcely changed in centuries: fields of sugar cane and date palms, feluccas drifting on the river, water buffalo standing in the shallows, and villages of mudbrick and painted walls. Your guide uses the journey to introduce the Ptolemaic period—the 275-year dynasty of Greek pharaohs (305–30 BC) who ruled Egypt after Alexander the Great''s conquest and who built some of Egypt''s most impressive temples.\n\nApproximately 45 kilometres north of Aswan, the **Temple of Kom Ombo** appears on a promontory above the Nile—one of the most dramatically sited temples in Egypt, commanding sweeping views of the river and the surrounding countryside.\n\nKom Ombo is unique in all of Egyptian architecture: it is a **double temple**, perfectly symmetrical, dedicated simultaneously to two gods. The southern half belongs to **Sobek**, the crocodile god—deity of fertility, water, and the Nile''s dangerous power. The northern half belongs to **Horus the Elder** (Haroeris), the falcon-headed god of the sky, war, and kingship. Two entrances, two hypostyle halls, two sanctuaries—the entire temple duplicated on a single axis, a theological and architectural solution found nowhere else in Egypt.\n\nYour guide walks you through the temple''s key features:\n\n• The **double entrance and twin sanctuaries**—your guide explains the theological reasoning: Sobek and Horus represented complementary aspects of divine power (water and sky, danger and protection), and the dual temple expressed the Egyptian concept of balance (*Ma''at*) in architectural form.\n\n• The **relief carvings** are among the most fascinating in Egypt. Your guide points out the famous **surgical instruments panel**—a relief depicting what appear to be scalpels, forceps, suction cups, bone saws, and other medical tools, offering a remarkable glimpse into ancient Egyptian medical knowledge and practice. Scholars debate whether these represent actual surgical instruments or ritual implements, and your guide presents both interpretations.\n\n• The **Nilometer**—a well connected to the Nile used to measure the river''s annual flood level. Your guide explains its crucial economic function: the flood measurement determined the year''s agricultural potential and, consequently, the tax rate.\n\n• The **Crocodile Museum** adjacent to the temple houses a collection of **mummified crocodiles** discovered in the temple precinct—sacred animals of Sobek, raised in the temple''s sacred lake and mummified after death. Some of the crocodiles are remarkably well preserved, and your guide explains the religious significance: Sobek was feared and worshipped simultaneously, and maintaining live crocodiles was a way of honouring and placating this powerful deity.\n\n---\n\n**Midday: The Drive to Edfu**\n\nThe 110-kilometre drive from Kom Ombo to Edfu continues through the Nile Valley—a ribbon of green cultivation between desert cliffs. Your guide uses the journey to discuss the Ptolemaic temple-building programme: why Greek rulers invested so heavily in Egyptian religious architecture (legitimacy, priestly support, economic control), and how the temples they built represent the final perfection of a building tradition stretching back three thousand years.\n\n---\n\n**Afternoon: The Temple of Edfu – The Best-Preserved Temple in Egypt**\n\nThe **Temple of Edfu** (the Temple of Horus) is simply the most complete ancient Egyptian temple surviving anywhere in the world. While other temples are ruins—roofless, fragmentary, their colours faded and their statues lost—Edfu stands virtually intact: walls, roof, pylons, hypostyle halls, chambers, and sanctuary all preserved, offering the most authentic experience of what an ancient Egyptian temple actually looked like when it was in use.\n\nBuilt over a period of approximately 180 years (237–57 BC), the temple was dedicated to **Horus**, the falcon-headed god—son of Isis and Osiris, avenger of his father, and the divine model for every Egyptian pharaoh. Edfu was one of the most important cult centres in Egypt, and the annual **Festival of the Beautiful Meeting** saw the cult statue of Hathor travel from her temple at Dendera to "visit" Horus at Edfu—a divine marriage that was one of the great religious celebrations of the ancient calendar.\n\nYour guide leads you through the temple''s progression from light to darkness, from the public to the most sacred:\n\n• The **Pylon** (entrance gateway)—at 36 meters high, it is one of the largest surviving pylons in Egypt. Its facade bears colossal reliefs of Ptolemy XII (father of Cleopatra VII) smiting enemies before Horus—the traditional pharaonic propaganda image, here executed by a Greek king with full Egyptian artistic conviction.\n\n• The **Court of Offerings**—a vast open courtyard surrounded by columns, where the public gathered during festivals. Your guide explains the social function: the temple was not merely a place of worship but the economic, administrative, and cultural centre of the region.\n\n• The **Hypostyle Halls** (outer and inner)—forest-like halls of massive columns supporting a stone roof, the light diminishing as you penetrate deeper into the temple. Your guide explains the deliberate architectural progression: from the bright, open court to the increasingly dark, enclosed halls, the worshipper moved symbolically from the world of the living toward the divine darkness of the sanctuary.\n\n• The **Sanctuary of Horus**—the innermost room of the temple, where the cult statue of Horus stood in a granite shrine (the shrine is still in place—one of the very few surviving in any Egyptian temple). This was the holiest space: only the high priest entered daily to perform the rituals of waking, washing, anointing, clothing, and feeding the god''s statue.\n\n• The **Ambulatory** (corridor around the sanctuary)—decorated with reliefs of the **Myth of Horus and Seth**, the great conflict between Horus and his uncle Seth for the throne of Egypt. Your guide narrates the story: Seth''s murder of Osiris, Isis''s resurrection of her husband, the conception and birth of Horus, and the epic battles between Horus and Seth—told in dramatic reliefs that function as an ancient "comic strip" around the temple''s most sacred space.\n\n• The **granite statue of Horus** as a falcon, wearing the double crown of Upper and Lower Egypt, stands before the sanctuary—one of the most iconic images in Egyptian art and one of the most photographed monuments in the country.\n\nAs the afternoon sun illuminates the temple''s western walls, your guide draws together the themes of the day: two Ptolemaic temples, two expressions of the same building tradition, two chapters in the story of Egypt''s last great age of temple construction.\n\n---\n\n**Evening: Arrival in Luxor**\n\nThe drive from Edfu to Luxor (approximately 110 kilometres) brings you to the city once known as Thebes—ancient Egypt''s greatest capital and the site of more monuments than any other city on Earth. You are dropped at your Luxor hotel as the sun sets over the Theban hills—a perfect conclusion to a day spent in the company of the ancient gods, or an exciting gateway to further adventures if you choose to extend your Egyptian journey.\n\n*Meals: Lunch*',
    ARRAY[
      'Temple of Kom Ombo – unique dual temple of Horus & Sobek',
      'Surgical instruments relief panel',
      'Nilometer and crocodile mummies',
      'Crocodile Museum',
      'Temple of Edfu – best-preserved temple in Egypt',
      'Sanctuary of Horus with original granite shrine',
      'Horus and Seth myth reliefs',
      'Nile Valley drive through rural Upper Egypt',
      'Professional English-speaking Egyptologist guide',
      'Lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Entrance fee to Temple of Kom Ombo',
      'Entrance fee to Crocodile Museum at Kom Ombo',
      'Entrance fee to Temple of Edfu',
      'Lunch at quality local restaurant en route',
      'Air-conditioned vehicle with driver (Aswan to Luxor)',
      'Hotel pickup in Aswan',
      'Hotel drop-off in Luxor',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. Full-day tour (8-10 hours total including driving). Route: Aswan → Kom Ombo (45 km, ~1 hr) → Edfu (110 km, ~2 hrs) → Luxor (110 km, ~2 hrs). Driving total ~5 hrs, temple visits ~3-4 hrs. Lunch typically between Kom Ombo and Edfu or at Edfu. At Edfu, horse carriages from parking to temple are common (not included—guests can walk 10 min or take carriage). Kom Ombo visit 1-1.5 hrs, Edfu visit 1.5-2 hrs. NOTE: This is a ONE-WAY transfer tour—guests start in Aswan, end in Luxor. Ensure luggage arrangements are clear. Morning departure recommended (7-8 AM) to avoid midday heat at Kom Ombo.',
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
    'Kom Ombo & Edfu Temples - Premium Experience',
    E'**The Ptolemaic Trail: A Premium Journey from the Crocodile God to the Falcon God, Aswan to Luxor**\n\nGreece conquered Egypt in 332 BC, but Egypt conquered Greece''s imagination. For the next three centuries, the Ptolemaic pharaohs—Greek by blood, Egyptian by ambition—built temples that represented the final, most refined expression of a building tradition stretching back three thousand years. This premium day tour follows the Nile Valley from Aswan to Luxor, visiting the two greatest Ptolemaic temples in Upper Egypt: Kom Ombo, with its unique dual dedication and extraordinary medical reliefs, and Edfu, the most perfectly preserved temple in the entire country. With an experienced Egyptologist, a small group, and a premium vehicle, these temples reveal themselves as the masterworks they truly are.\n\n---\n\n**Morning: The Temple of Kom Ombo – Where Two Gods Share One House**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle for the drive north from Aswan. The Nile Valley unfolds beside you—sugar cane, date palms, egrets in the fields, feluccas on the river—while your guide sets the scene: the Ptolemaic dynasty, founded by Alexander''s general Ptolemy I Soter, inheriting the richest kingdom in the Mediterranean and choosing to rule not as Greek colonisers but as Egyptian pharaohs—adopting the titles, the religion, the artistic conventions, and above all the temple-building tradition of the civilisation they now governed.\n\nThe **Temple of Kom Ombo** appears on its Nile-side promontory, and your guide explains what makes it unique before you enter: this is the only known **double temple** in Egyptian architecture. Not two separate temples side by side, but a single building with a perfect axis of symmetry—two of everything, from entrance to sanctuary, running in parallel from front to back.\n\nYour experienced guide provides deeper context at each key point:\n\n• The **theological concept**: Sobek (the crocodile god) and Horus the Elder (the falcon god) were not random pairings. Your guide explains the Upper Egyptian religious tradition that united these two deities as representative of complementary cosmic forces: Sobek embodying the fertile, dangerous power of the Nile, Horus the protective sovereignty of the sky. The dual temple expressed the Egyptian concept of **duality-in-unity** (*sema-tawy*)—the same principle represented by the double crown of Upper and Lower Egypt.\n\n• The **surgical instruments relief**: your guide provides the scholarly context for this famous panel. The instruments depicted include what appear to be scalpels, bone saws, forceps, suction cups, retractors, and scales for measuring doses—an apparent catalogue of medical and surgical equipment. Your guide explains the debate: some scholars interpret these as actual surgical tools, citing the well-documented sophistication of Egyptian medical practice (the Edwin Smith Papyrus, the Ebers Papyrus), while others argue they represent ritual implements used in the "Opening of the Mouth" ceremony. Your guide presents both views and the evidence supporting each.\n\n• The **calendar and astronomical reliefs**: Kom Ombo preserves important astronomical and calendrical inscriptions. Your guide identifies key panels and explains the Egyptian calendar system—365 days, 12 months of 30 days, plus 5 epagomenal days—and the religious festivals associated with specific astronomical events.\n\n• The **Nilometer**: your guide explains the engineering and economic function in detail—how the well was connected to the Nile, how water levels were measured against marked stone, and how the resulting data was used to predict the harvest and calculate taxes. A good flood meant prosperity; a low flood meant famine; an excessive flood meant destruction. The Nilometer was, in effect, ancient Egypt''s most important economic instrument.\n\n• The **Crocodile Museum**: your guide contextualises the mummified crocodiles within the broader practice of sacred animal cults in Ptolemaic Egypt—a phenomenon that astonished Greek visitors and became one of the most distinctive features of late Egyptian religion. At Kom Ombo, live crocodiles were kept in the temple''s sacred lake, worshipped as living embodiments of Sobek, and mummified after death with the same care accorded to human burials.\n\n---\n\n**Midday: The Nile Valley Drive & Lunch**\n\nThe drive from Kom Ombo to Edfu follows the Nile through the heartland of Upper Egypt. Your guide uses the journey productively, discussing the Ptolemaic building programme: how the Greek pharaohs constructed or expanded temples at virtually every major cult centre in Egypt—Dendera, Esna, Edfu, Kom Ombo, Philae—creating a network of monumental buildings that expressed their devotion to Egyptian religion and secured the support of the powerful priestly class.\n\nA quality lunch at a well-selected restaurant provides a comfortable break.\n\n---\n\n**Afternoon: The Temple of Edfu – Egypt''s Most Perfect Temple**\n\nThe **Temple of Edfu** is the crown jewel of Ptolemaic architecture and arguably the single most rewarding temple visit in Egypt. While Karnak is larger and the pyramids are older, no temple anywhere offers the **completeness** of Edfu: walls, roof, columns, chambers, and sanctuary all intact, the decorative programme preserved from floor to ceiling, the architectural progression from light to darkness fully experienceable.\n\nYour experienced guide brings the temple to life as a **functioning religious institution**, not just a ruin:\n\n• The **Pylon**: your guide explains the iconographic programme of the entrance towers—the smiting scenes, the protective deities, the flagstaff sockets (where enormous pennants would have fluttered, visible for miles across the valley)—and places them in the context of pharaonic propaganda: even Greek kings portrayed themselves crushing enemies in the traditional pose established by Narmer 3,000 years earlier.\n\n• The **Court of Offerings**: your guide reconstructs the festivals that filled this space—particularly the annual **Festival of the Beautiful Meeting**, when the cult statue of Hathor was carried by barge from Dendera (150 km north) to "marry" Horus at Edfu in a celebration lasting two weeks. Music, dancing, feasting, and sacred rituals transformed the temple precinct into the setting for ancient Egypt''s greatest love story.\n\n• The **Hypostyle Halls**: your guide explains the symbolic architecture—the diminishing light as you move deeper representing the journey from the created world to the primordial darkness from which creation emerged. The column capitals, each carved with elaborate botanical designs, represent the marshes of the First Time (*Zep Tepi*)—the Egyptian creation narrative in which the world emerged from watery chaos.\n\n• The **Laboratory** and **Treasury** rooms: small chambers off the hypostyle halls whose walls are inscribed with **recipes for sacred incense and ointments**, listing ingredients and procedures. Your guide explains the theological significance: these recipes were not merely practical instructions but sacred texts, the proper preparation of ritual substances being essential to the temple''s function.\n\n• The **Sanctuary**: the granite naos (shrine) of Horus still stands in the centre of the innermost room—one of the very few original shrines surviving in any Egyptian temple. Your guide reconstructs the daily ritual: each morning, the high priest broke the clay seal on the shrine doors, opened them to reveal the golden cult statue, and performed the elaborate sequence of purification, anointing, clothing, and offering that sustained the god''s presence in the temple.\n\n• The **Myth of Horus and Seth** reliefs in the ambulatory: your guide narrates the complete mythological cycle depicted on the walls—the murder of Osiris, the devotion of Isis, the birth and childhood of Horus, the series of contests between Horus and Seth (including the famous "lettuce incident" and the tribunal of the gods), and the final vindication of Horus as rightful king. These reliefs represent one of the longest and most detailed mythological narratives surviving from the ancient world.\n\n• The **falcon statue of Horus**: your guide explains the iconography of the double crown and the symbolic meaning of the falcon in Egyptian religion—Horus as the living pharaoh, the protector of Egypt, and the avenger of cosmic order.\n\n---\n\n**Evening: Arrival in Luxor**\n\nThe drive from Edfu to Luxor traverses the final stretch of the Nile Valley, passing Esna (where another Ptolemaic temple stands, its hypostyle hall still buried beneath the modern town). Your guide previews Luxor—the ancient Thebes, capital of the New Kingdom, home to Karnak, Luxor Temple, the Valley of the Kings, and more concentrated archaeological wealth than any city on Earth.\n\nYou arrive at your Luxor hotel as the evening settles over the Nile—the Theban mountains glowing amber in the last light.\n\n*Meals: Lunch*',
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Kom Ombo – dual temple theology explained in depth',
      'Surgical instruments panel with scholarly debate',
      'Calendar, astronomical reliefs, and Nilometer',
      'Crocodile Museum with sacred animal cult context',
      'Edfu – Egypt''s most complete temple experience',
      'Festival of the Beautiful Meeting narrative',
      'Laboratory rooms with sacred incense recipes',
      'Sanctuary with original granite naos of Horus',
      'Horus & Seth myth cycle in full',
      'Premium vehicle and quality lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Entrance fee to Temple of Kom Ombo',
      'Entrance fee to Crocodile Museum at Kom Ombo',
      'Entrance fee to Temple of Edfu',
      'Quality lunch at well-selected restaurant',
      'Premium air-conditioned vehicle with professional driver (Aswan to Luxor)',
      'Hotel pickup in Aswan',
      'Hotel drop-off in Luxor',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Full-day tour (8-10 hours). Same route as budget but with smaller group, better vehicle, and more experienced guide allowing deeper interpretation. At Edfu, horse carriages to temple (optional, not included—some guests enjoy it, others prefer walking). Guide should emphasise the Laboratory rooms and Treasury inscriptions at Edfu, which are often skipped by budget-level guides. Lunch between Kom Ombo and Edfu. ONE-WAY TRANSFER—luggage in vehicle. Morning departure 7-8 AM recommended.',
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
    'Kom Ombo & Edfu Temples - Deluxe Collection',
    E'**The Twin Temples: A Private Journey Through the Last Great Age of Egyptian Architecture, Aswan to Luxor**\n\nWith your private Egyptologist, luxury vehicle, and the freedom to explore at your own pace, the Ptolemaic temples of Kom Ombo and Edfu reveal themselves as the architectural and theological masterpieces they truly are. This is not the hurried group visit—this is a private journey through the Nile Valley that transforms two temple stops into an immersive exploration of the most refined era of Egyptian temple building. At Kom Ombo, your guide decodes the medical reliefs, the astronomical inscriptions, and the unique dual theology with a depth impossible in a group setting. At Edfu, you experience the most complete temple in Egypt as a functioning religious institution—its rituals reconstructed, its myths narrated, its architecture explained as a cosmic diagram in stone. Travel in comfort, dine well, and arrive in Luxor enriched.\n\n---\n\n**Morning: The Temple of Kom Ombo – The Private Interpretation**\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you in a luxury vehicle. The drive north from Aswan becomes an introduction to Ptolemaic Egypt: your guide explains how Alexander''s general Ptolemy seized Egypt in the chaos following Alexander''s death in 323 BC and founded a dynasty that ruled for nearly three centuries—the wealthiest, most culturally sophisticated kingdom in the Mediterranean world. The Ptolemies were Greek by origin, but they governed Egypt by embracing its religion, its artistic traditions, and above all its temple culture—building sanctuaries that exceeded anything their pharaonic predecessors had achieved in architectural refinement.\n\nAt the **Temple of Kom Ombo**, your private guide provides the definitive experience:\n\n• The **architectural analysis**: your guide explains how the dual-temple concept works in practice. The building is not simply mirrored—it is architecturally integrated, with shared walls, interconnected passages, and a unified decorative programme that expresses the theological relationship between Sobek and Horus. Your guide walks you through both halves, comparing the relief programmes, pointing out the subtle differences in iconography, and explaining the theological concept of divine duality that underpins the entire design.\n\n• The **medical reliefs** receive the extended analysis they deserve. Your guide identifies each depicted instrument—scalpels of various shapes, bone saws, probes, forceps, suction cups, cauterising tools, birthing chairs, and what appears to be a set of scales for measuring pharmaceutical doses. The scholarly context is provided: the **Edwin Smith Papyrus** (c. 1600 BC, based on texts as old as 3000 BC) demonstrates that Egyptian physicians practised rational, empirical medicine alongside their magical treatments—diagnosing injuries, setting fractures, performing surgery, and prescribing specific treatments based on observed symptoms. The Kom Ombo panel may represent the temple''s function as a healing centre, where the sick came to seek divine and medical intervention.\n\n• The **astronomical ceiling fragments** and **calendar inscriptions**: your guide identifies constellation figures, calendrical notations, and festival dates inscribed on the temple''s surfaces—evidence of the temple''s role as an astronomical observatory and calendar keeper.\n\n• The **Nilometer** is explored with engineering and economic analysis: the connection to the Nile, the measurement system, and the profound economic consequences of each reading—your guide explains specific historical famines and floods recorded in Egyptian texts and how the Nilometer data informed royal policy.\n\n• The **Crocodile Museum** is experienced with your guide''s expert commentary: the mummification techniques visible in the preserved specimens, the evidence of different crocodile species, the varying sizes (from hatchlings to adults several metres long), and the religious texts that explain Sobek''s role—not merely a fearsome predator to be placated, but a creator god, a solar deity, and a protector of pharaonic power.\n\n• The **Nile-side setting**: your guide selects the optimal viewpoint on the temple''s terrace to appreciate the temple''s dramatic position above the river—a site chosen deliberately for its visibility from the water, marking a territorial and religious boundary in the Ptolemaic landscape.\n\n---\n\n**Midday: Lunch & The Nile Valley**\n\nA premium lunch at a carefully selected restaurant—your guide may recommend a venue with Nile views—provides a comfortable midday break.\n\nThe drive to Edfu continues through the agricultural heartland of Upper Egypt. Your guide uses the journey to discuss the relationship between temple and community: Ptolemaic temples were not merely places of worship but economic powerhouses—owning agricultural land, employing hundreds of priests and workers, operating workshops, and managing grain stores. The temple of Edfu, your destination, was one of the wealthiest institutions in Egypt, its economic records inscribed on its own walls.\n\n---\n\n**Afternoon: The Temple of Edfu – The Complete Experience**\n\nAt the **Temple of Edfu**, your private guide provides the most comprehensive interpretation available:\n\n• The **approach and Pylon**: your guide pauses before the entrance to explain the temple''s scale—the pylon is 36 metres high, the temple 137 metres long—and its construction history: begun under Ptolemy III Euergetes in 237 BC and completed 180 years later under Ptolemy XII, the building represents the sustained commitment of nine successive pharaohs to a single architectural project. Your guide points out the foundation inscriptions that record the exact dates and the ritual of temple founding.\n\n• The **Court of Offerings** is reconstructed as a festival space: your guide describes the **Festival of the Beautiful Meeting** in detail—the departure of Hathor''s statue from Dendera by Nile barge, the welcoming ceremonies at Edfu, the processions, the sacred marriage rituals, the public celebrations, and the fourteen days of festivities that followed. Specific reliefs in the court depict these scenes, and your guide identifies them.\n\n• The **outer Hypostyle Hall**: your guide draws attention to the **"Library"** (a small room off the hall) whose walls list the titles of the sacred texts stored there—a catalogue of the temple''s theological, ritual, and astronomical knowledge. Also the **robing room** where the priests prepared for ceremonies, its reliefs depicting the precise garments and ornaments required for each ritual.\n\n• The **inner Hypostyle Hall**: your guide explains the diminishing light as a deliberate architectural metaphor—the journey from the created world to the primordial darkness of the *Nun* (the cosmic waters from which creation emerged). The column capitals, each uniquely carved, represent the vegetation of the primordial marsh—the first land that rose from the waters at the beginning of time.\n\n• The **Laboratory** rooms: your guide reads selected recipes from the walls—ingredients for sacred incense (*kyphi*, the most famous temple fragrance), ointments for anointing the god''s statue, and preparations for purification rituals. The ingredients include myrrh, frankincense, honey, wine, juniper berries, and numerous plant resins—some identifiable, others still debated by scholars.\n\n• The **Treasury** inscriptions: records of the temple''s wealth—gold, silver, precious stones, and fine linen—and the offerings made by pharaohs to Horus. Your guide explains the temple''s economic function: Edfu owned vast agricultural estates, employed hundreds of people, and managed a complex economy of production, storage, and distribution.\n\n• The **New Year Chapel** on the temple roof (accessible via internal staircase): a special chamber where rituals were performed to greet the first sunrise of the new year. The ceiling reliefs depict the sky goddess Nut giving birth to the sun—one of the most beautiful cosmological images in Egyptian art. Your guide explains the New Year ritual: the procession of priests carrying the cult statue up the staircase to be "reunited" with the sun''s rays, an annual renewal of the god''s divine energy.\n\n• The **Sanctuary and naos**: your guide reconstructs the daily ritual in detail—the breaking of the seal, the opening of the shrine, the hymns, the offerings, the anointing of the statue—and explains the theological concept: the ritual did not merely honour the god but sustained the cosmic order. If the ritual ceased, the Egyptians believed, the world itself would begin to dissolve back into chaos.\n\n• The **Ambulatory** with the complete **Horus and Seth cycle**: your guide narrates the myth with the full scholarly version—including episodes often omitted from tourist presentations. The final scene—the tribunal of the gods awarding the kingship to Horus—is explained as the foundational political myth of Egyptian civilisation: every pharaoh was Horus, every rightful succession recapitulated the triumph of order over chaos.\n\n• The **Mammisi (Birth House)**: the free-standing structure in front of the temple where reliefs depict the divine birth of Horus—your guide explains the architectural tradition of the birth house (a Ptolemaic innovation) and its ritual function in legitimising royal power.\n\n---\n\n**Evening: Arrival in Luxor**\n\nThe drive to Luxor traverses the final stretch of the Nile Valley. Your guide provides a preview of Luxor''s riches—Karnak, the Valley of the Kings, the temples of the West Bank—setting the stage for whatever adventures lie ahead.\n\nYou arrive at your hotel in Luxor as the evening settles over the Nile.\n\n*Meals: Lunch*',
    ARRAY[
      'Private Egyptologist guide (max 8 guests)',
      'Kom Ombo – dual theology, astronomical reliefs, complete medical panel analysis',
      'Crocodile Museum with mummification expertise',
      'Nilometer with engineering and economic analysis',
      'Edfu – most complete temple interpretation available',
      'Festival of the Beautiful Meeting reconstructed',
      'Library room, robing room, Laboratory recipes',
      'Treasury inscriptions and temple economics',
      'New Year Chapel on temple roof',
      'Sanctuary daily ritual reconstructed',
      'Horus & Seth complete myth cycle',
      'Mammisi (Birth House) of Horus',
      'Luxury vehicle and premium lunch'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Entrance fee to Temple of Kom Ombo',
      'Entrance fee to Crocodile Museum at Kom Ombo',
      'Entrance fee to Temple of Edfu',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent) with professional driver',
      'Hotel pickup in Aswan',
      'Hotel drop-off in Luxor',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), luxury vehicle, premium lunch. KEY ADVANTAGE: Private guide allows extended time at both temples—especially Edfu, where the New Year Chapel (roof access), Library room, and Laboratory rooms are often skipped by group tours. At Edfu, private electric cart from parking to temple can be arranged (more comfortable than horse carriage). Full day 8-10 hours. ONE-WAY TRANSFER—ensure luggage in vehicle. Guide should include Mammisi at Edfu if time permits. Consider offering optional stop at Esna temple en route to Luxor for guests with particular interest in Ptolemaic architecture.',
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
    'Kom Ombo & Edfu Temples - Ultimate Luxury',
    E'**The Ptolemaic Masterpieces: A Private Scholarly Expedition from Aswan to Luxor Through Egypt''s Greatest Surviving Temples**\n\nThis is not a transfer with temple stops. It is a private archaeological expedition along the Nile Valley led by a personal PhD Egyptologist—a published specialist in Ptolemaic temple architecture, Greco-Roman religion, or Egyptian art history. Two temples that most tourists visit in hurried group tours become, in the hands of your scholar, deeply immersive encounters with the final flowering of a civilisation. At Kom Ombo, your scholar decodes the medical reliefs using current scholarship, reads the astronomical inscriptions, and explains the unique dual theology with academic authority. At Edfu, you experience the most complete temple in Egypt as no standard tour could ever offer—from the sacred recipes on the laboratory walls to the New Year rituals on the roof to the hieroglyphic inscriptions your scholar reads directly from the stone. Travel by private limousine, dine superbly, and arrive in Luxor having experienced the Ptolemaic world at its finest.\n\n---\n\n**Morning: The Temple of Kom Ombo – The Scholar''s Reading**\n\nYour private limousine collects you at your preferred time, and your personal **PhD Egyptologist** begins the day''s intellectual journey as you drive. The Ptolemaic period is introduced not as a footnote to pharaonic history but as one of the most fascinating chapters in the ancient world: Greek rulers who adopted Egyptian religion with genuine conviction, who commissioned temples that surpassed anything their pharaonic predecessors had built in decorative refinement, and who created a multicultural civilisation that fused Greek philosophy with Egyptian theology in ways that shaped the development of Western religion.\n\nAt the **Temple of Kom Ombo**, your scholar provides the definitive interpretation:\n\n• The **architectural analysis** goes beyond the double-temple concept. Your scholar explains the temple''s relationship to the broader settlement: Kom Ombo was a military garrison town in the Ptolemaic period, strategically positioned to control trade routes from Nubia. The temple served both religious and political functions—a statement of Ptolemaic authority on Egypt''s southern frontier. The choice of Sobek and Horus reflects this dual role: Sobek, the local crocodile deity worshipped in the region since predynastic times, and Horus the Elder, the universal sky god associated with royal power.\n\n• The **medical reliefs** are decoded with current academic scholarship. Your scholar identifies each instrument with reference to parallel evidence from medical papyri and archaeological finds: the Edwin Smith Papyrus (the world''s oldest surgical treatise), the Ebers Papyrus (pharmacological recipes), and the Kahun Papyrus (gynaecological texts). The debate—surgical instruments vs. ritual implements—is presented with scholarly balance, and your scholar shares the latest academic opinions and any recent publications.\n\n• The **astronomical inscriptions** are read directly from the stone: your scholar identifies specific constellations in the Egyptian system (distinct from Greco-Roman constellations), calendrical notations, and decans (star groups used for timekeeping). The temple''s possible function as an astronomical observation point is discussed.\n\n• The **hieroglyphic and demotic inscriptions** are read by your scholar directly from the walls—Ptolemaic hieroglyphs are notably more complex than earlier forms (the number of signs expanded from approximately 700 in the classical period to over 6,000 in the Ptolemaic era), and your scholar explains this expansion as a deliberate "encoding" of sacred knowledge by the priestly class.\n\n• The **Crocodile Museum** becomes a seminar on the sacred animal cults of late Egyptian religion: your scholar explains the phenomenon (which bewildered Greek visitors like Herodotus) as a theological development in which specific animals were understood as living *ba* (spiritual manifestation) of their associated deity. The mummification techniques are analyzed—the wrapping methods, the resin application, the varying levels of care given to different specimens—and compared with human mummification practices.\n\n• The **Nilometer** is contextualized within the network of Nilometers along the river (at Elephantine, Cairo, and elsewhere) that constituted ancient Egypt''s hydrological monitoring system—a coordinated infrastructure of measurement and prediction that informed agricultural planning, taxation, and temple ritual calendars.\n\n---\n\n**Midday: A Refined Interlude**\n\nA carefully arranged lunch at a premium venue—your scholar may recommend a restaurant with Nile views or a private arrangement suited to the day''s schedule—provides a moment of comfortable reflection.\n\nThe drive to Edfu becomes a continuation of the scholarly narrative: your PhD guide discusses the Ptolemaic temple-building programme as a systematic cultural project—a network of temples stretching from Philae to Dendera that together constituted the most ambitious religious building programme in the ancient world. The investment—in stone, labour, artistic talent, and priestly expertise—was staggering, and your scholar explains the political and economic motivations: temples as centres of economic production, priestly support as a pillar of political legitimacy, and religious architecture as a tool of cultural integration between Greek rulers and their Egyptian subjects.\n\n---\n\n**Afternoon: The Temple of Edfu – The Definitive Experience**\n\nAt the **Temple of Edfu**, your PhD scholar provides what is, simply, the most complete temple interpretation available anywhere in Egypt:\n\n• The **foundation inscriptions** are read directly from the stone: your scholar translates the texts recording the temple''s founding ceremony (August 23, 237 BC), the ritual of "stretching the cord" (astronomical alignment of the temple axis), the laying of the first stone, and the completion and dedication under Ptolemy XII. These inscriptions are among the most detailed building records surviving from the ancient world.\n\n• The **Pylon reliefs** are decoded with iconographic expertise: the traditional smiting scene analyzed as political theology (the pharaoh as cosmic champion of order over chaos), the protective deities identified, the astronomical alignments of the temple entrance noted, and the original appearance of the pylon reconstructed (painted reliefs, gilded elements, enormous flagstaffs with coloured pennants visible for miles).\n\n• The **Court of Offerings** is reconstructed as the setting for the **Festival of the Beautiful Meeting**—your scholar provides the complete ritual programme: the departure from Dendera, the Nile journey, the arrival ceremonies, the sacred marriage of Horus and Hathor, the public celebrations (music, dance, food, beer), and the theological significance (the annual renewal of cosmic fertility). Specific reliefs depicting these events are identified and read.\n\n• The **Library room**: your scholar reads the catalogue of texts inscribed on the walls—titles of the books of ritual, theology, astronomy, and temple management that were once stored here. This room was the temple''s intellectual centre, and your scholar explains the Egyptian concept of the sacred library: not merely a storage room but a place of power, where the written word had magical efficacy.\n\n• The **Laboratory rooms**: your scholar reads the recipes for *kyphi* (sacred incense) and other ritual preparations directly from the walls, identifying ingredients (myrrh, frankincense, wine, honey, juniper, calamus, cinnamon, raisins) and explaining the ritual context—when and how each preparation was used, what theological purpose it served, and how the recipes compare with descriptions in Plutarch and other Greco-Roman sources.\n\n• The **Hypostyle Halls**: your scholar provides the architectural and theological analysis—the column types identified (composite floral capitals, palm capitals, papyrus-bundle columns), the symbolic programme explained (the temple as microcosm: floor as earth, columns as vegetation, ceiling as sky, the darkening progression as a journey back to the beginning of creation), and the hieroglyphic inscriptions on the columns and architraves read and contextualized.\n\n• The **New Year Chapel** (roof access): your scholar reconstructs the New Year ritual in full—the procession up the staircase (whose walls are decorated with reliefs of the ascending priests), the exposure of the cult statue to the first rays of the rising sun, the invocation hymns, and the theological concept of *whem-mesut* ("repetition of birth")—the annual renewal of divine energy through solar contact. The ceiling relief of the sky goddess Nut giving birth to the sun is analyzed as one of the supreme achievements of Egyptian cosmological art.\n\n• The **Sanctuary**: your scholar reconstructs the daily temple ritual with academic completeness—the predawn preparations, the procession of priests, the breaking of the seal, the opening of the shrine, the four-fold purification (water, natron, incense, linen), the anointing with seven sacred oils, the presentation of the eye of Horus (the theological symbol of wholeness and restoration), and the closing and resealing of the shrine. This ritual, performed every day for over three centuries at Edfu, was the heartbeat of the temple''s existence.\n\n• The **Ambulatory and the Triumph of Horus**: your scholar narrates the complete myth cycle from the reliefs—including the episodes that reveal the myth''s complexity (the sexual contests, the deceptions, the appeals to the divine tribunal) and the political reading: every pharaoh was Horus, every succession was a re-enactment of Horus''s triumph, every reign was a restoration of *Ma''at* (cosmic order) over *Isfet* (chaos).\n\n• The **Mammisi (Birth House)**: your scholar analyzes this as a Ptolemaic architectural innovation—a freestanding structure dedicated to the birth of the divine child (Horus/Ihy), whose ritual function legitimised the ruling pharaoh as the living incarnation of the god. The reliefs are read and compared with other mammisis at Dendera and Philae.\n\n• The **exterior reliefs and enclosure wall**: areas often ignored by group tours but rich in astronomical and mythological content—your scholar identifies key scenes and reads inscriptions that contribute to the temple''s complete theological programme.\n\n---\n\n**Evening: Arrival in Luxor**\n\nThe drive to Luxor, with a possible brief stop at **Esna** (where another Ptolemaic temple, still being excavated, reveals stunning painted reliefs), brings the day to its conclusion.\n\nYour limousine delivers you to your Luxor hotel as evening falls over the Theban hills—the Valley of the Kings, the temple of Hatshepsut, and the Colossi of Memnon silhouetted against the fading light. The Ptolemaic temples of today connect seamlessly to the pharaonic treasures that await: from the final age of Egyptian temple building to the golden age that preceded it, the story of Egypt''s civilisation continues.\n\nYour scholar provides a personalised digital summary of the day''s key themes, inscriptions discussed, and suggested further reading—a scholarly souvenir of an extraordinary journey.\n\n*Meals: Lunch*',
    ARRAY[
      'Personal PhD Egyptologist (fully private)',
      'Kom Ombo – complete medical reliefs with current scholarship',
      'Astronomical inscriptions and hieroglyphic reading',
      'Ptolemaic hieroglyphic expansion explained (700 to 6,000+ signs)',
      'Crocodile Museum with sacred animal cult seminar',
      'Edfu – the definitive temple experience',
      'Foundation inscriptions read from stone (237 BC)',
      'Festival of the Beautiful Meeting fully reconstructed',
      'Library room catalogue read and explained',
      'Laboratory kyphi recipes translated from walls',
      'New Year Chapel roof ritual with Nut ceiling',
      'Sanctuary daily ritual – complete academic reconstruction',
      'Horus & Seth complete cycle with scholarly analysis',
      'Mammisi and exterior reliefs',
      'Optional Esna temple stop',
      'Private limousine and fine dining lunch',
      'Personalised scholarly briefing notes'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'Entrance fee to Temple of Kom Ombo',
      'Entrance fee to Crocodile Museum at Kom Ombo',
      'Entrance fee to Temple of Edfu',
      'Private limousine (Mercedes S-Class or equivalent) with professional chauffeur',
      'Fine dining lunch at premium venue',
      'Hotel pickup in Aswan',
      'Hotel drop-off in Luxor',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)',
      'Optional stop at Esna temple (entrance fee included if visited)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Ptolemaic architecture specialist, Greco-Roman religion expert, or Egyptian art historian), private limousine, fine dining. KEY ADVANTAGES: Scholar can read hieroglyphic AND demotic inscriptions directly from temple walls; extended time at Edfu allows roof access (New Year Chapel), Library, Laboratory, exterior reliefs—areas skipped by all group tours. At Edfu, arrange private electric cart (not horse carriage) for comfort. Optional Esna stop adds 30-45 min but is worthwhile for the recently cleaned and restored ceiling. ONE-WAY TRANSFER—luggage in limousine. Full day 9-11 hours depending on depth of exploration. For UHNW clients and serious cultural travellers. Consider recommending this as the overland alternative to the Nile cruise segment between Aswan and Luxor—same temples, more time, scholarly depth.',
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
  RAISE NOTICE 'Migration 151 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Kom Ombo & Edfu Temples Day Tour:';
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
WHERE cl.slug = 'kom-ombo-edfu-temples-day-tour'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
