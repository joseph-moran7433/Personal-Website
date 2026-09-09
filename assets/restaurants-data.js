// ─────────────────────────────────────────────────────────────────
// NEARBY EATS DATA
// A hand-curated list of restaurants Joseph actually vouches for —
// no crowdsourcing, no submissions. Each entry's lat/lon is geocoded
// once (from its zip) at authoring time, so a search only needs to
// geocode the visitor's own zip or city, then it's just distance math
// against this list.
//
// To add a restaurant: look up its zip's coordinates (e.g. visiting
// https://api.zippopotam.us/us/<zip> in a browser gives you
// "latitude"/"longitude" directly — swap "us" for another country
// code, e.g. "es", for non-US zips), then add an entry below.
//
// cuisines is its own list here, not Recipe Finder's — it adds
// "spanish", "bakery", "bbq", and "seafood" on top of the shared base
// set, since those come up for restaurants but not home recipes.
//
// mealTypes: which of "breakfast" | "lunch" | "dinner" the place is
// realistically open for, based on its posted hours — used by the
// meal filter. hours/knownFor are just display text, not parsed.
// ─────────────────────────────────────────────────────────────────

const RESTAURANT_CUISINE_OPTIONS = [
  { value: "italian", label: "Italian" },
  { value: "mexican", label: "Mexican" },
  { value: "asian", label: "Asian" },
  { value: "greek", label: "Greek & Mediterranean" },
  { value: "spanish", label: "Spanish" },
  { value: "irish", label: "Irish" },
  { value: "french", label: "French" },
  { value: "american", label: "American / Classic" },
  { value: "caribbean", label: "Caribbean & Latin" },
  { value: "bakery", label: "Bakery & Café" },
  { value: "bbq", label: "BBQ" },
  { value: "seafood", label: "Seafood" }
];

const RESTAURANT_MEAL_OPTIONS = [
  { value: "breakfast", label: "Breakfast" },
  { value: "lunch", label: "Lunch" },
  { value: "dinner", label: "Dinner" }
];

