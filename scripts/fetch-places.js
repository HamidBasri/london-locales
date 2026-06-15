#!/usr/bin/env node
/**
 * London Places Data Pipeline
 * ===========================
 * Fetches comprehensive London POIs from OpenStreetMap Overpass API.
 * Free — no API key required. Covers all boroughs of Greater London.
 *
 * Run:  node scripts/fetch-places.js
 * Out:  data/places.json  (commit this file — serves as the database)
 *
 * Re-run periodically to refresh data (Overpass reflects OSM edits).
 * Requires Node.js 18+ (built-in fetch).
 *
 * Categories fetched:
 *   - Tourist attractions, museums, galleries, viewpoints
 *   - Historic sites (wikidata-filtered for quality)
 *   - Notable pubs & bars (wikidata OR listed building)
 *   - Notable restaurants (wikidata OR Michelin/stars)
 *   - Parks, gardens, nature reserves
 *   - Markets and major shopping destinations
 *   - Theatres, cinemas, arts centres, music venues
 *   - Places of worship (wikidata OR wikipedia quality filter)
 *   - Neighbourhoods and areas
 *   - Stadiums and arenas
 */

'use strict';
const fs   = require('fs');
const path = require('path');
const https = require('https');

// Greater London bounding box  south, west, north, east
const BBOX = '51.28,-0.56,51.73,0.36';
const OUT  = path.join(__dirname, '../data/places.json');
const DELAY_MS = 3000; // polite delay between queries

// ─── Overpass helpers ────────────────────────────────────────────────────────

function overpassPost(query) {
  return new Promise((resolve, reject) => {
    const body = 'data=' + encodeURIComponent(query);
    const opts = {
      hostname: 'overpass-api.de',
      path:     '/api/interpreter',
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
        'User-Agent':     'LondonFieldGuide/2.0 contact:dev.hamidbasri@gmail.com',
      },
    };
    const req = https.request(opts, res => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
        catch(e) { reject(new Error('JSON parse failed: ' + e.message)); }
      });
    });
    req.on('error', reject);
    req.setTimeout(180_000, () => { req.destroy(); reject(new Error('Timeout after 180s')); });
    req.write(body);
    req.end();
  });
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ─── Category mapping ────────────────────────────────────────────────────────

const PUB_CAT      = ['pub', 'bar', 'biergarten'];
const FOOD_CAT     = ['restaurant', 'cafe', 'fast_food', 'food_court'];
const ENTERTAIN    = ['theatre', 'cinema', 'arts_centre', 'music_venue', 'nightclub', 'events_venue'];
const HISTORIC_CAT = ['castle', 'fort', 'palace', 'manor', 'ruins', 'archaeological_site',
                      'monument', 'memorial', 'city_gate', 'boundary_stone', 'wayside_cross',
                      'milestone', 'pillory', 'gallows', 'ship', 'aircraft', 'cannon'];
const PARK_CAT     = ['park', 'garden', 'nature_reserve', 'common', 'recreation_ground'];

function categorize(tags) {
  const am  = tags.amenity  || '';
  const to  = tags.tourism  || '';
  const hi  = tags.historic || '';
  const le  = tags.leisure  || '';
  const sh  = tags.shop     || '';
  const pl  = tags.place    || '';

  if (PUB_CAT.includes(am))                                    return 'pubs';
  if (FOOD_CAT.includes(am))                                   return 'dining';
  if (to === 'museum')                                         return 'museums';
  if (to === 'gallery')                                        return 'museums';
  if (to === 'zoo' || to === 'aquarium')                       return 'family';
  if (to === 'theme_park' || to === 'attraction' && tags.name?.match(/tower|castle|palace/i)) return 'history';
  if (to === 'viewpoint')                                      return 'views';
  if (HISTORIC_CAT.includes(hi))                              return 'history';
  if (hi)                                                      return 'history';
  if (PARK_CAT.includes(le))                                  return 'parks';
  if (am === 'marketplace' || ['market', 'mall', 'department_store', 'supermarket'].includes(sh)) return 'markets';
  if (ENTERTAIN.includes(am))                                  return 'theatre';
  if (am === 'place_of_worship')                               return 'faith';
  if (['stadium', 'arena', 'sports_centre', 'ice_rink'].includes(le)) return 'theatre';
  if (['neighbourhood', 'quarter', 'suburb', 'village'].includes(pl)) return 'areas';
  if (to === 'attraction' || to === 'artwork')                 return 'landmarks';
  return 'landmarks';
}

