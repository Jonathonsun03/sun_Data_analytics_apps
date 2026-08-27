const compact = new Intl.NumberFormat("en-US", {notation: "compact", maximumFractionDigits: 1});
const currency = new Intl.NumberFormat("en-US", {style: "currency", currency: "USD", maximumFractionDigits: 0});
const integer = new Intl.NumberFormat("en-US", {maximumFractionDigits: 0});

function formatValue(metric) {
  if (metric.format === "currency") return currency.format(metric.value);
  if (metric.format === "integer") return integer.format(metric.value);
  return compact.format(metric.value);
}

export function metricCard(metric) {
  const card = document.createElement("article");
  card.className = "metric-card";

  const label = document.createElement("div");
  label.className = "metric-label";
  label.textContent = metric.label;

  const value = document.createElement("div");
  value.className = "metric-value";
  value.textContent = formatValue(metric);

  const change = document.createElement("div");
  change.className = "metric-change";
  const sign = metric.change > 0 ? "+" : "";
  change.textContent = `${sign}${metric.change.toFixed(1)}% vs prior period`;

  card.append(label, value, change);
  return card;
}

export function metricGrid(metrics) {
  const grid = document.createElement("div");
  grid.className = "metric-grid";
  for (const metric of metrics) grid.append(metricCard(metric));
  return grid;
}
