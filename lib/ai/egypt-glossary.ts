// ============================================
// COMPREHENSIVE EGYPT TRAVEL ABBREVIATIONS
// ============================================
// Injected into the structured-mode prompt so the model correctly decodes
// industry shorthand (CAI/ASW, NTS/CRZ/RO/BB/FB, airline codes, etc.).

export const EGYPT_TRAVEL_GLOSSARY = `
=================================================================
EGYPTIAN TRAVEL INDUSTRY ABBREVIATIONS - COMPREHENSIVE GLOSSARY
=================================================================

CRITICAL: You MUST decode these abbreviations and follow the itinerary EXACTLY as written.
DO NOT add, remove, or reorder any activities. Convert ONLY what is written.

-----------------------------------------------------------------
AIRPORT & CITY CODES (IATA CODES)
-----------------------------------------------------------------
CAI = Cairo (Cairo International Airport)
ALX / ALY = Alexandria (Borg El Arab Airport)
ASW = Aswan (Aswan International Airport)
LXR = Luxor (Luxor International Airport)
HRG = Hurghada (Hurghada International Airport)
SSH = Sharm El Sheikh (Sharm El Sheikh International Airport)
RMF = Marsa Alam (Marsa Alam International Airport)
ABS = Abu Simbel (Abu Simbel Airport)
ATZ = Assiut (Assiut Airport)
MUH = Marsa Matrouh (Marsa Matrouh Airport)
PSD = Port Said (Port Said Airport)
TCP = Taba (Taba International Airport)
SKV = St. Catherine (St. Catherine International Airport)
HMB = Sohag (Sohag International Airport)
SPX = Sphinx/Giza (Sphinx International Airport)
DBB = Dabaa / El Alamein area
DAK = Dakhla Oasis (Dakhla Oasis Airport)
AAC = El Arish (El Arish International Airport)
EGH = El Gora (El Gora Airport)
UVL = El Kharga (El Kharga Airport)

COMMON CITY ABBREVIATIONS (non-IATA):
GZA = Giza
KOM = Kom Ombo
EDU / EDFU = Edfu
ESN = Esna
ABY = Abydos
DEN = Dendera
SAQ = Saqqara / Sakkara
MEM = Memphis
FAY = Fayoum
SIW = Siwa Oasis

-----------------------------------------------------------------
AIRLINE CODES (IATA)
-----------------------------------------------------------------
MS = EgyptAir (Egypt's national carrier)
BA = British Airways
TK = Turkish Airlines
QR = Qatar Airways
EK = Emirates
EY = Etihad Airways
LH = Lufthansa
AF = Air France
KL = KLM Royal Dutch
IB = Iberia
AZ = Alitalia / ITA Airways
SU = Aeroflot
FZ = FlyDubai
G9 = Air Arabia
XY = flynas
SV = Saudia (Saudi Arabian Airlines)
RJ = Royal Jordanian
ME = Middle East Airlines
GF = Gulf Air
WY = Oman Air
KU = Kuwait Airways
OS = Austrian Airlines
LX = Swiss International
SK = Scandinavian Airlines
AY = Finnair
LO = LOT Polish Airlines
NP = Nile Air (Egyptian low-cost)
SM = Air Cairo

-----------------------------------------------------------------
ACCOMMODATION CODES
-----------------------------------------------------------------
NTS = Nights (e.g., "3NTS" = 3 nights stay)
HTL = Hotel
CRZ = Cruise / Nile Cruise
OVN = Overnight
C/IN = Check-in
C/OUT = Check-out (disembarkation from cruise)

MEAL PLANS:
RO = Room Only (no meals)
BB = Bed & Breakfast (breakfast only)
HB = Half Board (breakfast + dinner)
FB = Full Board (breakfast + lunch + dinner)
AI = All Inclusive (all meals + drinks + snacks)
UAI = Ultra All Inclusive (premium AI with top-shelf drinks, room service)
SC = Self Catering

-----------------------------------------------------------------
DAY & TIME NOTATION
-----------------------------------------------------------------
D1, D2, D3... = Day 1, Day 2, Day 3...
"D1 CAI" = Day 1 in Cairo
"D3 CAI/ASW" = Day 3: Travel from Cairo to Aswan
"/" between cities = transfer/travel between those cities
@ = at (time), e.g., "arrive @05:10" = arrive at 05:10

-----------------------------------------------------------------
CRITICAL: ENTRANCE FEE MARKERS
-----------------------------------------------------------------
(INSIDE) = Entrance fee REQUIRED - guests will enter the site
(OUTSIDE) = NO entrance fee - photo stop only, viewing from outside

Examples:
- "Alexandria Library (OUTSIDE)" = Photo stop, NO entrance fee
- "Pompey's Pillar (INSIDE)" = Entrance fee required
- "Pyramids" with no marker = Assume entrance included

-----------------------------------------------------------------
FREE DAYS AND SAILING DAYS
-----------------------------------------------------------------
When a day shows ONLY the location with NO activities:
- "D5 CRZ" = Sailing day on cruise (no tours, relaxing on board)
- "D8 HRG" = Free day in Hurghada (no scheduled activities)

Convert these to:
- Sailing days: title = "Sailing Day" or "Day at Leisure on Nile"
- Free days: title = "Free Day" or "Day at Leisure"

-----------------------------------------------------------------
MEALS IN ITINERARY
-----------------------------------------------------------------
B = Breakfast
L = Lunch
D = Dinner
"L" at end of day = Lunch included
"Chinese Dinner" = Dinner at Chinese restaurant
"Pigeon Lunch" = Lunch featuring Egyptian pigeon dish

-----------------------------------------------------------------
AIRPORT & HOTEL SERVICES (EGYPT TRAVEL INDUSTRY STANDARD)
-----------------------------------------------------------------

AIRPORT SERVICES (add when flights arrive/depart):
- International arrival: Airport meet & assist, visa assistance, luggage help, transfer to vehicle
- Domestic arrival: Airport meet & assist, luggage help, transfer to vehicle
- Departure: Hotel to airport transfer, check-in assistance

HOTEL SERVICES (add when):
- Check-in to hotel (first time in a city)
- Check-out from hotel (leaving city)
- Check-in to cruise (C/IN CRZ, "check in CRZ")
- Check-out from cruise (C/OUT CRZ)
- Moving from one city to another

-----------------------------------------------------------------
COMMON PATTERNS - EXAMPLES
-----------------------------------------------------------------
"2NTS CAI + 3NTS CRZ + 3NTS HRG"
= 2 nights Cairo + 3 nights Cruise + 3 nights Hurghada
= Total: 2+3+3 = 8 nights = 9 DAYS

"D1 CAI/ALX/CAI Arrive MS956@05:10, Pompey's Pillar (INSIDE), Library (OUTSIDE), L, back to CAI"
= Day 1: Arrive Cairo, then FULL DAY TRIP to Alexandria with sites, lunch, return to Cairo
= This is NOT just arrival - it's arrival + full day tour!

"D5 CRZ" (with nothing else)
= Day 5: Sailing day, no activities, relaxing on cruise

"D8 HRG" (with nothing else)
= Day 8: Free day in Hurghada, no scheduled activities

"C/OUT CRZ, LXR/HRG" = Check out of cruise, then travel from Luxor to Hurghada

-----------------------------------------------------------------
IMPORTANT CALCULATION RULE
-----------------------------------------------------------------
Number of DAYS = Number of NIGHTS + 1

Example: "2NTS CAI + 3NTS CRZ + 3NTS HRG"
- Nights: 2 + 3 + 3 = 8 nights
- Days: 8 + 1 = 9 days (D1 through D9)

-----------------------------------------------------------------
CRITICAL RULE: FOLLOW EXACTLY
-----------------------------------------------------------------
DO NOT add attractions not mentioned in the original!
DO NOT reorder days!
DO NOT skip any day!
If Abu Simbel is NOT mentioned, do NOT add it!
If a day just says "CRZ", it's a SAILING day with NO tours!
=================================================================
`