// ─── Descriptor generation ────────────────────────────────────────────────────

const CUISINE_LABEL = {
  british: 'British', italian: 'Italian', french: 'French', indian: 'Indian',
  chinese: 'Chinese', japanese: 'Japanese', thai: 'Thai', mexican: 'Mexican',
  american: 'American', greek: 'Greek', spanish: 'Spanish', turkish: 'Turkish',
  vietnamese: 'Vietnamese', korean: 'Korean', middle_eastern: 'Middle Eastern',
  seafood: 'Seafood', steak_house: 'Steakhouse', pizza: 'Pizza',
};

function describePlace(name, tags, cat) {
  if (tags.description) return tags.description;

  const am  = tags.amenity || '';
  const to  = tags.tourism || '';
  const hi  = tags.historic || '';
  const le  = tags.leisure || '';
  const cuisine = (tags.cuisine || '').split(';').map(c => CUISINE_LABEL[c.trim()] || c).filter(Boolean).join(', ');
  const street  = tags['addr:street'] || '';
  const area    = tags['addr:suburb'] || tags['addr:city'] || '';

  if (PUB_CAT.includes(am)) {
    const parts = [`A ${am === 'biergarten' ? 'beer garden' : am} in London`];
    if (tags.real_ale === 'yes')    parts.push('serving real ale');
    if (tags.food === 'yes')        parts.push('with food');
    if (tags.historic)              parts.push('with historic character');
    if (street)                     parts.push(`on ${street}`);
    return parts.join(', ') + '.';
  }

  if (FOOD_CAT.includes(am)) {
    const type = am === 'cafe' ? 'café' : 'restaurant';
    const parts = cuisine ? [`A ${cuisine} ${type}`] : [`A ${type}`];
    if (tags.michelin_stars) parts.push(`${tags.michelin_stars}-Michelin-star`);
    if (tags.stars)          parts.push(`${tags.stars}-star rated`);
    if (street)              parts.push(`on ${street}`);
    return parts.join(' ') + '.';
  }

  if (to === 'museum')   return `A museum${street ? ' on ' + street : ''} in London.`;
  if (to === 'gallery')  return `An art gallery${street ? ' on ' + street : ''} in London.`;
  if (to === 'viewpoint') return `A viewpoint in London offering panoramic views.`;
  if (to === 'zoo')      return 'A zoological garden in London.';
  if (to === 'aquarium') return 'A public aquarium in London.';
  if (hi === 'castle' || hi === 'palace')
    return `A historic ${hi} in London${street ? ' on ' + street : ''}.`;
  if (hi)
    return `A historic site (${hi}) in London.`;
  if (PARK_CAT.includes(le))
    return `A ${le} in London offering green space for visitors.`;
  if (am === 'marketplace')   return `A market in London.`;
  if (ENTERTAIN.includes(am)) return `A ${am.replace('_', ' ')} in London.`;
  if (am === 'place_of_worship') {
    const rel = tags.religion ? tags.religion : 'religious';
    return `A ${rel} place of worship in London.`;
  }

  return `A notable attraction in London.`;
}

