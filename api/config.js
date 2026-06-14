/**
 * GET /api/config
 *
 * Returns public configuration values from Vercel environment variables.
 * The Anthropic key is NEVER returned — only a boolean flag indicating
 * whether it is configured on the server.
 *
 * Vercel environment variables to set:
 *   MAPBOX_TOKEN   — your Mapbox public token  (pk.*)
 *   ANTHROPIC_KEY  — your Anthropic API key    (sk-ant-*)
 */
module.exports = function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  res.setHeader('Cache-Control', 'no-store, no-cache');

  res.json({
    mapboxToken:    process.env.MAPBOX_TOKEN    || '',
    hasAnthropicKey: !!process.env.ANTHROPIC_KEY,
  });
};
