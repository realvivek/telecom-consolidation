# The Consolidation

**Forty years of American telecom mergers — 66 companies, 76 deals, 1983 to 2026 — in a chart that says which company each one ended up inside, plus a 3D story mode that flies you through it.**

🔗 **Live**: https://realvivek.github.io/telecom-consolidation/

## What it is

In 1984 a federal consent decree shattered the Bell System — the largest corporate
breakup in history — into a long-distance carrier and seven regional "Baby Bells."
Over the next four decades more than sixty companies and over a trillion dollars of
deals slowly put the pieces back together into a handful of giants.

The page tells that story twice, and both tellings read from the same dataset:

**The lineage chart** is the reference. Every company is one horizontal thread with
its name in a fixed left gutter, time runs left to right, and a company that was
bought has its thread sweep into the thread that bought it and stop there. Threads
are grouped by the trunk they ended up inside, so each block is one surviving
company and everything now within it. A year rail follows the top of the viewport
while the chart is in view. Threads still independent today are drawn in blue and
run to the right edge; everything absorbed is neutral grey; blocked deals are the
one reserved red.

**Story mode** is the same lineage in three dimensions, in eight narrated chapters.
Time still runs along one axis, but the other two are a ring: each surviving company
owns an angular wedge, and everything that ended up inside it rides in that wedge —
so a family reads as a braid of strands twisting into one, and the whole
cross-section stays in frame. The Bell System sits on the axis itself, which turns
the 1984 breakup into threads thrown outward to every wedge at once. Threads grow as
the years advance, trunks thicken with each acquisition, deal nodes flare as they
close, and only the companies the current chapter is about are labelled — that is
what keeps a scene with sixty-six threads in it legible.

Supporting views: how many companies were still independent in each year, how much
deal value each survivor pulled in, and a filterable ledger of all 76 transactions.

## How it's built

No build step, no bundler, no CDN — a static page of ES modules.

- **Flat views**: hand-built SVG and HTML. Light and dark are both *selected* — each
  mode has its own steps against its own surface, not an automatic flip.
- **Colour**: the encoding is blue (still independent) / neutral grey (absorbed) /
  reserved red (blocked), checked with a palette validator for lightness band, chroma
  floor, colour-vision separation and surface contrast in both modes. Five sector
  hues were tried first and dropped — no five-hue set from the palette clears the
  all-pairs gates, and identity here is carried by the name in the gutter anyway.
- **Story mode**: [three.js](https://threejs.org), vendored locally and loaded
  through an import map. Custom variable-radius tube geometry so a trunk visibly
  thickens as it absorbs; index order runs along the length so `setDrawRange` grows
  each thread with the clock. `UnrealBloomPass` for the glow, `CSS2DRenderer` for
  crisp DOM labels, with a screen-space declutter pass that drops any label which
  would overprint a nearer one. Loaded lazily — the module is only fetched when
  someone opens it.
- **Accessibility**: every value in a chart is also written out in the ledger,
  keyboard focus shows what hover shows, `prefers-reduced-motion` turns off autoplay,
  and the page works without WebGL (story mode simply stays hidden).

## The data

76 transactions and 66 company lineages curated from SEC filings, FCC orders,
company press releases and contemporary coverage — including the deals that died
(WorldCom–Sprint, AT&T–T-Mobile, EchoStar–DirecTV twice, Comcast–TWC) and the ones
still pending (Charter–Cox, Charter–Liberty Broadband). Values are announced
transaction values in nominal dollars, including assumed debt where that was the
headline figure. The set is curated rather than exhaustive: it covers the deals that
moved the industry's structure. Last updated July 2026.

All data lives in [`js/data.js`](js/data.js) — corrections welcome via PR.

## Layout

```
js/data.js      the dataset — companies, deals, chapters
js/model.js     derives the graph: who ended up inside whom, thread extents, totals
js/lineage.js   the SVG lineage chart
js/charts.js    the independent-company curve and the survivor bars
js/table.js     the deal ledger
js/story.js     the 3D scene (lazy-loaded)
js/main.js      wiring, controls, tooltips
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works; ES modules require http://, not file://.)