const restaurants = [
  {
    name: "LaScala's Beach House", zip: "08203", cuisines: ["italian"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 12–10pm, Fri 12pm–1am, Sat 11am–1am, Sun 11am–10pm",
    knownFor: "Seafood and Italian-American beach house fare",
    lat: 39.3702, lon: -74.4940, city: "Brigantine", state: "NJ"
  },
  {
    name: "Salsa Mexicana", zip: "11570", cuisines: ["mexican"],
    mealTypes: ["lunch", "dinner"],
    hours: "Tue–Thu 3–9:30pm, Fri 3–10pm, Sat 1–10pm, Sun 1–9pm; closed Mon",
    knownFor: "Sit-down Mexican classics",
    lat: 40.6637, lon: -73.6380, city: "Rockville Centre", state: "NY"
  },
  {
    name: "Dos Vargas Taqueria", zip: "11570", cuisines: ["mexican"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–10pm, Sun 12–10pm",
    knownFor: "Tacos and quick Mexican",
    lat: 40.6637, lon: -73.6380, city: "Rockville Centre", state: "NY"
  },
  {
    name: "The French Workshop", zip: "11530", cuisines: ["french", "bakery"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Thu 7am–9pm, Fri 7am–10pm, Sat–Sun 8am–9/10pm",
    knownFor: "French pastries, bread, and coffee",
    note: "Bakery and coffee.",
    lat: 40.7245, lon: -73.6487, city: "Garden City", state: "NY"
  },
  {
    name: "Caracara Mexican Grill", zip: "11735", cuisines: ["mexican"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri lunch 12–3pm; dinner Mon–Thu 3–9pm, Fri–Sat 12–10pm, Sun 12–9pm",
    knownFor: "Tableside guacamole and margaritas",
    lat: 40.7315, lon: -73.4327, city: "Farmingdale", state: "NY"
  },
  {
    name: "Caracara Mexican Grill", zip: "11731", cuisines: ["mexican"],
    mealTypes: ["lunch", "dinner"],
    hours: "Closed Mon; Tue–Thu 12–9pm, Fri–Sat 12–10pm, Sun 12–9pm",
    knownFor: "Tableside guacamole and margaritas",
    lat: 40.8570, lon: -73.3146, city: "East Northport", state: "NY"
  },
  {
    name: "Heritage", zip: "10018", cuisines: ["italian"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily 11am–11pm",
    knownFor: "Wood-fired pizza and Italian small plates",
    note: "By Bryant Park.",
    lat: 40.7547, lon: -73.9925, city: "New York", state: "NY"
  },
  {
    name: "Naya", zip: "10036", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily 10:30am–9pm",
    knownFor: "Customizable Lebanese bowls, rolls, and pitas",
    note: "By Bryant Park.",
    lat: 40.7597, lon: -73.9918, city: "New York", state: "NY"
  },
  {
    name: "Cava", zip: "06830", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 41.0427, lon: -73.6262, city: "Greenwich", state: "CT"
  },
  {
    name: "Cava", zip: "11590", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 40.7557, lon: -73.5723, city: "Westbury", state: "NY"
  },
  {
    name: "Cava", zip: "10917", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 41.3268, lon: -74.1220, city: "Central Valley", state: "NY"
  },
  {
    name: "Cava", zip: "28303", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 35.0742, lon: -78.9650, city: "Fayetteville", state: "NC"
  },
  {
    name: "A Better Place Bar & Grill", zip: "10917", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 11:30am–12am, Fri–Sat 11:30am–2am, Sun 11am–12am",
    knownFor: "Burgers, wings, and a big beer list",
    lat: 41.3268, lon: -74.1220, city: "Central Valley", state: "NY"
  },
  {
    name: "Orienta Restaurant", zip: "06830", cuisines: ["asian"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 11:45am–2pm & 4:30–9pm, Fri–Sat 11:45am–10pm, Sun 4:30–8:30pm",
    knownFor: "French-Vietnamese fusion",
    note: "Vietnamese.",
    lat: 41.0427, lon: -73.6262, city: "Greenwich", state: "CT"
  },
  {
    name: "Zaza Italian Gastrobar", zip: "06901", cuisines: ["italian"],
    mealTypes: ["lunch", "dinner"],
    hours: "Kitchen: Mon–Thu 11am–9:30pm, Fri–Sat 11am–10:45pm, Sun 11am–9pm",
    knownFor: "Wood-fired pizza and Italian small plates",
    lat: 41.0531, lon: -73.5390, city: "Stamford", state: "CT"
  },
  {
    name: "Mecha Noodle Bar", zip: "06901", cuisines: ["asian"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11:30am–10pm, Sun 11:30am–9pm",
    knownFor: "Ramen and Asian noodle bowls",
    note: "On Bedford Street.",
    lat: 41.0531, lon: -73.5390, city: "Stamford", state: "CT"
  },
  {
    name: "La Selva", zip: "08025", cuisines: ["spanish"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily 12:30pm–12:30am (lunch until 6pm, dinner after)",
    knownFor: "Grilled meats and steaks",
    note: "Steakhouse in Barcelona.",
    lat: 41.4048, lon: 2.1763, city: "Barcelona", state: "Spain"
  },
  {
    name: "El Nacional", zip: "08007", cuisines: ["spanish"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily from noon — kitchen open until midnight or 1am depending on the day",
    knownFor: "Tapas, drinks, and grilled meats in a historic hall",
    note: "Drinks, meats, and tapas in Barcelona.",
    lat: 41.3900, lon: 2.1682, city: "Barcelona", state: "Spain"
  },
  {
    name: "Bubba's 33", zip: "28314", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–12am (varies by location)",
    knownFor: "Burgers, wings, and cold beer",
    lat: 35.0583, lon: -79.0080, city: "Fayetteville", state: "NC"
  },
  {
    name: "Carolina Ale House", zip: "28314", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–12/1am (varies by location)",
    knownFor: "Wings, beer, and sports on TV",
    lat: 35.0583, lon: -79.0080, city: "Fayetteville", state: "NC"
  },
  {
    name: "Don Ramon's Taco Shop", zip: "28303", cuisines: ["mexican"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Fri 8am–8pm, Sat 9am–7pm; closed Sun",
    knownFor: "Tacos",
    lat: 35.0742, lon: -78.9650, city: "Fayetteville", state: "NC"
  },
  {
    name: "Taqueria El Refugio", zip: "28303", cuisines: ["mexican"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat 9am–9pm, Sun 9am–7pm",
    knownFor: "Tacos and quick Mexican",
    lat: 35.0742, lon: -78.9650, city: "Fayetteville", state: "NC"
  },
  // ── Chick-fil-A: broad metro coverage (not a full nationwide list) ──
  {
    name: "Chick-fil-A", zip: "10036", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 40.7597, lon: -73.9918, city: "New York", state: "NY"
  },
  {
    name: "Chick-fil-A", zip: "90017", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 34.0559, lon: -118.2666, city: "Los Angeles", state: "CA"
  },
  {
    name: "Chick-fil-A", zip: "60601", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 41.8858, lon: -87.6181, city: "Chicago", state: "IL"
  },
  {
    name: "Chick-fil-A", zip: "77010", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 29.7543, lon: -95.3609, city: "Houston", state: "TX"
  },
  {
    name: "Chick-fil-A", zip: "85016", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 33.5021, lon: -112.0305, city: "Phoenix", state: "AZ"
  },
  {
    name: "Chick-fil-A", zip: "19114", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 40.0634, lon: -74.999, city: "Philadelphia", state: "PA"
  },
  {
    name: "Chick-fil-A", zip: "78209", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 29.4821, lon: -98.4554, city: "San Antonio", state: "TX"
  },
  {
    name: "Chick-fil-A", zip: "92111", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 32.7972, lon: -117.1708, city: "San Diego", state: "CA"
  },
  {
    name: "Chick-fil-A", zip: "75202", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 32.7781, lon: -96.8054, city: "Dallas", state: "TX"
  },
  {
    name: "Chick-fil-A", zip: "78701", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 30.2713, lon: -97.7426, city: "Austin", state: "TX"
  },
  {
    name: "Chick-fil-A", zip: "32246", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 30.2933, lon: -81.5092, city: "Jacksonville", state: "FL"
  },
  {
    name: "Chick-fil-A", zip: "76107", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 32.7392, lon: -97.3852, city: "Fort Worth", state: "TX"
  },
  {
    name: "Chick-fil-A", zip: "43201", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 39.9952, lon: -83.0047, city: "Columbus", state: "OH"
  },
  {
    name: "Chick-fil-A", zip: "28209", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 35.1796, lon: -80.8559, city: "Charlotte", state: "NC"
  },
  {
    name: "Chick-fil-A", zip: "94015", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 37.6787, lon: -122.478, city: "Daly City", state: "CA"
  },
  {
    name: "Chick-fil-A", zip: "46204", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 39.772, lon: -86.1535, city: "Indianapolis", state: "IN"
  },
  {
    name: "Chick-fil-A", zip: "98133", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 47.7377, lon: -122.3431, city: "Seattle", state: "WA"
  },
  {
    name: "Chick-fil-A", zip: "80222", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 39.671, lon: -104.9279, city: "Denver", state: "CO"
  },
  {
    name: "Chick-fil-A", zip: "20001", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 38.9122, lon: -77.0177, city: "Washington", state: "DC"
  },
  {
    name: "Chick-fil-A", zip: "02116", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 42.3492, lon: -71.0768, city: "Boston", state: "MA"
  },
  {
    name: "Chick-fil-A", zip: "37203", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 36.1504, lon: -86.7916, city: "Nashville", state: "TN"
  },
  {
    name: "Chick-fil-A", zip: "48226", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 42.3333, lon: -83.0484, city: "Detroit", state: "MI"
  },
  {
    name: "Chick-fil-A", zip: "73112", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 35.5184, lon: -97.5746, city: "Oklahoma City", state: "OK"
  },
  {
    name: "Chick-fil-A", zip: "97216", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 45.5137, lon: -122.5569, city: "Portland", state: "OR"
  },
  {
    name: "Chick-fil-A", zip: "89109", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 36.126, lon: -115.1454, city: "Las Vegas", state: "NV"
  },
  {
    name: "Chick-fil-A", zip: "38117", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 35.1124, lon: -89.9034, city: "Memphis", state: "TN"
  },
  {
    name: "Chick-fil-A", zip: "40218", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 38.189, lon: -85.654, city: "Louisville", state: "KY"
  },
  {
    name: "Chick-fil-A", zip: "21202", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 39.2998, lon: -76.6075, city: "Baltimore", state: "MD"
  },
  {
    name: "Chick-fil-A", zip: "53203", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 43.0403, lon: -87.9154, city: "Milwaukee", state: "WI"
  },
  {
    name: "Chick-fil-A", zip: "30361", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 33.8444, lon: -84.474, city: "Atlanta", state: "GA"
  },
  {
    name: "Chick-fil-A", zip: "33136", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 25.7864, lon: -80.2042, city: "Miami", state: "FL"
  },
  {
    name: "Chick-fil-A", zip: "55414", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 44.9779, lon: -93.2199, city: "Minneapolis", state: "MN"
  },
  {
    name: "Chick-fil-A", zip: "64114", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 38.9621, lon: -94.5959, city: "Kansas City", state: "MO"
  },
  {
    name: "Chick-fil-A", zip: "27605", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Mon–Sat ~6:30am–9/10pm; closed Sundays (varies by location)",
    knownFor: "Chicken sandwiches and waffle fries",
    lat: 35.7908, lon: -78.653, city: "Raleigh", state: "NC"
  },

  // ── IHOP: broad metro coverage (not a full nationwide list) ──
  {
    name: "IHOP", zip: "10003", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 40.7313, lon: -73.9892, city: "New York", state: "NY"
  },
  {
    name: "IHOP", zip: "90036", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 34.0699, lon: -118.3492, city: "Los Angeles", state: "CA"
  },
  {
    name: "IHOP", zip: "60647", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 41.9209, lon: -87.7043, city: "Chicago", state: "IL"
  },
  {
    name: "IHOP", zip: "77057", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 29.7422, lon: -95.4903, city: "Houston", state: "TX"
  },
  {
    name: "IHOP", zip: "85008", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 33.4665, lon: -111.9984, city: "Phoenix", state: "AZ"
  },
  {
    name: "IHOP", zip: "19107", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 39.9487, lon: -75.1593, city: "Philadelphia", state: "PA"
  },
  {
    name: "IHOP", zip: "78209", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 29.4821, lon: -98.4554, city: "San Antonio", state: "TX"
  },
  {
    name: "IHOP", zip: "92111", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 32.7972, lon: -117.1708, city: "San Diego", state: "CA"
  },
  {
    name: "IHOP", zip: "75214", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 32.8248, lon: -96.7498, city: "Dallas", state: "TX"
  },
  {
    name: "IHOP", zip: "78701", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 30.2713, lon: -97.7426, city: "Austin", state: "TX"
  },
  {
    name: "IHOP", zip: "32211", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 30.348, lon: -81.5882, city: "Jacksonville", state: "FL"
  },
  {
    name: "IHOP", zip: "76107", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 32.7392, lon: -97.3852, city: "Fort Worth", state: "TX"
  },
  {
    name: "IHOP", zip: "43201", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 39.9952, lon: -83.0047, city: "Columbus", state: "OH"
  },
  {
    name: "IHOP", zip: "28262", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 35.3183, lon: -80.7476, city: "Charlotte", state: "NC"
  },
  {
    name: "IHOP", zip: "94133", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 37.8002, lon: -122.4091, city: "San Francisco", state: "CA"
  },
  {
    name: "IHOP", zip: "46254", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 39.849, lon: -86.272, city: "Indianapolis", state: "IN"
  },
  {
    name: "IHOP", zip: "98122", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 47.6116, lon: -122.3056, city: "Seattle", state: "WA"
  },
  {
    name: "IHOP", zip: "80222", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 39.671, lon: -104.9279, city: "Denver", state: "CO"
  },
  {
    name: "IHOP", zip: "20010", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 38.9327, lon: -77.0322, city: "Washington", state: "DC"
  },
  {
    name: "IHOP", zip: "02135", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 42.3478, lon: -71.1566, city: "Boston", state: "MA"
  },
  {
    name: "IHOP", zip: "37211", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 36.0725, lon: -86.724, city: "Nashville", state: "TN"
  },
  {
    name: "IHOP", zip: "48226", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 42.3333, lon: -83.0484, city: "Detroit", state: "MI"
  },
  {
    name: "IHOP", zip: "73118", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 35.5136, lon: -97.5319, city: "Oklahoma City", state: "OK"
  },
  {
    name: "IHOP", zip: "97266", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 45.4762, lon: -122.5596, city: "Portland", state: "OR"
  },
  {
    name: "IHOP", zip: "89121", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 36.1232, lon: -115.0902, city: "Las Vegas", state: "NV"
  },
  {
    name: "IHOP", zip: "38104", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 35.1334, lon: -90.0046, city: "Memphis", state: "TN"
  },
  {
    name: "IHOP", zip: "40222", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 38.2674, lon: -85.6237, city: "Louisville", state: "KY"
  },
  {
    name: "IHOP", zip: "21202", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 39.2998, lon: -76.6075, city: "Baltimore", state: "MD"
  },
  {
    name: "IHOP", zip: "53214", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 43.0215, lon: -88.0176, city: "Milwaukee", state: "WI"
  },
  {
    name: "IHOP", zip: "30329", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 33.8236, lon: -84.3214, city: "Atlanta", state: "GA"
  },
  {
    name: "IHOP", zip: "33155", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 25.7392, lon: -80.3103, city: "Miami", state: "FL"
  },
  {
    name: "IHOP", zip: "55421", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 45.0523, lon: -93.2541, city: "Minneapolis", state: "MN"
  },
  {
    name: "IHOP", zip: "64117", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 39.1651, lon: -94.5256, city: "Kansas City", state: "MO"
  },
  {
    name: "IHOP", zip: "27604", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily, many locations open very early to late or 24 hours (varies)",
    knownFor: "All-day breakfast — pancakes and more",
    lat: 35.8334, lon: -78.5799, city: "Raleigh", state: "NC"
  },

  // ── Cava: broad metro coverage (not a full nationwide list; a few metros skipped where Cava has no open location yet) ──
  {
    name: "Cava", zip: "10018", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 40.7547, lon: -73.9925, city: "New York", state: "NY"
  },
  {
    name: "Cava", zip: "90089", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 33.7866, lon: -118.2987, city: "Los Angeles", state: "CA"
  },
  {
    name: "Cava", zip: "60611", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 41.8971, lon: -87.6223, city: "Chicago", state: "IL"
  },
  {
    name: "Cava", zip: "77008", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 29.7991, lon: -95.4118, city: "Houston", state: "TX"
  },
  {
    name: "Cava", zip: "85018", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 33.4958, lon: -111.9883, city: "Phoenix", state: "AZ"
  },
  {
    name: "Cava", zip: "19103", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 39.9513, lon: -75.1741, city: "Philadelphia", state: "PA"
  },
  {
    name: "Cava", zip: "78209", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 29.4821, lon: -98.4554, city: "San Antonio", state: "TX"
  },
  {
    name: "Cava", zip: "92130", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 32.9555, lon: -117.2252, city: "San Diego", state: "CA"
  },
  {
    name: "Cava", zip: "75201", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 32.7904, lon: -96.8044, city: "Dallas", state: "TX"
  },
  {
    name: "Cava", zip: "78701", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 30.2713, lon: -97.7426, city: "Austin", state: "TX"
  },
  {
    name: "Cava", zip: "32202", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 30.3299, lon: -81.6517, city: "Jacksonville", state: "FL"
  },
  {
    name: "Cava", zip: "76107", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 32.7392, lon: -97.3852, city: "Fort Worth", state: "TX"
  },
  {
    name: "Cava", zip: "43240", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 40.1454, lon: -82.9817, city: "Columbus", state: "OH"
  },
  {
    name: "Cava", zip: "28209", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 35.1796, lon: -80.8559, city: "Charlotte", state: "NC"
  },
  {
    name: "Cava", zip: "46202", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 39.7851, lon: -86.1595, city: "Indianapolis", state: "IN"
  },
  {
    name: "Cava", zip: "80202", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 39.7491, lon: -104.9946, city: "Denver", state: "CO"
  },
  {
    name: "Cava", zip: "20036", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 38.9087, lon: -77.0414, city: "Washington", state: "DC"
  },
  {
    name: "Cava", zip: "02116", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 42.3492, lon: -71.0768, city: "Boston", state: "MA"
  },
  {
    name: "Cava", zip: "37203", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 36.1504, lon: -86.7916, city: "Nashville", state: "TN"
  },
  {
    name: "Cava", zip: "48226", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 42.3333, lon: -83.0484, city: "Detroit", state: "MI"
  },
  {
    name: "Cava", zip: "73134", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 35.6174, lon: -97.5583, city: "Oklahoma City", state: "OK"
  },
  {
    name: "Cava", zip: "89149", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 36.2765, lon: -115.2885, city: "Las Vegas", state: "NV"
  },
  {
    name: "Cava", zip: "21224", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 39.2876, lon: -76.5568, city: "Baltimore", state: "MD"
  },
  {
    name: "Cava", zip: "30305", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 33.832, lon: -84.3851, city: "Atlanta", state: "GA"
  },
  {
    name: "Cava", zip: "33131", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 25.7629, lon: -80.1895, city: "Miami", state: "FL"
  },
  {
    name: "Cava", zip: "55414", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 44.9779, lon: -93.2199, city: "Minneapolis", state: "MN"
  },
  {
    name: "Cava", zip: "66202", cuisines: ["greek"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~10:30am–9:30pm (varies by location)",
    knownFor: "Customizable Mediterranean bowls and pitas",
    lat: 39.0248, lon: -94.6826, city: "Mission", state: "KS"
  },
  {
    name: "Chopt", zip: "10036", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.7580, lon: -73.9855, city: "New York (Times Square)", state: "NY"
  },
  {
    name: "Chopt", zip: "10003", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.7359, lon: -73.9911, city: "New York (Union Square)", state: "NY"
  },
  {
    name: "Chopt", zip: "10018", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.7536, lon: -73.9832, city: "New York (Bryant Park)", state: "NY"
  },
  {
    name: "Chopt", zip: "10001", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.7539, lon: -74.0022, city: "New York (Hudson Yards)", state: "NY"
  },
  {
    name: "Chopt", zip: "10583", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.0053, lon: -73.7965, city: "Scarsdale", state: "NY"
  },
  {
    name: "Chopt", zip: "10543", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.9490, lon: -73.7290, city: "Mamaroneck", state: "NY"
  },
  {
    name: "Chopt", zip: "11590", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.7557, lon: -73.5876, city: "Westbury", state: "NY"
  },
  {
    name: "Chopt", zip: "10522", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.0126, lon: -73.8712, city: "Dobbs Ferry", state: "NY"
  },
  {
    name: "Chopt", zip: "06830", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.0262, lon: -73.6282, city: "Greenwich", state: "CT"
  },
  {
    name: "Chopt", zip: "06905", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.1122, lon: -73.5387, city: "Stamford", state: "CT"
  },
  {
    name: "Chopt", zip: "06033", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.7129, lon: -72.6070, city: "Glastonbury", state: "CT"
  },
  {
    name: "Chopt", zip: "07652", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.9445, lon: -74.0754, city: "Paramus", state: "NJ"
  },
  {
    name: "Chopt", zip: "08540", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.3573, lon: -74.6672, city: "Princeton", state: "NJ"
  },
  {
    name: "Chopt", zip: "08034", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 39.9259, lon: -75.0273, city: "Cherry Hill", state: "NJ"
  },
  {
    name: "Chopt", zip: "07950", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.8290, lon: -74.4813, city: "Morris Plains", state: "NJ"
  },
  {
    name: "Chopt", zip: "19010", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.0223, lon: -75.3149, city: "Bryn Mawr", state: "PA"
  },
  {
    name: "Chopt", zip: "19073", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 39.9926, lon: -75.4085, city: "Newtown Square", state: "PA"
  },
  {
    name: "Chopt", zip: "19454", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 40.2101, lon: -75.2827, city: "North Wales", state: "PA"
  },
  {
    name: "Chopt", zip: "44145", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.4581, lon: -81.9184, city: "Westlake", state: "OH"
  },
  {
    name: "Chopt", zip: "44122", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 41.4670, lon: -81.4993, city: "Woodmere", state: "OH"
  },
  {
    name: "Chopt", zip: "20814", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.9847, lon: -77.0947, city: "Bethesda", state: "MD"
  },
  {
    name: "Chopt", zip: "20852", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 39.0508, lon: -77.1200, city: "Rockville", state: "MD"
  },
  {
    name: "Chopt", zip: "21204", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 39.4015, lon: -76.6019, city: "Towson", state: "MD"
  },
  {
    name: "Chopt", zip: "21401", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.9784, lon: -76.4922, city: "Annapolis", state: "MD"
  },
  {
    name: "Chopt", zip: "21208", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 39.3820, lon: -76.6816, city: "Pikesville", state: "MD"
  },
  {
    name: "Chopt", zip: "22203", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.8821, lon: -77.1116, city: "Arlington (Ballston)", state: "VA"
  },
  {
    name: "Chopt", zip: "22315", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.7726, lon: -77.1408, city: "Alexandria (Kingstowne)", state: "VA"
  },
  {
    name: "Chopt", zip: "22101", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.9339, lon: -77.1773, city: "McLean", state: "VA"
  },
  {
    name: "Chopt", zip: "23219", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 37.5407, lon: -77.4360, city: "Richmond", state: "VA"
  },
  {
    name: "Chopt", zip: "22903", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.0293, lon: -78.4767, city: "Charlottesville", state: "VA"
  },
  {
    name: "Chopt", zip: "20004", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.8974, lon: -77.0219, city: "Washington (Chinatown)", state: "DC"
  },
  {
    name: "Chopt", zip: "20002", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.8973, lon: -77.0063, city: "Washington (Union Station)", state: "DC"
  },
  {
    name: "Chopt", zip: "20005", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 38.8990, lon: -77.0281, city: "Washington (Metro Center)", state: "DC"
  },
  {
    name: "Chopt", zip: "28202", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 35.2271, lon: -80.8431, city: "Charlotte (Uptown)", state: "NC"
  },
  {
    name: "Chopt", zip: "27609", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 35.8420, lon: -78.6382, city: "Raleigh (North Ridge)", state: "NC"
  },
  {
    name: "Chopt", zip: "27514", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 35.9132, lon: -79.0558, city: "Chapel Hill", state: "NC"
  },
  {
    name: "Chopt", zip: "27103", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 36.0999, lon: -80.2853, city: "Winston-Salem", state: "NC"
  },
  {
    name: "Chopt", zip: "28403", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 34.2257, lon: -77.8857, city: "Wilmington", state: "NC"
  },
  {
    name: "Chopt", zip: "27408", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 36.0726, lon: -79.8264, city: "Greensboro (Friendly Center)", state: "NC"
  },
  {
    name: "Chopt", zip: "29206", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 34.0079, lon: -80.9756, city: "Columbia (Trenholm Plaza)", state: "SC"
  },
  {
    name: "Chopt", zip: "30319", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 33.8590, lon: -84.3410, city: "Atlanta (Brookhaven)", state: "GA"
  },
  {
    name: "Chopt", zip: "30305", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 33.8362, lon: -84.3822, city: "Atlanta (North Buckhead)", state: "GA"
  },
  {
    name: "Chopt", zip: "30068", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 33.9701, lon: -84.4494, city: "Marietta (East Cobb)", state: "GA"
  },
  {
    name: "Chopt", zip: "31406", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 32.0296, lon: -81.1637, city: "Savannah", state: "GA"
  },
  {
    name: "Chopt", zip: "30346", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 33.9304, lon: -84.3444, city: "Dunwoody (Perimeter)", state: "GA"
  },
  {
    name: "Chopt", zip: "37215", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 36.1022, lon: -86.8137, city: "Nashville (Green Hills)", state: "TN"
  },
  {
    name: "Chopt", zip: "37027", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 36.0331, lon: -86.7828, city: "Brentwood", state: "TN"
  },
  {
    name: "Chopt", zip: "35243", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 33.4515, lon: -86.7297, city: "Birmingham (The Summit)", state: "AL"
  },
  {
    name: "Chopt", zip: "35216", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Fri 10:30am–9pm, Sat–Sun 11am–8pm (varies by location)",
    knownFor: "Build-your-own salads and warm grain bowls",
    lat: 33.4479, lon: -86.7883, city: "Vestavia Hills", state: "AL"
  },
  {
    name: "Bareburger", zip: "10024", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7828, lon: -73.9812, city: "New York (Upper West Side – Broadway)", state: "NY"
  },
  {
    name: "Bareburger", zip: "10036", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7595, lon: -73.9906, city: "New York (Hell's Kitchen)", state: "NY"
  },
  {
    name: "Bareburger", zip: "10016", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7454, lon: -73.9807, city: "New York (Murray Hill)", state: "NY"
  },
  {
    name: "Bareburger", zip: "10025", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7947, lon: -73.9683, city: "New York (Upper West Side – Columbus Ave)", state: "NY"
  },
  {
    name: "Bareburger", zip: "10128", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7825, lon: -73.9482, city: "New York (Upper East Side)", state: "NY"
  },
  {
    name: "Bareburger", zip: "11201", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.6892, lon: -73.9926, city: "Brooklyn (Cobble Hill)", state: "NY"
  },
  {
    name: "Bareburger", zip: "11106", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7648, lon: -73.9235, city: "Astoria", state: "NY"
  },
  {
    name: "Bareburger", zip: "11361", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7626, lon: -73.7754, city: "Bayside", state: "NY"
  },
  {
    name: "Bareburger", zip: "11375", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7196, lon: -73.8448, city: "Forest Hills", state: "NY"
  },
  {
    name: "Bareburger", zip: "11101", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.7447, lon: -73.9565, city: "Long Island City", state: "NY"
  },
  {
    name: "Bareburger", zip: "11570", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.6631, lon: -73.6412, city: "Rockville Centre", state: "NY"
  },
  {
    name: "Bareburger", zip: "07624", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.9721, lon: -73.9615, city: "Closter", state: "NJ"
  },
  {
    name: "Bareburger", zip: "07020", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.8207, lon: -73.9762, city: "Edgewater", state: "NJ"
  },
  {
    name: "Bareburger", zip: "07042", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.8259, lon: -74.2090, city: "Montclair", state: "NJ"
  },
  {
    name: "Bareburger", zip: "07450", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.9793, lon: -74.1165, city: "Ridgewood", state: "NJ"
  },
  {
    name: "Bareburger", zip: "07091", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.6590, lon: -74.3474, city: "Westfield", state: "NJ"
  },
  {
    name: "Bareburger", zip: "07677", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.0260, lon: -74.0611, city: "Woodcliff Lake", state: "NJ"
  },
  {
    name: "Bareburger", zip: "06877", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.2815, lon: -73.4979, city: "Ridgefield", state: "CT"
  },
  {
    name: "Bareburger", zip: "06902", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.0501, lon: -73.5379, city: "Stamford", state: "CT"
  },
  {
    name: "Bareburger", zip: "06820", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.0776, lon: -73.4826, city: "Darien", state: "CT"
  },
  {
    name: "Bareburger", zip: "06033", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.7129, lon: -72.6070, city: "Glastonbury", state: "CT"
  },
  {
    name: "Bareburger", zip: "10530", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.0201, lon: -73.7929, city: "Hartsdale", state: "NY"
  },
  {
    name: "Bareburger", zip: "10549", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.2043, lon: -73.7276, city: "Mount Kisco", state: "NY"
  },
  {
    name: "Bareburger", zip: "10580", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.9818, lon: -73.6857, city: "Rye", state: "NY"
  },
  {
    name: "Bareburger", zip: "10917", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.3294, lon: -74.1250, city: "Central Valley (near Woodbury Common)", state: "NY"
  },
  {
    name: "Bareburger", zip: "10522", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 41.0126, lon: -73.8712, city: "Dobbs Ferry", state: "NY"
  },
  {
    name: "Bareburger", zip: "43215", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 39.9764, lon: -83.0043, city: "Columbus (Short North)", state: "OH"
  },
  {
    name: "Bareburger", zip: "43219", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Grass-fed, organic burgers and shakes",
    lat: 40.0286, lon: -82.9182, city: "Columbus (Easton Gateway)", state: "OH"
  },
  {
    name: "Mission BBQ", zip: "21042", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.2673, lon: -76.7983, city: "Ellicott City", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "20852", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.0508, lon: -77.1200, city: "Rockville", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "21061", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.1626, lon: -76.6247, city: "Glen Burnie (original location)", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "21740", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.6418, lon: -77.7200, city: "Hagerstown", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "21701", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.4143, lon: -77.4105, city: "Frederick", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "21224", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.2823, lon: -76.5766, city: "Baltimore (Canton)", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "21204", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.4015, lon: -76.6019, city: "Towson", state: "MD"
  },
  {
    name: "Mission BBQ", zip: "23462", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 36.8529, lon: -76.0346, city: "Virginia Beach", state: "VA"
  },
  {
    name: "Mission BBQ", zip: "22601", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.1857, lon: -78.1633, city: "Winchester", state: "VA"
  },
  {
    name: "Mission BBQ", zip: "22191", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 38.6581, lon: -77.2497, city: "Woodbridge", state: "VA"
  },
  {
    name: "Mission BBQ", zip: "23320", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 36.7682, lon: -76.2875, city: "Chesapeake", state: "VA"
  },
  {
    name: "Mission BBQ", zip: "20170", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 38.9695, lon: -77.3861, city: "Herndon", state: "VA"
  },
  {
    name: "Mission BBQ", zip: "23233", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 37.6260, lon: -77.5875, city: "Richmond (Glenside)", state: "VA"
  },
  {
    name: "Mission BBQ", zip: "44145", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 41.4581, lon: -81.9184, city: "Westlake", state: "OH"
  },
  {
    name: "Mission BBQ", zip: "18974", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 40.1937, lon: -75.0921, city: "Warminster", state: "PA"
  },
  {
    name: "Mission BBQ", zip: "18052", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 40.6595, lon: -75.5088, city: "Whitehall Township", state: "PA"
  },
  {
    name: "Mission BBQ", zip: "19610", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 40.3329, lon: -75.9635, city: "Wyomissing", state: "PA"
  },
  {
    name: "Mission BBQ", zip: "17402", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.9626, lon: -76.6664, city: "York", state: "PA"
  },
  {
    name: "Mission BBQ", zip: "15146", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 40.4310, lon: -79.7889, city: "Monroeville", state: "PA"
  },
  {
    name: "Mission BBQ", zip: "34613", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 28.5561, lon: -82.3879, city: "Brooksville", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "33326", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 26.1004, lon: -80.3997, city: "Weston", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "33634", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 28.0067, lon: -82.5729, city: "Tampa (Town & Country)", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "33613", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 28.0625, lon: -82.3903, city: "Tampa (Temple Terrace)", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "32246", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 30.2400, lon: -81.5085, city: "Jacksonville (St. Johns)", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "33907", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 26.5906, lon: -81.8898, city: "Fort Myers", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "33334", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 26.1795, lon: -80.1256, city: "Fort Lauderdale", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "33914", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 26.5443, lon: -82.0300, city: "Cape Coral", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "34108", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 26.2426, lon: -81.7787, city: "Naples", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "34952", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 27.2860, lon: -80.3529, city: "Port St. Lucie", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "32822", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 28.4674, lon: -81.3095, city: "Orlando (Lee Vista)", state: "FL"
  },
  {
    name: "Mission BBQ", zip: "06477", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 41.2795, lon: -73.0287, city: "Orange", state: "CT"
  },
  {
    name: "Mission BBQ", zip: "49525", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 42.9989, lon: -85.5658, city: "Grand Rapids", state: "MI"
  },
  {
    name: "Mission BBQ", zip: "40207", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 38.2450, lon: -85.6394, city: "St. Matthews", state: "KY"
  },
  {
    name: "Mission BBQ", zip: "85253", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 33.5312, lon: -111.9520, city: "Paradise Valley", state: "AZ"
  },
  {
    name: "Mission BBQ", zip: "85374", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 33.6292, lon: -112.3679, city: "Surprise", state: "AZ"
  },
  {
    name: "Mission BBQ", zip: "85338", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 33.4353, lon: -112.3576, city: "Goodyear", state: "AZ"
  },
  {
    name: "Mission BBQ", zip: "80921", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.0142, lon: -104.7939, city: "Colorado Springs", state: "CO"
  },
  {
    name: "Mission BBQ", zip: "80003", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.8028, lon: -105.0875, city: "Arvada", state: "CO"
  },
  {
    name: "Mission BBQ", zip: "61614", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 40.7642, lon: -89.6151, city: "Peoria", state: "IL"
  },
  {
    name: "Mission BBQ", zip: "47715", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 37.9748, lon: -87.5211, city: "Evansville", state: "IN"
  },
  {
    name: "Mission BBQ", zip: "52807", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 41.5871, lon: -90.5205, city: "Davenport", state: "IA"
  },
  {
    name: "Mission BBQ", zip: "08034", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.9259, lon: -75.0273, city: "Cherry Hill", state: "NJ"
  },
  {
    name: "Mission BBQ", zip: "08081", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.7412, lon: -74.9635, city: "Sicklerville", state: "NJ"
  },
  {
    name: "Mission BBQ", zip: "08096", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.8368, lon: -75.1188, city: "Deptford", state: "NJ"
  },
  {
    name: "Mission BBQ", zip: "12205", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 42.7284, lon: -73.8154, city: "Albany (Colonie)", state: "NY"
  },
  {
    name: "Mission BBQ", zip: "27613", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 35.8987, lon: -78.6836, city: "Raleigh", state: "NC"
  },
  {
    name: "Mission BBQ", zip: "27834", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 35.6127, lon: -77.3663, city: "Greenville", state: "NC"
  },
  {
    name: "Mission BBQ", zip: "19803", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 39.8065, lon: -75.5466, city: "Wilmington (Concord Pike)", state: "DE"
  },
  {
    name: "Mission BBQ", zip: "29582", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 33.8125, lon: -78.6805, city: "North Myrtle Beach", state: "SC"
  },
  {
    name: "Mission BBQ", zip: "29212", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 34.0537, lon: -81.1620, city: "Columbia", state: "SC"
  },
  {
    name: "Mission BBQ", zip: "37214", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 36.2081, lon: -86.6906, city: "Nashville (Opry Mills)", state: "TN"
  },
  {
    name: "Mission BBQ", zip: "37129", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 11:30am–8pm",
    knownFor: "Smoked brisket, ribs, and pulled pork with a side of patriotism",
    lat: 35.8264, lon: -86.3921, city: "Murfreesboro", state: "TN"
  },
  {
    name: "One Hot Mama's", zip: "29928", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily 11am–9:30pm (bar bites Thu–Sun until 11pm)",
    knownFor: "Hickory-smoked BBQ ribs and Southern comfort classics",
    lat: 32.1544, lon: -80.7669, city: "Hilton Head Island", state: "SC"
  },
  {
    name: "Frankie Bones", zip: "29926", cuisines: ["italian"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Sat 11am–9pm, Sun 10am–9pm (Sunday brunch 10am–3pm)",
    knownFor: "Wood-fired pizzas and Northern Italian classics on Main Street",
    lat: 32.2185, lon: -80.7515, city: "Hilton Head Island", state: "SC"
  },
  {
    name: "Victoria & Albert's", zip: "32830", cuisines: ["american"],
    mealTypes: ["dinner"],
    hours: "Tue–Sat, single seating 5:30–8:05pm; closed Sun–Mon",
    knownFor: "AAA Five Diamond prix-fixe fine dining inside Disney's Grand Floridian",
    lat: 28.4103, lon: -81.5837, city: "Lake Buena Vista (Orlando)", state: "FL"
  },
  {
    name: "The Olde Pink House", zip: "31401", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Lunch Tue–Sat 11am–2:30pm, Dinner Sun–Thu 5–10:30pm, Fri–Sat 5–11pm",
    knownFor: "Candlelit Southern fine dining in an 18th-century pink mansion",
    lat: 32.0796, lon: -81.0899, city: "Savannah", state: "GA"
  },
  {
    name: "Poseidon", zip: "29928", cuisines: ["seafood"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 11am–10pm, Fri 11am–11pm, Sat 10am–11pm, Sun 10am–9pm (weekend brunch 10am–3pm)",
    knownFor: "Waterfront seafood, steaks, and raw bar overlooking Broad Creek",
    lat: 32.1888, lon: -80.7267, city: "Hilton Head Island", state: "SC"
  },
  {
    name: "Chima Steakhouse", zip: "33301", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Dinner nightly 4:30–10pm (weekend lunch 12:30–3pm)",
    knownFor: "All-you-can-eat Brazilian rodizio churrasco and an extensive salad bar",
    lat: 26.1224, lon: -80.1373, city: "Fort Lauderdale", state: "FL"
  },
  {
    name: "CaraCara Mexican Grill", zip: "11735", cuisines: ["mexican"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 12–9pm, Fri–Sat 12–10pm, Sun 12–9pm",
    knownFor: "Tableside guacamole and craft margaritas",
    lat: 40.7326, lon: -73.4451, city: "Farmingdale", state: "NY"
  },
  {
    name: "Salt + Smoke", zip: "63130", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 11am–9pm, Fri–Sat 11am–10pm, Sun 11am–9pm",
    knownFor: "St. Louis-style BBQ ribs and bourbon-glazed burnt ends",
    lat: 38.6631, lon: -90.3129, city: "University City", state: "MO"
  },
  {
    name: "Pappy's Smokehouse", zip: "63103", cuisines: ["bbq"],
    mealTypes: ["lunch"],
    hours: "Mon, Wed 11am–4pm, Thu 11am–6pm, Fri–Sat 11am–7pm, Sun 11am–4pm, closed Tue",
    knownFor: "James Beard-nominated St. Louis ribs and pulled pork",
    lat: 38.6339, lon: -90.2280, city: "St. Louis", state: "MO"
  },
  {
    name: "Hatch'd St. Louis", zip: "63116", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch"],
    hours: "Daily 7am–1:30pm",
    knownFor: "Creative St. Louis brunch plates and stuffed hatch cakes",
    lat: 38.5811, lon: -90.2743, city: "St. Louis", state: "MO"
  },
  {
    name: "The Shack", zip: "63131", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch"],
    hours: "Daily 6:30am–2pm",
    knownFor: "Scratch-made breakfast skillets and pancakes",
    lat: 38.6398, lon: -90.4176, city: "Frontenac (St. Louis)", state: "MO"
  },
  {
    name: "Skillets Café & Grill", zip: "29928", cuisines: ["american"],
    mealTypes: ["breakfast", "lunch", "dinner"],
    hours: "Daily 7am–3pm, 4–9pm (varies by day)",
    knownFor: "All-day breakfast skillets and Lowcountry lunch classics",
    lat: 32.1509, lon: -80.7488, city: "Hilton Head Island", state: "SC"
  },
  {
    name: "Cootie Brown's", zip: "37620", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 11am–9pm, Fri–Sat 11am–10pm, Sun 11am–9pm",
    knownFor: "Fire-roasted pizzas, tamales, and a huge Jamaican/Cajun/Mexican-inflected menu",
    lat: 36.569, lon: -82.184, city: "Bristol", state: "TN"
  },
  {
    name: "Juniper", zip: "37604", cuisines: ["american"],
    mealTypes: ["dinner"],
    hours: "Tue–Sat 4:30–9pm, closed Sun–Mon",
    knownFor: "Chef-owned modern American tasting plates and cocktails",
    lat: 36.3141, lon: -82.3815, city: "Johnson City", state: "TN"
  },
  {
    name: "Phil's Dream Pit", zip: "37663", cuisines: ["bbq"],
    mealTypes: ["lunch", "dinner"],
    hours: "Tue 11am–7pm, Wed 11am–6pm, Thu 11am–7pm, Fri–Sat 11am–8pm, closed Sun–Mon",
    knownFor: "Slow-smoked BBQ plates and a locally bottled house sauce",
    lat: 36.461, lon: -82.485, city: "Kingsport", state: "TN"
  },
  {
    name: "La Carreta", zip: "37620", cuisines: ["mexican"],
    mealTypes: ["lunch", "dinner"],
    hours: "Mon–Thu 11am–8:30pm, Fri 11am–9:30pm, Sat 11:30am–9:30pm, Sun 11:30am–8pm",
    knownFor: "Tri-Cities favorite for classic Mexican plates and margaritas",
    lat: 36.569, lon: -82.184, city: "Bristol", state: "TN"
  },
  {
    name: "Smashburger", zip: "80202", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 39.7392, lon: -104.9903, city: "Denver", state: "CO"
  },
  {
    name: "Smashburger", zip: "80012", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 39.7294, lon: -104.8319, city: "Aurora", state: "CO"
  },
  {
    name: "Smashburger", zip: "80903", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 38.8339, lon: -104.8214, city: "Colorado Springs", state: "CO"
  },
  {
    name: "Smashburger", zip: "85004", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 33.4484, lon: -112.0740, city: "Phoenix", state: "AZ"
  },
  {
    name: "Smashburger", zip: "85251", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 33.4942, lon: -111.9261, city: "Scottsdale", state: "AZ"
  },
  {
    name: "Smashburger", zip: "07102", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.7357, lon: -74.1724, city: "Newark", state: "NJ"
  },
  {
    name: "Smashburger", zip: "07652", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.9445, lon: -74.0754, city: "Paramus", state: "NJ"
  },
  {
    name: "Smashburger", zip: "77002", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 29.7604, lon: -95.3698, city: "Houston", state: "TX"
  },
  {
    name: "Smashburger", zip: "75201", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 32.7767, lon: -96.7970, city: "Dallas", state: "TX"
  },
  {
    name: "Smashburger", zip: "60601", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 41.8781, lon: -87.6298, city: "Chicago", state: "IL"
  },
  {
    name: "Smashburger", zip: "60540", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 41.7508, lon: -88.1535, city: "Naperville", state: "IL"
  },
  {
    name: "Smashburger", zip: "28202", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 35.2271, lon: -80.8431, city: "Charlotte", state: "NC"
  },
  {
    name: "Smashburger", zip: "27701", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 35.9940, lon: -78.8986, city: "Durham", state: "NC"
  },
  {
    name: "Smashburger", zip: "10022", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.7580, lon: -73.9855, city: "New York (Midtown)", state: "NY"
  },
  {
    name: "Smashburger", zip: "10451", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.8296, lon: -73.9262, city: "Bronx", state: "NY"
  },
  {
    name: "Smashburger", zip: "19102", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 39.9526, lon: -75.1652, city: "Philadelphia", state: "PA"
  },
  {
    name: "Smashburger", zip: "18101", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.6023, lon: -75.4714, city: "Allentown", state: "PA"
  },
  {
    name: "Smashburger", zip: "43215", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 39.9612, lon: -82.9988, city: "Columbus", state: "OH"
  },
  {
    name: "Smashburger", zip: "45402", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 39.7589, lon: -84.1916, city: "Dayton", state: "OH"
  },
  {
    name: "Smashburger", zip: "06489", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 41.5987, lon: -72.8781, city: "Southington", state: "CT"
  },
  {
    name: "Smashburger", zip: "22314", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 38.8048, lon: -77.0469, city: "Alexandria", state: "VA"
  },
  {
    name: "Smashburger", zip: "23320", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 36.7682, lon: -76.2875, city: "Chesapeake", state: "VA"
  },
  {
    name: "Smashburger", zip: "20852", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 39.0840, lon: -77.1528, city: "Rockville", state: "MD"
  },
  {
    name: "Smashburger", zip: "48226", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 42.3314, lon: -83.0458, city: "Detroit", state: "MI"
  },
  {
    name: "Smashburger", zip: "84101", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.7608, lon: -111.8910, city: "Salt Lake City", state: "UT"
  },
  {
    name: "Smashburger", zip: "84043", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 40.3916, lon: -111.8508, city: "Lehi", state: "UT"
  },
  {
    name: "Smashburger", zip: "89109", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 36.1147, lon: -115.1728, city: "Las Vegas", state: "NV"
  },
  {
    name: "Smashburger", zip: "89029", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 35.1678, lon: -114.5719, city: "Laughlin", state: "NV"
  },
  {
    name: "Smashburger", zip: "33629", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 27.9506, lon: -82.4572, city: "Tampa", state: "FL"
  },
  {
    name: "Smashburger", zip: "32541", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 30.3935, lon: -86.4958, city: "Destin", state: "FL"
  },
  {
    name: "Smashburger", zip: "29201", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 34.0007, lon: -81.0348, city: "Columbia", state: "SC"
  },
  {
    name: "Smashburger", zip: "29483", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 33.0185, lon: -80.1756, city: "Summerville", state: "SC"
  },
  {
    name: "Smashburger", zip: "98642", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 45.8154, lon: -122.6837, city: "Ridgefield", state: "WA"
  },
  {
    name: "Smashburger", zip: "50265", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 41.5772, lon: -93.7113, city: "West Des Moines", state: "IA"
  },
  {
    name: "Smashburger", zip: "83709", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 43.6135, lon: -116.2622, city: "Boise", state: "ID"
  },
  {
    name: "Smashburger", zip: "58103", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 46.8501, lon: -96.7898, city: "Fargo", state: "ND"
  },
  {
    name: "Smashburger", zip: "99503", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 61.1958, lon: -149.8846, city: "Anchorage", state: "AK"
  },
  {
    name: "Smashburger", zip: "74133", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 36.0392, lon: -95.8878, city: "Tulsa", state: "OK"
  },
  {
    name: "Smashburger", zip: "55102", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Daily ~11am–9/10pm (varies by location)",
    knownFor: "Smashed burgers, crispy fries, and hand-spun shakes",
    lat: 44.9367, lon: -93.1252, city: "St. Paul", state: "MN"
  },
  {
    name: "Amada", zip: "08401", cuisines: ["spanish"],
    mealTypes: ["dinner"],
    hours: "Wed–Sun 5–10/11pm, closed Mon–Tue",
    knownFor: "Spanish tapas and paella from Chef Jose Garces inside Ocean Casino Resort",
    lat: 39.3624, lon: -74.4148, city: "Atlantic City", state: "NJ"
  },
  {
    name: "McCormick & Schmick's", zip: "08401", cuisines: ["seafood"],
    mealTypes: ["lunch", "dinner"],
    hours: "Sun, Wed–Sat 11:30am–10pm, Mon–Tue 3–10pm",
    knownFor: "Fresh seafood and steaks inside Harrah's Resort, with a daily happy hour",
    lat: 39.3845, lon: -74.4291, city: "Atlantic City", state: "NJ"
  },
  {
    name: "Morton's", zip: "08401", cuisines: ["american"],
    mealTypes: ["lunch", "dinner"],
    hours: "Sun 10am–9pm, Mon–Thu 4–9pm, Fri–Sat 4–10pm",
    knownFor: "Classic prime steaks and tableside presentation inside Caesars Atlantic City",
    lat: 39.3558, lon: -74.4361, city: "Atlantic City", state: "NJ"
  },
  {
    name: "Old Homestead", zip: "08401", cuisines: ["american"],
    mealTypes: ["dinner"],
    hours: "Mon–Thu, Sun 5–10pm, Fri 5–10:30pm, Sat 4–10:30pm",
    knownFor: "Legendary NYC steakhouse import known for dry-aged prime beef inside Borgata",
    lat: 39.3785, lon: -74.4349, city: "Atlantic City", state: "NJ"
  }
];
