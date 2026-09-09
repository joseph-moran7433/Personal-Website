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
// "spanish" and "bakery" on top of the shared base set, since those
// come up for restaurants but not home recipes.
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
  { value: "bakery", label: "Bakery & Café" }
];

const restaurants = [
  {
    name: "LaScala's Beach House", zip: "08203", cuisines: ["italian"],
    lat: 39.3702, lon: -74.4940, city: "Brigantine", state: "NJ"
  },
  {
    name: "Salsa Mexicana", zip: "11570", cuisines: ["mexican"],
    lat: 40.6637, lon: -73.6380, city: "Rockville Centre", state: "NY"
  },
  {
    name: "Dos Vargas Taqueria", zip: "11570", cuisines: ["mexican"],
    lat: 40.6637, lon: -73.6380, city: "Rockville Centre", state: "NY"
  },
  {
    name: "The French Workshop", zip: "11530", cuisines: ["french", "bakery"],
    note: "Bakery and coffee.",
    lat: 40.7245, lon: -73.6487, city: "Garden City", state: "NY"
  },
  {
    name: "Caracara Mexican Grill", zip: "11735", cuisines: ["mexican"],
    lat: 40.7315, lon: -73.4327, city: "Farmingdale", state: "NY"
  },
  {
    name: "Caracara Mexican Grill", zip: "11731", cuisines: ["mexican"],
    lat: 40.8570, lon: -73.3146, city: "East Northport", state: "NY"
  },
  {
    name: "Heritage", zip: "10018", cuisines: ["italian"],
    note: "By Bryant Park.",
    lat: 40.7547, lon: -73.9925, city: "New York", state: "NY"
  },
  {
    name: "Naya", zip: "10036", cuisines: ["greek"],
    note: "By Bryant Park.",
    lat: 40.7597, lon: -73.9918, city: "New York", state: "NY"
  },
  {
    name: "Cava", zip: "06830", cuisines: ["greek"],
    lat: 41.0427, lon: -73.6262, city: "Greenwich", state: "CT"
  },
  {
    name: "Cava", zip: "11590", cuisines: ["greek"],
    lat: 40.7557, lon: -73.5723, city: "Westbury", state: "NY"
  },
  {
    name: "Cava", zip: "10917", cuisines: ["greek"],
    lat: 41.3268, lon: -74.1220, city: "Central Valley", state: "NY"
  },
  {
    name: "Cava", zip: "28303", cuisines: ["greek"],
    lat: 35.0742, lon: -78.9650, city: "Fayetteville", state: "NC"
  },
  {
    name: "A Better Place Bar & Grill", zip: "10917", cuisines: ["american"],
    lat: 41.3268, lon: -74.1220, city: "Central Valley", state: "NY"
  },
  {
    name: "Orienta Restaurant", zip: "06830", cuisines: ["asian"],
    note: "Vietnamese.",
    lat: 41.0427, lon: -73.6262, city: "Greenwich", state: "CT"
  },
  {
    name: "Zaza Italian Gastrobar", zip: "06901", cuisines: ["italian"],
    lat: 41.0531, lon: -73.5390, city: "Stamford", state: "CT"
  },
  {
    name: "Mecha Noodle Bar", zip: "06901", cuisines: ["asian"],
    note: "On Bedford Street.",
    lat: 41.0531, lon: -73.5390, city: "Stamford", state: "CT"
  },
  {
    name: "La Selva", zip: "08025", cuisines: ["spanish"],
    note: "Steakhouse in Barcelona.",
    lat: 41.4048, lon: 2.1763, city: "Barcelona", state: "Spain"
  },
  {
    name: "El Nacional", zip: "08007", cuisines: ["spanish"],
    note: "Drinks, meats, and tapas in Barcelona.",
    lat: 41.3900, lon: 2.1682, city: "Barcelona", state: "Spain"
  },
  {
    name: "Bubba's 33", zip: "28314", cuisines: ["american"],
    lat: 35.0583, lon: -79.0080, city: "Fayetteville", state: "NC"
  },
  {
    name: "Carolina Ale House", zip: "28314", cuisines: ["american"],
    lat: 35.0583, lon: -79.0080, city: "Fayetteville", state: "NC"
  },
  {
    name: "Don Ramon's Taco Shop", zip: "28303", cuisines: ["mexican"],
    lat: 35.0742, lon: -78.9650, city: "Fayetteville", state: "NC"
  },
  {
    name: "Taqueria El Refugio", zip: "28303", cuisines: ["mexican"],
    lat: 35.0742, lon: -78.9650, city: "Fayetteville", state: "NC"
  }
];
