// Data Export intentionally reuses the existing YouTube Analytics permission result.
// The browser never supplies an email or authoritative entitlement list.
(() => {
  const root = document.querySelector("[data-data-export-root]");
  if (!root) return;

  const localPreviewHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]"
  ]);
  const YOUTUBE_PRODUCT_ID = "youtube-analytics";
  const elements = {
    status: root.querySelector("[data-export-status]"),
    content: root.querySelector("[data-export-content]"),
    form: root.querySelector("[data-export-form]"),
    talents: root.querySelector("[data-export-talents]"),
    customRange: root.querySelector("[data-custom-range]"),
    submit: root.querySelector("[data-export-submit]"),
    backendNote: root.querySelector("[data-export-backend-note]")
  };
  let authorizedTalents = [];

  const setStatus = (message, tone = "info") => {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
  };

  const appendEmptyMessage = (container, message) => {
    const paragraph = document.createElement("p");
    paragraph.className = "admin-empty-message";
    paragraph.textContent = message;
    container.appendChild(paragraph);
  };

  const renderTalents = (permissions) => {
    elements.talents.replaceChildren();
    authorizedTalents = permissions.filter(
      (permission) =>
        permission?.type === "talent" &&
        typeof permission.code === "string" &&
        permission.code.length > 0
    );

    if (authorizedTalents.length === 0) {
      appendEmptyMessage(
        elements.talents,
        "No active YouTube Analytics talent permissions are assigned to this account."
      );
      return;
    }

    for (const permission of authorizedTalents) {
      const label = document.createElement("label");
      label.className = "admin-check";
      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.name = "talent";
      checkbox.value = permission.code;
      checkbox.checked = true;
      const text = document.createTextNode(permission.label);
      label.append(checkbox, text);
      elements.talents.appendChild(label);
    }
  };

  const configuredEndpoint = () => root.dataset.exportEndpoint?.trim() || "";

  const updateSubmitState = () => {
    const hasTalent = elements.form.querySelectorAll("input[name='talent']:checked").length > 0;
    const hasDataset = elements.form.querySelectorAll("input[name='dataset']:checked").length > 0;
    const endpoint = configuredEndpoint();
    elements.submit.disabled = !(hasTalent && hasDataset && endpoint);

    if (!endpoint) {
      elements.backendNote.textContent =
        "The client UI and authorization path are ready. Export generation will activate when a DuckDB export API endpoint is connected.";
    }
  };

  const updateDateRange = () => {
    const custom =
      elements.form.querySelector("input[name='dateMode']:checked")?.value === "custom";
    elements.customRange.toggleAttribute("hidden", !custom);
    elements.form.elements.startDate.required = custom;
    elements.form.elements.endDate.required = custom;
  };

  const requestedPayload = () => ({
    // The backend must re-check these requested codes against the verified
    // account's effective YouTube Analytics permissions before reading data.
    talentCodes: Array.from(
      elements.form.querySelectorAll("input[name='talent']:checked")
    ).map((input) => input.value),
    datasets: Array.from(
      elements.form.querySelectorAll("input[name='dataset']:checked")
    ).map((input) => input.value),
    dateRange:
      elements.form.elements.dateMode.value === "custom"
        ? {
            start: elements.form.elements.startDate.value,
            end: elements.form.elements.endDate.value
          }
        : null,
    format: elements.form.elements.format.value
  });

  elements.form.addEventListener("change", () => {
    updateDateRange();
    updateSubmitState();
  });

  elements.form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const endpoint = configuredEndpoint();
    if (!endpoint) return;

    elements.submit.disabled = true;
    setStatus("Preparing your export...", "info");

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json"
        },
        body: JSON.stringify(requestedPayload())
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || `Export request failed with ${response.status}.`);
      }

      if (typeof payload.downloadUrl !== "string" || payload.downloadUrl.length === 0) {
        throw new Error("The export service did not return a download URL.");
      }

      setStatus("Your export is ready.", "success");
      globalThis.location.assign(payload.downloadUrl);
    } catch (error) {
      setStatus(
        error instanceof Error ? error.message : "The export could not be created.",
        "error"
      );
    } finally {
      updateSubmitState();
    }
  });

  if (localPreviewHosts.has(globalThis.location.hostname)) {
    elements.content.removeAttribute("hidden");
    setStatus(
      "Permissions load after Cloudflare Access authentication in the deployed site.",
      "info"
    );
    appendEmptyMessage(
      elements.talents,
      "No client permissions are simulated in local preview."
    );
    updateDateRange();
    updateSubmitState();
    return;
  }

  fetch("/api/my-products", {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Permissions request failed with ${response.status}.`);
      }
      return response.json();
    })
    .then((payload) => {
      const products = Array.isArray(payload.products) ? payload.products : [];
      const youtubeAnalytics = products.find(
        (product) => product.id === YOUTUBE_PRODUCT_ID
      );
      renderTalents(
        Array.isArray(youtubeAnalytics?.permissions)
          ? youtubeAnalytics.permissions
          : []
      );
      elements.content.removeAttribute("hidden");

      if (authorizedTalents.length === 0) {
        setStatus(
          "Your account does not currently have an active YouTube Analytics talent assignment.",
          "error"
        );
      } else {
        setStatus(
          `Authorized for ${authorizedTalents.length} talent${authorizedTalents.length === 1 ? "" : "s"}. Data Export mirrors these YouTube Analytics permissions.`,
          "success"
        );
      }

      updateDateRange();
      updateSubmitState();
    })
    .catch((error) => {
      elements.content.removeAttribute("hidden");
      renderTalents([]);
      setStatus(
        error instanceof Error
          ? error.message
          : "Your permissions could not be loaded.",
        "error"
      );
      updateDateRange();
      updateSubmitState();
    });
})();
