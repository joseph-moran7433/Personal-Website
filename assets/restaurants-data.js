// ─────────────────────────────────────────────────────────────────
// NEARBY EATS DATA
// A hand-curated list of restaurants Joseph actually vouches for —
// no crowdsourcing, no submissions. Each entry's lat/lon is geocoded
// once (from its zip) at authoring time, so a search only needs to
// geocode the visitor's own zip, then it's just distance math against
// this list.
//
// To add a restaurant: look up its zip's coordinates (e.g. visiting
// https://api.zippopotam.us/us/<zip> in a browser gives you
// "latitude"/"longitude" directly), then add an entry below.
//
// cuisine values match Recipe Finder's list: "italian" | "mexican" |
// "asian" | "greek" | "irish" | "french" | "american" | "caribbean"
// ─────────────────────────────────────────────────────────────────

const restaurants = [
  // Starts empty — add real recommendations here.
];
