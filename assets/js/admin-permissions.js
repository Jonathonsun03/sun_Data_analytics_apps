(() => {
  const root = document.querySelector("[data-admin-root]");

  if (!root) return;

  const elements = {
    status: root.querySelector("[data-admin-status]"),
    content: root.querySelector("[data-admin-content]"),
    addUserForm: root.querySelector("[data-add-user-form]"),
    addTalentForm: root.querySelector("[data-add-talent-form]"),
    userSearch: root.querySelector("[data-user-search]"),
    userList: root.querySelector("[data-user-list]"),
    emptySelection: root.querySelector("[data-empty-selection]"),
    userEditor: root.querySelector("[data-user-editor]"),
    editorTitle: root.querySelector("[data-editor-title]"),
    deleteUser: root.querySelector("[data-delete-user]"),
    productEditor: root.querySelector("[data-product-editor]"),
    managedGrants: root.querySelector("[data-managed-grants]"),
    catalogSync: root.querySelector("[data-catalog-sync-status]"),
    talentList: root.querySelector("[data-talent-list]"),
    auditList: root.querySelector("[data-audit-list]")
  };
  let state = null;
  let selectedUserId = null;

  const setStatus = (message, tone = "info") => {
    elements.status.textContent = message;
    elements.status.dataset.tone = tone;
    elements.status.removeAttribute("hidden");
  };

  const apiRequest = async (path, options = {}) => {
    const headers = new Headers(options.headers ?? {});
    const method = (options.method ?? "GET").toUpperCase();
    headers.set("Accept", "application/json");

    if (options.body) {
      headers.set("Content-Type", "application/json");
    }

    if (method !== "GET" && method !== "HEAD") {
      headers.set("X-SDA-Admin", "1");
    }

    const response = await fetch(path, {
      ...options,
      credentials: "same-origin",
      headers
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.error || `Request failed with ${response.status}.`);
    }

    return payload;
  };

  const setFormBusy = (form, busy) => {
    form.querySelectorAll("button").forEach((button) => {
      button.disabled = busy;
    });
    form.setAttribute("aria-busy", String(busy));
  };

  const appendEmptyMessage = (container, message) => {
    const paragraph = document.createElement("p");
    paragraph.className = "admin-empty-message";
    paragraph.textContent = message;
    container.appendChild(paragraph);
  };

  const productTitle = (productId) =>
    state.products.find((product) => product.id === productId)?.title ?? productId;

  const talentTitle = (talentId) =>
    state.talents.find((talent) => talent.id === talentId)?.displayName ?? talentId;

  const formatDate = (value) => {
    if (!value) return "Unknown time";
    const normalized = value.includes("T") ? value : `${value.replace(" ", "T")}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
  };

  const renderUserList = () => {
    const query = elements.userSearch.value.trim().toLowerCase();
    const users = state.users.filter((user) =>
      user.email.toLowerCase().includes(query)
    );
    elements.userList.replaceChildren();

    if (users.length === 0) {
      appendEmptyMessage(elements.userList, "No matching clients.");
      return;
    }

    for (const user of users) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "admin-user-option";
      button.dataset.selected = String(user.id === selectedUserId);
      button.addEventListener("click", () => selectUser(user.id));

      const email = document.createElement("span");
      email.textContent = user.email;
      const status = document.createElement("small");
      status.textContent = user.active ? "Active" : "Inactive";
      status.dataset.active = String(user.active);
      button.append(email, status);
      elements.userList.appendChild(button);
    }
  };

  const productAccessCard = (product, access) => {
    const fieldset = document.createElement("fieldset");
    fieldset.className = "admin-product-access";
    fieldset.dataset.productId = product.id;

    const legend = document.createElement("legend");
    const productLabel = document.createElement("label");
    const productCheckbox = document.createElement("input");
    productCheckbox.type = "checkbox";
    productCheckbox.checked = Boolean(access);
    productCheckbox.disabled = !product.active;
    productCheckbox.dataset.productToggle = "";
    const title = document.createElement("span");
    title.textContent = product.title;
    productLabel.append(productCheckbox, title);
    legend.appendChild(productLabel);
    fieldset.appendChild(legend);

    if (!product.active) {
      const inactive = document.createElement("p");
      inactive.textContent = "This product is inactive and cannot be newly assigned.";
      fieldset.appendChild(inactive);
      return fieldset;
    }

    const talentGrid = document.createElement("div");
    talentGrid.className = "admin-talent-grid";
    const activeTalents = state.talents.filter(
      (talent) =>
        talent.active &&
        (product.id !== "youtube-analytics" ||
          (talent.catalogActive && talent.talentCode))
    );

    if (activeTalents.length === 0) {
      appendEmptyMessage(talentGrid, "No active talents. Product-only access is allowed.");
    } else {
      for (const talent of activeTalents) {
        const label = document.createElement("label");
        label.className = "admin-check";
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.value = talent.id;
        checkbox.dataset.talentId = talent.id;
        checkbox.checked = access?.talentIds.includes(talent.id) ?? false;
        checkbox.disabled = !productCheckbox.checked;
        label.append(checkbox, document.createTextNode(talent.displayName));
        talentGrid.appendChild(label);
      }
    }

    productCheckbox.addEventListener("change", () => {
      talentGrid.querySelectorAll("input[type='checkbox']").forEach((checkbox) => {
        checkbox.disabled = !productCheckbox.checked;
      });
    });
    fieldset.appendChild(talentGrid);
    return fieldset;
  };

  const renderManagedGrants = (user) => {
    elements.managedGrants.replaceChildren();

    if (user.managedGrants.length === 0) {
      appendEmptyMessage(elements.managedGrants, "No source-owned grants.");
      return;
    }

    const list = document.createElement("ul");
    list.className = "admin-managed-list";

    for (const grant of user.managedGrants) {
      const item = document.createElement("li");
      const permission = grant.talentId
        ? `${productTitle(grant.productId)} — ${talentTitle(grant.talentId)}`
        : `${productTitle(grant.productId)} — Product access`;
      const source = document.createElement("strong");
      source.textContent = grant.source;
      const description = document.createElement("span");
      description.textContent = `${permission}${grant.active ? "" : " (inactive)"}`;
      item.append(source, description);
      list.appendChild(item);
    }

    elements.managedGrants.appendChild(list);
  };

  const renderEditor = () => {
    const user = state.users.find((candidate) => candidate.id === selectedUserId);

    if (!user) {
      elements.emptySelection.removeAttribute("hidden");
      elements.userEditor.setAttribute("hidden", "");
      return;
    }

    elements.emptySelection.setAttribute("hidden", "");
    elements.userEditor.removeAttribute("hidden");
    elements.editorTitle.textContent = user.email;
    elements.userEditor.elements.email.value = user.email;
    elements.userEditor.elements.active.checked = user.active;
    elements.productEditor.replaceChildren();

    for (const product of state.products) {
      const access = user.manualAccess.find(
        (assignment) => assignment.productId === product.id
      );
      elements.productEditor.appendChild(productAccessCard(product, access));
    }

    renderManagedGrants(user);
  };

  const selectUser = (userId) => {
    selectedUserId = userId;
    renderUserList();
    renderEditor();
  };

  const renderTalents = () => {
    elements.talentList.replaceChildren();

    if (state.catalogSync) {
      elements.catalogSync.textContent =
        `${state.catalogSync.discoveredCount} DuckDB talents synchronized ` +
        `${formatDate(state.catalogSync.syncedAt)}.`;
    } else {
      elements.catalogSync.textContent =
        "The DuckDB talent catalog has not been synchronized yet.";
    }

    if (state.talents.length === 0) {
      appendEmptyMessage(elements.talentList, "No talents have been added yet.");
      return;
    }

    for (const talent of state.talents) {
      const form = document.createElement("form");
      form.className = "admin-talent-row";
      const name = document.createElement("input");
      name.name = "displayName";
      name.value = talent.displayName;
      name.required = true;
      name.readOnly = Boolean(talent.talentCode);
      name.setAttribute("aria-label", `Talent name for ${talent.displayName}`);
      const activeLabel = document.createElement("label");
      activeLabel.className = "admin-check";
      const active = document.createElement("input");
      active.type = "checkbox";
      active.name = "active";
      active.checked = talent.active;
      activeLabel.append(active, document.createTextNode("Active"));
      const id = document.createElement("code");
      id.textContent = talent.talentCode
        ? `${talent.talentCode} · DuckDB`
        : `${talent.id} · manual`;
      const button = document.createElement("button");
      button.type = "submit";
      button.textContent = "Save";
      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "admin-danger-action";
      deleteButton.textContent = talent.talentCode ? "Catalog managed" : "Delete";
      deleteButton.disabled = Boolean(talent.talentCode);
      const actions = document.createElement("div");
      actions.className = "admin-row-actions";
      actions.append(button, deleteButton);
      form.append(name, activeLabel, id, actions);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (
          talent.active &&
          !active.checked &&
          !globalThis.confirm("Deactivating this talent removes its effective access. Save the change?")
        ) {
          return;
        }

        setFormBusy(form, true);
        try {
          await apiRequest(`/api/admin/talents/${talent.id}`, {
            method: "PUT",
            body: JSON.stringify({
              displayName: name.value,
              active: active.checked
            })
          });
          await loadState(selectedUserId);
          setStatus(`Saved talent '${name.value.trim()}'.`, "success");
        } catch (error) {
          setStatus(error.message, "error");
        } finally {
          setFormBusy(form, false);
        }
      });
      if (!talent.talentCode) {
        deleteButton.addEventListener("click", async () => {
          if (
            !globalThis.confirm(
              `Permanently delete '${talent.displayName}'? This removes it from every client's manual permissions and cannot be undone.`
            )
          ) {
            return;
          }

          setFormBusy(form, true);
          try {
            await apiRequest(`/api/admin/talents/${talent.id}`, {
              method: "DELETE"
            });
            await loadState(selectedUserId);
            setStatus(`Deleted talent '${talent.displayName}'.`, "success");
          } catch (error) {
            setStatus(error.message, "error");
          } finally {
            setFormBusy(form, false);
          }
        });
      }
      elements.talentList.appendChild(form);
    }
  };

  const auditDescription = (entry) => {
    if (entry.action === "user.created") {
      return `Added ${entry.details.email ?? entry.targetKey}`;
    }
    if (entry.action === "user.updated") {
      return `Updated ${entry.details.email ?? `user ${entry.targetKey}`}`;
    }
    if (entry.action === "talent.created") {
      return `Added talent ${entry.details.displayName ?? entry.targetKey}`;
    }
    if (entry.action === "talent.updated") {
      return `Updated talent ${entry.details.displayName ?? entry.targetKey}`;
    }
    if (entry.action === "user.deleted") {
      return `Deleted ${entry.details.email ?? `user ${entry.targetKey}`}`;
    }
    if (entry.action === "talent.deleted") {
      return `Deleted talent ${entry.details.displayName ?? entry.targetKey}`;
    }
    return `${entry.action} ${entry.targetType} ${entry.targetKey}`;
  };

  const renderAudit = () => {
    elements.auditList.replaceChildren();

    if (state.audit.length === 0) {
      appendEmptyMessage(elements.auditList, "No administrative changes recorded yet.");
      return;
    }

    for (const entry of state.audit) {
      const article = document.createElement("article");
      const description = document.createElement("strong");
      description.textContent = auditDescription(entry);
      const metadata = document.createElement("span");
      metadata.textContent = `${formatDate(entry.createdAt)} · ${entry.actorEmail}`;
      article.append(description, metadata);
      elements.auditList.appendChild(article);
    }
  };

  const render = () => {
    elements.content.removeAttribute("hidden");
    renderUserList();
    renderEditor();
    renderTalents();
    renderAudit();
  };

  const loadState = async (preferredUserId = null) => {
    state = await apiRequest("/api/admin/state");
    const preferredExists = state.users.some((user) => user.id === preferredUserId);
    selectedUserId = preferredExists
      ? preferredUserId
      : state.users.some((user) => user.id === selectedUserId)
        ? selectedUserId
        : null;
    render();
  };

  const serializedManualAccess = () =>
    Array.from(elements.productEditor.querySelectorAll("[data-product-id]"))
      .filter((fieldset) => {
        const toggle = fieldset.querySelector("[data-product-toggle]");
        return toggle.checked && !toggle.disabled;
      })
      .map((fieldset) => ({
        productId: fieldset.dataset.productId,
        talentIds: Array.from(
          fieldset.querySelectorAll("[data-talent-id]:checked")
        ).map((checkbox) => checkbox.value)
      }));

  elements.userSearch.addEventListener("input", renderUserList);

  elements.addUserForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const email = form.elements.email.value.trim().toLowerCase();
    setFormBusy(form, true);
    try {
      await apiRequest("/api/admin/users", {
        method: "POST",
        body: JSON.stringify({ email })
      });
      form.reset();
      await loadState();
      const user = state.users.find((candidate) => candidate.email === email);
      if (user) selectUser(user.id);
      setStatus(`Added ${email}. You can now assign products and talents.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.addTalentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const displayName = form.elements.displayName.value.trim();
    setFormBusy(form, true);
    try {
      await apiRequest("/api/admin/talents", {
        method: "POST",
        body: JSON.stringify({ displayName })
      });
      form.reset();
      await loadState(selectedUserId);
      setStatus(`Added talent '${displayName}'.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.userEditor.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const user = state.users.find((candidate) => candidate.id === selectedUserId);
    if (!user) return;

    const manualAccess = serializedManualAccess();
    const newPermissionCount = manualAccess.reduce(
      (count, access) => count + 1 + access.talentIds.length,
      0
    );
    const oldPermissionCount = user.manualAccess.reduce(
      (count, access) => count + 1 + access.talentIds.length,
      0
    );
    const active = form.elements.active.checked;

    if (
      ((user.active && !active) || newPermissionCount < oldPermissionCount) &&
      !globalThis.confirm(
        "This change removes or disables access. Save the change?"
      )
    ) {
      return;
    }

    setFormBusy(form, true);
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          email: form.elements.email.value,
          active,
          manualAccess
        })
      });
      await loadState(user.id);
      setStatus(`Saved permissions for ${form.elements.email.value}.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setFormBusy(form, false);
    }
  });

  elements.deleteUser.addEventListener("click", async () => {
    const user = state.users.find((candidate) => candidate.id === selectedUserId);
    if (!user) return;

    if (
      !globalThis.confirm(
        `Permanently delete ${user.email}? This removes their manual permissions and cannot be undone.`
      )
    ) {
      return;
    }

    setFormBusy(elements.userEditor, true);
    try {
      await apiRequest(`/api/admin/users/${user.id}`, {
        method: "DELETE"
      });
      selectedUserId = null;
      await loadState();
      setStatus(`Deleted ${user.email}.`, "success");
    } catch (error) {
      setStatus(error.message, "error");
    } finally {
      setFormBusy(elements.userEditor, false);
    }
  });

  loadState()
    .then(() => {
      setStatus(`Administrator access verified for ${state.admin.email}.`, "success");
    })
    .catch((error) => {
      elements.content.setAttribute("hidden", "");
      setStatus(error.message, "error");
    });
})();
