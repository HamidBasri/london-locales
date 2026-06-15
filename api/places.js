/**
 * GET /api/places
 *
 * Serves London places from data/places.json with filtering and pagination.
 *
 * Query parameters:
 *   cat    — category key (all | pubs | dining | museums | …)  default: all
 *   q      — free-text search (searches name, desc, features)  default: ''
 *   feats  — comma-separated feature tags to AND-filter        default: ''
 *   page   — 1-based page number                               default: 1
 *   limit  — results per page (max 200)                        default: 100
 *
 * Response:
 *   { total, page, pages, limit, generated, license, places: [...] }
 */

'use strict';
const fs   = require('fs');
const path = require('path');

// Load and cache the dataset in memory (survives warm Lambda invocations)
let _cache = null;
function getPlaces() {
  if (_cache) return _cache;
  const file = path.join(__dirname, '../data/places.json');
  try {
    _cache = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    _cache = { places: [], generated: null, license: '' };
  }
  return _cache;
}

module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const db = getPlaces();

  // ── Parse query params ───────────────────────────────────────────────────
  const cat   = (req.query.cat   || 'all').toLowerCase().trim();
  const q     = (req.query.q     || '').toLowerCase().trim();
  const feats = (req.query.feats || '').split(',').map(s => s.trim()).filter(Boolean);
  const page  = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 100));

  // ── Filter ───────────────────────────────────────────────────────────────
  let places = db.places;

  if (cat !== 'all') {
    places = places.filter(p => p.cat === cat);
  }

  if (feats.length > 0) {
    places = places.filter(p =>
      feats.every(f => p.features.some(pf => pf.toLowerCase().includes(f.toLowerCase())))
    );
  }

  if (q) {
    const tokens = q.split(/\s+/).filter(Boolean);
    places = places.filter(p => {
      const hay = [p.name, p.desc, p.why, ...(p.features || []), p.address || '']
        .join(' ').toLowerCase();
      return tokens.every(t => hay.includes(t));
    });
  }

  // ── Paginate ─────────────────────────────────────────────────────────────
  const total  = places.length;
  const pages  = Math.ceil(total / limit);
  const offset = (page - 1) * limit;
  const slice  = places.slice(offset, offset + limit);

  // ── CORS (same-origin on Vercel; useful for local dev) ───────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');

  return res.status(200).json({
    total,
    page,
    pages,
    limit,
    generated: db.generated,
    license:   db.license,
    places:    slice,
  });
};