function extractFeatures(tags, cat) {
  const feats = [];

  // Access
  if (tags.fee === 'no'  || tags.access === 'yes') feats.push('Free entry');
  if (tags.fee === 'yes')                           feats.push('Paid entry');

  // Heritage
  const grade = tags.listed_building_grade || tags['heritage'] || '';
  if (grade === 'I'  || grade === '1')  feats.push('Grade I listed');
  if (grade === 'II' || grade === '2')  feats.push('Grade II listed');
  if (tags['heritage:operator'] === 'National Trust') feats.push('National Trust');
  if (tags['heritage:operator'] === 'English Heritage') feats.push('English Heritage');
  if (tags.wikidata)  feats.push('Notable');

  // Food & drink
  if (tags.real_ale === 'yes')         feats.push('Real ale');
  if (tags.outdoor_seating === 'yes')  feats.push('Outdoor seating');
  if (tags.food === 'yes')             feats.push('Food served');
  if (tags.cuisine) {
    const c = tags.cuisine.split(';')[0].trim();
    feats.push(CUISINE_LABEL[c] || c.charAt(0).toUpperCase() + c.slice(1));
  }

  // Dining accolades
  const ms = parseInt(tags.michelin_stars, 10);
  if (ms === 1) feats.push('1 Michelin Star');
  if (ms === 2) feats.push('2 Michelin Stars');
  if (ms === 3) feats.push('3 Michelin Stars');
  if (tags.michelin_bib) feats.push('Michelin Bib Gourmand');

  // Accessibility
  if (tags.wheelchair === 'yes') feats.push('Wheelchair accessible');

  // River
  if ((tags['addr:street'] || '').match(/thames|embankment|riverside/i)) feats.push('On the Thames');

  // Fallback: at least one feature
  if (feats.length === 0) {
    const am = tags.amenity || tags.tourism || tags.historic || tags.leisure || '';
    if (am) feats.push(am.charAt(0).toUpperCase() + am.slice(1).replace(/_/g, ' '));
    else    feats.push('London');
  }

  return feats.slice(0, 8); // cap at 8 tags
}

// ─── ID generation ────────────────────────────────────────────────────────────

function makeId(el, tags) {
  if (tags.wikidata) {
    // stable slug from wikidata + name
    return 'wd-' + tags.wikidata.replace(/^Q/, '').slice(0, 8) +
           '-' + (tags.name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 20).replace(/-$/, '');
  }
  return 'osm-' + el.type.slice(0,1) + el.id;
}

// ─── Element processor ───────────────────────────────────────────────────────

function processElement(el, seenIds, seenNames) {
  const tags = el.tags || {};
  const name = (tags.name || tags['name:en'] || '').trim();
  if (!name) return null;

  // Skip private / disused
  if (tags.access === 'private' || tags.disused) return null;

  // Coordinates
  const lat = el.lat ?? el.center?.lat;
  const lon = el.lon ?? el.center?.lon;
  if (!lat || !lon) return null;

  // Dedup
  const id = makeId(el, tags);
  if (seenIds.has(id)) return null;
  const normName = name.toLowerCase().trim();
  if (seenNames.has(normName)) return null;

  seenIds.add(id);
  seenNames.add(normName);

  const cat      = categorize(tags);
  const desc     = describePlace(name, tags, cat);
  const features = extractFeatures(tags, cat);

  const place = {
    id,
    name,
    cat,
    lat: +lat.toFixed(6),
    lng: +lon.toFixed(6),
    desc,
    features,
    near: [],
    why:  `${name} is a notable London ${cat} worth visiting.`,
  };

  // Optional enrichment fields
  if (tags.wikidata)        place.wikidata       = tags.wikidata;
  if (tags.wikipedia)       place.wikipedia      = tags.wikipedia;
  if (tags.website)         place.website        = tags.website;
  if (tags.opening_hours)   place.opening_hours  = tags.opening_hours;
  if (tags.phone)           place.phone          = tags.phone;
  if (tags.michelin_stars)  place.michelin_stars = parseInt(tags.michelin_stars, 10);
  if (tags.note)            place.note           = tags.note;

  const houseNo = tags['addr:housenumber'] || '';
  const street  = tags['addr:street'] || '';
  const postcode= tags['addr:postcode'] || '';
  if (street) place.address = [houseNo, street, postcode].filter(Boolean).join(' ');

  return place;
}

// ─── Overpass queries ────────────────────────────────────────────────────────

