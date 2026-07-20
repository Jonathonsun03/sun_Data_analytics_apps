# Sun Data Analytics Apps

A Quarto-based launcher for Sun Data Analytics client applications.

## Current implementation

The launcher is currently rendered as a static website. Application tiles are created at build time from either:

- a local `.env` file during development; or
- GitHub repository variables during the GitHub Actions build.

Because the output is static, every authenticated visitor receives the same set of tiles. Cloudflare Access must therefore protect both the launcher and every destination application separately.

## Add or update an app locally

Add one line to `.env` using the tile name as the key and the app URL as the value:

```dotenv
YT_dashboard=https://dashboard.sun-dataanalytics.com
news_tracker=https://news.sun-dataanalytics.com
```

Underscores become spaces and common acronyms are preserved, so these keys render as **YT Dashboard** and **News Tracker**. URLs without a scheme use `http://`.

Run `quarto preview` to view the page locally. The `.env` file is intentionally ignored by Git.

## Shared local R library

The project-level `.Rprofile` reuses the restored `renv` library from `Sun_Data_Analytics_Analyze_Talent_Data` when that local path exists. This provides `knitr`, `rmarkdown`, and `jsonlite` without a second package installation.

On GitHub Actions, the local path does not exist, so R falls back to the packages installed by the publishing workflow.

## Current deployed-app configuration

Create the same keys as GitHub repository variables under **Settings → Secrets and variables → Actions → Variables**. Every repository variable currently becomes a tile during the GitHub Pages build.

This is acceptable for the first release, but it should be replaced with an explicit application catalog so unrelated repository variables cannot accidentally appear as launcher tiles.

# Cloudflare Access migration checklist

## Repository changes

- [ ] Replace the implicit repository-variable tile system with a structured file such as `data/apps.yml`.
- [ ] Give each application an explicit `id`, `title`, `description`, `url`, `status`, and optional icon.
- [ ] Update `index.qmd` to render application descriptions and availability states.
- [ ] Add a non-clickable `coming-soon` state for products that are not deployed.
- [ ] Add an account strip that displays the Cloudflare-authenticated email address.
- [ ] Add a logout link using `/cdn-cgi/access/logout`.
- [ ] Add browser JavaScript that requests `/cdn-cgi/access/get-identity` and fails silently during local preview.
- [ ] Do not use browser-side JavaScript or hidden tiles as authorization controls.
- [ ] Add an access-help section with a contact link for missing applications.
- [ ] Add `noindex`, `nofollow`, and `noarchive` metadata to the portal page.
- [ ] Remove `APP_VARIABLES_JSON` from the publishing workflow after the structured catalog is implemented.
- [ ] Reduce the GitHub Actions R dependency list to packages actually required by this launcher.
- [ ] Confirm the GitHub Actions workflow creates and updates the `gh-pages` branch successfully.

## GitHub Pages changes

- [ ] Enable GitHub Pages for this repository.
- [ ] Confirm the Quarto publishing workflow completes successfully.
- [ ] Set the custom domain to `apps.sun-dataanalytics.com`.
- [ ] Confirm HTTPS enforcement is available after DNS validation.
- [ ] Verify that the rendered launcher contains no credentials, client data, internal IP addresses, or private service URLs.

## Cloudflare DNS and Access changes

- [ ] Standardize on `apps.sun-dataanalytics.com` rather than alternating between `app` and `apps`.
- [ ] Create the DNS record for `apps.sun-dataanalytics.com` pointing to the GitHub Pages hostname.
- [ ] Create a Cloudflare Access application for `apps.sun-dataanalytics.com`.
- [ ] Configure Google as the primary identity provider.
- [ ] Keep email one-time PIN available as a fallback.
- [ ] Create an allow policy for approved client email addresses.
- [ ] Create a separate Access application for `dashboard.sun-dataanalytics.com`.
- [ ] Give the dashboard a narrower allow policy than the general launcher when appropriate.
- [ ] Protect every future application hostname separately; do not rely on the launcher as the only gate.
- [ ] Test login, logout, session reuse, denied access, and direct navigation to protected application URLs.

## Talent dashboard and Shiny changes

- [ ] Bind Shiny to `127.0.0.1:3838` rather than a public interface.
- [ ] Route `dashboard.sun-dataanalytics.com` through Cloudflare Tunnel to `http://localhost:3838`.
- [ ] Ensure no router port-forward exposes Shiny directly.
- [ ] Read and validate the Cloudflare Access identity at the trusted server boundary.
- [ ] Map the verified Cloudflare email address to application-, client-, and talent-level permissions.
- [ ] Do not require a second user login inside Shiny once Cloudflare identity is integrated.
- [ ] Deny access when the authenticated email is absent from the permissions table.
- [ ] Keep authorization logic server-side; hiding tabs or controls in the browser is not sufficient.

## Later personalized-launcher upgrade

The static GitHub Pages launcher cannot securely return different tiles for different users. When personalized tiles become necessary, move request-time authorization into a Cloudflare Worker or Pages Function and store permissions in a server-side data store such as D1.

A future request flow would be:

```text
Cloudflare Access
→ validate the Access JWT
→ identify the verified user email
→ query application permissions
→ return only authorized applications
```

Do not build this upgrade until the first milestone works reliably:

```text
Cloudflare login
→ apps.sun-dataanalytics.com
→ Talent Analytics tile
→ dashboard opens without another login
→ unauthorized users cannot access either hostname
```
