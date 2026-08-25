// Filters launcher tiles and renders the signed-in user's Products page.
(() => {
  const localPreviewHosts = new Set([
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
    "[::1]"
  ]);
  const productItems = Array.from(document.querySelectorAll("[data-product-id]"));
  const productsAccess = document.querySelector("[data-my-products]");
  const message = productsAccess?.querySelector("[data-products-message]");
  const productList = productsAccess?.querySelector("[data-products-list]");

  if (productItems.length === 0 && (!productsAccess || !message || !productList)) {
    return;
  }

  const showLocalPreview = () => {
    productItems.forEach((item) => item.removeAttribute("hidden"));

    if (message) {
      message.textContent =
        "Product access details load after Cloudflare Access authentication in the deployed site.";
    }
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
    if (!message || !productList) {
      return;
    }

    productList.replaceChildren();

    for (const product of products) {
      const article = document.createElement("article");
      article.className = "product-access-card";

      const headingRow = document.createElement("div");
      headingRow.className = "product-access-heading";

      const heading = document.createElement("h4");
      heading.textContent = product.title;
      headingRow.appendChild(heading);

      if (typeof product.url === "string" && product.url.startsWith("https://")) {
        const productLink = document.createElement("a");
        productLink.href = product.url;
        productLink.textContent = "Open product →";
        headingRow.appendChild(productLink);
      }

      article.appendChild(headingRow);

      const label = document.createElement("div");
      label.className = "product-access-label";
      label.textContent = "You have access to";
      article.appendChild(label);

      const permissions = document.createElement("ul");
      permissions.className = "product-access-permissions";

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

      article.appendChild(permissions);
      productList.appendChild(article);
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

      if (message && productList) {
        message.textContent =
          "Your permissions could not be loaded. Contact Sun Data Analytics for assistance.";
        productList.setAttribute("hidden", "");
      }
    });
})();
