# Sun Data Analytics Apps

A simple, five-column launcher for Sun Data Analytics applications.

## Add or update an app locally

Add one line to `.env` using the tile name as the key and the app URL as the value:

```dotenv
YT_dashboard=https://example.com
tren_tracker_dashboard=http://192.0.2.10:8080
```

Underscores become spaces and common acronyms are preserved, so these keys render as **YT Dashboard** and **Tren Tracker Dashboard**. URLs without a scheme use `http://`.

Run `quarto preview` to view the page locally. The `.env` file is intentionally ignored by Git.

## Shared local R library

The project-level `.Rprofile` reuses the restored `renv` library from `Sun_Data_Analytics_Analyze_Talent_Data` when that local path exists. This provides `knitr`, `rmarkdown`, and `jsonlite` without a second package installation.

On GitHub Actions, the local path does not exist, so R falls back to the packages installed by the publishing workflow.

## Configure deployed apps

Create the same keys as GitHub repository variables under **Settings → Secrets and variables → Actions → Variables**. Every repository variable becomes a tile during the GitHub Pages build.
