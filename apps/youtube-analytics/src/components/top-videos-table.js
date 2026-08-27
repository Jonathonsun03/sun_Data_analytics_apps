const number = new Intl.NumberFormat("en-US");

export function topVideosTable(rows) {
  const wrapper = document.createElement("div");
  wrapper.className = "table-wrap";

  const table = document.createElement("table");
  table.className = "top-videos-table";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Video</th>
      <th>Type</th>
      <th class="numeric">Views</th>
      <th class="numeric">Avg. viewed</th>
    </tr>
  `;

  const tbody = document.createElement("tbody");

  for (const row of rows) {
    const tr = document.createElement("tr");

    const title = document.createElement("td");
    title.className = "video-title";
    title.textContent = row.title;

    const type = document.createElement("td");
    const badge = document.createElement("span");
    badge.className = "type-badge";
    badge.textContent = row.type;
    type.append(badge);

    const views = document.createElement("td");
    views.className = "numeric";
    views.textContent = number.format(row.views);

    const viewed = document.createElement("td");
    viewed.className = "numeric";
    viewed.textContent = `${row.averageViewPercentage.toFixed(1)}%`;

    tr.append(title, type, views, viewed);
    tbody.append(tr);
  }

  table.append(thead, tbody);
  wrapper.append(table);
  return wrapper;
}
