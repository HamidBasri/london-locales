/**
 * POST /api/agent
 *
 * Secure proxy to Anthropic /v1/messages.
 * The API key NEVER leaves the server.
 *
 * Priority:
 *   1. ANTHROPIC_KEY  environment variable (set in Vercel dashboard)
 *   2. x-user-api-key request header (browser-saved key as fallback)
 *
 * This means the deployed app works for all visitors when ANTHROPIC_KEY
 * is set, and falls back to the user's own key (stored in their browser)
 * when the server key is absent.
 */
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Server key takes priority over any client-supplied key
  const apiKey =
    process.env.ANTHROPIC_KEY ||
    req.headers['x-user-api-key'] ||
    '';

  if (!apiKey) {
    return res.status(503).json({
      error:
        'No API key available. Set ANTHROPIC_KEY in your Vercel environment variables, ' +
        'or enter your own Anthropic key in the Settings panel.',
    });
  }

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(req.body),
    });

    const data = await upstream.json();
    res.status(upstream.status).json(data);
  } catch (err) {
    res.status(500).json({ error: 'Upstream request failed: ' + err.message });
  }
};
