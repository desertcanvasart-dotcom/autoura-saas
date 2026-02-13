-- =====================================================================
-- Migration 145: Add Grand West Bank Day Tour (Luxor)
-- Description: Full-day tour of Luxor's West Bank with 4 tier variations
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
    'Grand West Bank Day Tour: Valley of the Kings, Hatshepsut, Medinet Habu & Beyond',
    'grand-west-bank-day-tour-luxor',
    'Cross to Luxor''s West Bank for the most comprehensive exploration of ancient Thebes'' royal necropolis and monumental temples. Descend into the painted tombs of pharaohs in the Valley of the Kings—including the legendary tomb of Tutankhamun. Marvel at the exquisite artistry of Queen Nefertari''s tomb in the Valley of the Queens. Stand before the towering Colossi of Memnon, explore the dramatic terraced temple of Hatshepsut at Deir el-Bahari, discover the vast fortress-temple of Ramesses III at Medinet Habu, and conclude at Deir el-Medina—the village where the tomb-builders themselves lived, worked, and were buried. Six extraordinary sites, 3,500 years of history, one unforgettable day on the West Bank of the Nile.',
    'Luxor West Bank, Egypt',
    '1 day (full day)',
    ARRAY['luxor', 'west-bank', 'valley-of-kings', 'tutankhamun', 'valley-of-queens', 'nefertari', 'hatshepsut', 'medinet-habu', 'colossi-memnon', 'deir-el-medina', 'day-tour', 'new-kingdom', 'thebes'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 9,
      'city', 'Luxor',
      'region', 'West Bank',
      'highlights', ARRAY[
        'Valley of the Kings (3 tombs + Tutankhamun)',
        'Valley of the Queens (Tomb of Nefertari)',
        'Colossi of Memnon',
        'Temple of Hatshepsut at Deir el-Bahari',
        'Medinet Habu (Temple of Ramesses III)',
        'Deir el-Medina (Workers'' Village)'
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
    'Grand West Bank Tour - Classic Discovery',
    E'**The Royal Necropolis: Luxor''s West Bank Revealed**\n\nThe East Bank of the Nile was for the living—its temples dedicated to the gods, its avenues thronged with processions and pilgrims. The West Bank was for eternity. Here, where the sun set each evening into the desert hills, the pharaohs of the New Kingdom carved their tombs deep into the rock, built vast mortuary temples to ensure their immortality, and employed entire villages of master artisans to prepare their passage into the afterlife.\n\nThis comprehensive full-day tour reveals the West Bank in its entirety—from the hidden tombs of pharaohs to the painted chambers of queens, from colossal statues that have guarded the plain for 3,400 years to the intimate village where the tomb-builders themselves lived and died. Six extraordinary sites. 3,500 years of history. One unforgettable day.\n\n---\n\n**Morning: The Royal Valleys**\n\n*Valley of the Kings – The House of Eternity*\n\nYour day begins in the most famous burial ground on Earth. The **Valley of the Kings** is a desolate, sun-scorched wadi carved into the Theban Hills—chosen by New Kingdom pharaohs precisely because its remoteness and the pyramid-shaped peak of al-Qurn above it made it the perfect secret resting place for royal eternity.\n\nSixty-three tombs have been discovered here, carved deep into the limestone bedrock over a span of nearly 500 years (c. 1539–1075 BC). Your general admission includes entry to **three tombs**, and your guide selects the most rewarding combination available on the day—each tomb a descent into decorated corridors and burial chambers whose painted walls depict the pharaoh''s journey through the underworld, the spells and prayers of the Book of the Dead, and the gods who would guide the king to resurrection.\n\nThe colours are extraordinary—vivid blues, golds, reds, and greens preserved by the bone-dry desert air for over three millennia. Scenes of the pharaoh before Osiris, of serpents and demons guarding the twelve hours of the night, of the sun god Ra''s nightly voyage through the underworld—each tomb is a theological masterpiece painted by master artists.\n\nYour tour includes entry to the **Tomb of Tutankhamun** (KV62)—the most famous archaeological discovery in history. While smaller than many royal tombs, its significance is unmatched: this is the only pharaonic tomb discovered with its treasures substantially intact, and the painted burial chamber—where the boy king''s mummy still rests in its original sarcophagus—retains a power that no museum can replicate. Your guide recounts the dramatic story of Howard Carter''s 1922 discovery, the years of painstaking excavation, and the legends of the "curse" that followed.\n\n*Valley of the Queens – Nefertari''s Masterpiece*\n\nFrom the kings'' valley, proceed to the **Valley of the Queens**, burial ground of royal consorts, princes, and princesses. The valley contains over 90 tombs, but one eclipses all others.\n\nThe **Tomb of Queen Nefertari** (QV66) is widely considered the most beautiful tomb in all of Egypt—and perhaps the most exquisite painted interior of the ancient world. The favourite wife of Ramesses II, Nefertari was honoured with a tomb whose every surface is covered in paintings of breathtaking quality: the queen in her white linen gown playing senet (a board game), the queen led by Isis and Hathor through the gates of the underworld, the queen receiving the breath of eternal life.\n\nThe colours—painted on fine plaster over limestone—are astonishingly vivid after 3,200 years. Azure blues, brilliant whites, rich golds, and deep reds create an atmosphere that feels less like a tomb and more like a jewel box. Your guide explains the symbolism of each scene and the extraordinary conservation effort that rescued these paintings from near-destruction in the 20th century.\n\n---\n\n**Midday: Temples and Monuments**\n\n*Colossi of Memnon – Guardians of the Plain*\n\nTwo enormous quartzite statues—each standing 18 meters high and weighing approximately 720 tons—rise from the agricultural plain as though emerging from the earth itself. The **Colossi of Memnon** are all that remain above ground of the once-vast mortuary temple of **Amenhotep III**, which in its day was the largest temple complex in Thebes.\n\nYour guide explains the colossi''s famous history: in antiquity, the northern statue was damaged by an earthquake and began to emit a haunting sound at dawn—a phenomenon that Greeks attributed to the mythical hero Memnon greeting his mother Eos (the dawn). The sound drew visitors from across the Roman Empire, including Emperor Hadrian, and made these statues among the most famous monuments in the ancient world.\n\n*Temple of Queen Hatshepsut – Majesty Against the Cliffs*\n\nThe **Mortuary Temple of Hatshepsut** at Deir el-Bahari is one of the most visually dramatic monuments in Egypt. Set against the sheer limestone cliffs of the Theban Hills, its three ascending terraces of colonnades rise in elegant horizontal lines that seem to grow organically from the rock face behind—an architectural vision centuries ahead of its time.\n\n**Hatshepsut** was Egypt''s first female pharaoh—a woman who ruled as king for over 20 years during the 18th Dynasty, adopting male regalia and titles while commissioning some of the finest architecture and art of the New Kingdom. Her temple is both a political statement and a work of genius.\n\nYour guide leads you through the terraces, explaining the relief carvings that chronicle Hatshepsut''s achievements: her legendary **trading expedition to Punt** (a distant land of myrrh, gold, and exotic animals), her divine birth narrative (claiming the god Amun as her father), and the chapels dedicated to Hathor and Anubis. The views from the upper terrace—across the cultivated plain to the Nile and Luxor''s East Bank—are among the most spectacular in Egypt.\n\n---\n\n**Afternoon: The Fortress-Temple and the Workers'' Village**\n\n*Medinet Habu – The Temple of Ramesses III*\n\nAfter lunch, explore one of the West Bank''s most impressive and least-crowded monuments. **Medinet Habu** is the mortuary temple of **Ramesses III**, the last great warrior-pharaoh of the New Kingdom—and it is vast, well-preserved, and spectacular.\n\nThe temple complex is entered through a massive **fortified gatehouse** (the "migdol"), modeled on Syrian fortresses Ramesses had seen on campaign—unique in Egyptian temple architecture. Beyond it, the main temple''s walls are covered in some of the most dramatic relief carvings in Egypt: scenes of Ramesses defeating the **Sea Peoples** (mysterious invaders whose attacks around 1177 BC contributed to the collapse of the Bronze Age civilizations), hunting wild bulls, and making offerings to the gods.\n\nThe colours preserved on many of these reliefs are remarkable—vibrant reds, blues, and yellows that give vivid life to scenes carved over 3,100 years ago. Your guide explains the historical significance: the Sea Peoples battle reliefs are one of the primary historical sources for one of the most catastrophic events in ancient history.\n\nThe temple''s sheer scale—multiple courtyards, hypostyle halls, and a sacred lake—rivals Karnak itself, yet you may find yourself sharing it with only a handful of other visitors.\n\n*Deir el-Medina – The Workers'' Village*\n\nYour day concludes at the most humanly moving site on the West Bank. **Deir el-Medina** is the village where the artisans and workers who created the royal tombs in the Valley of the Kings and Valley of the Queens lived, worked, and were buried over a span of nearly 500 years.\n\nUnlike the monumental tombs of pharaohs, the tombs at Deir el-Medina are intimate, personal, and deeply touching. These workers—master painters, sculptors, scribes, and builders—created their own tombs with the same extraordinary skill they applied to royal commissions. The paintings in their burial chambers are often more vivid and personal than those in the royal valleys: family scenes, daily life, the deceased and their loved ones before the gods.\n\nBut Deir el-Medina''s greatest treasure is the insight it provides into ordinary life in ancient Egypt. Thousands of **ostraca** (limestone flakes used for notes) found here record everything from work schedules and supply inventories to love poems, medical prescriptions, dream interpretations, and the world''s earliest recorded workers'' strike (when the tomb-builders downed tools because their grain rations hadn''t arrived). Your guide brings these human details to life, transforming the ancient Egyptians from remote monument-builders into recognizable human beings.\n\nReturn to your hotel on the East Bank having experienced the West Bank''s full sweep—from the grandest royal tombs to the most intimate human stories, from the monumental to the personal, from 3,500 years of silence to voices that still speak clearly across the millennia.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 3 tombs including Tutankhamun',
      'Valley of the Queens – Tomb of Nefertari',
      'Colossi of Memnon',
      'Temple of Hatshepsut at Deir el-Bahari',
      'Medinet Habu (Temple of Ramesses III)',
      'Deir el-Medina workers'' village and tombs',
      'Professional English-speaking Egyptologist guide',
      'Lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Valley of the Kings general admission (3 tombs)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fees to Hatshepsut Temple, Medinet Habu, Deir el-Medina',
      'Colossi of Memnon visit (no entrance fee)',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel pickup and drop-off in Luxor'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. IMPORTANT: Tutankhamun tomb requires separate ticket (included). Nefertari tomb requires separate premium ticket (included—confirm availability, limited daily visitors ~150). Nefertari can close without notice for conservation—have backup plan (Tomb of Titi or other Queens Valley tombs). Valley of Kings tomb selection rotates—guide selects best available. Full-day tour is physically demanding—heat, walking, stairs in tombs. Recommend earliest possible start (6-7 AM) to avoid midday heat.',
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
    'Grand West Bank Tour - Premium Experience',
    E'**The Complete West Bank: A Premium Day Among Pharaohs and Artisans**\n\nThe West Bank of Luxor is the greatest open-air museum of the ancient world—a landscape where the tombs of pharaohs, the temples of queens, and the villages of master craftsmen have survived for over three millennia, preserved by the dry desert air and the Theban Hills that shelter them. This premium day tour, with an experienced Egyptologist, small group, and comfortable vehicle, reveals the full scope of this extraordinary necropolis—from the hidden chambers of the Valley of the Kings to the intimate workshops of Deir el-Medina, with every monumental temple and royal tomb between.\n\n---\n\n**Early Morning: The Royal Valleys**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle before dawn—the West Bank is best experienced in the cool early morning, and an early start means arriving at the Valley of the Kings before the main crowds.\n\n*Valley of the Kings – Into the Mountain*\n\nThe approach to the **Valley of the Kings** is itself dramatic—the road winds through barren desert hills until the valley opens before you, austere and magnificent. The pyramid-shaped peak of **al-Qurn** rises above—the natural pyramid that ancient Egyptians believed the goddess Meretseger inhabited, protecting the tombs below.\n\nYour guide has selected the optimal combination of **three tombs** for the day—this varies as tombs rotate, but your Egyptologist ensures you experience the finest available. Possibilities include the tombs of **Ramesses IV** (with its magnificent astronomical ceiling), **Ramesses IX** (with its vivid Book of the Dead illustrations), **Merenptah** (with its massive sarcophagus still in situ), or **Thutmose III** (hidden in a cleft high above the valley floor, its cartouche-shaped burial chamber decorated with the earliest complete copy of the Amduat, the guide to the underworld).\n\nEach tomb descent is narrated by your guide: the purpose of each decorated corridor, the meaning of each religious text, the engineering challenges of carving chambers deep into solid rock while maintaining precise decoration throughout. The cumulative effect is immersive—you begin to understand the ancient Egyptian conception of death not as an ending but as a journey, guided by spells, protected by gods, and culminating in resurrection.\n\nThe **Tomb of Tutankhamun** (KV62) provides the emotional peak. Your guide tells the complete story: the boy king who died at 19, the hastily prepared tomb (far smaller than his status warranted), the entrance buried beneath debris from later construction, and Howard Carter''s legendary discovery in November 1922—the sealed doorway, the first glimpse by candlelight, the famous words "wonderful things." Standing in the burial chamber, where Tutankhamun''s mummy still rests in its outermost golden coffin, the power of the place is undeniable.\n\n*Valley of the Queens – Art of the Highest Order*\n\nThe **Valley of the Queens** is more intimate than the Kings'' valley—a secluded wadi where royal wives, princes, and princesses were interred during the 19th and 20th Dynasties.\n\nThe **Tomb of Nefertari** (QV66) is the indisputable masterpiece. Your Egyptologist prepares you for what you are about to see: what many scholars consider the finest painted interior to survive from the ancient world. Every surface of this tomb—walls, ceilings, pillars—is covered in paintings of extraordinary refinement. Nefertari, the "Great Royal Wife" beloved by Ramesses II, is depicted in flowing white linen moving through the afterlife: playing senet with an invisible opponent (a metaphor for the soul''s contest with destiny), being crowned by Isis and Hathor, receiving the ankh (breath of life) from the gods.\n\nYour guide explains the artistic techniques—the careful plaster preparation, the preliminary grid drawings (some still visible), the confident brushwork, and the symbolic colour palette. The conservation story is equally compelling: in the 1980s, the Getty Conservation Institute undertook a painstaking six-year restoration that saved these paintings from destruction. Time inside the tomb is limited to protect the artwork, and your guide ensures every moment counts.\n\n---\n\n**Midday: The Monumental West Bank**\n\n*Colossi of Memnon – Giants of the Plain*\n\nThe **Colossi of Memnon** rise from the cultivation like sentinels from another age. At 18 meters tall, these quartzite statues of **Amenhotep III** once guarded the entrance to the largest mortuary temple in Thebes—a complex that has almost entirely vanished, its stones quarried by later pharaohs.\n\nYour guide tells the story of the "Vocal Memnon"—the northern colossus that, after earthquake damage, produced eerie sounds at dawn, attributed by Greek and Roman visitors to the mythical hero Memnon singing to his mother. Emperors, poets, and philosophers made pilgrimages to hear the sound, carving their names and testimonials into the statue''s legs—graffiti you can still see today. When Emperor Septimius Severus repaired the statue around 199 AD, the singing stopped forever.\n\nYour guide also explains the ongoing **archaeological excavation** of Amenhotep III''s temple—new discoveries continue to emerge, including colossal statues and architectural fragments that hint at the original complex''s extraordinary scale.\n\n*Temple of Hatshepsut – The Queen Who Was King*\n\nThe **Mortuary Temple of Hatshepsut** at Deir el-Bahari commands the landscape. Three terraces of colonnaded porticoes rise against the vertical limestone cliffs in a composition of breathtaking harmony—architecture and geology in perfect dialogue.\n\nYour guide tells Hatshepsut''s extraordinary story: the queen who became pharaoh, who wore the false beard and kilt of kingship, who commissioned a trading expedition to the mythical land of Punt, and who ruled Egypt for over 20 years with a combination of political skill and cultural ambition that few pharaohs matched.\n\nThe temple''s relief carvings are among the finest of the New Kingdom: the **Punt Expedition reliefs** (depicting exotic animals, incense trees, and the famously rotund Queen of Punt), the **Divine Birth reliefs** (showing Hatshepsut''s conception by the god Amun himself), and the chapels of **Hathor** (with their cow-headed columns) and **Anubis** (with their jewel-like painted decoration).\n\nYour guide also addresses the mystery of Hatshepsut''s erasure—the systematic defacement of her images and cartouches, traditionally attributed to her successor Thutmose III but now understood as a more complex political and theological act.\n\nEnjoy a quality lunch at a well-selected restaurant before the afternoon programme.\n\n---\n\n**Afternoon: The Hidden West Bank**\n\n*Medinet Habu – The Great Fortress-Temple*\n\n**Medinet Habu** is the reward for those willing to go beyond the standard itinerary. The mortuary temple of **Ramesses III** is one of the best-preserved temple complexes in all of Egypt—and one of the least crowded.\n\nEnter through the extraordinary **migdol gateway**—a fortified entrance modeled on the military fortresses Ramesses encountered in his Syrian campaigns, unique in Egyptian temple architecture. Your guide explains its dual function: religious gateway and genuine defensive structure, reflecting the increasingly unstable political climate of the late New Kingdom.\n\nThe temple walls bear some of the most historically important relief carvings in Egypt. The **Sea Peoples battle reliefs** on the northern exterior wall depict the great naval and land battles of Year 8 of Ramesses'' reign (c. 1177 BC)—one of our primary sources for the catastrophic wave of invasions that brought the Bronze Age to its end. Your guide identifies the different Sea Peoples groups by their distinctive helmets and weapons, explains the naval battle tactics depicted, and places these events in the broader context of the Bronze Age Collapse.\n\nInside, the colours preserved on the columns and walls are stunning—some of the best-preserved painted surfaces of any Egyptian temple. The First and Second Courts retain vivid scenes of religious festivals, military triumphs, and offerings to the gods.\n\n*Deir el-Medina – The Human Heart of the West Bank*\n\nThe day''s final site is its most intimate and perhaps most moving. **Deir el-Medina** was home to the community of skilled artisans who carved and decorated the royal tombs for nearly 500 years—the painters, sculptors, scribes, and builders whose collective genius produced the wonders you have seen throughout the day.\n\nTheir village—stone houses lining a central street, workshops, storage rooms, and a communal well—has been excavated to reveal the most complete picture of daily life available from any ancient Egyptian settlement. Your guide brings this community to life: the foreman who assigned work shifts, the scribe who recorded supplies, the doctor who treated injuries, the women who managed households and traded goods.\n\nThe workers'' **tombs** are gems of intimate artistry. Smaller than royal tombs but painted with the same extraordinary skill, they depict scenes of personal devotion and family life: the deceased couple before Osiris, children playing, the tomb-owner at work in the Valley of the Kings. The **Tomb of Sennedjem** (TT1) and the **Tomb of Inherkhau** (TT359) are among the finest—their vaulted ceilings painted with scenes of paradisiacal fields where the deceased harvests grain, sails in a reed boat, and lives eternally in the company of the gods.\n\nYour guide shares the most evocative ostraca discoveries: love poems, humorous sketches, complaints about colleagues, dream interpretations, and the famous account of the first recorded workers'' strike in history—when the royal tomb-builders downed tools because their grain rations were late, marching to the mortuary temples to demand what was owed.\n\nReturn to Luxor''s East Bank in the late afternoon, carrying an understanding of the West Bank that encompasses not just its monuments but its humanity.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 3 tombs with expert guide selection',
      'Tomb of Tutankhamun (KV62) with full discovery narrative',
      'Tomb of Nefertari (QV66) – finest painted tomb in Egypt',
      'Colossi of Memnon with archaeological update',
      'Temple of Hatshepsut with Punt and Divine Birth reliefs',
      'Medinet Habu – Sea Peoples battle reliefs',
      'Deir el-Medina workers'' village and painted tombs',
      'Experienced Egyptologist (small group max 16)',
      'Premium vehicle and quality lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Valley of the Kings general admission (3 tombs)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fees to Hatshepsut Temple, Medinet Habu, Deir el-Medina',
      'Colossi of Memnon visit',
      'Quality lunch at well-selected restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel pickup and drop-off in Luxor',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Early start essential (6-7 AM)—Valley of Kings before crowds. Nefertari tomb has limited daily visitors (~150)—book tickets in advance. Tomb selection in Valley of Kings rotates; guide selects best available. Physically demanding day—heat, walking, tomb stairs. Medinet Habu is key differentiator—most tours skip it. Deir el-Medina provides emotional contrast to royal sites.',
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
    'Grand West Bank Tour - Deluxe Collection',
    E'**The West Bank Unveiled: A Private Archaeological Journey**\n\nThis is the definitive West Bank experience. With your private Egyptologist, luxury vehicle, and expanded tomb access, you don''t merely visit Luxor''s royal necropolis—you inhabit it. Descend into four tombs in the Valley of the Kings (not the standard three). Stand in the jewel-like perfection of Nefertari''s tomb with expert interpretation. Explore Medinet Habu''s battle reliefs with a guide who can read the hieroglyphs. Discover the workers'' village at Deir el-Medina with the human stories that bring ancient Egypt to life. Every site receives the private attention and scholarly depth it deserves—unhurried, expert, and profoundly rewarding.\n\n---\n\n**Early Morning: The Royal Valleys – Expanded Access**\n\n*Valley of the Kings – Four Tombs, One Scholar*\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you before dawn in a luxury vehicle. The early start is strategic—arriving at the **Valley of the Kings** at opening time, when the air is cool and the valley nearly empty.\n\nYour deluxe tour includes access to **four tombs** (one more than standard admission), and your private guide has selected the combination that provides the most comprehensive understanding of royal tomb architecture and decoration across the New Kingdom.\n\nYour guide reads the hieroglyphs and religious texts directly from the walls—not summaries or simplifications, but the actual words written by ancient scribes. In the tomb of **Ramesses VI** (KV9), perhaps the most spectacularly decorated tomb in the valley, your guide traces the complete text of the Book of Gates and the Book of Caverns across walls and ceilings of overwhelming beauty. The **astronomical ceiling** of the burial chamber—depicting the goddess Nut swallowing the sun each evening and giving birth to it each morning—is one of the supreme artistic achievements of the ancient world.\n\nOther tombs are chosen for their unique qualities: **Thutmose III** (KV34) for its hidden location and the earliest complete Amduat; **Merenptah** (KV8) for its massive alabaster sarcophagus; **Seti I** (if accessible, with supplementary ticket)—the longest, deepest, and most finely decorated tomb in the valley, its painted reliefs rivaling Nefertari''s in quality.\n\nThe **Tomb of Tutankhamun** (KV62) receives unhurried private attention. Your guide reconstructs the tomb as Carter found it: the antechamber overflowing with golden chariots, beds, and thrones; the treasury with its canopic shrine guarded by golden goddesses; the burial chamber where three nested coffins—the innermost of solid gold—held the most famous mummy in history. Standing before the painted north wall, where twelve baboons represent the twelve hours of the night, the intimate scale of this tomb becomes its power.\n\n*Valley of the Queens – Nefertari Illuminated*\n\nThe **Tomb of Nefertari** with a private Egyptologist becomes a revelation. Where other visitors spend their limited minutes in awed silence, your guide ensures you understand what you are seeing: the theological programme that guides Nefertari through the gates of the underworld, the artistic techniques that make these paintings glow with inner light (the white background amplifies every colour), and the identity of each deity who accompanies the queen on her journey.\n\nYour guide points out details invisible without expert knowledge: the preliminary red grid lines still visible beneath some paintings (the artist''s guidelines), the subtle differences between the two painting teams who decorated different chambers, and the conservation challenges that nearly destroyed these masterworks before the Getty Institute''s six-year restoration.\n\n---\n\n**Midday: Temples and Titans**\n\n*Colossi of Memnon – The Vanished Temple*\n\nThe **Colossi of Memnon** with a private guide become more than a photo opportunity. Your Egyptologist explains the ongoing **excavation of Amenhotep III''s mortuary temple**—the largest in Thebes, now being reconstructed by archaeologists who have discovered hundreds of statues, sphinx avenues, and architectural elements beneath the flood plain. You learn that the temple complex once exceeded even Karnak in grandeur, and that the colossi are merely its outermost sentinels.\n\nYour guide explains the "singing" phenomenon with scientific precision: the sound was likely caused by temperature-induced expansion of fractured quartzite at dawn, creating vibrations audible as musical tones—a phenomenon that ceased when the Romans repaired the fracture.\n\n*Temple of Hatshepsut – Beyond the Terraces*\n\nAt **Deir el-Bahari**, your private guide provides the architectural and political context that transforms this temple from impressive to extraordinary. The temple''s design—attributed to Hatshepsut''s architect **Senenmut** (whose mysterious relationship with the queen is one of Egyptology''s great puzzles)—is analyzed as both an aesthetic masterpiece and a political statement.\n\nYour guide leads you through areas most visitors bypass: the upper terrace''s **sanctuary of Amun**, carved deep into the cliff face where the mountain''s living rock becomes the temple''s inner sanctum; the **Hathor Chapel** with its exquisite cow-headed columns and painted reliefs of the goddess nursing the queen; and the rarely visited **solar altar** on the roof terrace, aligned to catch the first rays of the rising sun.\n\nThe **Punt Expedition reliefs** receive extended attention—your guide identifies the exotic flora and fauna depicted (myrrh trees, baboons, giraffes, leopard skins), explains the scholarly debate about Punt''s location (modern Eritrea? Somalia? Yemen?), and describes the trading relationship that made this expedition one of the most celebrated achievements of Hatshepsut''s reign.\n\nA premium lunch at a carefully selected restaurant—perhaps overlooking the Nile or the cultivation—provides a refined midday pause.\n\n---\n\n**Afternoon: The Deeper West Bank**\n\n*Medinet Habu – Reading the Walls*\n\nWith a private Egyptologist who reads hieroglyphs, **Medinet Habu** becomes the most intellectually rewarding temple visit on the West Bank.\n\nThe **Sea Peoples reliefs** are read as a historical document: your guide identifies the Peleset (Philistines), Tjeker, Shekelesh, Denyen, and Weshesh by their distinctive helmets and weapons, explains the naval battle tactics depicted (grappling hooks, archers on ship decks, capsized enemy vessels), and places these events in the context of the **Bronze Age Collapse**—a catastrophic series of events around 1177 BC that destroyed the Hittite Empire, devastated the Levantine city-states, and threatened Egypt itself.\n\nInside the temple, your guide reveals details most visitors miss: the **Calendrical Festival reliefs** depicting the annual festivals celebrated at Thebes, the **Window of Appearances** where the pharaoh appeared to his subjects, and the remarkable **palace attached to the temple''s south side**—one of the best-preserved royal residences from ancient Egypt, with its own throne room, bathroom, and private apartments.\n\nThe preserved polychrome decoration throughout Medinet Habu is exceptional. Your guide points out columns still bearing their original colours—an invaluable reference for understanding how all Egyptian temples once appeared.\n\n*Deir el-Medina – Private Encounter with the Artisans*\n\nThe day concludes at **Deir el-Medina** with the depth it deserves—and with your private guide, the workers'' village becomes the most emotionally engaging site on the entire West Bank.\n\nExplore the village itself: walk the central street, enter reconstructed houses, and visualise the daily routines of the 60 or so families who lived here at any one time. Your guide explains the community''s unique social structure: a self-governing village of state employees, with its own court system, medical care, religious festivals, and internal economy.\n\nThe workers'' tombs are experienced as masterpieces of personal art. The **Tomb of Sennedjem** (TT1)—with its vaulted ceiling depicting the Fields of Iaru (paradise) in rich agricultural detail—is a gem of intimate beauty. The **Tomb of Inherkhau** (TT359) offers some of the most expressive painting in all of Egyptian art: cats herding geese, the deceased in a papyrus boat, and the unforgettable image of the ba-bird (the soul) alighting on the deceased''s mummy.\n\nYour guide shares the ostraca evidence that reveals this community''s personality: the foreman accused of stealing state property, the woman who divorced her husband and kept the house, the doctor whose prescriptions mixed practical medicine with magical spells, and the painters who sketched comic scenes on limestone flakes during their lunch breaks—ancient cartoons that reveal a sense of humour spanning 3,300 years.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 4 tombs (expanded access) with private guide',
      'Tomb of Tutankhamun with unhurried private visit',
      'Tomb of Nefertari with expert art interpretation',
      'Colossi of Memnon with excavation update',
      'Hatshepsut Temple including upper sanctuary and Hathor Chapel',
      'Medinet Habu with hieroglyphic reading of Sea Peoples reliefs',
      'Deir el-Medina village and painted tombs (Sennedjem, Inherkhau)',
      'Private Egyptologist (max 8 guests)',
      'Premium lunch and luxury vehicle'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Valley of the Kings expanded access (4 tombs)',
      'Tomb of Tutankhamun entrance (KV62)',
      'Tomb of Nefertari entrance (QV66)',
      'Entrance fees to Hatshepsut Temple, Medinet Habu, Deir el-Medina',
      'Colossi of Memnon visit',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel pickup and drop-off in Luxor',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private (max 8), luxury vehicle, premium lunch. Key upgrade: 4 tombs in Valley of Kings (requires purchasing extra ticket—arrange in advance). Nefertari ticket must be pre-booked (limited to ~150/day, EGP 1400 as of 2024). If Seti I (KV17) is accessible, offer as premium add-on (separate ticket, significant cost). Tomb of Ramesses VI (KV9) strongly recommended for astronomical ceiling. Physically demanding day—ensure guests are prepared for heat and tomb stairs. Early start (6 AM) essential.',
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
    'Grand West Bank Tour - Ultimate Luxury',
    E'**The West Bank as No One Else Experiences It**\n\nThis is not a day tour. It is a private archaeological expedition across the greatest necropolis in the ancient world, conducted by a PhD Egyptologist whose published research on Theban tombs, New Kingdom art, or mortuary temple architecture transforms every site into a living seminar. Access six tombs in the Valley of the Kings—including the legendary Tomb of Seti I, the longest and most finely decorated in the valley. Experience Nefertari''s tomb with a scholar who has studied its conservation. Read the Sea Peoples battle inscriptions at Medinet Habu with a historian who can decode every hieroglyph. Travel in a private limousine. Dine at Luxor''s finest. This is the West Bank revealed at the highest level of scholarship and exclusivity—for travellers who demand the extraordinary.\n\n---\n\n**Dawn: The Valley of the Kings – A Scholar''s Expedition**\n\nYour private limousine collects you before dawn, and your personal **PhD Egyptologist**—a published specialist in New Kingdom tombs, mortuary art, or Theban archaeology—begins the day''s narrative as you cross the Nile in the pre-dawn light, retracing the journey that funeral processions made three and a half thousand years ago.\n\nArriving at the **Valley of the Kings** at the earliest possible moment, the valley is still cool, the shadows deep, the atmosphere charged with the silence of millennia. Your scholar provides a topographical reading of the valley—why this wadi was chosen, how the pyramid-shaped peak of al-Qurn served as a natural sacred marker, and how each pharaoh''s tomb was positioned in relation to geology, theology, and the need for secrecy.\n\nYour luxury tier includes access to **six tombs**—double the standard allocation—and your scholar has designed a route that tells the complete story of royal tomb evolution across the New Kingdom.\n\nThe **Tomb of Seti I** (KV17) is the expedition''s crown jewel. The longest tomb in the valley (137 meters), decorated from entrance to burial chamber with reliefs of unmatched quality—every wall surface covered in scenes from the Amduat, the Book of Gates, the Litany of Ra, and the Opening of the Mouth ceremony, each executed with a precision and artistic refinement that represents the absolute pinnacle of New Kingdom art. Your scholar, who has studied these reliefs in detail, reads the texts directly from the walls, explaining the theological journey through the twelve hours of the night, the demons and deities encountered at each gate, and the ultimate resurrection at dawn.\n\nThe astronomical ceiling of the burial chamber—depicting constellations, decan stars, and the northern sky—is a masterpiece of ancient astronomical knowledge. Your scholar explains the relationship between Egyptian astronomy, the calendar, and the belief that the pharaoh''s soul ascended to join the "imperishable stars" of the circumpolar region.\n\nAdditional tombs are selected by your scholar for maximum impact: **Ramesses VI** (KV9) for its overwhelming ceiling decoration; **Thutmose III** (KV34) for its hidden location and intimate cartouche-shaped chamber; **Ramesses III** (KV11) for its unique secular scenes (including the famous "harpists'' tomb" side chambers); **Horemheb** (KV57) for its unfinished decoration that reveals the painting process stage by stage—preliminary drawings, grid lines, corrections, and the progression from sketch to finished masterpiece.\n\nThe **Tomb of Tutankhamun** (KV62) receives your scholar''s most nuanced interpretation. Beyond the standard discovery narrative, your guide explains the theological significance of the burial chamber paintings, the latest scientific analysis of the mummy (CT scans, DNA analysis, cause of death debates), and the ongoing investigation of possible hidden chambers behind the painted walls—a mystery that continues to tantalise archaeologists.\n\n---\n\n**Morning: The Valley of the Queens**\n\n*Nefertari''s Tomb – A Scholar''s Masterclass*\n\nThe **Tomb of Nefertari** (QV66) with a PhD art historian or conservator becomes the most profound artistic experience available in Egypt.\n\nYour scholar provides context unavailable to any other visitor: the relationship between Nefertari''s tomb paintings and the broader tradition of New Kingdom funerary art, the specific innovations introduced by her painters (the luminous white backgrounds, the sculptural modelling of figures, the psychological expressiveness of faces), and the technical analysis of pigments and plaster that modern conservation science has revealed.\n\nEach scene is read as both art and theology: Nefertari playing senet (the game of destiny, where the stakes are eternal life), Nefertari led by Isis (the goddess whose magical knowledge conquered death itself), Nefertari offering to the gods (establishing her place in the divine order), and the queen''s ba-bird spreading its wings above her mummy (the moment of transfiguration when the mortal becomes divine).\n\nYour scholar explains the Getty Conservation Institute''s six-year restoration in professional detail—the salts that were destroying the plaster, the techniques used to consolidate and clean the paintings, and the monitoring systems now in place to ensure their survival. You understand why visitor numbers are strictly limited and why your presence in this tomb is a privilege of extraordinary rarity.\n\n---\n\n**Midday: Monuments of Power**\n\n*Colossi of Memnon – The Scholar''s Perspective*\n\nThe **Colossi of Memnon** with your scholar become a case study in ancient logistics and modern archaeology. Your guide explains the extraordinary engineering required to transport these 720-ton quartzite statues from their quarry near modern Aswan—over 600 kilometres by river—and the ongoing excavation that is gradually revealing the full plan of Amenhotep III''s vanished temple.\n\nYour scholar shares the latest discoveries: sphinxes, colossal statues, and architectural elements that are rewriting our understanding of the most ambitious building project of the 18th Dynasty.\n\n*Temple of Hatshepsut – The Complete Vision*\n\nAt **Deir el-Bahari**, your scholar provides the complete architectural, political, and artistic analysis. The temple is examined not just as a monument but as a rhetorical document: every relief, every inscription, every architectural choice was designed to legitimise Hatshepsut''s unprecedented rule as female pharaoh.\n\nWith VIP timing, you visit areas most tourists never reach: the **inner sanctuary** carved into the cliff where the sacred barque of Amun rested during the Beautiful Festival of the Valley, the **solar altar** on the upper terrace aligned to the winter solstice sunrise, and the **Hathor Chapel** whose intact painted reliefs are among the most delicate in Thebes.\n\nYour scholar addresses the Hatshepsut erasure with nuanced interpretation: not the simple revenge narrative of popular accounts, but a complex theological act related to the integrity of the kingship institution—a distinction that transforms understanding of ancient Egyptian political thought.\n\nA refined lunch at Luxor''s finest restaurant—**Sofitel Winter Palace terrace**, **Al Moudira**, or a private arrangement—provides a moment of comfort matched to the day''s extraordinary standard.\n\n---\n\n**Afternoon: The Deep West Bank**\n\n*Medinet Habu – The Historian''s Temple*\n\nWith a PhD Egyptologist who reads hieroglyphs fluently, **Medinet Habu** becomes the most intellectually thrilling temple visit on the West Bank.\n\nYour scholar reads the **Sea Peoples inscriptions** directly from the walls—not summaries but the actual words of Ramesses III''s scribes describing the existential threat that faced Egypt and the broader Mediterranean world. The naval battle scene is decoded in detail: the tactics, the technology, the diplomatic context, and the catastrophic consequences for civilizations from Greece to Mesopotamia.\n\nYour scholar reveals Medinet Habu''s deeper layers: the small **18th Dynasty temple** within the complex (older than the Ramesses III structure by centuries), the **palace remains** on the south side (with their own throne room and viewing window), and the evidence of the temple''s later use as a Christian church and a medieval Arab village—layers of occupation spanning three millennia.\n\nThe preserved colours throughout are used by your scholar as a reference for understanding how all Egyptian temples once appeared—a lesson in archaeological imagination that transforms every future temple visit.\n\n*Deir el-Medina – The Scholars'' Favourite*\n\nArchaeologists often say that **Deir el-Medina** is their favourite site in Egypt—and with a PhD guide, you understand why. This is the site that transformed Egyptology from the study of kings and monuments to the study of real people.\n\nYour scholar provides the documentary evidence: texts written by these workers that survive in their thousands—work journals, court records, personal letters, medical prescriptions, hymns, love poems, and the record of the world''s first labour strike. The community''s social structure—its hierarchies, its conflicts, its festivals, its justice system—is reconstructed in vivid detail.\n\nThe workers'' tombs are experienced as the artistic achievements they represent. Your scholar explains how these master craftsmen—who spent their working lives decorating royal tombs—applied the same skills to their own final resting places, but with a freedom and personal expression absent from royal commissions. The **Tomb of Sennedjem** (TT1), the **Tomb of Inherkhau** (TT359), and the **Tomb of Peshedu** (TT3)—with its famous image of the deceased drinking from a sacred pool beneath a date palm—represent the full range of personal funerary art.\n\nWith special access, your scholar may arrange a visit to the **Ptolemaic Hathor Temple** at the site—a small, exquisitely decorated temple that served as the village''s main place of worship, its painted reliefs still vivid after 2,200 years.\n\nReturn to Luxor via private limousine as the sun sets over the Theban Hills—the same sunset that marked the daily death and rebirth of the sun god Ra, and that gave the West Bank its eternal significance as the land of the dead and the promise of resurrection.\n\n*Meals: Lunch*',
    ARRAY[
      'Valley of the Kings – 6 tombs including Tomb of Seti I (KV17)',
      'Tomb of Tutankhamun with advanced scholarly interpretation',
      'Tomb of Nefertari with conservation and art history analysis',
      'Colossi of Memnon with latest excavation insights',
      'Hatshepsut Temple with sanctuary, solar altar, Hathor Chapel',
      'Medinet Habu with hieroglyphic reading of battle inscriptions',
      'Deir el-Medina with documentary evidence and painted tombs',
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
      'All entrance fees to Hatshepsut Temple, Medinet Habu, Deir el-Medina',
      'Special access to Ptolemaic Hathor Temple at Deir el-Medina (subject to availability)',
      'Colossi of Memnon visit',
      'Private limousine (Mercedes S-Class or equivalent)',
      'Fine dining lunch at premium venue (Winter Palace, Al Moudira, or equivalent)',
      'Hotel pickup and drop-off in Luxor',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (New Kingdom specialist), luxury limousine, VIP access. Tomb of Seti I (KV17) is the crown jewel—requires special ticket (significant cost, limited availability—book 2+ weeks ahead). 6 tombs in Valley of Kings requires multiple ticket purchases—arrange all in advance. Nefertari ticket limited to ~150/day (EGP 1400+)—pre-book essential. If Seti I is closed (common for restoration), substitute with Ramesses V/VI + extra tomb. Fine dining at Winter Palace, Al Moudira, or private arrangement. Extremely physically demanding day—6 tomb descents plus 3 temple visits. Ensure guests are informed. Earliest possible start (5:30-6 AM) essential. For UHNW clients and serious archaeology enthusiasts.',
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
  RAISE NOTICE 'Migration 145 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Grand West Bank Day Tour:';
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
WHERE cl.slug = 'grand-west-bank-day-tour-luxor'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
