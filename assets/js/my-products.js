(() => {
  const localPreviewHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]"
  ]);
  const productItems = Array.from(document.querySelectorAll("[data-product-id]"));
  const summary = document.querySelector("[data-my-products]");
  const message = summary?.querySelector("[data-products-message]");
  const productList = summary?.querySelector("[data-products-list]");

  if (!summary || !message || !productList) {
    return;
  }

  const showLocalPreview = () => {
    productItems.forEach((item) => item.removeAttribute("hidden"));
    message.textContent =
      "Permission details load after Cloudflare Access authentication in the deployed launcher.";
  };

  if (localPreviewHosts.has(globalThis.location.hostname)) {
    showLocalPreview();
    return;
  }

  const showAllowedProducts = (allowedIds) => {
    productItems.forEach((item) => {
      item.toggleAttribute("hidden", !allowedIds.has(item.dataset.productId));
    });
  };

  const renderProducts = (products) => {
    productList.replaceChildren();

    for (const product of products) {
      const section = document.createElement("section");
      section.className = "my-product";

      const heading = document.createElement("h4");
      heading.textContent = product.title;
      section.appendChild(heading);

      const label = document.createElement("div");
      label.className = "my-product-label";
      label.textContent = "Permissions";
      section.appendChild(label);

      const permissions = document.createElement("ul");
      permissions.className = "my-product-permissions";

      if (product.permissions.length === 0) {
        const item = document.createElement("li");
        item.textContent = "Product access";
        permissions.appendChild(item);
      } else {
        for (const permission of product.permissions) {
          const item = document.createElement("li");
          item.textContent = permission.label;
          permissions.appendChild(item);
        }
      }

      section.appendChild(permissions);
      productList.appendChild(section);
    }

    message.toggleAttribute("hidden", products.length > 0);
    productList.toggleAttribute("hidden", products.length === 0);

    if (products.length === 0) {
      message.textContent = "No products are currently assigned to your account.";
    }
  };

  fetch("/api/my-products", {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Permissions request failed with ${response.status}`);
      }
      return response.json();
    })
    .then((payload) => {
      const products = Array.isArray(payload.products) ? payload.products : [];
      const allowedIds = new Set(products.map((product) => product.id));
      showAllowedProducts(allowedIds);
      renderProducts(products);
    })
    .catch(() => {
      showAllowedProducts(new Set());
      message.textContent =
        "Your permissions could not be loaded. Contact Sun Data Analytics for assistance.";
      productList.setAttribute("hidden", "");
    });
})();
