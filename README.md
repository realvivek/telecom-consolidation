# The Consolidation

**A 3D scroll-driven visualization of forty years of American telecom mergers — from the 1984 Bell System breakup to today's three giants.**

🔗 **Live**: https://realvivek.github.io/telecom-consolidation/

## What it is

In 1984, a federal consent decree shattered the Bell System — the largest corporate breakup in history — into a long-distance carrier and seven regional "Baby Bells." Over the next four decades, more than sixty companies and over a trillion dollars of deals slowly reassembled the pieces into a handful of giants.

This project renders that story as a **river of light in 3D space**: every company is a glowing thread flowing through time, every merger a confluence where one stream is absorbed into another. Scrolling flies the camera through the decades in eight narrative chapters; blocked deals snap back in red, pending deals hang as dashed threads, and every merger node is clickable for the deal's story.

## How it's built

- **[three.js](https://threejs.org)** r160, vendored locally and loaded via an ES-module import map — no build step, no bundler, no CDN dependency
- Custom variable-radius tube geometry with parallel-transport frames (threads visibly thicken as they absorb competitors)
- `UnrealBloomPass` for the glow, `CSS2DRenderer` for crisp DOM labels
- Hand-rolled scroll-to-camera-path rig (Catmull-Rom keyframes + exponential damping) — no animation library
- Sector palette validated for color-vision deficiency (adjacent-sector ΔE ≥ 8.4 under CVD simulation)
- Graceful degradation: FPS-based quality guard, reduced-motion support, and a full HTML deal chronology if WebGL is unavailable

## The data

~65 deals and ~63 company lineages curated from SEC filings, FCC orders, company press releases, and contemporary coverage — including the failed deals (WorldCom–Sprint, AT&T–T-Mobile, EchoStar–DirecTV twice) and the ones still pending (Charter–Cox). Deal values are announced transaction values in nominal dollars. Last updated July 2026.

All data lives in [`js/data.js`](js/data.js) — corrections welcome via PR.

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works; ES modules require http://, not file://.)
