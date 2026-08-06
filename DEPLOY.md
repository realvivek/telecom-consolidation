# Deploying a static site to Render

The method that works, written down because working it out took far longer than
doing it.

## The short version

Render deploys by **watching a branch of a GitHub repo**. Nothing pushes to
Render — you connect a service once, and after that every push to the watched
branch deploys on its own. The one-time connect is the whole problem, and there
are two ways to do it.

| | Connect via | Needs | Good for |
|---|---|---|---|
| **A** | Render dashboard → Blueprints | `render.yaml`, two clicks | You are at a keyboard |
| **B** | GitHub Actions → Render REST API | `RENDER_API_KEY` repo secret | An agent doing it unattended |

Both end in the same place: one Render service, `autoDeploy` on, watching one
branch.

## The trap that cost the time

**A workflow only runs if it exists on the repository's default branch.**

GitHub registers workflows from the default branch only. A workflow sitting on a
feature branch is invisible: it will not appear in the Actions tab, `workflow_dispatch`
returns 404, and dispatch-by-API fails the same way. It looks exactly like a
broken workflow, and it is not.

This is why `decibel` "just worked" and this repo did not — `decibel` has exactly
one branch, `claude/decibel-project-setup-xovup4`, so that branch *is* its
default branch. Here, `main` was the default and the work was on a feature
branch.

**So: the deploy workflow and the deployed branch should both be the default
branch.** Either develop on the default branch, or merge before expecting a
deploy.

Two smaller traps, worth knowing:

- **`render.yaml` is only read by Blueprints.** A service created through the
  REST API never looks at it. If you use route B, the settings have to be in the
  API call as well — keep the two in step or you will wonder why your cache
  headers vanished.
- **A repository secret is not readable outside a workflow.** If you put
  `RENDER_API_KEY` in *Settings → Secrets and variables → Actions*, only a
  workflow run can see it. An agent in a session cannot, and neither can you
  from a terminal. To let an agent call the API directly, the key has to be in
  that environment's variables instead — and those are injected at container
  start, so a session already running will not pick up a newly added one.

## Route A — dashboard

1. Commit `render.yaml` (see below).
2. [dashboard.render.com/blueprints](https://dashboard.render.com/blueprints) →
   **New Blueprint Instance** → pick the repo → pick the branch.

Done. No API key involved.

```yaml
# render.yaml
services:
  - type: web
    runtime: static
    name: your-service-name
    buildCommand: ""
    staticPublishPath: .
    autoDeploy: true
    headers:
      - path: /vendor/*      # versioned by path — cache hard
        name: Cache-Control
        value: public, max-age=31536000, immutable
      - path: /*             # changes every deploy — revalidate
        name: Cache-Control
        value: public, max-age=0, must-revalidate
```

## Route B — workflow

1. Create an API key: [dashboard.render.com](https://dashboard.render.com) →
   avatar → **Account Settings** → **API Keys** → **Create API Key**. It is shown
   in full exactly once. Note that Render keys are *user*-scoped — the key acts
   as you across every workspace you belong to, with no per-service scoping.
2. Repo → **Settings → Secrets and variables → Actions** → new secret named
   `RENDER_API_KEY`.
3. Commit `.github/workflows/deploy-render.yml` (this repo's copy is a working
   template) **on the default branch**.
4. Actions tab → the workflow → **Run workflow**. The first run creates the
   service; every run after triggers a deploy.

The workflow finds the service by matching `owner/repo` against
`GET /v1/services`, so it is idempotent — re-running never makes a second
service. It then waits for the deploy to report `live`, and finally reads the
live URL until it returns the expected content five times in a row. That last
part is not paranoia: a fresh Render edge flaps while propagating, and a stray
404 can get cached until the next deploy purges it.

## Verifying

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://your-service.onrender.com
curl -sSI https://your-service.onrender.com/vendor/anything | grep -i cache-control
```

## Where to put this for new projects

**Put a `## Deploy` section in the repo's `CLAUDE.md`.** That is the file Claude
Code reads automatically at the start of every session, so the setup is known
before anyone asks. It travels with the repo, which matters because these
sessions are ephemeral — nothing outside the repo survives.

Keep it factual and specific. This is the shape that works:

```markdown
## Deploy

Live at **https://<service>.onrender.com** — a Render static site (publish path
`.`) tracking `<branch>` with autoDeploy on: **every push deploys**.
`RENDER_API_KEY` lives in the repo's GitHub Actions secrets, so API work happens
in `.github/workflows/deploy-render.yml`. `render.yaml` is the blueprint for
connecting through the dashboard; a service created through the API never reads
it, so the two carry the same settings.
```

Two things make that section earn its place: **the live URL** and **which branch
deploys**. Everything else can be re-derived; those two cannot.

If you use Claude Code on your own machine as well, the same block in
`~/.claude/CLAUDE.md` applies it to every project at once. In an ephemeral web
session that file does not persist, so treat the per-repo copy as the real one.

## Copy-paste starter for a new static project

```bash
mkdir -p .github/workflows
curl -sO https://raw.githubusercontent.com/realvivek/telecom-consolidation/main/render.yaml
curl -s -o .github/workflows/deploy-render.yml \
  https://raw.githubusercontent.com/realvivek/telecom-consolidation/main/.github/workflows/deploy-render.yml
# then edit the service name, the repo URL and the branch in both files
```
