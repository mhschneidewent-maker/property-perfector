## Batch photo upload with per-photo enhancement

Add a new **Batch** mode to the Studio so clients can drop many photos at once and configure each one independently before running everything in parallel.

### User flow

1. On `/studio`, add a top toggle: **Single** (current) / **Batch** (new).
2. In Batch mode, the drop zone accepts multiple files (drag/drop or picker). Files stream into a grid of "photo cards".
3. Each card shows:
   - Thumbnail + filename + remove (×) button
   - **Enhancement** dropdown (Twilight, Sky Replace, Virtual Stage, Kitchen Remodel, Bathroom Remodel, …)
   - If the choice is a Decor8 service (stage / kitchen / bathroom): inline compact controls for **style**, **room type** (staging only), **variations** slider (1–4), and optional prompt
4. A sticky footer summarizes: total photos, total variations, **estimated cost** (`Σ variations × $0.20` for Decor8 photos, other services counted per-photo), and a big **Run batch** button.
5. On run: upload all originals in parallel, insert one `projects` row per photo with its chosen settings, then invoke the correct edge function per project with a small concurrency cap (e.g. 3 at a time) to avoid Decor8 rate limits.
6. Below the grid, a **Results** section subscribes to realtime updates and shows per-photo progress (queued → processing → done/failed) plus a preview and download link once ready. A **Download all** button zips finished outputs.

### Technical notes

- New component `src/components/BatchStudio.tsx` renders the grid + footer; each card is `BatchPhotoCard.tsx` with local state `{ file, enhancement, style, roomType, prompt, numVariations, projectId?, status, resultUrls[] }`.
- Studio page gains a `mode` state; when `batch`, render `<BatchStudio />` instead of the existing single-photo UI. All existing single-mode code stays intact.
- Concurrency: a simple `pLimit`-style helper (no new dep) — `async function runWithLimit(tasks, n)`.
- Reuses existing edge functions (`enhance-photo`, `decor8-stage`) and existing DB schema — no migrations needed. Each photo = one `projects` row, exactly like today.
- Realtime: one channel subscribed to `projects` filtered by `user_id=eq.<uid>` updates card statuses; a second subscription on `staging_results` fills Decor8 variation thumbnails.
- Cost estimator: Decor8 rows = `numVariations × $0.20`; non-Decor8 rows = `$0.05` flat placeholder (same as today's single-mode implicit cost — kept consistent).
- "Download all as ZIP" uses `jszip` (small, add via `bun add jszip`) to bundle signed-URL fetches client-side.
- No changes to enhancement definitions, pricing constants, or existing single-mode logic.

### Files

- new `src/components/BatchStudio.tsx`
- new `src/components/BatchPhotoCard.tsx`
- new `src/lib/concurrency.ts` (tiny `runWithLimit` helper)
- edit `src/pages/Studio.tsx` (add Single/Batch toggle + mount BatchStudio)
- `bun add jszip`

### Out of scope (ask if you want them)

- CSV/folder import with filename → room-type auto-detection
- Per-photo custom variation-level pricing overrides
- Saving batch presets to reuse settings across sessions
