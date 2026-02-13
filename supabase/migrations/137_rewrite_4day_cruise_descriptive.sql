-- =====================================================================
-- Migration 137: Rewrite 4-Day Cruise with More Descriptive Content
-- Description: Enhanced descriptions for all four tier variations
-- Date: 2026-02-05
-- =====================================================================

DO $$
DECLARE
  v_content_id UUID;
  v_user_id UUID;
  v_tenant_id UUID;
BEGIN
  -- Get primary tenant
  SELECT get_primary_tenant_id() INTO v_tenant_id;

  -- Get the content ID for the 4-day cruise
  SELECT id INTO v_content_id
  FROM content_library
  WHERE slug = '4-day-nile-cruise-aswan-luxor'
    AND tenant_id = v_tenant_id;

  IF v_content_id IS NULL THEN
    RAISE EXCEPTION 'Content not found: 4-day-nile-cruise-aswan-luxor';
  END IF;

  -- Get a user for updated_by
  SELECT user_id INTO v_user_id
  FROM tenant_members
  WHERE tenant_id = v_tenant_id
  LIMIT 1;

  RAISE NOTICE 'Updating content: %', v_content_id;

  -- =====================================================================
  -- UPDATE CONTENT ITEM (Enhanced Short Description)
  -- =====================================================================

  UPDATE content_library
  SET
    short_description = 'Embark on an unforgettable 4-day odyssey along the timeless Nile, sailing from Aswan''s sun-drenched shores to legendary Luxor. Witness the grandeur of Philae Temple rising from its island sanctuary, marvel at the twin temples of Kom Ombo at sunset, and walk in the footsteps of pharaohs through the Valley of the Kings. This is Egypt as it was meant to be experienced—from the deck of a traditional cruise ship, with ancient wonders unfolding around every river bend.',
    updated_at = NOW(),
    updated_by = v_user_id
  WHERE id = v_content_id;

  -- =====================================================================
  -- BUDGET TIER - Authentic & Accessible
  -- =====================================================================

  UPDATE content_variations
  SET
    title = '4-Day Nile Cruise - Classic Discovery',
    description = E'**Sail Through 5,000 Years of History**\n\nThe Nile has witnessed the rise and fall of empires, and now it''s your turn to become part of its eternal story. This 4-day cruise from Aswan to Luxor offers an authentic introduction to Egypt''s most treasured monuments, all while enjoying the comfort of a traditional Nile cruiser.\n\n---\n\n**Day 1: Aswan – Where the Journey Begins**\n\nYour Egyptian adventure commences in Aswan, where the Nile flows at its bluest and the desert meets the river in a dramatic tableau of gold and azure. Begin with a visit to the **Aswan High Dam**, a modern marvel that tamed the mighty Nile and created Lake Nasser—one of the largest man-made lakes on Earth. Stand atop this engineering triumph and contemplate how it changed Egypt forever.\n\nNext, venture to the **Unfinished Obelisk**, still lying in its granite bed where ancient stonemasons abandoned it over 3,000 years ago. At 42 meters, it would have been the tallest obelisk ever erected—a testament to pharaonic ambition frozen in time.\n\nThe afternoon brings the ethereal **Philae Temple**, dedicated to the goddess Isis. Rescued from the rising waters of the Nile and relocated stone by stone to Agilkia Island, this temple complex seems to float upon the water like a dream. Wander through its colonnaded courts as the afternoon light bathes the hieroglyphs in gold.\n\nBoard your cruise ship for a welcome lunch, then set sail on a traditional **felucca** around Kitchener''s Island, gliding past Aswan''s legendary botanical gardens as the sunset paints the Nile in shades of amber and rose. Return to the ship for dinner and your first night floating on history''s most storied river.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Temples of the Crocodile and the Falcon**\n\nAwaken to the gentle rhythm of the Nile as your ship sails northward toward **Kom Ombo**. This unique double temple, perched on a sandy promontory overlooking the river, is the only temple in Egypt dedicated to two gods simultaneously—Sobek, the crocodile god, and Horus the Elder, the falcon-headed healer.\n\nExplore the temple''s symmetrical corridors, where ancient surgical instruments are carved into the walls alongside depictions of sacred crocodiles. In the adjacent museum, mummified crocodiles stare back through millennia, guardians of secrets we can only imagine.\n\nAfter lunch onboard, continue downstream to **Edfu** and the magnificent **Temple of Horus**. This is Egypt''s best-preserved ancient temple, its massive pylons and hypostyle halls virtually complete after 2,000 years. Stand before the famous granite statue of Horus as a falcon and feel the weight of history pressing down like the Egyptian sun.\n\nAs evening falls, return to your floating haven. Dine under the stars on deck, watching the riverbanks slip past in the darkness—villages twinkling with lamplight, the silhouettes of date palms swaying in the warm breeze, the eternal Nile carrying you ever northward toward Luxor.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Luxor – The World''s Greatest Open-Air Museum**\n\nThis morning, you arrive at Luxor—ancient Thebes, capital of Egypt''s golden age. The sheer concentration of ancient monuments here is unparalleled anywhere on Earth.\n\nBegin at the staggering **Karnak Temple Complex**, the largest religious building ever constructed. For over 2,000 years, successive pharaohs competed to build grander halls and taller obelisks here. Walk through the Great Hypostyle Hall with its 134 massive columns, each carved with intricate hieroglyphs, and lose yourself in this forest of stone.\n\nAfter lunch, explore **Luxor Temple**, connected to Karnak by the ancient Avenue of Sphinxes (recently restored after 3,000 years). As the afternoon light softens, watch how the temple''s massive statues of Ramesses II seem to glow from within—a sight that has moved travelers for millennia.\n\nReturn to the ship for dinner and an evening at leisure. Perhaps take a stroll along the Nile corniche, where the illuminated temples create a magical backdrop to your final night aboard.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: The Valley of the Kings – Final Revelations**\n\nYour last day brings the most anticipated sites of all. Cross to Luxor''s West Bank—the ancient necropolis where pharaohs chose to be buried in hidden tombs rather than conspicuous pyramids.\n\nDescend into the **Valley of the Kings**, where 63 tombs honeycomb the limestone hills. Enter chambers adorned with vivid paintings that have survived 3,000 years, their colors still vibrant, depicting the pharaoh''s journey through the underworld to eternal life.\n\nVisit the **Temple of Hatshepsut**, Egypt''s most successful female pharaoh, whose mortuary temple rises in elegant terraces against the golden cliffs of Deir el-Bahri. Its clean lines feel surprisingly modern, a masterpiece of ancient architecture.\n\nPause at the **Colossi of Memnon**, twin statues that have guarded the West Bank for 3,400 years, their weathered faces still scanning the horizon for enemies that never came.\n\nAfter breakfast onboard, bid farewell to your ship and crew. Transfer to Luxor International Airport, carrying with you memories of a journey through time itself.\n\n*Meals: Breakfast*',
    highlights = ARRAY[
      'Comfortable accommodation on traditional Nile cruiser',
      'All meals included throughout the voyage',
      'Professional English-speaking Egyptologist guide',
      'All temple and tomb entrance fees covered',
      'Scenic felucca sailing on the Nile',
      'Air-conditioned transportation for all excursions'
    ],
    inclusions = ARRAY[
      '3 nights accommodation in comfortable standard cabin',
      'Full board: 3 breakfasts, 3 lunches, 3 dinners',
      'Expert guided tours at all archaeological sites',
      'Entrance fees to all temples and tombs mentioned',
      'Traditional felucca sailing at Aswan',
      'Airport transfer on departure day',
      'Onboard entertainment and activities'
    ],
    internal_notes = 'BUDGET TIER: Standard class vessel, twin or double cabin, shared group tours (max 20). Best value option. Vessel: 4-star standard cruise ships. Good for budget-conscious travelers, students, and those who prioritize experiences over luxury.',
    updated_at = NOW(),
    updated_by = v_user_id
  WHERE content_id = v_content_id AND tier = 'budget';

  -- =====================================================================
  -- STANDARD TIER - Refined Comfort
  -- =====================================================================

  UPDATE content_variations
  SET
    title = '4-Day Nile Cruise - Premium Experience',
    description = E'**Where Comfort Meets Wonder**\n\nThis premium 4-day Nile cruise elevates your Egyptian journey with superior accommodations, refined dining, and more intimate touring experiences. Sail from Aswan to Luxor aboard a first-class vessel, enjoying the perfect balance of comfort and authenticity.\n\n---\n\n**Day 1: Aswan – Gateway to Ancient Nubia**\n\nYour premium Nile experience begins in Aswan, Egypt''s southernmost city, where Africa and the Arab world converge in a symphony of color, culture, and timeless beauty.\n\nStart your exploration at the **Aswan High Dam**, the engineering marvel that transformed Egypt. Your guide will share the dramatic story of this undertaking—how entire temples were rescued from the rising waters, and how this dam gives life to 100 million people today.\n\nAt the **Unfinished Obelisk**, see ancient Egyptian engineering laid bare. This 1,200-ton granite monolith was abandoned when cracks appeared during its carving, offering an invaluable window into pharaonic construction techniques that still puzzle engineers today.\n\nThe jewel of Aswan awaits: **Philae Temple** on its sacred island. Board a motorboat to reach this sanctuary of Isis, where the last hieroglyphs were carved in 394 AD—marking the end of pharaonic Egypt. Explore at a leisurely pace, your guide revealing secrets hidden in every carved relief.\n\nBoard your first-class cruise ship to a champagne welcome and a gourmet lunch showcasing the best of Egyptian cuisine. In the golden hour before sunset, embark on a private **felucca sailing** experience around Lord Kitchener''s Botanical Island, refreshments in hand, as the Nile''s famous beauty unfolds before you.\n\nDinner is an elegant affair, with international and Egyptian dishes prepared by skilled chefs. Retire to your river-view cabin as the ship prepares to sail through the night.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Sacred Temples Rising from the River**\n\nThe gentle motion of the ship carries you northward as you enjoy breakfast with views of the passing countryside—farmers tending fields as their ancestors did millennia ago, children waving from the banks, water buffalo grazing in the shallows.\n\nArrive at **Kom Ombo** in the late morning. This atmospheric temple, elevated on a sandy bluff, offers commanding views of the Nile and a fascinating dual dedication to Sobek (the crocodile god) and Horus (the falcon god). Your guide will point out the ancient "calendar" carved into the walls and the remarkable surgical instruments depicted—evidence of sophisticated medical knowledge.\n\nLunch onboard is followed by a leisurely afternoon as you sail to **Edfu**. The **Temple of Horus** here is nothing short of spectacular—the best-preserved temple in all Egypt. Pass through towering pylons 36 meters high, adorned with scenes of divine victory. Inside, the sanctuary still houses the granite shrine where the golden statue of Horus once resided.\n\nReturn to your ship for afternoon tea on the sundeck, watching the Nile''s ever-changing scenery glide past. Tonight''s dinner features a special Egyptian-themed menu, followed by a traditional dance performance under the stars.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Luxor – City of a Hundred Gates**\n\nYou wake in Luxor, the ancient city Homer called "hundred-gated Thebes." The concentration of monuments here surpasses any other place on Earth—you''re about to discover why.\n\nThe morning is devoted to the awe-inspiring **Karnak Temple Complex**. Spend nearly three hours exploring this vast sacred site, walking the same processional routes that pharaohs, priests, and pilgrims walked for two millennia. Your guide brings the carved walls to life, translating hieroglyphs and explaining the complex mythology depicted everywhere.\n\nThe **Sacred Lake** still reflects the temple''s towering columns, and the famous **Scarab Statue** awaits—legend says walking around it seven times brings good fortune in matters of the heart.\n\nAfter a sumptuous lunch back on board, spend the afternoon at **Luxor Temple**, arguably the most beautiful temple in Egypt. Connected to Karnak by the recently restored Avenue of Sphinxes, this temple was the site of the annual Opet Festival, when the gods of Karnak were carried here in sacred procession. As the afternoon light bathes the colossal statues of Ramesses II in gold, you''ll understand why generations of travelers have fallen under Luxor''s spell.\n\nEnjoy a captain''s farewell dinner with special regional delicacies. The evening is yours—perhaps a moonlit walk along the corniche, or stargazing from the sundeck as the illuminated temples shimmer across the water.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Secrets of the West Bank**\n\nYour final day reveals the mysteries of Luxor''s West Bank—the "Land of the Dead" where pharaohs prepared for eternity.\n\nFirst, the legendary **Valley of the Kings**. Hidden in these desert hills are the tombs of Egypt''s greatest rulers. Descend into painted chambers where every surface blazes with images of the afterlife—gods and demons, stars and serpents, the journey of the sun through the underworld. Your admission includes three tombs (additional tombs available for purchase), each a unique masterpiece.\n\nThe **Temple of Hatshepsut** awaits, its three terraces rising against dramatic cliffs in perfect harmony with the landscape. Egypt''s most powerful female ruler commissioned this masterpiece, and its elegant proportions have inspired architects for 3,500 years.\n\nFinally, pay homage to the **Colossi of Memnon**—two 18-meter seated figures of Amenhotep III that have welcomed visitors to the West Bank since 1350 BC. In ancient times, one statue was famous for "singing" at dawn (caused by temperature changes), drawing tourists from across the Roman Empire.\n\nReturn to the ship for a farewell breakfast. Your private transfer to Luxor International Airport allows time for last glimpses of this extraordinary land.\n\n*Meals: Breakfast*',
    highlights = ARRAY[
      'First-class cabin with panoramic river views',
      'Refined dining with international and Egyptian cuisine',
      'Experienced Egyptologist guide (small groups)',
      'All entrance fees including premium sites',
      'Private felucca sailing with refreshments',
      'Air-conditioned premium vehicles for transfers'
    ],
    inclusions = ARRAY[
      '3 nights in superior first-class cabin with Nile views',
      'Full board gourmet dining with welcome champagne',
      'Complimentary soft drinks, tea and coffee throughout',
      'Small group guided tours (maximum 16 guests)',
      'All entrance fees to temples and tombs',
      'Private felucca sailing with refreshments',
      'Private airport transfer on departure',
      'Daily afternoon tea service',
      'Evening entertainment program',
      'Complimentary Wi-Fi onboard'
    ],
    internal_notes = 'STANDARD TIER: First-class 5-star vessel, superior cabin with large windows, small group tours. Popular mid-range option. Vessel: Premium cruise ships like MS Mayfair, MS Nile Goddess. Best for couples and discerning travelers.',
    updated_at = NOW(),
    updated_by = v_user_id
  WHERE content_id = v_content_id AND tier = 'standard';

  -- =====================================================================
  -- DELUXE TIER - Exclusive Luxury
  -- =====================================================================

  UPDATE content_variations
  SET
    title = '4-Day Nile Cruise - Deluxe Collection',
    description = E'**Timeless Elegance on Egypt''s Royal River**\n\nThis deluxe 4-day cruise represents the finest way to experience the Nile without compromise. From your private balcony cabin to VIP access at ancient sites, every detail has been crafted for travelers who appreciate the extraordinary. Sail from Aswan to Luxor in pampered luxury, with exclusive experiences unavailable to ordinary tourists.\n\n---\n\n**Day 1: Aswan – A Royal Welcome**\n\nYour deluxe Nile journey begins with a private transfer to Aswan''s most significant sites, traveling in a premium air-conditioned vehicle with your personal driver.\n\nThe **Aswan High Dam** reveals the full scope of Egypt''s ambition—a monument of the modern age that rivals the pharaonic achievements you''re about to witness. Your private Egyptologist guide contextualizes this engineering triumph with the sweep of 5,000 years of Egyptian civilization.\n\nAt the **Unfinished Obelisk**, enjoy unhurried exploration with none of the crowds that plague these sites. Your guide demonstrates the ancient techniques that would have raised this 1,200-ton monument—if fate had allowed.\n\n**Philae Temple** comes alive in the afternoon light. Arriving by private motor launch, you''ll explore the sanctuary of Isis at your own pace, lingering at reliefs that catch your eye, asking questions as they arise. This intimate approach transforms tourism into true discovery.\n\nBoard your deluxe cruise ship to champagne and canapés, then settle into your balcony cabin—your private floating sanctuary for the next three nights. Before dinner, a **private felucca sailing** awaits: vintage champagne, gourmet canapés, and a sunset that has inspired poets since the pharaohs. Return for a multi-course dinner where Egyptian and international cuisines are elevated to artistry.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Temples of Divine Wisdom**\n\nBreakfast on your private balcony sets the tone for a day of discovery. Watch Egypt''s timeless landscape drift past—fishermen casting nets as they did in pharaonic times, children playing beside mud-brick villages, the desert hills glowing gold and amber beyond the palm-fringed banks.\n\nArrive at **Kom Ombo** before the crowds. This remarkable double temple, dedicated to both crocodile and falcon gods, perches dramatically above the Nile. Your private guide reveals the temple''s secrets—ancient medical instruments carved into stone, a nilometer that measured the river''s life-giving floods, mummified crocodiles in the adjacent museum.\n\nA gourmet lunch awaits onboard, with regional specialties paired with carefully selected wines. Rest in your cabin or lounge on the sundeck as the ship continues to Edfu.\n\nThe **Temple of Horus at Edfu** demands superlatives—it is simply the best-preserved ancient temple on Earth. Its massive pylons, intimate chapels, and dramatic hypostyle halls transport you directly into pharaonic Egypt. Your guide brings the temple''s mythology to vivid life, explaining the eternal struggle between Horus and Set carved into every wall.\n\nReturn to the ship for sunset cocktails on the deck. Tonight''s dinner is a special affair—a seven-course tasting menu showcasing Egypt''s diverse culinary heritage, from Alexandria to Aswan. Live traditional music accompanies your meal as the ship sails through the night toward Luxor.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Luxor – Heart of the Ancient World**\n\nAwaken in Luxor, where the ruins of ancient Thebes sprawl across both banks of the Nile. Today you''ll understand why this was the capital of an empire that stretched from Sudan to Syria.\n\nThe **Karnak Temple Complex** awaits with **early morning VIP access**—entering before general opening hours, you''ll have the Great Hypostyle Hall virtually to yourself. Stand among its 134 massive columns in the soft morning light, hearing only birdsong and your guide''s quietly spoken commentary. This is the Karnak experience that most visitors can only dream of.\n\nSpend a full morning exploring this vast sacred site, your expert Egyptologist illuminating stories hidden in every carved relief. See the Sacred Lake where priests purified themselves, the towering obelisks of Hatshepsut and Thutmose, the granite scarab that promises eternal love.\n\nReturn to the ship for a spa treatment before lunch—your voyage includes access to the onboard wellness center with sauna, steam room, and massage services. A gourmet lunch follows, then an afternoon at leisure.\n\nAs the fierce afternoon sun softens, visit **Luxor Temple** at the most magical hour. The Avenue of Sphinxes, recently restored after 3,000 years, leads you to this architectural masterpiece. Watch the temple transform in the golden light, its massive statues of Ramesses II glowing as if lit from within. Stay for the illumination after dark—a private viewing arranged exclusively for deluxe guests.\n\nA private dinner under the stars on the top deck concludes this extraordinary day, with the illuminated Luxor Temple as your backdrop.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: Valley of the Kings – Into Eternity**\n\nYour final morning brings the journey''s climax: the fabled West Bank of Luxor, where pharaohs prepared for their voyage to eternity.\n\nCross the Nile at first light and enter the **Valley of the Kings** with **special access** permits. Your ticket includes four tombs (rather than the standard three), potentially including restricted tombs not open to regular visitors. Descend into chambers ablaze with images of the afterlife—each tomb a unique masterpiece of ancient art and belief.\n\nThe **Temple of Hatshepsut** reveals Egypt''s most extraordinary ruler—a woman who declared herself pharaoh and ruled for two decades of peace and prosperity. Her mortuary temple, rising in elegant terraces against sheer cliffs, is a triumph of architecture that feels strikingly modern.\n\nThe **Colossi of Memnon** conclude your West Bank exploration. These weathered giants have watched over the Nile for 34 centuries, surviving earthquakes, floods, and the rise and fall of empires. In their patient endurance lies a lesson about time itself.\n\nReturn to the ship for a farewell gourmet breakfast. Your luxury vehicle transfer to Luxor International Airport allows time for reflection on a journey that has touched four millennia.\n\n*Meals: Breakfast*',
    highlights = ARRAY[
      'Spacious deluxe cabin with private balcony',
      'Gourmet multi-course dining with premium wines',
      'Private Egyptologist guide throughout',
      'VIP early access to major temples',
      'Special tomb access in Valley of the Kings',
      'Private felucca with champagne service'
    ],
    inclusions = ARRAY[
      '3 nights in deluxe balcony cabin (approx. 28-32 sqm)',
      'Butler service and premium amenities',
      'Full board gourmet cuisine with premium wine pairing',
      'Private Egyptologist guide (couples or small group max 8)',
      'VIP entrance and early access to temples',
      'Special access to 4 tombs in Valley of the Kings',
      'Private felucca sailing with vintage champagne and canapés',
      'Luxury vehicle transfers throughout',
      'Full spa access with one complimentary treatment',
      'Nightly entertainment and cultural performances',
      'Private starlight dinner on deck',
      'Complimentary premium beverages throughout',
      'Complimentary laundry service'
    ],
    internal_notes = 'DELUXE TIER: Luxury boutique vessel, balcony cabin, private/semi-private tours, VIP access. Premium experience. Vessels: Sanctuary Sun Boat, Oberoi Philae class. For well-traveled clients expecting exceptional service.',
    updated_at = NOW(),
    updated_by = v_user_id
  WHERE content_id = v_content_id AND tier = 'deluxe';

  -- =====================================================================
  -- LUXURY TIER - Ultimate Opulence
  -- =====================================================================

  UPDATE content_variations
  SET
    title = '4-Day Nile Cruise - Ultimate Luxury',
    description = E'**The Definitive Nile Experience**\n\nFor those who accept nothing but the absolute finest, this ultra-luxury 4-day cruise represents the pinnacle of Nile travel. Stay in a magnificent suite with panoramic views. Enjoy the services of a dedicated butler. Dine on world-class cuisine paired with vintage champagne. Access ancient sites with exclusive permits that open doors closed to all other visitors. This is not merely a cruise—it is an immersion into the Egypt of pharaohs and poets, experienced with a level of luxury that matches the magnificence of the monuments themselves.\n\n---\n\n**Day 1: Aswan – A Journey Beyond Compare**\n\nYour extraordinary adventure begins the moment your private limousine collects you from your hotel or the airport. Nothing about this journey will be ordinary.\n\nArriving at the **Aswan High Dam**, you''re accompanied by your personal PhD-qualified Egyptologist—one of Egypt''s foremost scholars, selected for both expertise and ability to bring the ancient world vividly to life. As you survey the transformation of the Nile, your guide recounts the dramatic rescue of Abu Simbel and Philae, an archaeological achievement that captivated the world.\n\nThe **Unfinished Obelisk** offers insights available nowhere else. Your Egyptologist demonstrates the exact techniques used 3,500 years ago, explaining mysteries that have puzzled scholars for generations—delivered with the authority of one who has spent decades studying these very questions.\n\n**Philae Temple** awaits, but not as other visitors experience it. Arriving by private motor launch, you''re granted **exclusive early access** to explore the sanctuary of Isis before the temple opens to the public. In the profound silence of early morning, with only birdsong and the lapping of the Nile, Philae reveals secrets hidden from the crowds.\n\nBoard your ultra-luxury cruise ship to a scene of refined opulence. Your magnificent suite—with floor-to-ceiling windows, separate living area, and private balcony—becomes your floating palace for the next three nights. A personal butler attends to every need, beginning with a welcome of Dom Pérignon and beluga caviar.\n\nAs the sun begins its descent, embark on a **private felucca sailing** experience beyond imagination. Vintage champagne, exquisite canapés prepared by the ship''s executive chef, and a sunset that transforms the Nile into liquid gold. Return for a private dinner in the ship''s most exclusive venue, a bespoke menu created in consultation with your preferences.\n\n*Meals: Lunch, Dinner*\n\n---\n\n**Day 2: Temples Revealed in New Light**\n\nBreakfast arrives via room service—or on your private balcony, as you prefer. Your butler has already prepared your day bag with cold refreshments and your favorite newspapers. The morning unfolds at a pace you dictate.\n\n**Kom Ombo Temple** reveals its secrets under exclusive morning access. Before the general public arrives, you explore this extraordinary double temple in near-solitude. Your Egyptologist—an authority on ancient Egyptian religion—illuminates the profound symbolism of this sanctuary shared between crocodile and falcon gods. Every carved relief tells a story; today, those stories are told only to you.\n\nReturn to the ship for a gourmet lunch featuring the finest ingredients Egypt has to offer, each dish paired with wines from your butler''s carefully curated selection. Enjoy a massage in the ship''s spa or simply watch the Nile''s eternal pageant from your private balcony.\n\nThe **Temple of Horus at Edfu** is the afternoon''s revelation. The best-preserved temple in Egypt gains new dimensions through your private exploration. Within its sanctuaries—including areas rarely accessed—you''ll understand why this temple remained active for centuries, and why it still inspires awe today.\n\nAs the ship sails toward Luxor, join the captain on the bridge for sunset cocktails and navigation insights few visitors ever receive. Dinner tonight is an event: a ten-course tasting menu paired with Grand Cru wines, served at the chef''s private table. Traditional musicians perform melodies that echo across millennia.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 3: Luxor – Where Time Stands Still**\n\nLuxor. Thebes. The ancient capital of the world''s greatest civilization. Today, you will experience it as no ordinary visitor can.\n\n**Karnak Temple Complex** opens its gates exclusively for you. Arriving **before dawn** with special permits, you witness the sunrise illuminate the Great Hypostyle Hall—134 massive columns emerging from shadow into golden light. For thirty minutes or more, one of history''s most sacred spaces belongs to you alone. Photographers wait lifetimes for these conditions; today, they are yours as a matter of course.\n\nSpend the morning exploring Karnak''s vast precincts with your personal Egyptologist. Access restricted areas closed to regular visitors. Stand in chambers where pharaohs were crowned, priests whispered prophecies, and the fate of empires was decided. Leave only when you are ready.\n\nReturn to the ship for a spa treatment—perhaps a traditional hammam ritual—followed by a light lunch. The afternoon is yours to spend as you wish: reading on your balcony, swimming in the ship''s pool, or exploring Luxor''s famous souk with your guide.\n\nAs sunset approaches, travel to **Luxor Temple** for a **private after-hours visit**. When the day''s visitors have departed and the temple is illuminated against the darkening sky, you enter this 3,400-year-old sanctuary in profound solitude. Walk the Avenue of Sphinxes. Stand before the Colossus of Ramesses. Feel the weight of history in the evening silence.\n\nReturn to the ship for the evening''s pinnacle: a **private starlight dinner** on the top deck, prepared by the executive chef exclusively for you. The illuminated Luxor Temple forms your backdrop; vintage champagne flows freely; the Nile whispers secrets as old as time itself.\n\n*Meals: Breakfast, Lunch, Dinner*\n\n---\n\n**Day 4: The Valley of the Kings – Ultimate Revelation**\n\nThis morning brings the journey''s ultimate experience: the sacred necropolis where pharaohs prepared for eternity.\n\nCross the Nile as the first light touches the Theban hills. Your **VIP permits** grant access to tombs closed to all but a handful of visitors each day—including, when available, the tomb of Tutankhamun and the magnificent tomb of Seti I, often called the "Sistine Chapel of ancient Egypt." Descend into painted chambers that have survived 33 centuries, their colors still vibrant, their secrets still profound.\n\nYour exploration extends beyond ordinary limits. Access **six tombs** (rather than the standard three), selected by your Egyptologist to provide the most comprehensive understanding of pharaonic beliefs about death and resurrection.\n\nThe **Temple of Hatshepsut** rises in terraces against golden cliffs—a masterpiece of ancient architecture that feels startlingly modern. Your guide reveals the extraordinary story of Egypt''s most powerful female ruler, whose monuments her successor tried—and failed—to erase from history.\n\nPause at the **Colossi of Memnon**, those eternal sentinels who have watched 34 centuries of travelers pass. Ancient Greeks came here to hear them "sing" at dawn; today, they witness your departure with the same patient dignity.\n\nReturn to the ship for a farewell breakfast of your choice. Your private limousine waits to transport you to Luxor International Airport—or to a private aviation terminal, should your journey continue in that manner.\n\nYou leave Egypt transformed. The pharaohs built for eternity; in some small measure, that eternity now lives in you.\n\n*Meals: Breakfast*',
    highlights = ARRAY[
      'Magnificent suite with panoramic views and private balcony',
      'Dedicated butler service throughout your voyage',
      'World-class dining with Dom Pérignon and vintage wines',
      'Personal PhD-qualified Egyptologist',
      'Exclusive before-hours and after-hours temple access',
      'VIP permits for restricted tombs including Seti I',
      'Private limousine transportation throughout'
    ],
    inclusions = ARRAY[
      '3 nights in magnificent suite (50+ sqm) with panoramic views',
      '24-hour dedicated butler service',
      'Full board world-class cuisine by executive chef',
      'Unlimited Dom Pérignon and premium vintage wines',
      'Personal PhD Egyptologist guide (fully private)',
      'Exclusive early/late access permits for all sites',
      'VIP tomb access including restricted tombs (6 tombs)',
      'Private felucca with Dom Pérignon and gourmet canapés',
      'Private limousine airport transfers',
      'Daily spa treatments of your choice',
      'Private starlight dinner on deck',
      'In-suite champagne service throughout',
      'Complimentary premium laundry and pressing',
      'Personalized leather-bound journey journal',
      'Exclusive departure gift from Egypt',
      'Helicopter transfer available on request'
    ],
    internal_notes = 'LUXURY TIER: Ultra-luxury boutique vessel (Sanctuary Sun Boat IV, Steam Ship Sudan, or equivalent). Presidential/Royal suite with butler. Fully private tours with PhD Egyptologist. Maximum exclusivity and access. For UHNW clients, celebrities, royalty. Verify special tomb permits 2 weeks in advance.',
    updated_at = NOW(),
    updated_by = v_user_id
  WHERE content_id = v_content_id AND tier = 'luxury';

  -- =====================================================================
  -- VERIFY RESULTS
  -- =====================================================================

  RAISE NOTICE '';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Migration 137 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Updated 4 tier variations with enhanced descriptions:';
  RAISE NOTICE '  - Budget: Classic Discovery';
  RAISE NOTICE '  - Standard: Premium Experience';
  RAISE NOTICE '  - Deluxe: Deluxe Collection';
  RAISE NOTICE '  - Luxury: Ultimate Luxury';
  RAISE NOTICE '';

END $$;

-- Verify the updates
SELECT
  cv.tier,
  cv.title,
  LENGTH(cv.description) as description_length,
  array_length(cv.highlights, 1) as highlight_count,
  array_length(cv.inclusions, 1) as inclusion_count
FROM content_variations cv
JOIN content_library cl ON cv.content_id = cl.id
WHERE cl.slug = '4-day-nile-cruise-aswan-luxor'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
