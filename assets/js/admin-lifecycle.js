(() => {
  const root = document.querySelector("[data-lifecycle-root]");
  if (!root) return;
  const legacyList = root.querySelector("[data-lifecycle-list]");
  const unmapped = root.querySelector("[data-lifecycle-unmapped]") || legacyList;
  const status = root.querySelector("[data-lifecycle-status]");
  const refresh = root.querySelector("[data-lifecycle-refresh]");
  let busy = false;
  let snapshot = null;
  let failed = false;

  const request = async (path, body) => {
    const response = await fetch(path, {
      method: body ? "POST" : "GET", credentials: "same-origin", cache: "no-store",
      headers: body ? { "Content-Type": "application/json", "X-SDA-Admin": "1" } : {},
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Lifecycle request failed.");
    return payload;
  };

  const note = (container, message, className = "admin-panel-help") => {
    const paragraph = document.createElement("p");
    paragraph.className = className;
    paragraph.textContent = message;
    container.append(paragraph);
  };

  const renderState = (container, talent) => {
    note(container, `Collection: ${talent.retrieval_enabled ? "enabled" : "stopped"}. Processing: ${talent.processing_enabled ? "enabled" : "stop requested; future work blocked"}.`);
    note(container, talent.updated_at ? `Last saved: ${talent.updated_at} by ${talent.updated_by}`
      : "No saved change.", "admin-lifecycle-metadata");
    const buttons = document.createElement("div");
    buttons.className = "admin-row-actions";
    for (const [action, label] of [
      [talent.retrieval_enabled ? "archive" : "restore", talent.retrieval_enabled ? "Stop collection" : "Resume collection"],
      [talent.processing_enabled ? "pause" : "resume", talent.processing_enabled ? "Stop processing" : "Resume processing"]
    ]) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = label;
      button.dataset.lifecycleAction = action;
      button.disabled = busy || !snapshot.writes_enabled;
      button.addEventListener("click", () => save(talent, action));
      buttons.append(button);
    }
    container.append(buttons);
  };

  const render = () => {
    const slots = Array.from(root.querySelectorAll("[data-lifecycle-talent]"));
    const byCode = new Map((snapshot?.talents || []).map(talent => [talent.talent_code, talent]));
    const catalogCodes = new Set();
    for (const slot of slots) {
      slot.replaceChildren();
      const code = slot.dataset.talentCode;
      if (!code) {
        note(slot, "Collection and processing controls require a catalog-linked talent.");
        continue;
      }
      catalogCodes.add(code);
      if (!snapshot) {
        note(slot, failed ? "Collection and processing status is unavailable. Use Refresh status to retry."
          : "Loading collection and processing status…");
      } else if (byCode.has(code)) {
        renderState(slot, byCode.get(code));
      } else {
        note(slot, "Collection and processing status is unavailable for this talent.");
      }
    }
    unmapped.replaceChildren();
    // Keep canonical talents visible even while their permission-catalog link is pending.
    if (snapshot && (legacyList || root.dataset.catalogReady === "true")) {
      for (const talent of snapshot.talents.filter(talent => !catalogCodes.has(talent.talent_code))) {
        const card = document.createElement("article");
        card.className = "admin-talent-card";
        const title = document.createElement("strong");
        title.textContent = `${talent.display_name} (${talent.talent_code})`;
        card.append(title);
        if (!legacyList) note(card, "Permission catalog link pending.");
        const controls = document.createElement("div");
        controls.className = "admin-talent-lifecycle";
        renderState(controls, talent);
        card.append(controls);
        unmapped.append(card);
      }
    }
  };

  const load = async () => {
    snapshot = null;
    failed = false;
    render();
    try {
      snapshot = await request("/api/admin/lifecycle");
      render();
      if (!snapshot.writes_enabled) status.textContent = "Collection and processing editing is not enabled.";
    } catch (error) {
      snapshot = null;
      failed = true;
      render();
      throw error;
    }
  };

  const save = async (talent, action) => {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    root.querySelectorAll("[data-lifecycle-action]").forEach(button => { button.disabled = true; });
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
    render();
    refresh.disabled = false;
  };

  const reload = async () => {
    if (busy) return;
    busy = true;
    refresh.disabled = true;
    status.textContent = "Loading collection and processing status…";
    try { await load(); if (snapshot?.writes_enabled) status.textContent = "Status refreshed."; }
    catch (error) { status.textContent = error.message; }
    busy = false;
    render();
    refresh.disabled = false;
  };
  root.addEventListener("talent-catalog-rendered", render);
  refresh.addEventListener("click", reload);
  reload();
})();
