import * as d3 from "npm:d3";

export function horizontalBarChart(data, {
  width = 640,
  height = 280,
  category = d => d.contentType,
  value = d => d.averageViewPercentage,
  valueSuffix = "%"
} = {}) {
  const marginTop = 18;
  const marginRight = 54;
  const marginBottom = 24;
  const marginLeft = 88;

  const x = d3.scaleLinear()
    .domain([0, Math.max(100, d3.max(data, value) || 0)])
    .range([marginLeft, width - marginRight]);

  const y = d3.scaleBand()
    .domain(data.map(category))
    .range([marginTop, height - marginBottom])
    .padding(0.34);

  const svg = d3.create("svg")
    .attr("class", "d3-chart")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("role", "img")
    .attr("aria-label", "Average view percentage by content type");

  svg.append("g")
    .attr("class", "chart-grid")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(
      d3.axisBottom(x)
        .ticks(5)
        .tickSize(-(height - marginTop - marginBottom))
        .tickFormat("")
    )
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(${marginLeft},0)`)
    .call(d3.axisLeft(y).tickSize(0))
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .selectAll("rect")
    .data(data)
    .join("rect")
    .attr("class", "chart-bar")
    .attr("x", marginLeft)
    .attr("y", d => y(category(d)))
    .attr("height", y.bandwidth())
    .attr("width", d => x(value(d)) - marginLeft)
    .attr("rx", 6);

  svg.append("g")
    .selectAll("text")
    .data(data)
    .join("text")
    .attr("class", "chart-bar-label")
    .attr("x", d => x(value(d)) + 8)
    .attr("y", d => y(category(d)) + y.bandwidth() / 2)
    .attr("dy", "0.35em")
    .text(d => `${value(d).toFixed(1)}${valueSuffix}`);

  return svg.node();
}
