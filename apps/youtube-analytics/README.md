# YouTube Analytics — Observable Framework + D3 Prototype

This directory is an isolated prototype for migrating the existing creator analytics dashboard from Quarto/Shiny presentation to **Observable Framework + D3**.

It currently exists only on the branch:

```text
draft/observable-d3-youtube-dashboard
```

It does not replace or modify the production Quarto launcher under `site/`.

## Why this is a sibling app

The Apps repo already separates:

- `site/` — the existing Quarto launcher
- `worker/` — Cloudflare Access/JWT and D1 permission infrastructure
- `migrations/` — D1 schema changes

The YouTube analytics experience is a separate application, so this prototype lives under:

```text
apps/youtube-analytics/
```

## Prototype scope

The prototype implements only the current dashboard's **Overview** concept:

- Total Views
- Total Revenue
- Videos / Streams
- Average Views
- Views over time
- Average viewed by content type
- Top videos

The metrics and records in `src/data/overview.json` are illustrative prototype data. They are intentionally not presented as real talent analytics.

## Visualization rule

**D3 is the visualization standard.**

The prototype does not use:

- Observable Plot
- Plotly
- Chart.js
- Vega
- ECharts

Reusable components currently include:

```text
src/components/
├── metric-card.js
├── line-chart.js
├── bar-chart.js
└── top-videos-table.js
```

The line and bar charts are rendered directly with D3.

## Run locally

Requires Node.js 18 or newer.

```bash
cd apps/youtube-analytics
npm install
npm run dev
```

Observable Framework will start its preview server, normally at:

```text
http://127.0.0.1:3000/
```

Build static production assets with:

```bash
npm run build
```

The generated site is written to:

```text
dist/
```

Those static assets can eventually be served continuously by Nginx or another static web server. D3 executes in the visitor's browser.

## Intended production architecture

```text
Sun_Data_Analytics_Talent_Repo
        |
        v
Sun_Data_Analytics_Analyze_Talent_Data
R / Python / DuckDB
        |
        | dashboard-ready analytical outputs
        v
authenticated data boundary / API
        |
        v
sun_Data_analytics_apps
Observable Framework + D3
        |
        v
client browser
```

The long-term objective is to remove ordinary visualization interaction from the R/Shiny request cycle.

Heavy analytics and models should remain in the analysis pipeline. Reusable dashboard results should be persisted and exposed through a controlled data boundary.

## Authentication and authorization

The Apps repo already has a Cloudflare Worker + D1 entitlement system.

The production YouTube analytics application must preserve the same core security rule:

> Hiding a talent in the browser is not authorization.

The backend serving protected dashboard data must:

1. validate the Cloudflare Access JWT
2. derive the user's identity from the validated token
3. query the existing D1 entitlement model
4. determine the user's allowed talent IDs/codes
5. apply those permissions to every protected analytics query
6. reject attempts to request unauthorized talent data

Do not expose the complete internal DuckDB database directly to the browser.

## Existing analytics logic

The prototype is not intended to rewrite the existing analytical definitions.

The current dashboard entrypoint is in the analysis repository:

```text
r_scripts/notebooks/dashboards/talent_dashboard/dashboard.qmd
```

Dashboard data are assembled through:

```text
r_scripts/lib/dashboard/data/assemble.R
build_creator_dashboard_data()
```

That data assembly currently prepares overview metrics, monthly performance, content summaries, topic/tag/collaboration metrics, publishing metrics, lifecycle data, audience metrics, top videos, and recommendations.

The migration should separate:

- true analytics/modeling
- reusable dashboard aggregation
- data access
- visualization
- UI
- authorization

without changing metric definitions just to eliminate Quarto.

## Next prototype step

Replace `src/data/overview.json` with a development data adapter that produces the same Overview payload from the real unified DuckDB / existing dashboard preparation code.

Before wiring production data, verify metric parity against the existing Quarto dashboard.

After Overview parity is established, migrate sections in this order:

1. Creator Performance
2. Content Strategy
3. Publishing Schedule
4. Audience
5. Recommendations
6. Method Notes / supporting documentation

The current Quarto dashboard should remain available until the new application has feature parity, authorization parity, and validated metrics.
