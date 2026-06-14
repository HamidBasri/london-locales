# London, A Visitor's Field Guide

A mobile-first progressive web app (PWA) for exploring London. Deployable to Vercel in one click.

## Deploy to Vercel

### Option A — Vercel CLI
```bash
npx vercel
```

### Option B — GitHub + Vercel dashboard
1. Push this folder to a GitHub repository.
2. Go to [vercel.com](https://vercel.com), import the repository.
3. No build settings needed — Vercel detects a static site with API routes.
4. Set environment variables (see below).
5. Deploy.

## Environment variables

Set these in the Vercel project dashboard under **Settings → Environment Variables**.

| Variable | Required | Description |
|---|---|---|
| `MAPBOX_TOKEN` | Recommended | Mapbox public token (`pk.*`). Pre-fills the map for all visitors. Get one free at [mapbox.com](https://mapbox.com). |
| `ANTHROPIC_KEY` | Recommended | Anthropic API key (`sk-ant-*`). Enables the "Update all" agent for all visitors without them needing their own key. |

Both variables are optional — users can enter their own tokens via the gear icon (⚙) in the app. Server-set values take priority over user-set values, but users can override them with their own browser-saved tokens.

## API routes

| Route | Description |
|---|---|
| `GET /api/config` | Returns `{ mapboxToken, hasAnthropicKey }`. The Anthropic key itself is never returned to the client. |
| `POST /api/agent` | Secure proxy to Anthropic `/v1/messages`. Uses `ANTHROPIC_KEY` from env vars, with the user's browser-saved key as fallback. |

## Local development

```bash
npx vercel dev
```

This starts a local server with API routes working at `http://localhost:3000`.

Opening `index.html` directly as a `file://` URL also works — the map and agent fall back to tokens entered manually in Settings.

## PWA installation

- **iOS**: Open in Safari → Share → Add to Home Screen.
- **Android / Chrome**: Open in Chrome → tap the install banner or use the "Install to device" button in Settings (gear icon).
- Full offline support requires serving from HTTPS (Vercel deployments include this automatically).
