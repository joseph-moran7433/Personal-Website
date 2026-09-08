// Accepts a restaurant submission from the Nearby Eats "Submit a Restaurant"
// form, geocodes its zip code, and appends it to the shared Netlify Blobs
// store that get-recommendations.js reads from. The whole "database" is a
// single JSON blob (an array of entries) — plenty for this site's scale,
// and simpler than juggling one blob key per submission.

const { getStore } = require("@netlify/blobs");
const { geocodeZip } = require("./lib/geo");

// Keep in sync with CUISINE_OPTIONS in assets/recipes-data.js.
const VALID_CUISINES = [
  "italian", "mexican", "asian", "greek", "irish", "french", "american", "caribbean"
];

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  let body;
  try {
    body = JSON.parse(event.body || "{}");
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: "Invalid request." }) };
  }

  // Honeypot: real visitors never fill in a field hidden off-screen.
  if (body.website) {
    return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ok: true }) };
  }

  const name = String(body.name || "").trim().slice(0, 120);
  const zip = String(body.zip || "").trim();
  const cuisines = Array.isArray(body.cuisines)
    ? [...new Set(body.cuisines.filter((c) => VALID_CUISINES.includes(c)))].slice(0, VALID_CUISINES.length)
    : [];
  const note = String(body.note || "").trim().slice(0, 400);

  if (!name || !/^\d{5}$/.test(zip) || cuisines.length === 0) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Please include a restaurant name, a valid 5-digit zip code, and at least one cuisine." })
    };
  }

  let geo;
  try {
    geo = await geocodeZip(zip);
  } catch {
    geo = null;
  }
  if (!geo) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "We couldn't find that zip code — double check it and try again." })
    };
  }

  const store = getStore("restaurants");
  const existing = (await store.get("index", { type: "json" })) || [];

  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name,
    zip,
    cuisines,
    note,
    lat: geo.lat,
    lon: geo.lon,
    city: geo.city,
    state: geo.state,
    submittedAt: new Date().toISOString()
  };

  existing.push(entry);
  await store.setJSON("index", existing);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ok: true, city: geo.city, state: geo.state })
  };
};
