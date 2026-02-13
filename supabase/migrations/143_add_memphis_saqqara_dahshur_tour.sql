-- =====================================================================
-- Migration 143: Add Memphis, Saqqara & Dahshur Day Tour
-- Description: Full-day tour of Egypt's oldest monuments with 4 tier variations
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
    'Memphis, Saqqara & Dahshur Day Tour',
    'memphis-saqqara-dahshur-day-tour',
    'Journey to the very origins of Egyptian civilization on this extraordinary day tour south of Cairo. At Memphis, stand before the colossal fallen statue of Ramses II and the enigmatic Alabaster Sphinx. At Saqqara, witness the Step Pyramid of Djoser—the oldest monumental stone structure on Earth, built 4,700 years ago and the architectural ancestor of every pyramid that followed. At Dahshur, enter the Red Pyramid (Egypt''s second largest) and marvel at the Bent Pyramid, whose dramatic change of angle preserves the trial-and-error story of pyramid engineering. These three sites together tell the complete story of how ancient Egyptians learned to build for eternity.',
    'Memphis, Saqqara & Dahshur, Egypt',
    '1 day (full day)',
    ARRAY['memphis', 'saqqara', 'dahshur', 'step-pyramid', 'djoser', 'red-pyramid', 'bent-pyramid', 'sneferu', 'ramses', 'day-tour', 'old-kingdom'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 8,
      'city', 'Cairo',
      'region', 'South of Cairo',
      'highlights', ARRAY[
        'Alabaster Sphinx of Memphis',
        'Colossi of Ramses II',
        'Step Pyramid of Djoser at Saqqara',
        'Red Pyramid of Dahshur',
        'Bent Pyramid of Dahshur',
        'Memphis Open-Air Museum'
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
    'Memphis, Saqqara & Dahshur - Classic Discovery',
    E'**The Birth of the Pyramids: Memphis, Saqqara & Dahshur**\n\nBefore Giza, before the Great Pyramid, before the Sphinx—there was Saqqara. There was Memphis. There was Dahshur. This extraordinary day tour takes you to the places where ancient Egypt learned to build for eternity, where the very concept of the pyramid was invented, refined, and perfected over centuries of breathtaking ambition and ingenious problem-solving.\n\nThese are not the crowds of Giza. These are the quiet, profound sites where archaeology comes alive and the full sweep of Egyptian engineering genius reveals itself—from the first tentative steps in monumental stone construction to the triumphant mastery that made the Great Pyramid possible.\n\n---\n\n**Morning: Memphis – The First Capital**\n\nYour journey begins at **Memphis**, the ancient capital of unified Egypt and one of the most important cities in the ancient world. Founded around 3100 BC by the legendary King Menes, Memphis served as the administrative and cultural heart of Egypt for over eight centuries—a city that, at its height, rivaled any on Earth.\n\nToday, the **Memphis Open-Air Museum** preserves the monumental remnants of this once-great capital. The centerpiece is the **Colossi of Ramses II**—a fallen limestone statue of staggering proportions, over 10 meters long even in its recumbent state. Carved during the reign of Egypt''s most prolific builder-pharaoh, this colossus once stood at the entrance to the great Temple of Ptah, announcing the power and divine authority of Ramses the Great. Your guide explains the significance of Ramses II—a pharaoh who reigned for 66 years, fathered over 100 children, and built more monuments than any other ruler in Egyptian history.\n\nNearby stands the **Alabaster Sphinx**, carved from a single block of alabaster weighing approximately 80 tons. Smaller than its famous cousin at Giza but arguably more beautiful, this sphinx is one of the finest examples of its kind ever discovered. Its smooth, translucent stone surface has survived 3,300 years with remarkable clarity, and your guide explains the quarrying and carving techniques that made such a sculpture possible.\n\nThe open-air museum also holds stelae, sarcophagi, and architectural fragments that hint at the grandeur of the vanished city—a city that ancient Greek historians compared favorably to Athens and Babylon.\n\n---\n\n**Midday: Saqqara – Where It All Began**\n\nFrom the first capital to the first pyramid. **Saqqara** is the necropolis of Memphis—a vast burial ground stretching across the desert plateau, where pharaohs, nobles, and sacred animals were interred over a span of 3,000 years. But one monument here changed the course of human history.\n\nThe **Step Pyramid of Djoser** is the oldest monumental stone structure on Earth. Built around 2670 BC by the architect **Imhotep**—a figure so brilliant he was later deified as a god of wisdom and medicine—it represents the moment when Egyptian builders made the revolutionary leap from mud-brick to stone, from flat-topped mastaba tombs to the soaring pyramid form that would define their civilization.\n\nStand before this 62-meter-high stepped monument and understand what you are seeing: the prototype. Every pyramid that followed—at Dahshur, at Meidum, at Giza—traces its lineage directly back to this single, audacious experiment in stone. Your guide explains Imhotep''s genius: how he began with a traditional mastaba and then, in a series of increasingly ambitious expansions, stacked six progressively smaller platforms to create something the world had never seen.\n\nThe recently restored entrance colonnade reveals the sophistication of Djoser''s funerary complex—fluted columns that predate Greek architecture by two millennia, false doors carved with exquisite precision, and a ceremonial courtyard designed for the pharaoh''s eternal jubilee festival.\n\nExplore the surrounding necropolis, where the tombs of Old Kingdom nobles contain some of the finest relief carvings in all of Egypt—vivid scenes of daily life, hunting, feasting, and worship that provide an unparalleled window into life 4,500 years ago.\n\n---\n\n**Afternoon: Dahshur – The Engineer''s Laboratory**\n\nAfter lunch, continue south to **Dahshur**, where the story of pyramid evolution reaches its most dramatic chapter.\n\nThe **Bent Pyramid** is one of the most visually striking monuments in all of Egypt. Rising from the desert at a steep 54-degree angle, it suddenly shifts to a gentler 43 degrees roughly halfway up, giving it the distinctive "bent" profile that makes it instantly recognizable. Why the change? Your guide explains the prevailing theory: the builders, realizing the steep angle was structurally unstable, adjusted mid-construction rather than abandoning the project. This pyramid is a frozen moment of problem-solving—engineering trial and error preserved in stone for 4,600 years.\n\nThe Bent Pyramid is also unique for retaining much of its original smooth limestone casing—giving you the clearest picture anywhere in Egypt of how finished pyramids once appeared: gleaming white surfaces that caught and reflected the desert sun.\n\nNearby stands the **Red Pyramid**, Egypt''s second-largest pyramid and the first true smooth-sided pyramid ever completed. Named for the reddish hue of its exposed limestone core, it was built by **Pharaoh Sneferu** (father of Khufu, who would build the Great Pyramid at Giza). The Red Pyramid represents the culmination of decades of experimentation—the moment when Egyptian engineers finally achieved the perfect pyramid form.\n\nYour guide leads the group to appreciate both pyramids from multiple angles, explaining the engineering advances each represents and how Sneferu''s experiments at Dahshur directly enabled his son''s masterpiece at Giza.\n\nReturn to Cairo in the late afternoon, having witnessed the complete evolutionary story of the pyramids—from the first step at Saqqara to the first true pyramid at Dahshur to the ultimate achievement at Giza.\n\n*Meals: Lunch*',
    ARRAY[
      'Memphis Open-Air Museum with Colossi of Ramses II',
      'Alabaster Sphinx of Memphis',
      'Step Pyramid of Djoser at Saqqara',
      'Saqqara necropolis and tomb reliefs',
      'Bent Pyramid at Dahshur (exterior)',
      'Red Pyramid at Dahshur (exterior)',
      'Professional English-speaking Egyptologist guide',
      'Lunch included'
    ],
    ARRAY[
      'Professional English-speaking Egyptologist guide',
      'Entrance fees to Memphis, Saqqara, and Dahshur',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. Excellent value for archaeology enthusiasts. Dahshur is less crowded than Giza—major advantage. Note: Red Pyramid interior entry not included in budget tier. Saqqara Step Pyramid interior sometimes closed for restoration—confirm before departure.',
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
    'Memphis, Saqqara & Dahshur - Premium Experience',
    E'**The Complete Pyramid Story: A Premium Journey to Egypt''s Origins**\n\nTravel beyond the famous Giza plateau to discover where the pyramid story truly begins. With your experienced Egyptologist, premium vehicle, and small group, explore the three extraordinary sites south of Cairo that together reveal the full arc of ancient Egyptian architectural genius—from the world''s first stone monument at Saqqara to the engineering laboratory at Dahshur where the true pyramid was finally perfected. This is the tour for travelers who want to understand, not just see.\n\n---\n\n**Morning: Memphis – Capital of the Ancient World**\n\nYour experienced Egyptologist collects your small group (maximum 16 guests) in a premium vehicle, and as you drive south from Cairo, the story begins. Your guide sketches the landscape of ancient Egypt—Memphis as the fulcrum of a civilization that endured for three millennia, its location chosen where Upper and Lower Egypt met, where the Nile Delta begins.\n\nAt the **Memphis Open-Air Museum**, your guide brings the vanished city to life. Memphis was not merely a capital—it was a sacred city, home to the great Temple of Ptah (god of craftsmen and architects), a center of learning and art that influenced the entire ancient world.\n\nThe **Colossi of Ramses II** commands your first sustained attention. This fallen colossus—over 10 meters of intricately carved limestone—was one of a pair that flanked the temple entrance. Your guide explains the statue''s remarkable details: the double crown of Upper and Lower Egypt, the pharaoh''s cartouche carved on the shoulder, the idealized musculature that conveyed divine power. A specially constructed viewing platform allows you to appreciate the statue from above, taking in its full extraordinary scale.\n\nThe **Alabaster Sphinx**—carved from a single 80-ton block of translucent stone—receives expert attention. Your guide explains the significance of the sphinx form in Egyptian religion (guardian of sacred spaces), the quarrying techniques used to extract such a massive block without fracture, and the identity debates surrounding this particular sphinx (likely Hatshepsut or Amenhotep II, but scholars disagree).\n\nYour guide also points out the less obvious treasures: inscribed stelae recording royal decrees, fragments of columns from the Temple of Ptah, and sarcophagi whose hieroglyphs tell stories of individuals who lived and died in this once-magnificent city.\n\n---\n\n**Midday: Saqqara – The Revolution in Stone**\n\nSaqqara is the jewel of this itinerary, and your guide ensures you experience it with the depth it deserves.\n\nThe **Step Pyramid of Djoser** is presented not merely as a monument but as a revolution. Your Egyptologist explains the historical context: before Imhotep, Egyptian tombs were flat-topped mud-brick structures called mastabas. What Imhotep did—stacking six progressively smaller stone platforms to create a 62-meter pyramid—was not simply architectural innovation. It was a fundamental reimagining of what humans could achieve with stone, skill, and ambition.\n\nThe recently restored **entrance colonnade** is a highlight—walk through corridors of fluted columns that predate the Parthenon by over two thousand years, past ribbed ceilings carved to imitate palm logs, through doorways that are permanently "open" (carved in stone to appear ajar). Your guide explains the theology behind these design choices: everything in Djoser''s complex was built to function in the afterlife, where the pharaoh would celebrate his jubilee festival for eternity.\n\nExplore the surrounding **Old Kingdom necropolis**, where tombs of nobles and officials contain relief carvings of extraordinary beauty and detail. Scenes of fishing, farming, feasting, music-making, and worship offer the most vivid surviving window into daily life in the Old Kingdom—4,500 years ago, yet rendered with an immediacy that feels almost contemporary.\n\nAfter a quality lunch at a well-appointed restaurant, your journey continues south.\n\n---\n\n**Afternoon: Dahshur – Where Perfection Was Born**\n\nDahshur is where the pyramid story reaches its climax—and where most visitors never go, giving your small group a sense of privileged discovery.\n\nThe **Bent Pyramid** is architecture caught in the act of thinking. Your guide explains the engineering drama frozen in its stones: the builders began at a steep 54-degree angle, likely the same as the recently collapsed pyramid at Meidum. When cracks appeared and the structure showed signs of instability, they made a mid-course correction—reducing the angle to 43 degrees and completing the pyramid with a distinctive "bent" silhouette. This is not a failure but a triumph of adaptive engineering, a 4,600-year-old lesson in problem-solving.\n\nCrucially, the Bent Pyramid retains most of its original smooth limestone casing—the best-preserved pyramid surface in all of Egypt. Your guide points out the fine joints between casing blocks, the quality of the limestone, and invites you to imagine every pyramid in Egypt—including those at Giza—clad in similar gleaming white stone.\n\nThe **Red Pyramid** stands nearby as the answer to the Bent Pyramid''s question. Built by the same pharaoh—**Sneferu**—it is the world''s first successful true (smooth-sided) pyramid and Egypt''s second-largest after the Great Pyramid of his son Khufu. Named for the warm reddish tones of its exposed limestone core, it represents the moment when decades of experimentation finally yielded perfection.\n\nYour standard tour includes the opportunity to **enter the Red Pyramid''s interior**—descending a narrow passage to reach the corbelled burial chambers deep within the structure. This is an intimate, atmospheric experience: you stand inside one of the oldest true pyramids on Earth, in chambers whose corbelled ceilings demonstrate the same engineering principles later used in the Grand Gallery of the Great Pyramid.\n\nReturn to Cairo having witnessed the complete evolutionary story: from Djoser''s first bold experiment in stone, through Sneferu''s decades of refinement, to the perfected form that would reach its ultimate expression at Giza.\n\n*Meals: Lunch*',
    ARRAY[
      'Memphis Open-Air Museum with expert commentary',
      'Elevated viewing of Colossi of Ramses II',
      'Alabaster Sphinx with identity debate discussion',
      'Step Pyramid of Djoser with restored colonnade',
      'Old Kingdom tomb reliefs at Saqqara',
      'Bent Pyramid exterior with casing stone analysis',
      'Red Pyramid with interior entry',
      'Experienced Egyptologist (small group max 16)',
      'Premium vehicle and quality lunch'
    ],
    ARRAY[
      'Experienced Egyptologist guide (small group max 16)',
      'Entrance fees to Memphis, Saqqara, and Dahshur',
      'Entry inside the Red Pyramid at Dahshur',
      'Quality lunch at well-appointed restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Bottled water and refreshments throughout'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Red Pyramid interior entry included—unique selling point vs budget. The Red Pyramid descent is physically demanding (steep, narrow, low ceiling)—advise guests in advance. Dahshur is much quieter than Giza, excellent for photography.',
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
    'Memphis, Saqqara & Dahshur - Deluxe Collection',
    E'**Egypt Before Giza: A Private Archaeological Journey**\n\nThis is the tour that transforms understanding. With your private Egyptologist, luxury vehicle, and exclusive access, you don''t merely visit Memphis, Saqqara, and Dahshur—you inhabit them. Enter the Red Pyramid''s ancient chambers with expert guidance. Explore Saqqara''s newly opened tombs that most visitors never see. Stand before the Bent Pyramid''s preserved casing stones and touch the surface of a 4,600-year-old monument. These three sites, experienced with scholarly depth and unhurried privilege, reveal the complete story of how ancient Egypt invented the pyramid—and changed architecture forever.\n\n---\n\n**Morning: Memphis – Private Encounter with the First Capital**\n\nYour private Egyptologist (guiding a maximum of 8 guests) meets you in a luxury vehicle, and the journey south from Cairo becomes a lecture in landscape archaeology. As modern suburbs give way to palm groves and agricultural land, your guide explains that you are crossing the same terrain ancient Egyptians navigated—the narrow fertile strip along the Nile that sustained one of history''s greatest civilizations.\n\nAt **Memphis**, your private guide provides the context that transforms scattered ruins into a vivid city. This was the political, religious, and artistic capital of the Old Kingdom—a metropolis that ancient sources describe as stretching for miles along the Nile, its temples rivaling anything built before or since.\n\nThe **Colossi of Ramses II** is experienced at length, your guide explaining the pharaoh''s 66-year reign, his military campaigns, his diplomatic innovations (the first recorded peace treaty in human history), and his obsessive building program that left monuments from Abu Simbel to the Nile Delta. The elevated viewing platform reveals details invisible at ground level—the precision of the carved musculature, the hieroglyphic cartouches, the crown symbolism.\n\nThe **Alabaster Sphinx** receives scholarly attention: the quarrying of an 80-ton single stone block, the symbolic meaning of alabaster in Egyptian religion (associated with ritual purity), and the ongoing identity debate. Your guide shares the evidence for each candidate pharaoh and invites you to examine the facial features and draw your own conclusions.\n\nBeyond the main attractions, your private guide reveals Memphis''s lesser-known treasures: inscribed blocks from the Temple of Ptah, an embalming bed used in the mummification of sacred Apis bulls, and stone fragments bearing the names of pharaohs spanning two millennia.\n\n---\n\n**Midday: Saqqara – Unlocking the Necropolis**\n\nSaqqara under private guidance becomes a masterclass in the birth of monumental architecture.\n\nThe **Step Pyramid of Djoser** is approached with the reverence it deserves. Your Egyptologist contextualizes Imhotep''s achievement: in a single generation, this architect-priest-physician transformed Egyptian construction from perishable mud-brick to imperishable stone, invented the pyramid form, and created a funerary complex of such sophistication that it inspired every subsequent pharaoh to attempt something grander. No single act of architectural innovation in human history has had a greater impact.\n\nThe restored **entrance colonnade** is experienced in detail—each column, each carved ceiling panel, each false door receives expert interpretation. Your guide explains the "frozen architecture" concept: every stone element mimics its organic predecessor (columns shaped like papyrus bundles, ceilings carved to resemble palm logs), as though the entire complex were a permanent translation of Egypt''s everyday architecture into eternal stone.\n\nWith private guidance, you access areas of Saqqara beyond the Step Pyramid: the **Tomb of Mereruka**, the largest Old Kingdom private tomb, whose 33 chambers contain relief carvings of staggering beauty and detail—scenes of crocodile hunting, metalworking, children''s games, surgical procedures, and court life that constitute our richest visual record of how ancient Egyptians actually lived.\n\nThe **Serapeum**—the underground burial complex of the sacred Apis bulls—is another Saqqara highlight accessible with your guide''s expertise. Descend into tunnels carved from bedrock to find massive granite sarcophagi, each weighing up to 70 tons, created to house the mummified remains of bulls worshipped as incarnations of the god Ptah. The scale and precision of these underground chambers are astonishing.\n\nA premium lunch at a carefully selected restaurant provides a moment of comfort amid the archaeology.\n\n---\n\n**Afternoon: Dahshur – Inside the First True Pyramid**\n\nDahshur with a private Egyptologist becomes the climactic chapter in the pyramid story.\n\nThe **Bent Pyramid** is examined with engineering precision. Your guide explains the three leading theories for its dramatic angle change, the structural innovations visible in its construction (the first use of inward-leaning courses for stability), and the significance of its remarkably preserved limestone casing. You approach close enough to examine the casing stones themselves—smooth, precisely fitted blocks that demonstrate the standard to which finished pyramids were built.\n\nYour guide explains that the Bent Pyramid''s satellite pyramid, small and often overlooked, was the first pyramid in Egyptian history to be built with a smooth exterior from the ground up—a crucial intermediary step between the "bent" experiment and the perfected Red Pyramid.\n\nThe **Red Pyramid** is the day''s physical climax. Your private guide leads you down the 63-meter descending passage (crouching required) into the pyramid''s interior. The experience is profound: three corbelled chambers, the highest rising 12 meters above, built with the same engineering brilliance later used in the Great Pyramid''s Grand Gallery. Stand in the silence of Sneferu''s burial chamber—a space 4,600 years old—and feel the weight and wonder of human achievement pressing in from all sides.\n\nYour guide ensures you understand the full narrative arc: Sneferu built more pyramid volume than any other pharaoh in Egyptian history. His experiments at Meidum, the Bent Pyramid, and the Red Pyramid were the research-and-development program that made his son Khufu''s Great Pyramid possible. Giza was the culmination; Dahshur was the laboratory.\n\nReturn to Cairo in the late afternoon, carrying an understanding of Egyptian architecture that no visit to Giza alone can provide.\n\n*Meals: Lunch*',
    ARRAY[
      'Private Egyptologist guide (max 8 guests)',
      'Memphis Open-Air Museum with extended scholarly tour',
      'Tomb of Mereruka at Saqqara (33 chambers)',
      'Serapeum underground bull tombs at Saqqara',
      'Step Pyramid with full colonnade exploration',
      'Bent Pyramid with close approach to casing stones',
      'Red Pyramid interior descent and chambers',
      'Premium lunch at curated restaurant',
      'Luxury vehicle throughout'
    ],
    ARRAY[
      'Private Egyptologist guide (couples or max 8 guests)',
      'Entrance fees to Memphis, Saqqara, and Dahshur',
      'Entry inside the Red Pyramid at Dahshur',
      'Entrance to the Serapeum at Saqqara',
      'Entrance to the Tomb of Mereruka',
      'Premium lunch at top-rated restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Complimentary refreshments throughout',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private tour (max 8), luxury vehicle, premium lunch. Key upgrades: Serapeum access, Tomb of Mereruka, close approach to Bent Pyramid casing. Red Pyramid descent is physically demanding—narrow 63m passage with low ceiling, crouching required. Advise guests on fitness requirement. Dahshur is largely uncrowded even at peak times—excellent for private experience.',
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
    'Memphis, Saqqara & Dahshur - Ultimate Luxury',
    E'**The Genesis of the Pyramids: A Private Scholarly Expedition**\n\nThis is not a day tour. It is an archaeological expedition in the company of one of Egypt''s foremost Old Kingdom scholars—a PhD Egyptologist whose published research on pyramid construction, Saqqara''s necropolis, or Memphis''s Temple of Ptah transforms every site into a living seminar. Travel in a private limousine. Access tombs and chambers closed to the general public. Examine the Bent Pyramid''s casing stones with a structural archaeologist''s insight. Descend into the Red Pyramid with a guide who has studied its internal geometry. Explore Saqqara''s newly opened tombs before the wider public arrives. This is Egypt''s oldest story told at the highest level of scholarship and exclusivity—for travelers who demand the extraordinary.\n\n---\n\n**Morning: Memphis – A Scholar''s Reading of the First Capital**\n\nYour private limousine collects you at your preferred time, and your personal PhD Egyptologist begins the story as you drive south. This is not standard commentary but a scholar''s narrative: Memphis as the pivot of Egyptian civilization, its Temple of Ptah as one of the ancient world''s greatest religious complexes, its role as the intellectual center where Egyptian art, medicine, and theology were codified.\n\nAt the **Memphis Open-Air Museum**, your scholar-guide transforms familiar monuments into revelations.\n\nThe **Colossi of Ramses II** becomes a case study in pharaonic propaganda, royal theology, and the sculptor''s art. Your guide explains how Ramses''s face was idealized according to precise canonical proportions (the "grid system" used for over two millennia), how the cartouches were carved with deliberate depth to prevent rivals from re-inscribing them (a common practice Ramses himself engaged in), and how this statue relates to the dozens of other colossi Ramses erected across Egypt.\n\nThe **Alabaster Sphinx** receives the attention of a specialist. Your scholar shares the latest dating evidence, the mineralogical analysis of the alabaster (travertine), the symbolic significance of sphinx placement at temple entrances, and the craft skills required to quarry, transport, and carve an 80-ton single stone without fracture. If your guide has personally participated in research at Memphis—many have—you receive firsthand scholarly insights unavailable in any published guide.\n\nBeyond the museum''s main exhibits, your scholar navigates to inscribed blocks and fragments that tell the story of Memphis across millennia: the Shabaka Stone theology, references to the Apis bull cult, fragments bearing the names of pharaohs from the Old Kingdom to the Ptolemaic era. What appears to casual visitors as scattered ruins becomes, under your guide''s interpretation, the skeleton of a great civilization.\n\n---\n\n**Midday: Saqqara – The Full Necropolis Revealed**\n\nSaqqara with a PhD guide becomes the highlight of any Egypt itinerary—a site whose depth and significance rival Giza itself.\n\nThe **Step Pyramid of Djoser** is presented as the most important single monument in the history of architecture. Your scholar explains not merely what Imhotep built but why it mattered: the theological shift that demanded eternal monuments, the administrative revolution that organized the labor force, the geological knowledge required to quarry and transport limestone, and the mathematical precision that ensured structural stability. Each of the pyramid''s six steps is analyzed as a phase of construction, revealing Imhotep''s evolving ambition.\n\nThe **entrance colonnade** becomes an architecture seminar. Your guide explains the "translation into stone" principle with scholarly depth: how each fluted column replicates a bundle of reeds, how each ceiling panel imitates palm-log roofing, how each false door was carved with hinges and door-bolts that would never move—the entire complex a permanent, imperishable version of the pharaoh''s earthly palace.\n\nWith VIP access, your guide leads you to areas of Saqqara most visitors never see:\n\n• The **Tomb of Ti**—a masterpiece of Old Kingdom relief carving, where scenes of boat-building, papyrus harvesting, and hippopotamus hunting are rendered with a naturalism and dynamism that wouldn''t be equaled for another two thousand years.\n\n• The **Tomb of Kagemni**—containing some of the most refined relief work in all of Egypt, including famous scenes of force-feeding hyenas and fishing with nets.\n\n• The **Serapeum**—the underground labyrinth of the sacred Apis bulls—experienced with your scholar''s full interpretation of this extraordinary cult: the selection of the living bull, the mummification process, the massive granite sarcophagi (each weighing up to 70 tons, their lids alone weighing 30 tons), and the religious significance that sustained this practice for over a millennium.\n\n• If currently accessible, your guide may arrange entry to one of Saqqara''s **recently discovered tombs**—new discoveries have been announced regularly at this site, and your scholar''s connections may provide access to chambers not yet open to the general public.\n\nA refined lunch at a private venue—perhaps a garden restaurant arranged exclusively for your group—offers cuisine matched to the day''s extraordinary standard.\n\n---\n\n**Afternoon: Dahshur – Inside the Engineer''s Mind**\n\nDahshur with a pyramid construction specialist becomes the most intellectually thrilling experience in Egyptian archaeology.\n\nThe **Bent Pyramid** is analyzed with forensic precision. Your scholar explains the structural crisis that forced the mid-construction angle change—not in simplified terms but with reference to the geological faults, the internal stress distribution, and the lessons learned from the earlier pyramid collapse at Meidum (likely Sneferu''s first attempt). The preserved limestone casing is examined closely: your guide points out the quality of the stone, the precision of the joints, the slight curvature of the face, and the mason''s marks still visible on some blocks.\n\nYour scholar draws attention to details invisible without expert knowledge: the Bent Pyramid''s unique **two-entrance system** (both a northern and western entrance, the only pyramid with this feature), the internal portcullis blocking system, and the evidence of ancient repair work—visible proof that the builders recognized and responded to structural problems during construction.\n\nThe Bent Pyramid''s **satellite pyramid** receives attention as the "missing link"—the first smooth-sided pyramid built from the ground up, a crucial prototype between the bent experiment and the perfected Red Pyramid.\n\nThe **Red Pyramid** provides the day''s climax. Descending the 63-meter passage into the interior, your scholar guides you through three corbelled chambers—explaining the structural principles of corbelling (each stone course projecting slightly beyond the one below), the acoustic properties of the chambers, and the engineering connections to the Grand Gallery at Giza. In the uppermost chamber—believed to be Sneferu''s actual burial chamber—you stand in a space that represents the culmination of a pharaoh''s lifelong obsession with pyramid perfection.\n\nYour scholar ties the narrative together: Sneferu—Khufu''s father—built more pyramid volume than any other pharaoh, expending perhaps 9 million tons of stone across his building projects. His three pyramids (Meidum, Bent, and Red) represent the research program that made the Great Pyramid possible. Without Dahshur, there is no Giza. This is the insight that makes the luxury tier transcend ordinary tourism.\n\nReturn to Cairo in the late afternoon via private limousine, carrying a depth of understanding that few visitors to Egypt ever achieve.\n\n*Meals: Lunch*',
    ARRAY[
      'Personal PhD Egyptologist (fully private)',
      'VIP access to restricted Saqqara tombs',
      'Tomb of Ti and Tomb of Kagemni',
      'Serapeum with full scholarly interpretation',
      'Bent Pyramid with structural analysis and close casing approach',
      'Red Pyramid interior with engineering commentary',
      'Possible access to recently discovered tombs',
      'Private limousine throughout',
      'Fine dining lunch at exclusive venue'
    ],
    ARRAY[
      'Personal PhD Egyptologist guide (fully private)',
      'VIP access and special permits for restricted areas',
      'All entrance fees to Memphis, Saqqara, and Dahshur',
      'Entry inside the Red Pyramid at Dahshur',
      'Serapeum entrance at Saqqara',
      'Tomb of Ti and Tomb of Kagemni entrances',
      'Access to recently opened tombs (subject to availability)',
      'Private limousine (Mercedes S-Class or equivalent)',
      'Fine dining lunch at exclusive venue',
      'Hotel/airport pickup and drop-off',
      'Complimentary premium refreshments throughout',
      'Photography guidance from scholar at key locations',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD Egyptologist (Old Kingdom specialist), luxury limousine, VIP access to restricted tombs. Scholar-guide should have published research on Saqqara/Memphis/Dahshur and personal connections for special access. Recently discovered tombs require advance arrangements—book 2+ weeks ahead. Fine dining lunch at exclusive venue (Mena House garden or private arrangement). For UHNW clients and serious archaeology enthusiasts. Red Pyramid descent is physically demanding—ensure guests are informed.',
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
  RAISE NOTICE 'Migration 143 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Memphis, Saqqara & Dahshur Tour:';
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
WHERE cl.slug = 'memphis-saqqara-dahshur-day-tour'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
