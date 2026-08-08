# The Consolidation

**Forty years of American telecom mergers — 66 companies, 76 deals, 1983 to 2026 — in a chart that says which company each one ended up inside, plus a 3D city where every acquisition is a storey.**

🔗 **Live**: https://telecom-consolidation.onrender.com
(also on GitHub Pages: https://realvivek.github.io/telecom-consolidation/)

## What it is

In 1984 a federal consent decree shattered the Bell System — the largest corporate
breakup in history — into a long-distance carrier and seven regional "Baby Bells."
Over the next four decades more than sixty companies and over a trillion dollars of
deals slowly put the pieces back together into a handful of giants.

The page tells that story three ways, all reading from the same dataset:

**The bubble map** is the default view. Every company is one bubble, sized by the
price paid for it, sitting inside the bubble of whoever owned it in the year on
the clock. Play it and companies slide into their buyer as each deal closes —
sixty-six separate bubbles in 1983, a handful of clusters by 2026. Containment
answers "who ended up inside whom" without tracing anything. The layout is one
continuous relaxation rather than a fresh pack per frame, so a merger reads as a
movement you can follow rather than everything teleporting on every tick. Click a
bubble and the rest recede while its whole chain of owners is written out — the
answer the thread chart made you trace by eye. The search box and sector chips
drive both views.

**The lineage chart** is the precise reference, one click away. Every company is one horizontal thread with
its name in a fixed left gutter, time runs left to right, and a company that was
bought has its thread sweep into the thread that bought it and stop there. Threads
are grouped by the trunk they ended up inside, so each block is one surviving
company and everything now within it. A year rail follows the top of the viewport
while the chart is in view. Threads still independent today are drawn in blue and
run to the right edge; everything absorbed is neutral grey; blocked deals are the
one reserved red.

**Story mode** is the same data as a city at night, in eight narrated chapters.
It opens by default on a desktop; on a phone it waits to be asked, and its card
collapses to a caption so the city it describes stays visible. Every company
still standing today gets a building; every acquisition it made is a storey, stacked
in the order the deals closed, with storey height set by the announced price. A
building's total height is therefore the money it spent buying its way to where it
is — AT&T's $408B tower stands over everything else on the plaza. Press play and the
city builds itself between 1983 and 2026: storeys slide into place as deals close,
traffic runs the streets, and lamplight pools on the pavement.

Deals that never closed are there too, as ghost storeys — red outlines rising out
of the roof at the height they would have occupied, then collapsing back into it
and leaving a scar on the parapet. WorldCom's $129B bid for Sprint is taller than
most finished buildings in the city. Announced-but-unclosed deals are scaffolding
on the roof; a company changing owner lights a marker rather than adding a floor.
Click any building to walk up to it and read its storeys by name.

The camera is fitted once, to the whole plaza at its final height, and then left
alone for the entire story. Nothing can grow out of frame, because the frame was
built for the finished city; every building keeps the same place on the screen
from 1983 to 2026; and the story is told by which buildings are lit and named,
not by where the camera is pointing. The city fills a frame that was always
waiting for it.

Only the companies a chapter is about keep their lights on. Every other building
— the rest of the data city included — goes dark, walls and windows both, so it
recedes into the surrounding fabric rather than standing in the front row with
no name on it. The lights fade rather than switch, so a chapter change reads as
the city handing the story on. Walk up to a building and it becomes the only lit
thing in the frame. The prologue has no cast at all, so the plaza stays dark
behind the Bell System's monument; the last chapter has the whole skyline.

Lit and named are the same set, deliberately: a nameplate that cannot be placed
takes its building's lights with it, so a lit window always has a name over it
and a name always has a leader down to a lit roof. The leader is drawn from the
foot of the box to the roof at whatever angle joins the two, and ends in a dot on
the roof itself, so which building a label belongs to is never a guess. Labels
avoid the lit buildings as well as each other — the declutter pass used to know
only about other labels, which is how a chapter about six companies ended up with
three of them behind captions. A deal that was blocked is a line inside the plate
of the company that tried it, not a second label competing for the same roof.

The architecture is borrowed from Chicago — Sears Tower setbacks, a tapered Hancock
tube, Aon's limestone slab, Board of Trade deco, Tribune Gothic pinnacles, Wrigley
terracotta, Marina City cylinders, Monadnock brick, Mies glass boxes. The city sits on a paved plaza inside a
wider low-rise city that fades into haze, under a low afternoon sun with four
ridges of hills behind it. Nothing in the surrounding fabric is ever labelled or lit,
and none of it changes with the year, so the data buildings stay the heroes while
the skyline stops ending in mid-air.

Every volume is glazed. Windows are drawn with a recess, a sill and a lintel, at
a fixed world size, so a tall storey gets more rows rather than a stretched grid
— and the surrounding fabric is glazed on the same pitch, so a two-storey shed
and a ten-storey block carry the same window. The texture carries the hue and
the material carries only a value gradient up the building, which keeps a dark
tube from crushing to a silhouette while a limestone slab stays paper-white.
Every edge is chamfered, so the sun catches along each arris. On the streets:
kerbs, crossings at every junction, lamp posts, planters, benches, bins, and
vents and steam on the roofs.

None of the styling means anything: massing, façade and crown are decoration, and
only storey height is data. Height is linear in deal value with a minimum so the
smallest deals stay visible. Perspective makes 3D heights hard to compare precisely,
which is why the flat bar chart on the page remains the accurate view and this is
the one you walk around.

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
  through an import map. A daylit scene: gradient sky dome, a low sun with soft
  shadow mapping and layered glare sprites, drifting clouds, and four
  procedurally generated horizon ridges painted with aerial perspective. Each
  building's massing comes from a style `profile(fraction) → width` function,
  which is what produces the setbacks and tapers. Façades are box-projected so
  the same texture reads correctly on every face of a slab, and the fabric's
  instanced boxes divide their own instance scale in the vertex shader to hold
  the window pitch constant across every size of building. Trees are clustered
  instanced canopies.
- **Rendering**: the scene draws into a linear half-float target carrying its own
  depth texture, and a single resolve pass reads colour and depth together to
  apply screen-space ambient occlusion, exposure, ACES tone mapping and the
  transfer function. Sixteen golden-angle samples per pixel with a per-pixel
  rotation; normals are reconstructed from the nearer neighbour on each axis so
  silhouettes do not smear. Contact shadows sit under every volume as well —
  shadow maps give you the sun, occlusion gives you the corners. The canvas is
  supersampled rather than multisampled, since a resolve pass means MSAA never
  reaches it. `CSS2DRenderer` gives crisp DOM labels, with a
  screen-space declutter pass. Labels are ranked — the focused building, then
  blocked deals, then nameplates biggest-spender-first — and each one is lifted
  clear of its neighbours on a growing stem, or slid back in from the edge of
  the frame on a leaning one, before it is given up as unplaceable. Both tests
  use real boxes: every label is measured once in a single pass, and the panels
  are measured rather than guessed at, since the deal card moves and resizes
  with its contents. The camera fit keeps one nameplate's worth of headroom
  above the skyline, so framing the tallest building never costs it its name.
  Loaded lazily — the module is only fetched when someone opens it.
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
js/bubbles.js   the bubble map on a clock (lazy-loaded)
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

## Deploy

Live at **https://telecom-consolidation.onrender.com** — a Render static site
(publish path `.`) tracking `main` with autoDeploy on: **every push to `main`
deploys**. `render.yaml` is the blueprint for connecting the repo through the
Render dashboard; a service created through the REST API never reads it, so
`.github/workflows/deploy-render.yml` carries the same settings and is what
created this one. `RENDER_API_KEY` lives in the repo's GitHub Actions secrets.

The workflow verifies each deploy with five consecutive clean reads of the live
URL — a fresh edge flaps while propagating, and a stray 404 can get cached until
the next deploy purges it.

GitHub Pages also builds from `main`, so both URLs serve the same commit.
