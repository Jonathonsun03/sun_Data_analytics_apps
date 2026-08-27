---
title: Overview
theme: dashboard
toc: false
---

```js
import {metricGrid} from "./components/metric-card.js";
import {lineChart} from "./components/line-chart.js";
import {horizontalBarChart} from "./components/bar-chart.js";
import {topVideosTable} from "./components/top-videos-table.js";

const data = await FileAttachment("./data/overview.json").json();
```

<div class="prototype-banner">
Prototype branch only — the values below are illustrative and are not production analytics.
</div>

<div class="app-topbar">
  <div class="brand-lockup">
    <div class="brand-mark">S</div>
    <div>
      <div class="brand-name">Sun Data Analytics</div>
      <div class="brand-subtitle">YouTube Creator Intelligence</div>
    </div>
  </div>
  <div class="account-chip">Authenticated client view · prototype</div>
</div>

<div class="section-nav" aria-label="Dashboard sections">
  <span class="active">Overview</span>
  <span>Creator Performance</span>
  <span>Content Strategy</span>
  <span>Publishing Schedule</span>
  <span>Audience</span>
  <span>Recommendations</span>
</div>

<div class="dashboard-hero">
  <div>
    <div class="eyebrow">Creator overview</div>
    <h1>${data.creator}</h1>
    <p>
      A browser-rendered operating view of channel performance. The production version
      will use the existing Cloudflare identity and talent entitlements before any
      protected analytics data are returned.
    </p>
  </div>
  <div class="hero-meta">${data.window}<br>Data through ${data.updated}</div>
</div>

${metricGrid(data.metrics)}

<div class="dashboard-grid">
  <section class="panel">
    <div class="panel-heading">
      <div>
        <div class="panel-kicker">Performance</div>
        <div class="panel-title">Views over time</div>
      </div>
      <div class="panel-note">Hover the chart</div>
    </div>
    ${resize((width) => lineChart(data.performance, {width: Math.max(width, 360), height: 310}))}
  </section>

  <section class="panel">
    <div class="panel-heading">
      <div>
        <div class="panel-kicker">Engagement</div>
        <div class="panel-title">Average viewed by content type</div>
      </div>
      <div class="panel-note">Percent</div>
    </div>
    ${resize((width) => horizontalBarChart(data.contentEngagement, {width: Math.max(width, 320), height: 270}))}
  </section>
</div>

<section class="panel">
  <div class="panel-heading">
    <div>
      <div class="panel-kicker">Content</div>
      <div class="panel-title">Top videos</div>
    </div>
    <div class="panel-note">Latest selected snapshot</div>
  </div>
  ${topVideosTable(data.topVideos)}
</section>