const QUERIES = [
  {
    name: 'tourist attractions',
    q: `[out:json][timeout:120];
(
  node["tourism"~"^(attraction|artwork)$"]["name"](${BBOX});
  way["tourism"~"^(attraction|artwork)$"]["name"](${BBOX});
  relation["tourism"="attraction"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'museums & galleries',
    q: `[out:json][timeout:120];
(
  node["tourism"~"^(museum|gallery)$"]["name"](${BBOX});
  way["tourism"~"^(museum|gallery)$"]["name"](${BBOX});
  relation["tourism"~"^(museum|gallery)$"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'viewpoints',
    q: `[out:json][timeout:60];
(
  node["tourism"="viewpoint"]["name"](${BBOX});
  way["tourism"="viewpoint"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'zoos & theme parks',
    q: `[out:json][timeout:60];
(
  node["tourism"~"^(zoo|aquarium|theme_park)$"]["name"](${BBOX});
  way["tourism"~"^(zoo|aquarium|theme_park)$"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'historic sites (wikidata)',
    q: `[out:json][timeout:120];
(
  node["historic"]["name"]["wikidata"](${BBOX});
  way["historic"]["name"]["wikidata"](${BBOX});
  relation["historic"]["name"]["wikidata"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'listed buildings (grade I & II)',
    q: `[out:json][timeout:120];
(
  node["listed_building_grade"~"^(I|II)$"]["name"](${BBOX});
  way["listed_building_grade"~"^(I|II)$"]["name"](${BBOX});
  node["heritage"~"^(1|2)$"]["name"](${BBOX});
  way["heritage"~"^(1|2)$"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'pubs & bars (wikidata)',
    q: `[out:json][timeout:120];
(
  node["amenity"~"^(pub|bar|biergarten)$"]["name"]["wikidata"](${BBOX});
  way["amenity"~"^(pub|bar)$"]["name"]["wikidata"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'pubs & bars (listed / historic)',
    q: `[out:json][timeout:120];
(
  node["amenity"~"^(pub|bar)$"]["name"]["listed_building_grade"](${BBOX});
  way["amenity"~"^(pub|bar)$"]["name"]["listed_building_grade"](${BBOX});
  node["amenity"="pub"]["name"]["historic"](${BBOX});
  node["amenity"="pub"]["name"]["wikipedia"](${BBOX});
  way["amenity"="pub"]["name"]["wikipedia"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'pubs with real ale (notable)',
    q: `[out:json][timeout:120];
(
  node["amenity"="pub"]["name"]["real_ale"="yes"]["website"](${BBOX});
  node["amenity"="pub"]["name"]["microbrewery"="yes"](${BBOX});
  node["amenity"="pub"]["name"]["brewery"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'restaurants (wikidata + Michelin)',
    q: `[out:json][timeout:120];
(
  node["amenity"="restaurant"]["name"]["wikidata"](${BBOX});
  way["amenity"="restaurant"]["name"]["wikidata"](${BBOX});
  node["amenity"="restaurant"]["name"]["michelin_stars"](${BBOX});
  node["amenity"="restaurant"]["name"]["stars"](${BBOX});
  node["amenity"="cafe"]["name"]["wikidata"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'restaurants (wikipedia)',
    q: `[out:json][timeout:120];
(
  node["amenity"="restaurant"]["name"]["wikipedia"](${BBOX});
  way["amenity"="restaurant"]["name"]["wikipedia"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'parks & gardens',
    q: `[out:json][timeout:120];
(
  node["leisure"~"^(park|garden|nature_reserve|common)$"]["name"](${BBOX});
  way["leisure"~"^(park|garden|nature_reserve|common)$"]["name"](${BBOX});
  relation["leisure"~"^(park|garden|nature_reserve)$"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'markets & notable shops',
    q: `[out:json][timeout:120];
(
  node["amenity"="marketplace"]["name"](${BBOX});
  way["amenity"="marketplace"]["name"](${BBOX});
  node["shop"~"^(market|mall|department_store)$"]["name"]["wikidata"](${BBOX});
  way["shop"~"^(market|mall|department_store)$"]["name"]["wikidata"](${BBOX});
  way["shop"~"^(market|mall|department_store)$"]["name"]["wikipedia"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'theatres, cinemas & arts centres',
    q: `[out:json][timeout:120];
(
  node["amenity"~"^(theatre|cinema|arts_centre|music_venue)$"]["name"](${BBOX});
  way["amenity"~"^(theatre|cinema|arts_centre|music_venue)$"]["name"](${BBOX});
  relation["amenity"~"^(theatre|cinema|arts_centre)$"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'places of worship (notable)',
    q: `[out:json][timeout:120];
(
  node["amenity"="place_of_worship"]["name"]["wikidata"](${BBOX});
  way["amenity"="place_of_worship"]["name"]["wikidata"](${BBOX});
  node["amenity"="place_of_worship"]["name"]["wikipedia"](${BBOX});
  way["amenity"="place_of_worship"]["name"]["wikipedia"](${BBOX});
  node["amenity"="place_of_worship"]["name"]["listed_building_grade"](${BBOX});
  way["amenity"="place_of_worship"]["name"]["listed_building_grade"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'stadiums & arenas',
    q: `[out:json][timeout:120];
(
  node["leisure"~"^(stadium|arena|sports_centre|ice_rink)$"]["name"](${BBOX});
  way["leisure"~"^(stadium|arena|sports_centre|ice_rink)$"]["name"](${BBOX});
  relation["leisure"~"^(stadium|arena)$"]["name"](${BBOX});
);
out center qt;`,
  },
  {
    name: 'neighbourhoods & areas',
    q: `[out:json][timeout:120];
(
  node["place"~"^(neighbourhood|quarter|suburb|village)$"]["name"](${BBOX});
  relation["place"~"^(neighbourhood|quarter|suburb)$"]["name"](${BBOX});
);
out center qt;`,
  },
];

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔════════════════════════════════════════════╗');
  console.log('║  London Places — Overpass API Pipeline     ║');
  console.log('╚════════════════════════════════════════════╝');
  console.log(`Target: ${QUERIES.length} queries → ${OUT}\n`);

  const seenIds   = new Set();
  const seenNames = new Set();
  const all       = [];

  for (let i = 0; i < QUERIES.length; i++) {
    const { name, q } = QUERIES[i];
    const pad = String(i + 1).padStart(2, '0');
    process.stdout.write(`  [${pad}/${QUERIES.length}] ${name} … `);

    try {
      const result = await overpassPost(q);
      const elements = result.elements || [];
      let added = 0;

      for (const el of elements) {
        const place = processElement(el, seenIds, seenNames);
        if (place) { all.push(place); added++; }
      }

      console.log(`${added} new (total: ${all.length})`);
    } catch(err) {
      console.log(`ERROR — ${err.message}`);
    }

    if (i < QUERIES.length - 1) await sleep(DELAY_MS);
  }

  // Sort by category then name
  all.sort((a, b) => a.cat.localeCompare(b.cat) || a.name.localeCompare(b.name));

  // Category summary
  const counts = {};
  for (const p of all) counts[p.cat] = (counts[p.cat] || 0) + 1;
  console.log('\n── Category breakdown ──────────────────────');
  for (const [cat, n] of Object.entries(counts).sort((a,b) => b[1]-a[1])) {
    console.log(`  ${cat.padEnd(12)} ${n}`);
  }
  console.log(`${'TOTAL'.padEnd(12)} ${all.length}`);

  // Write output
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    generated: new Date().toISOString(),
    source:    'OpenStreetMap Overpass API',
    license:   'ODbL 1.0 — © OpenStreetMap contributors',
    count:     all.length,
    places:    all,
  }, null, 2));

  console.log(`\n✓ ${all.length} places written to ${path.relative(process.cwd(), OUT)}`);
}

main().catch(err => { console.error('\nFatal:', err.message); process.exit(1); });
