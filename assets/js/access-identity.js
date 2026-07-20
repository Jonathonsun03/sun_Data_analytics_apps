(() => {
  const emailElement = document.querySelector("[data-access-email]");

  if (!emailElement) {
    return;
  }

  fetch("/cdn-cgi/access/get-identity", {
    credentials: "same-origin",
    headers: { Accept: "application/json" }
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Identity request failed with ${response.status}`);
      }
      return response.json();
    })
    .then((identity) => {
      if (identity && identity.email) {
        emailElement.textContent = identity.email;
        emailElement.closest(".access-account")?.removeAttribute("hidden");
      }
    })
    .catch(() => {
      // Local previews and unprotected environments do not expose this endpoint.
    });
})();
