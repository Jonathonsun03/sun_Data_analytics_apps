# Data Export Page Handoff

This folder currently contains the client-facing Data Export work for Sun Data Analytics.

## Current stopping point

The Data Export UI has been created, but the backend that actually reads DuckDB/Parquet and generates downloadable files is not implemented yet.

The current design intentionally reuses the existing Youtube Analytics authorization model instead of creating a second permission system.

## Files

### `data_export.qmd`

Client-facing Quarto page for exporting data.

The UI currently supports:

- selecting authorized talents
- selecting data families
- choosing all-history or a custom date range
- choosing CSV or Parquet
- displaying Cloudflare Access identity
- showing whether the current account has Youtube Analytics talent access

The page is included in the Quarto render list in:

```text
site/_quarto.yml
```

There is intentionally **no launcher tile yet**.

### `../assets/js/data-export.js`

Browser logic for the Data Export page.

It reuses:

```text
GET /api/my-products
```

and finds the existing:

```text
youtube-analytics
```

product.

Only the effective Youtube Analytics talent permissions returned by the existing Worker are shown on the Data Export page.

The browser does **not** determine the user's email and does **not** maintain authoritative permissions.

## Permission model

Data Export mirrors the existing Youtube Analytics access model:

```text
Cloudflare Access login
        ↓
Cf-Access-Jwt-Assertion
        ↓
existing Worker JWT validation
        ↓
verified email
        ↓
D1 users / product_access / talent_access / permission_grants
        ↓
effective Youtube Analytics talent permissions
        ↓
Data Export
```

If a client has Youtube Analytics access to Talent A and Talent B, Data Export must expose only Talent A and Talent B.

If those assignments change in the Admin panel, Data Export should reflect that automatically.

### Important

Do **not** add:

- a separate Data Export product permission
- a separate email-to-talent table
- separate Data Export talent checkboxes in Admin
- client-supplied email authorization
- client-supplied talent authorization as a trusted source

The existing Youtube Analytics assignments remain the single source of truth.

## Admin panel changes

The existing Youtube Analytics permission card in the Admin panel now explains that Data Export mirrors those assignments automatically.

There are no new Data Export permission controls.

This is intentional to avoid redundant permission state.

## What is intentionally incomplete

The page does not currently create downloadable files.

The **Create export** button remains disabled until a server-side export endpoint is connected.

The missing backend must:

1. Receive an authenticated export request.
2. Validate the Cloudflare Access JWT server-side.
3. Derive the email from the verified JWT.
4. Re-query the existing D1 Youtube Analytics permissions.
5. Intersect requested talent codes with the server-authorized talent codes.
6. Reject requests with no authorized talents.
7. Query the canonical DuckDB / Parquet data.
8. Apply talent and date filters server-side.
9. Generate CSV or Parquet outputs.
10. Package multi-dataset exports, likely as ZIP.
11. Return a safe download URL or streamed response.

The backend must **never trust the talent codes submitted by the browser** without rechecking them against the authenticated user's effective permissions.

## Intended backend architecture

```text
data_export.qmd
      ↓
data-export.js
      ↓
POST /api/export  (not implemented yet)
      ↓
Cloudflare Access JWT validation
      ↓
existing D1 Youtube Analytics permissions
      ↓
authorized talent_code list
      ↓
DuckDB
      ↓
Parquet / data lake
      ↓
CSV / Parquet / ZIP
      ↓
client download
```

## Suggested export datasets

The current UI exposes these logical data families:

- video and stream metadata
- video statistics
- subtitles
- live chat
- paid messages
- derived classifications and analytics

Before wiring the backend, confirm the authoritative DuckDB tables/views or Parquet paths for each of these.

Avoid duplicating transformation logic that already exists elsewhere in the analysis repositories.

## Suggested backend contract

The browser is currently structured to send something equivalent to:

```json
{
  "talentCodes": ["example_talent"],
  "datasets": ["video-metadata", "subtitles"],
  "dateRange": null,
  "format": "csv"
}
```

Treat `talentCodes` only as a **requested subset**.

The backend should independently derive:

```text
authorized talent codes
```

from Cloudflare identity + D1 and then calculate:

```text
requested talents ∩ authorized talents
```

before any DuckDB query is executed.

## Recommended next steps

1. Identify the canonical DuckDB database and relevant tables/views.
2. Decide where the export service should run.
3. Add a server-side `/api/export` endpoint.
4. Reuse the existing Cloudflare JWT authentication helpers from the Worker where practical.
5. Reuse the existing Youtube Analytics D1 entitlement query instead of duplicating SQL.
6. Implement server-side DuckDB filtering and export generation.
7. Connect the endpoint to `data-export.js`.
8. Test a client with one talent, multiple talents, no talents, and inactive access.
9. Verify that manually changing browser-submitted talent codes cannot expose another client's data.
10. Only after end-to-end authorization works, add the Data Export tile to the launcher.

## Do not change yet

Until the backend is complete and tested:

- do not add the Data Export launcher tile
- do not add a new D1 product for Data Export
- do not add new permission tables
- do not loosen Cloudflare Access
- do not enable the Create export button against an unauthenticated or client-trusting endpoint

## Related files

```text
site/pages/data_export.qmd
site/assets/js/data-export.js
site/assets/js/access-identity.js
site/assets/js/admin-permissions.js
site/admin.qmd
worker/src/index.js
worker/src/admin.js
site/_quarto.yml
```

The existing Youtube Analytics permission stack should remain the source of truth throughout the rest of this implementation.
