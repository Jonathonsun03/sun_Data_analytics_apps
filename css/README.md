# CSS Organization

`styles.css` is the site-wide CSS entrypoint. It only imports the categorized files in `styles/`.

- `styles/tokens.css`: site colors, typography variables, and other design tokens.
- `styles/base.css`: default document, typography, paragraph, and link styles.
- `styles/layout.css`: Quarto page shell and content width rules.
- `styles/navigation.css`: Quarto/Bootstrap navbar overrides.
- `styles/components.css`: reusable content patterns such as cards, index lists, and link lists.
- `styles/home.css`: homepage-only feature carousel styles.
- `styles/about.css`: About page-specific title and identity styles.
- `styles/footer.css`: site-wide custom footer styles.
- `styles/responsive.css`: mobile overrides kept last so they can override earlier modules.
