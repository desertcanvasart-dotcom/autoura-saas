-- =====================================================================
-- Migration 144: Add Grand Old Cairo Day Tour
-- Description: Full-day tour of Cairo's medieval, Coptic, and Islamic heritage
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
    'The Grand Old Cairo Day Tour',
    'grand-old-cairo-day-tour',
    'Step through the living layers of Cairo''s extraordinary religious and cultural heritage in a single unforgettable day. From the medieval Islamic gate of Bab Zuweila to the ancient Hanging Church suspended above a Roman fortress, from one of the oldest synagogues in Egypt to the breathtaking Cave Church carved into the Mokattam cliffs, this tour reveals a Cairo most visitors never discover. Wander with artisans in Khan el-Khalili, stand where the Holy Family is said to have sheltered, and close the day amid the gardens and skyline views of Al-Azhar Park. This is Cairo at its deepest—a city where mosques, churches, and synagogues have stood side by side for over a millennium.',
    'Old Cairo & Islamic Cairo, Egypt',
    '1 day (full day)',
    ARRAY['old-cairo', 'coptic-cairo', 'islamic-cairo', 'hanging-church', 'ibn-tulun', 'bab-zuweila', 'khan-el-khalili', 'cave-church', 'mokattam', 'ben-ezra', 'day-tour', 'cultural', 'religious-heritage'],
    jsonb_build_object(
      'tour_type', 'day_tour',
      'duration_hours', 9,
      'city', 'Cairo',
      'highlights', ARRAY[
        'Bab Zuweila medieval gate',
        'Mosque of Ibn Tulun',
        'The Hanging Church',
        'Saint Sergius and Bacchus Church (Abu Serga)',
        'Ben Ezra Synagogue',
        'Cave Church of Mokattam',
        'Khan el-Khalili artisan workshops',
        'Al-Azhar Park'
      ],
      'included_meals', 'Lunch included',
      'transport', true,
      'themes', ARRAY['Coptic heritage', 'Islamic architecture', 'Jewish history', 'Medieval Cairo', 'Living culture']
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
    'Grand Old Cairo - Classic Discovery',
    E'**Cairo''s Sacred Mosaic: Mosques, Churches, and the Living City**\n\nBeneath the surface of modern Cairo lies another city entirely—one where medieval Islamic gates still frame the sky, where Coptic churches shelter within the walls of a Roman fortress, where a synagogue guards manuscripts a thousand years old, and where a church carved into a mountainside serves a community unlike any other on Earth. This is Old Cairo: a living palimpsest of faith, culture, and resilience that has endured for over fourteen centuries.\n\nThis full-day tour peels back the layers, guiding you through the sacred and secular landmarks that together tell the extraordinary story of a city where three great religions have coexisted—sometimes in tension, often in harmony—for longer than most nations have existed.\n\n---\n\n**Morning: Medieval Cairo – Gates and Minarets**\n\n*Bab Zuweila – Gateway to the Medieval City*\n\nYour day begins at **Bab Zuweila**, one of only three surviving gates of Cairo''s medieval Fatimid walls, built in 1092 AD. This massive stone gateway once marked the southern entrance to the walled city, and for centuries it served as the site of public proclamations, celebrations—and executions. The two soaring minarets that crown its towers belong to the adjacent Mosque of al-Mu''ayyad and create one of Cairo''s most dramatic silhouettes.\n\nClimb to the top of the gate for a **panoramic view** that stretches across Old Cairo''s rooftops—a forest of domes and minarets punctuated by the distant profile of the Citadel. Your guide shares the gate''s colourful history: the Mamluk sultans who held court here, the Ottoman governors who passed beneath its arch, and the legends that still cling to its ancient stones.\n\n*Mosque of Ibn Tulun – Masterpiece of Islamic Architecture*\n\nFrom the medieval gate, you proceed to the **Mosque of Ibn Tulun**, one of the oldest and most magnificent mosques in Cairo—and one of the largest in the entire Islamic world. Built between 876 and 879 AD by Ahmad ibn Tulun, the Abbasid governor who declared Egypt independent, this mosque is a masterpiece of spare, geometric beauty.\n\nIts vast courtyard—covering over 2.5 hectares—is surrounded by elegant arcades of pointed arches, their simplicity creating a sense of serene grandeur that contrasts dramatically with the ornate Mamluk mosques elsewhere in Cairo. The stucco decoration on the arches is original 9th-century work—among the oldest surviving Islamic decorative art in Egypt.\n\nYour guide explains the mosque''s distinctive **spiral minaret**, modeled on the famous spiral minaret of the Great Mosque of Samarra in Iraq—a visual connection to the Abbasid heartland from which Ibn Tulun came. For those who wish, a climb to the top rewards with sweeping views across the city.\n\n---\n\n**Midday: Coptic Cairo – Faith in Stone**\n\n*The Hanging Church (Al-Mu''allaqa)*\n\nCross into **Coptic Cairo**, the ancient quarter where Egypt''s Christian community has worshipped continuously since the first centuries of the faith. The **Hanging Church**—formally the Church of the Virgin Mary—is the jewel of this quarter, and one of the most extraordinary churches in the Christian world.\n\n"Hanging" refers not to suspension but to its construction: the church is built above the gatehouse of the ancient **Roman Fortress of Babylon**, its nave literally suspended over the passage below. First constructed in the 3rd or 4th century AD, it has been rebuilt and adorned over the centuries, and its interior is a treasure house of Coptic art: a magnificent wooden ceiling carved in the shape of Noah''s Ark, a marble pulpit supported by 13 slender columns (representing Christ and the twelve apostles), and icons dating back as far as the 8th century.\n\nYour guide explains the significance of the Coptic Church in Christian history—one of the oldest Christian communities on Earth, founded according to tradition by Saint Mark the Evangelist in the 1st century AD.\n\n*Saint Sergius and Bacchus Church (Abu Serga)*\n\nSteps away lies the **Church of Saints Sergius and Bacchus**, known locally as Abu Serga—one of the oldest churches in Egypt, dating to the 4th or 5th century. Its fame rests on a profound tradition: the crypt beneath the church is believed to be the spot where the **Holy Family—Mary, Joseph, and the infant Jesus—rested** during their flight into Egypt, as described in the Gospel of Matthew.\n\nDescend into the crypt (when accessible) and stand in a space charged with nearly two millennia of devotion. The church above, with its basilica plan and ancient wooden roof, preserves the atmosphere of early Christianity with remarkable authenticity.\n\n*Ben Ezra Synagogue*\n\nComplete your Coptic Cairo circuit at the **Ben Ezra Synagogue**, one of the oldest Jewish synagogues in Egypt. Built on the site where, tradition holds, baby Moses was found in the reeds along the Nile, this beautifully restored synagogue is renowned for the discovery of the **Cairo Geniza**—a treasure trove of nearly 300,000 manuscript fragments dating from the 9th to 19th centuries that transformed scholarly understanding of medieval Jewish, Islamic, and Christian life in the Middle East.\n\nYour guide explains the synagogue''s elegant architecture—Star of David motifs, marble columns, carved wooden screens—and the story of the Geniza discovery, one of the greatest manuscript finds in history.\n\n---\n\n**Afternoon: Mountains, Markets, and Gardens**\n\n*The Cave Church of Mokattam (Monastery of Saint Simon)*\n\nLeave the old city for one of Cairo''s most extraordinary and least-expected landmarks: the **Cave Church** in the Mokattam Hills, also known as the **Monastery of Saint Simon the Tanner**.\n\nCarved directly into the limestone cliffs, this remarkable church seats up to 20,000 worshippers—making it one of the largest churches in the Middle East. Its walls are adorned with stunning biblical carvings depicting scenes from the Old and New Testaments, their scale and artistry rivaling anything in Cairo''s more famous monuments.\n\nWhat makes the Cave Church truly extraordinary is its community. It serves the **Zabbaleen**—Cairo''s traditional garbage collectors, a Coptic Christian community who have recycled the city''s waste for generations with remarkable efficiency. Your guide explains this unique community''s history, their faith, and the social dynamics that make Mokattam one of Cairo''s most fascinating neighborhoods.\n\n*Khan el-Khalili – The Artisan Quarter*\n\nReturn to the heart of Islamic Cairo for an afternoon at **Khan el-Khalili**, Cairo''s legendary 14th-century bazaar. Wander through vibrant lanes where artisans practice crafts passed down through generations—coppersmiths hammering intricate patterns, jewelers setting stones, perfumers blending essential oils, and textile merchants displaying hand-woven fabrics in cascades of colour.\n\nYour guide points out the highlights and helps you navigate the labyrinth, ensuring you discover authentic artisan workshops rather than tourist-oriented shops.\n\n*Al-Azhar Park – The Perfect Finale*\n\nYour day concludes at **Al-Azhar Park**, one of Cairo''s most beautiful green spaces, built on a site that was a rubbish dump for centuries before the Aga Khan Trust for Culture transformed it into a 30-hectare oasis of manicured gardens, fountains, and walkways.\n\nStroll through lush landscapes with **breathtaking views of the Cairo skyline**—the minarets and domes of Islamic Cairo spread before you, the Citadel rising in the distance, and the entire sweep of the city visible from the park''s elevated terraces. It is a moment of tranquility after a day immersed in the intensity of Old Cairo—and a reminder that this ancient city continues to reinvent itself.\n\n*Meals: Lunch*',
    ARRAY[
      'Bab Zuweila gate with panoramic rooftop views',
      'Mosque of Ibn Tulun – one of Cairo''s oldest mosques',
      'The Hanging Church (Al-Mu''allaqa)',
      'Abu Serga Church – Holy Family shelter tradition',
      'Ben Ezra Synagogue – site of the Cairo Geniza',
      'Cave Church of Mokattam – carved into the cliffs',
      'Khan el-Khalili artisan quarter',
      'Al-Azhar Park with city skyline views'
    ],
    ARRAY[
      'Professional English-speaking guide',
      'Entrance fees to all sites visited',
      'Lunch at quality local restaurant',
      'Air-conditioned vehicle with driver',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Bottled water during the tour'
    ],
    'BUDGET TIER: Shared group tour (max 20), standard air-conditioned minibus, local restaurant lunch. This tour is walking-intensive—comfortable shoes essential. Some sites have stairs (Bab Zuweila climb, Ibn Tulun minaret). Abu Serga crypt access can be restricted during flooding—confirm before departure. Cave Church visit requires vehicle to Mokattam Hills. Al-Azhar Park has a small entrance fee (included).',
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
    'Grand Old Cairo - Premium Experience',
    E'**The Soul of Cairo: A Premium Journey Through Faith and Culture**\n\nCairo is not one city but many—layered, interwoven, each era leaving its mark on the next. This premium day tour reveals the deepest of these layers: the medieval Islamic city with its soaring minarets and massive stone gates, the ancient Coptic quarter where Christianity has been practised since the apostolic age, the Jewish heritage preserved in one of Egypt''s most beautiful synagogues, and the extraordinary living community of Mokattam where faith literally moves mountains. With an experienced guide, small group, and premium vehicle, you experience Old Cairo with the depth and comfort it deserves.\n\n---\n\n**Morning: Medieval Cairo – The Power and the Glory**\n\n*Bab Zuweila – A Sentinel of Nine Centuries*\n\nYour experienced guide (leading a maximum of 16 guests) meets you in a premium vehicle, and the story of Old Cairo begins as you drive. Cairo was founded in 969 AD by the Fatimid dynasty, but the city''s roots reach back centuries further—to the Roman fortress of Babylon, to the ancient port of Fustat, to the pharaonic city of Memphis beyond.\n\n**Bab Zuweila** materialises as a monument to the Fatimid vision. Built in 1092 AD, this is the last surviving southern gate of the original walled city, its massive stonework flanked by the twin minarets of the Mosque of al-Mu''ayyad Sheikh. Climb to the top and your guide narrates the panorama: the forest of minarets marking the great mosques of the Fatimid, Ayyubid, and Mamluk eras; the distant Citadel of Saladin; the rooftops of a city that has been continuously inhabited for over a thousand years.\n\nYour guide shares the gate''s vivid history—from the Mamluk sultan who nailed the severed heads of his enemies to its doors, to the Sufi saint whose legends still draw pilgrims to its threshold. Bab Zuweila is not a museum piece but a living monument, its stones still warm with stories.\n\n*Mosque of Ibn Tulun – Geometry and Grace*\n\nThe **Mosque of Ibn Tulun** is a revelation even for seasoned travelers. Built between 876 and 879 AD, it is one of the oldest intact mosques in the Islamic world—and its architectural purity is breathtaking.\n\nYour guide provides the context that transforms appreciation into understanding. Ahmad ibn Tulun was an Abbasid governor who effectively made himself independent ruler of Egypt, and his mosque was a statement of cultural ambition: modeled on the great mosques of Samarra in Iraq (where Ibn Tulun was raised), it introduced architectural forms previously unknown in Egypt.\n\nThe vast courtyard—among the largest of any mosque in the world—is surrounded by arcades whose pointed arches rest on massive piers, creating a rhythm of light and shadow that photographers adore. Your guide draws attention to the original 9th-century stucco decorations above the arches—geometric and floral patterns of extraordinary delicacy, among the oldest surviving examples of Islamic decorative art in Egypt.\n\nThe **spiral minaret** is the mosque''s iconic feature—a helical tower modeled on its famous predecessor in Samarra. Your guide accompanies those who wish to climb for a view that encompasses the mosque''s full geometric perfection from above, plus a panorama stretching from the Citadel to the Pyramids of Giza on clear days.\n\n---\n\n**Midday: Coptic Cairo – The Oldest Christian Quarter**\n\n*The Hanging Church (Al-Mu''allaqa)*\n\nEnter **Coptic Cairo** through the remains of the Roman **Fortress of Babylon**—a 1st-century fortification whose towers and walls still define this ancient quarter. Your guide explains the fortress''s strategic importance: controlling the head of the Nile Delta, it was a linchpin of Roman Egypt.\n\nThe **Hanging Church** rises above the fortress gatehouse, its nave suspended over the ancient passage below—a physical metaphor for the way Christianity in Egypt has always been built upon older foundations. Inside, your guide reveals the church''s artistic treasures with expert commentary: the extraordinary **wooden ceiling** carved to resemble the inverted hull of Noah''s Ark (a masterpiece of Coptic woodcarving), the **marble pulpit** resting on 13 slender columns representing Christ and his apostles (one column, dark basalt among white marble, symbolises Judas), and a collection of **icons** spanning centuries of Coptic artistic tradition.\n\nYour guide provides the historical context that deepens the experience: the Coptic Church''s claim to apostolic foundation by Saint Mark in 42 AD, its theological independence since the Council of Chalcedon in 451 AD, and its remarkable survival through fourteen centuries as a minority faith in an Islamic land.\n\n*Saint Sergius and Bacchus Church (Abu Serga)*\n\nThe **Church of Abu Serga** carries one of Christianity''s most moving traditions. Built in the 4th or 5th century atop a cave where the **Holy Family** is believed to have sheltered during their flight into Egypt, it preserves the atmosphere of early Christianity with remarkable fidelity.\n\nYour guide leads you through the basilica—its ancient columns, wooden iconostasis, and candlelit sanctuary creating an atmosphere of profound devotion—before descending to the **crypt** where, according to Coptic tradition, Mary, Joseph, and the infant Jesus rested. Whether one takes the tradition literally or not, standing in this subterranean space, you feel the accumulated devotion of sixteen centuries pressing in around you.\n\n*Ben Ezra Synagogue – A Treasure House of Memory*\n\nThe **Ben Ezra Synagogue** completes the interfaith trinity of Coptic Cairo. Your guide tells the remarkable story of the **Cairo Geniza**: for nearly a thousand years, the Jewish community deposited worn-out documents in a sealed chamber rather than destroying texts that might contain the name of God. When the chamber was opened in the 19th century, scholars found nearly 300,000 fragments—personal letters, business contracts, poetry, prayer books, and legal documents that revolutionised understanding of medieval Mediterranean life.\n\nThe synagogue itself, beautifully restored, features elegant **Star of David** motifs, marble columns, and carved wooden screens. Your guide explains the history of Egypt''s Jewish community—once one of the largest and most prosperous in the Middle East—and the cultural cross-pollination between the three Abrahamic faiths that characterised medieval Cairo.\n\nEnjoy a quality lunch at a carefully selected restaurant before the afternoon programme.\n\n---\n\n**Afternoon: Mountains, Markets, and Gardens**\n\n*The Cave Church of Mokattam*\n\nThe **Cave Church** in the Mokattam Hills is unlike anything else in Cairo—or, indeed, anywhere in the world. Carved into the limestone cliffs on the eastern edge of the city, the **Monastery of Saint Simon the Tanner** encompasses multiple churches, the largest seating up to 20,000 people beneath a canopy of natural rock.\n\nThe biblical carvings adorning the cave walls are monumental in scale—scenes from Genesis, the life of Christ, and the Book of Revelation rendered in a style that blends ancient Coptic tradition with striking contemporary boldness. Your guide explains the story of **Saint Simon**, the 10th-century tanner whose faith, according to Coptic tradition, literally moved the Mokattam mountain—a miracle that saved the Coptic community during the reign of the Fatimid caliph al-Mu''izz.\n\nThe human story is equally compelling. The **Zabbaleen** community—Cairo''s traditional waste collectors, predominantly Coptic Christians—has inhabited these hills for decades. Your guide explains their remarkable recycling system (achieving rates of 80-85%, far exceeding Western cities), their faith, and the social challenges they face. The Cave Church is their spiritual heart, and visiting it with sensitivity and understanding is an essential part of the experience.\n\n*Khan el-Khalili – Artisans and Atmosphere*\n\nReturn to Islamic Cairo for **Khan el-Khalili** at its most atmospheric—the late afternoon, when the light softens and the bazaar''s energy reaches its peak. Your guide navigates beyond the tourist-facing shops to the **artisan workshops** where the real craft happens: coppersmiths creating lanterns using techniques unchanged since the Mamluk era, silversmiths setting turquoise and lapis lazuli, perfumers blending attars from ancient recipes, and calligraphers practicing the sacred art of Arabic script.\n\nYour guide offers **shopping guidance**—identifying quality, suggesting fair prices, and introducing you to craftspeople whose work represents the living continuation of Cairo''s medieval artistic traditions.\n\n*Al-Azhar Park – Sunset Serenity*\n\nThe day''s final chapter unfolds at **Al-Azhar Park**, the Aga Khan Trust''s magnificent transformation of a medieval rubbish dump into one of Cairo''s most beautiful public spaces. Stroll through landscaped gardens, past fountains and ornamental pools, to the park''s elevated terraces where the **skyline of Islamic Cairo** spreads before you—hundreds of minarets and domes silhouetted against the softening sky.\n\nYour guide identifies the landmarks visible from this perfect vantage point: the Citadel of Saladin, the Mosque of Muhammad Ali, the minarets of Sultan Hassan and al-Rifa''i—a fitting panoramic finale to a day spent immersed in the city''s deepest layers.\n\n*Meals: Lunch*',
    ARRAY[
      'Bab Zuweila rooftop panorama with historical narrative',
      'Mosque of Ibn Tulun with spiral minaret option',
      'Hanging Church with expert Coptic art commentary',
      'Abu Serga Church and Holy Family crypt',
      'Ben Ezra Synagogue with Geniza story',
      'Cave Church of Mokattam with community context',
      'Khan el-Khalili artisan workshops with shopping guidance',
      'Al-Azhar Park skyline views',
      'Experienced guide (small group max 16)'
    ],
    ARRAY[
      'Experienced English-speaking guide (small group max 16)',
      'Entrance fees to all sites visited',
      'Quality lunch at well-selected restaurant',
      'Premium air-conditioned vehicle with professional driver',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Bottled water and refreshments throughout',
      'Al-Azhar Park entrance fee',
      'Shopping guidance at Khan el-Khalili'
    ],
    'STANDARD TIER: Small group (max 16), premium vehicle (Mercedes Vito or similar), quality restaurant lunch. Walking-intensive tour—comfortable shoes essential. Ibn Tulun minaret climb is optional (steep, narrow). Abu Serga crypt can be flooded—check conditions. Cave Church visit requires 20-min drive to Mokattam Hills. Al-Azhar Park timing ideally late afternoon for best light. Guide should be knowledgeable across Islamic, Coptic, and Jewish heritage.',
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
    'Grand Old Cairo - Deluxe Collection',
    E'**Cairo''s Hidden Depths: A Private Journey Through Three Faiths**\n\nBeneath the surface of every great city lies a secret history. In Cairo, that history is written in stone, mosaic, and light—in the massive Fatimid gates that once sealed the city at nightfall, in the oldest mosques of the Islamic world, in churches that predate Islam by centuries, in a synagogue that guarded a million secrets for a thousand years, and in a mountainside church that serves a community of quiet miracles. This private deluxe tour, guided by a specialist in Cairo''s religious heritage, reveals the city at its most profound—its sacred spaces, its living traditions, and the extraordinary tapestry of faiths that has defined Cairo for over fourteen centuries.\n\n---\n\n**Morning: Medieval Cairo – Private Access to the Islamic City**\n\n*Bab Zuweila – The Gate Between Worlds*\n\nYour private guide—a specialist in Cairo''s medieval and religious heritage, accompanying a maximum of 8 guests—meets you in a luxury vehicle. The approach to Bab Zuweila becomes a journey through time as your guide traces the evolution of the city you''re about to enter: from the Roman fortress that anchored its earliest settlement, through the Fatimid founding in 969, to the Mamluk golden age that produced the monuments you''ll see today.\n\n**Bab Zuweila** itself receives the private attention it deserves. Climbing to the rooftop gallery, your guide provides an interpretive panorama—identifying not just the visible landmarks but the invisible layers beneath: the Fatimid street plan still traceable in the modern lanes, the Mamluk commercial district (now the fabric souk), the route of royal processions that once wound from the Citadel through this very gate.\n\nYour guide shares the stories most visitors never hear: the gate''s role in Mamluk justice (grim but fascinating), the Sufi traditions still practiced at nearby shrines, and the architectural techniques that have kept this thousand-year-old structure standing through earthquakes and centuries of urban pressure.\n\n*Mosque of Ibn Tulun – Architecture as Meditation*\n\nThe **Mosque of Ibn Tulun** with a private guide becomes an immersive experience in Islamic aesthetics. Your guide explains not just the history but the theology embedded in the architecture: the vast courtyard as a representation of the ordered universe, the mihrab (prayer niche) oriented precisely toward Mecca, the ablution fountain as a symbol of purification, and the minbar (pulpit) as the platform from which the ruler''s authority was proclaimed.\n\nWith your small group, you have time to appreciate details that crowds obscure: the carved stucco window grilles that filter light into geometric patterns on the floor, the kufic inscriptions running along the arcade walls, and the wooden ceiling of the prayer hall with its original 9th-century beams.\n\nThe **spiral minaret** is experienced with your guide''s full commentary—the symbolism of the ascending spiral in Islamic thought, the architectural connection to Samarra, and from its summit, a panorama that your guide reads like a text, identifying monuments and explaining their relationships to each other and to the city''s unfolding history.\n\nYour guide may also open access to the adjacent **Gayer-Anderson Museum**—a beautifully preserved 17th-century Ottoman house filled with antiques and curiosities, offering a domestic counterpoint to the mosque''s religious grandeur.\n\n---\n\n**Midday: Coptic Cairo – Beyond the Surface**\n\n*The Hanging Church – A Private Art History Lesson*\n\nEnter **Coptic Cairo** through the ancient **Roman fortress gateway**, its massive towers still standing after nearly two millennia. Your guide explains the fortress''s layers: Roman construction at the base, Byzantine modifications above, and Coptic churches nestled within and upon its walls.\n\nThe **Hanging Church** under private guidance becomes a masterclass in Coptic art. Your guide draws attention to artistic details invisible without expert knowledge: the iconographic programme of the wooden ceiling panels (each panel tells a specific biblical story), the theological significance of the marble pulpit''s 13 columns and their materials, the stylistic evolution visible in icons spanning from the 8th to the 18th century, and the hidden symbolism in the carved wooden screens (iconostasis) that separate nave from sanctuary.\n\nYour guide explains the Coptic Church''s unique theological position—its Miaphysite Christology, its ancient liturgical language (Coptic, the last descendant of ancient Egyptian), and its unbroken tradition of monasticism that influenced all of Western Christianity.\n\n*Abu Serga – Walking Where the Holy Family Walked*\n\nAt the **Church of Saints Sergius and Bacchus**, your private guide provides the archaeological context: the church has been rebuilt multiple times on the same site, but its deepest layers—including the crypt—date to the earliest centuries of Egyptian Christianity.\n\nThe **crypt** is experienced with scholarly depth. Your guide explains the Coptic tradition of the Holy Family''s Flight into Egypt—the route they are believed to have followed, the sites along the Nile associated with their journey, and the way this tradition has shaped Coptic identity for two millennia. The crypt''s atmospheric power—its low ceiling, ancient stonework, and devotional quiet—is given time to be fully absorbed.\n\n*Ben Ezra Synagogue – The Memory Palace*\n\nAt the **Ben Ezra Synagogue**, your guide devotes particular attention to the **Cairo Geniza** story—one of the greatest discoveries in the history of scholarship. Nearly 300,000 fragments, deposited over a millennium, included personal letters that revealed the daily lives of medieval Jews, Muslims, and Christians; business documents that mapped Mediterranean trade networks; and religious texts that transformed understanding of Jewish liturgical development.\n\nYour guide explains the detective work of scholars like Solomon Schechter, who recognised the Geniza''s importance in 1896, and S.D. Goitein, whose multi-volume study of the Geniza documents remains one of the masterworks of social history.\n\nA premium lunch at a thoughtfully selected restaurant—perhaps in the atmospheric surroundings of Old Cairo—provides a refined pause.\n\n---\n\n**Afternoon: Mountains, Markets, and Gardens**\n\n*The Cave Church – Faith Against All Odds*\n\nThe journey to the **Cave Church of Mokattam** is itself a transition—from the ancient precincts of Old Cairo to the gritty, extraordinary hillside community of the **Zabbaleen**. Your private guide frames the visit with sensitivity and depth, explaining the community''s history, their Coptic faith, and their remarkable contribution to Cairo''s ecology.\n\nThe **Monastery of Saint Simon** is experienced as both an architectural wonder and a living place of worship. Your guide points out the details of the monumental **biblical carvings**: the precision of the stonework, the artistic references to both ancient Coptic and contemporary traditions, and the theological programme that unfolds across the cave walls like a stone Bible.\n\nThe story of **Saint Simon the Tanner**—the 10th-century miracle of the moving mountain—is told in full, with your guide explaining the historical context of the Fatimid caliph''s challenge to the Coptic patriarch, the community''s desperate prayer, and the tradition of divine intervention that remains central to Coptic identity.\n\n*Khan el-Khalili – The Private Artisan Trail*\n\nReturn to **Khan el-Khalili** for a private artisan experience arranged by your guide. Visit workshops not accessible to the general public:\n\n• A **master calligrapher** who practices the sacred art of Arabic script—watch as Quranic verses and poetry emerge from the tip of a bamboo pen, each stroke following rules codified over a thousand years.\n\n• A **traditional lantern maker** (fanous) whose workshop produces the ornate brass and coloured-glass lanterns that are emblematic of Cairo''s Ramadan celebrations.\n\n• A **silversmith or goldsmith** whose techniques—granulation, filigree, stone-setting—have been passed down through family generations.\n\nYour guide facilitates genuine encounters with these artisans: conversations over tea, demonstrations of their craft, and the opportunity to commission bespoke pieces.\n\n*Al-Azhar Park – Golden Hour*\n\nThe day culminates at **Al-Azhar Park** during the golden hour—the warm late-afternoon light that transforms Cairo''s skyline into a vision of amber and gold. Your guide leads you to the best vantage points, identifying the landmarks that compose this extraordinary panorama: the walls of Fatimid Cairo (revealed and restored during the park''s construction), the great mosques, and the medieval cityscape that stretches to the Citadel.\n\nRefreshments are arranged at the park''s lakeside café or one of its garden terraces—a tranquil conclusion to a day of profound cultural immersion.\n\n*Meals: Lunch*',
    ARRAY[
      'Private specialist guide in religious heritage (max 8)',
      'Bab Zuweila with interpretive panoramic commentary',
      'Mosque of Ibn Tulun with Gayer-Anderson Museum access',
      'Hanging Church private art history tour',
      'Abu Serga crypt with scholarly Holy Family context',
      'Ben Ezra Synagogue with full Geniza narrative',
      'Cave Church with Zabbaleen community context',
      'Private artisan workshops at Khan el-Khalili',
      'Al-Azhar Park golden hour with refreshments',
      'Luxury vehicle throughout'
    ],
    ARRAY[
      'Private specialist guide (couples or max 8 guests)',
      'Entrance fees to all sites including Gayer-Anderson Museum',
      'Premium lunch at atmospheric Old Cairo restaurant',
      'Luxury vehicle (Mercedes E-Class or equivalent)',
      'Hotel/airport pickup and drop-off in Cairo/Giza',
      'Complimentary refreshments throughout',
      'Private artisan workshop visits at Khan el-Khalili',
      'Refreshments at Al-Azhar Park',
      'Al-Azhar Park entrance fee',
      'Photography guidance at key locations'
    ],
    'DELUXE TIER: Private/semi-private tour (max 8), luxury vehicle, premium lunch. Key upgrades: Gayer-Anderson Museum access, private artisan trail at Khan el-Khalili (calligrapher, lantern maker, jeweller—pre-arranged), refreshments at Al-Azhar Park. Guide must be specialist in interfaith Cairo heritage—Coptic, Islamic, and Jewish history. Cave Church visit requires sensitivity—brief guests on community etiquette. Al-Azhar Park best timed for golden hour (varies by season).',
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
    'Grand Old Cairo - Ultimate Luxury',
    E'**Cairo Unveiled: A Private Scholarly Pilgrimage Through Fourteen Centuries**\n\nThis is not a tour of Cairo. It is a private audience with the city''s soul—conducted by a PhD scholar whose published work on Cairo''s religious heritage, Islamic architecture, or Coptic studies transforms every stone, every mosaic, every carved inscription into a revelation. Travel in a private limousine. Access spaces closed to the public. Meet artisans whose families have practised their craft for generations. Dine in settings matched to the day''s extraordinary quality. From the medieval gates that once sealed the Fatimid city to a mountainside church that seats twenty thousand, from the crypt where the Holy Family sheltered to the synagogue that guarded a million lost documents—this is Cairo at its most profound, experienced at the highest level of scholarship and exclusivity.\n\n---\n\n**Morning: Medieval Cairo – A Scholar''s City**\n\n*Bab Zuweila – Reading the Medieval City*\n\nYour private limousine collects you at your preferred time, and your personal **PhD scholar**—a published specialist in Cairo''s Islamic, Coptic, or interfaith heritage—begins the day''s narrative as you drive through the city. This is not standard commentary but a scholar''s reading of urban landscape: the layers of Cairo visible in its streets, the way each dynasty left its mark on the city''s fabric, the tensions and harmonies between faith communities that shaped its architecture.\n\nAt **Bab Zuweila**, your scholar provides a private rooftop seminar. The panorama becomes a text: each minaret identified, its dynasty and architectural style explained, its relationship to the political and religious currents of its era. The gate itself becomes a case study in Fatimid military architecture, Mamluk appropriation, and Ottoman adaptation—layers of power inscribed in stone.\n\nYour scholar shares research-level insights: the archaeological evidence beneath the modern street level, the discovery of Fatimid-era shops in the gate''s foundations, and the ongoing debate about the original extent of the walled city.\n\n*Mosque of Ibn Tulun – The Private Masterclass*\n\nThe **Mosque of Ibn Tulun** with a PhD guide becomes the most intellectually rich mosque visit in Cairo.\n\nYour scholar explains the mosque''s place in the broader narrative of Islamic architecture: its debt to the Abbasid mosques of Iraq, its influence on subsequent Cairene architecture, and the specific innovations introduced by Ibn Tulun''s architects. The **pointed arches**—among the earliest in Egypt—are analyzed as structural and aesthetic achievements. The **stucco decorations** are read as a visual language: vegetal, geometric, and epigraphic elements combining in patterns whose mathematical sophistication scholars are still decoding.\n\nWith VIP access arranged by your scholar, you may enter areas of the mosque complex normally restricted—the **original minaret staircase** with its ancient graffiti, restoration workshops where conservators work on 9th-century stucco, or the **Gayer-Anderson Museum** next door with its extraordinary collection of Islamic art, Pharaonic antiquities, and Ottoman domestic furnishings, experienced with your scholar''s full interpretation.\n\nYour guide may also arrange a brief visit to the nearby **Mosque of Sultan Hassan** (1356–1363)—considered by many scholars the finest piece of Islamic architecture ever built—its colossal portal, pendant vaults, and cruciform plan representing the apex of Mamluk architectural ambition.\n\n---\n\n**Midday: Coptic Cairo – The Deepest Layers**\n\n*The Hanging Church – Theology in Art*\n\nEnter **Coptic Cairo** through the ancient **Roman fortress**, where your scholar explains the archaeological layers visible in the walls: Roman-era construction techniques at the base, Byzantine modifications in the upper courses, and the way Coptic churches were deliberately built within the fortress—seeking both physical protection and symbolic continuity with Egypt''s pre-Islamic past.\n\nThe **Hanging Church** becomes a private seminar in Coptic art and theology. Your scholar reads the iconographic programme of the church as a unified statement of faith: the ceiling''s Ark symbolism (the church as vessel of salvation), the pulpit''s Christological message (the dark column of Judas amid the white columns of fidelity), and the icons'' stylistic evolution from late antique naturalism through medieval abstraction to the distinctive Coptic style that blends Egyptian, Byzantine, and indigenous artistic traditions.\n\nYour scholar explains the Coptic liturgical tradition—the use of the **Coptic language** (the last living descendant of ancient Egyptian) in worship, the seven sacraments, and the monastic tradition that began in the Egyptian desert with Saint Anthony and Saint Pachomius before spreading to the entire Christian world.\n\n*Abu Serga – The Archaeology of Faith*\n\nAt **Abu Serga**, your scholar provides the full archaeological and theological context. The church''s multiple building phases are explained, the basilica plan interpreted in relation to early Christian worship, and the **crypt** experienced as both a devotional space and an archaeological site.\n\nYour scholar traces the **Flight into Egypt** tradition through its literary, liturgical, and archaeological sources—from the Gospel of Matthew through Coptic hagiography to modern archaeological investigation. The route traditionally ascribed to the Holy Family—from Sinai through the Delta, southward along the Nile, and back—is mapped against known ancient routes and settlements.\n\nIf your interests extend deeper, your scholar can arrange access to spaces within Coptic Cairo not generally open to tourists—restoration workshops, manuscript collections, or private chapels within the fortress precinct.\n\n*Ben Ezra Synagogue – The Scholar''s Treasure*\n\nThe **Ben Ezra Synagogue** and the **Cairo Geniza** receive the attention of a scholar who understands their full significance. The Geniza discovery is presented not merely as a dramatic story but as a revolution in historical methodology: 300,000 fragments that opened a window onto a medieval world of astonishing complexity—Jewish philosophers debating with Muslim theologians, Christian and Jewish merchants partnering in Mediterranean trade, women writing love letters, children doing homework, and doctors prescribing remedies.\n\nYour scholar explains the work of S.D. Goitein, whose decades-long study of Geniza documents produced *A Mediterranean Society*—one of the most important works of social history ever written—and the ongoing digital cataloguing projects at Cambridge and other universities that continue to yield discoveries.\n\nA refined lunch is arranged at an exclusive venue—perhaps a private dining room at a historic hotel or a garden restaurant within Old Cairo—with cuisine matched to the day''s extraordinary intellectual standard.\n\n---\n\n**Afternoon: Mountains, Markets, and Gardens**\n\n*The Cave Church – Where Faith Meets Community*\n\nThe journey to **Mokattam** is framed by your scholar as a passage from ancient to contemporary—from the heritage preserved in museums and churches to the living, breathing faith of Cairo''s most remarkable community.\n\nThe **Cave Church** receives your scholar''s full interpretive attention: the theological programme of the biblical carvings, the artistic influences (Coptic, Western, contemporary Egyptian), and the engineering achievement of creating a church to seat 20,000 within a natural limestone cavern.\n\nThe **Saint Simon the Tanner** narrative is told with scholarly nuance—the 10th-century Fatimid context, the interfaith challenge posed by the caliph, and the mountain-moving miracle that remains a cornerstone of Coptic identity. Your scholar may connect this tradition to the broader Coptic experience of survival and resilience as a minority community.\n\nWith your scholar''s guidance, the **Zabbaleen** community is encountered with understanding and respect. Your guide explains the community''s origins, their extraordinary recycling achievement (an 80-85% recycling rate, among the highest in the world), and the ongoing social dynamics that make Mokattam a site of both inspiration and challenge.\n\n*Khan el-Khalili – The Master Artisan Experience*\n\nReturn to **Khan el-Khalili** for the ultimate artisan experience—private introductions arranged by your scholar to the bazaar''s most accomplished craftspeople:\n\n• A **master calligrapher** whose work has been exhibited internationally—a private demonstration of the art of Arabic script, with the opportunity to commission a personalised piece (your name or a chosen phrase rendered in classical thuluth or naskh script).\n\n• A **master goldsmith** whose family has worked in Khan el-Khalili for generations—a demonstration of traditional techniques (granulation, filigree, repoussé) and the chance to commission bespoke jewellery.\n\n• A **traditional perfumer** whose essential oil blends follow recipes passed through his family—a private fragrance consultation where you create a personalised scent from ingredients including Egyptian jasmine, Nubian musk, Siwan olive, and Upper Egyptian lotus.\n\nEach encounter is a personal introduction over tea—a conversation, not a transaction—facilitated by your scholar''s long-standing relationships within the bazaar.\n\n*Al-Azhar Park – Private Sunset*\n\nThe day''s finale unfolds at **Al-Azhar Park** as the sun descends toward Cairo''s western skyline. Your scholar leads you to the finest vantage point, and the panorama becomes the day''s final lesson: every monument visible has been visited or discussed, every minaret placed in its historical context, every dome and tower part of the story you''ve spent the day uncovering.\n\nA **private refreshment service** is arranged—fine tea, coffee, or chilled beverages with premium pastries—at a reserved table with unobstructed skyline views. As the call to prayer rises from a hundred mosques across the city, and the lights begin to glow along the medieval streets below, you experience the moment that travellers to Cairo have cherished for centuries: the ancient city, seen whole, at the hour when it is most beautiful.\n\nYour limousine returns you carrying memories of a day that revealed Cairo in its fullest depth—a city of faith, art, resilience, and extraordinary beauty.\n\n*Meals: Lunch*',
    ARRAY[
      'Personal PhD scholar (fully private)',
      'VIP access to restricted areas of mosques and churches',
      'Bab Zuweila private rooftop scholarly seminar',
      'Ibn Tulun with possible Mosque of Sultan Hassan visit',
      'Gayer-Anderson Museum with scholarly interpretation',
      'Hanging Church private art history masterclass',
      'Abu Serga crypt with archaeological context',
      'Ben Ezra Synagogue with full Geniza scholarship',
      'Cave Church with Zabbaleen community engagement',
      'Private master artisan introductions at Khan el-Khalili',
      'Al-Azhar Park private sunset refreshments',
      'Luxury limousine throughout'
    ],
    ARRAY[
      'Personal PhD scholar-guide (fully private)',
      'VIP access and special permits for restricted areas',
      'All entrance fees including Gayer-Anderson Museum',
      'Possible Mosque of Sultan Hassan addition (subject to schedule)',
      'Private limousine (Mercedes S-Class or equivalent)',
      'Fine dining lunch at exclusive venue',
      'Hotel/airport pickup and drop-off',
      'Private master artisan introductions at Khan el-Khalili',
      'Bespoke calligraphy or jewellery commissioning facilitated',
      'Private fragrance consultation with traditional perfumer',
      'Private refreshment service at Al-Azhar Park with skyline views',
      'Complimentary premium refreshments throughout',
      'Personalised scholarly briefing notes (digital)'
    ],
    'LUXURY TIER: Fully private with PhD scholar (specialist in Cairo''s religious heritage or Islamic/Coptic studies), luxury limousine, VIP access everywhere. Scholar should have published research on medieval Cairo and personal relationships with artisans and clergy. Private artisan introductions pre-arranged—calligrapher, goldsmith, perfumer. Al-Azhar Park private refreshments arranged in advance. Fine dining lunch at historic venue (Naguib Mahfouz Restaurant, Le Riad, or private arrangement). Possible Sultan Hassan addition if schedule permits—confirm with guide. For UHNW clients and serious cultural travellers.',
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
  RAISE NOTICE 'Migration 144 Complete!';
  RAISE NOTICE '============================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Content ID: %', v_content_id;
  RAISE NOTICE 'Created 4 tier variations for Grand Old Cairo Day Tour:';
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
WHERE cl.slug = 'grand-old-cairo-day-tour'
ORDER BY
  CASE cv.tier
    WHEN 'budget' THEN 1
    WHEN 'standard' THEN 2
    WHEN 'deluxe' THEN 3
    WHEN 'luxury' THEN 4
  END;
