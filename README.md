# The Consolidation

**Forty years of American telecom mergers — 66 companies, 76 deals, 1983 to 2026 — in a chart that says which company each one ended up inside, plus a 3D city where every acquisition is a storey.**

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

**Story mode** is the same data as a city, in eight narrated chapters. Every company
still standing today gets a building; every acquisition it made is a storey, stacked
in the order the deals closed, with storey height set by the announced price. A
building's total height is therefore the money it spent buying its way to where it
is — AT&T's $408B tower stands over everything else on the plaza. Press play and the
city builds itself between 1983 and 2026: storeys slide into place as deals close,
traffic runs the streets, and the sun casts the whole thing across the pavement.

Deals that never closed are there too, as ghost storeys — red outlines hanging beside
the building at the height they would have occupied. WorldCom's $129B bid for Sprint
is taller than most finished buildings in the city. Announced-but-unclosed deals are
scaffolding on the roof; a company changing owner lights a marker rather than adding
a floor. Click any building to walk up to it and read its storeys by name.

Height is linear in deal value with a minimum so the smallest deals stay visible, and
façade colour is architecture rather than data. Perspective makes 3D heights hard to
compare precisely, which is why the flat bar chart on the page remains the accurate
view and this is the one you walk around.

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
  through an import map. A daylit scene: gradient sky dome, a single sun with soft
  shadow mapping, procedural façade and asphalt textures generated on canvas, and
  instanced pedestrians and trees. `CSS2DRenderer` gives crisp DOM labels, with a
  screen-space declutter pass that drops any label which would overprint a nearer
  one or land on the interface. Loaded lazily — the module is only fetched when
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
js/story.js     the 3D city (lazy-loaded)
js/main.js      wiring, controls, tooltips
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

(Any static server works; ES modules require http://, not file://.)
