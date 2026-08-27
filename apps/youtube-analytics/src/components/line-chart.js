import * as d3 from "npm:d3";

export function lineChart(data, {
  width = 800,
  height = 320,
  x = d => new Date(d.month),
  y = d => d.views,
  xLabel = null,
  yLabel = "Views"
} = {}) {
  const marginTop = 18;
  const marginRight = 22;
  const marginBottom = 42;
  const marginLeft = 64;

  const xScale = d3.scaleUtc()
    .domain(d3.extent(data, x))
    .range([marginLeft, width - marginRight]);

  const yScale = d3.scaleLinear()
    .domain([0, d3.max(data, y) || 0])
    .nice()
    .range([height - marginBottom, marginTop]);

  const svg = d3.create("svg")
    .attr("class", "d3-chart")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height)
    .attr("role", "img")
    .attr("aria-label", "Monthly performance line chart");

  svg.append("g")
    .attr("class", "chart-grid")
    .attr("transform", `translate(${marginLeft},0)`)
    .call(
      d3.axisLeft(yScale)
        .ticks(5)
        .tickSize(-(width - marginLeft - marginRight))
        .tickFormat("")
    )
    .call(g => g.select(".domain").remove());

  svg.append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(d3.axisBottom(xScale).ticks(Math.min(data.length, 8)).tickFormat(d3.utcFormat("%b")));

  svg.append("g")
    .attr("class", "chart-axis")
    .attr("transform", `translate(${marginLeft},0)`)
    .call(d3.axisLeft(yScale).ticks(5).tickFormat(d3.format("~s")))
    .call(g => g.select(".domain").remove());

  const area = d3.area()
    .x(d => xScale(x(d)))
    .y0(yScale(0))
    .y1(d => yScale(y(d)))
    .curve(d3.curveMonotoneX);

  const line = d3.line()
    .x(d => xScale(x(d)))
    .y(d => yScale(y(d)))
    .curve(d3.curveMonotoneX);

  svg.append("path")
    .datum(data)
    .attr("class", "chart-area")
    .attr("d", area);

  svg.append("path")
    .datum(data)
    .attr("class", "chart-line")
    .attr("d", line);

  svg.append("g")
    .selectAll("circle")
    .data(data)
    .join("circle")
    .attr("class", "chart-point")
    .attr("cx", d => xScale(x(d)))
    .attr("cy", d => yScale(y(d)))
    .attr("r", 3.5);

  const focus = svg.append("g").style("display", "none");
  focus.append("line")
    .attr("class", "chart-focus-line")
    .attr("y1", marginTop)
    .attr("y2", height - marginBottom);

  focus.append("circle")
    .attr("class", "chart-focus-point")
    .attr("r", 5);

  const focusLabel = focus.append("g").attr("class", "chart-focus-label");
  focusLabel.append("rect").attr("rx", 8).attr("ry", 8);
  const focusText = focusLabel.append("text");

  const bisect = d3.bisector(x).center;
  const dateFormat = d3.utcFormat("%b %Y");
  const valueFormat = d3.format(",");

  svg.append("rect")
    .attr("class", "chart-overlay")
    .attr("x", marginLeft)
    .attr("y", marginTop)
    .attr("width", Math.max(0, width - marginLeft - marginRight))
    .attr("height", Math.max(0, height - marginTop - marginBottom))
    .on("pointerenter", () => focus.style("display", null))
    .on("pointerleave", () => focus.style("display", "none"))
    .on("pointermove", function(event) {
      const [px] = d3.pointer(event, this);
      const date = xScale.invert(px + marginLeft);
      const i = Math.max(0, Math.min(data.length - 1, bisect(data, date)));
      const d = data[i];
      const cx = xScale(x(d));
      const cy = yScale(y(d));

      focus.select(".chart-focus-line").attr("x1", cx).attr("x2", cx);
      focus.select(".chart-focus-point").attr("cx", cx).attr("cy", cy);

      focusText.text(`${dateFormat(x(d))} · ${valueFormat(y(d))}`);
      const bbox = focusText.node().getBBox();
      const labelX = Math.min(width - marginRight - bbox.width - 22, Math.max(marginLeft, cx + 12));
      const labelY = Math.max(marginTop + 20, cy - 16);

      focusLabel.attr("transform", `translate(${labelX},${labelY})`);
      focusLabel.select("rect")
        .attr("x", -8)
        .attr("y", -16)
        .attr("width", bbox.width + 16)
        .attr("height", 24);
    });

  if (yLabel) {
    svg.append("text")
      .attr("class", "chart-label")
      .attr("x", marginLeft)
      .attr("y", 12)
      .text(yLabel);
  }

  if (xLabel) {
    svg.append("text")
      .attr("class", "chart-label")
      .attr("x", width - marginRight)
      .attr("y", height - 4)
      .attr("text-anchor", "end")
      .text(xLabel);
  }

  return svg.node();
}
