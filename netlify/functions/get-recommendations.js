// Looks up restaurant recommendations within 15 miles of a searched zip
// code, optionally filtered by cuisine, from the shared Netlify Blobs
// store that submit-restaurant.js writes to.
//
// Distance is checked against ALL submitted restaurants regardless of
// cuisine first — if nothing is within range at all, that's a coverage
// gap ("no recommendations near you"), which is a different situation
// from "we have coverage here, just not that cuisine yet."

const { getStore } = require("@netlify/blobs");
const { geocodeZip, haversineMiles } = require("./lib/geo");

const MAX_DISTANCE_MILES = 15;

exports.handler = async (event) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const params = event.queryStringParameters || {};
  const zip = String(params.zip || "").trim();
  const cuisines = String(params.cuisines || "")
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);

  if (!/^\d{5}$/.test(zip)) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "That doesn't look like a valid 5-digit zip code." })
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
  const all = (await store.get("index", { type: "json" })) || [];

  const withDistance = all.map((r) => ({
    ...r,
    distance: haversineMiles(geo.lat, geo.lon, r.lat, r.lon)
  }));

  const nearby = withDistance.filter((r) => r.distance <= MAX_DISTANCE_MILES);

  if (nearby.length === 0) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, results: [], reason: "out-of-range" })
    };
  }

  const matches = cuisines.length === 0
    ? nearby
    : nearby.filter((r) => r.cuisines.some((c) => cuisines.includes(c)));

  matches.sort((a, b) => a.distance - b.distance);

  return {
    statusCode: 200,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ok: true,
      results: matches.map((r) => ({
        name: r.name,
        city: r.city,
        state: r.state,
        cuisines: r.cuisines,
        note: r.note,
        distance: Math.round(r.distance * 10) / 10
      })),
      reason: matches.length === 0 ? "no-cuisine-match" : null
    })
  };
};
