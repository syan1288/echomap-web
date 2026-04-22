# Echo Map (web prototype)

Interactive prototype that **reuses the Pixel Travel Map stack** (React + Leaflet + Carto light tiles + Gemini image generation) inside the **Echo Map** layout from `docs/echo-map-unified-description.md`.

## Run locally

```bash
cd echomap-web
npm install
cp .env.example .env   # optional — create and set GEMINI_API_KEY
npm run dev
```

- **Gemini**: Set `GEMINI_API_KEY` in `.env` (see `vite.config.ts`) so `services/geminiService.ts` can generate 3D pixel buildings from photos.
- **Demo buildings**: Two **locked** sample markers load by default (`App.tsx` → `ECHO_SEED_DEMO_BUILDINGS`). Set to `false` for an empty map and the `ECHO MAP` empty state.

## What’s implemented

- **Home**: 30% / 70% layout, Echo sidebar (Home / Gallery), map chrome (zoom + `PIXEL TRAVEL MAP` label + `?` + language), centered search, Hammer / Camera FABs, import/export/reset as secondary links, cream “Scroll for more / Travel gallery” band, olive **Gallery** section with wave divider.
- **Building states**: Same as upstream: **unlocked** → toolbar + Remix; **locked** → idle until selected; **locked + selected** → dashed ring + fan actions + lock to unlock. Demo assets are **locked + unselected** by default.
- **Modals**: M01 (add building), M02 (travel log / Book), M03/M04 (gallery detail flow).

## Assets

Reference PNGs live under `public/assets/` (figures M01–M04 and numbered screenshots).
