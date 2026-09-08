// Shared helpers for the Nearby Eats functions.
// Zip -> lat/lon lookup via Zippopotam.us (free, no API key, US zip codes only).

async function geocodeZip(zip) {
  const res = await fetch(`https://api.zippopotam.us/us/${encodeURIComponent(zip)}`);
  if (!res.ok) return null;
  const data = await res.json();
  const place = data.places && data.places[0];
  if (!place) return null;
  return {
    lat: parseFloat(place.latitude),
    lon: parseFloat(place.longitude),
    city: place["place name"],
    state: place["state abbreviation"]
  };
}

// Great-circle distance between two lat/lon points, in miles.
function haversineMiles(lat1, lon1, lat2, lon2) {
  const toRad = (d) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

module.exports = { geocodeZip, haversineMiles };
