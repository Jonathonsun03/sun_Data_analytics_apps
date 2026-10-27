(() => {
  const root = document.querySelector("[data-lifecycle-root]");
  if (!root) return;
  const list = root.querySelector("[data-lifecycle-list]");
  const status = root.querySelector("[data-lifecycle-status]");
  const refresh = root.querySelector("[data-lifecycle-refresh]");
  let busy = false;

  const request = async (path, body) => {
    const response = await fetch(path, {
      method: body ? "POST" : "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: body ? { "Content-Type": "application/json", "X-SDA-Admin": "1" } : {},
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Lifecycle request failed.");
    return payload;
  };

  const load = async () => {
    // Remove stale controls even if refreshing fails.
    list.replaceChildren();
    const payload = await request("/api/admin/lifecycle");
    for (const talent of payload.talents) {
      const row = document.createElement("article");
      row.className = "admin-lifecycle-row";
      const title = document.createElement("strong");
      title.textContent = `${talent.display_name} (${talent.talent_code})`;
      const state = document.createElement("p");
      state.textContent = `Collection: ${talent.retrieval_enabled ? "enabled" : "stopped"}. Processing: ${talent.processing_enabled ? "enabled" : "pause requested; future work blocked"}. Revision: ${talent.revision}.`;
      const metadata = document.createElement("p");
      metadata.textContent = talent.updated_at
        ? `Last saved: ${talent.updated_at} by ${talent.updated_by}` : "No saved change.";
      const buttons = document.createElement("div");
      buttons.className = "admin-row-actions";
      const actions = [
        [talent.retrieval_enabled ? "archive" : "restore", talent.retrieval_enabled ? "Stop collection" : "Resume collection"],
        [talent.processing_enabled ? "pause" : "resume", talent.processing_enabled ? "Pause processing" : "Resume processing"]
      ];
      for (const [action, label] of actions) {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.disabled = !payload.writes_enabled;
        button.addEventListener("click", () => save(talent, action));
        buttons.append(button);
      }
      row.append(title, state, metadata, buttons);
      list.append(row);
    }
    if (!payload.writes_enabled) status.textContent = "Lifecycle editing is not enabled.";
  };

  const save = async (talent, action) => {
    if (busy) return;
    busy = true;
    root.querySelectorAll("button").forEach(button => { button.disabled = true; });
    try {
      await request(`/api/admin/lifecycle/${encodeURIComponent(talent.talent_code)}`, {
        action, expected_revision: talent.revision
      });
      status.textContent = "Saved. Workers observe controls at their next safe checkpoint.";
    } catch (error) {
      status.textContent = `${error.message} Status will be refreshed; the change will not be retried.`;
    }
    try { await load(); } catch (error) { status.textContent = error.message; }
    busy = false;
    refresh.disabled = false;
  };

  const reload = async () => {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    status.textContent = "Loading lifecycle status…";
    try { await load(); if (status.textContent === "Loading lifecycle status…") status.textContent = "Status refreshed."; }
    catch (error) { status.textContent = error.message; }
    busy = false;
    refresh.disabled = false;
  };
  refresh.addEventListener("click", reload);
  reload();
})();
