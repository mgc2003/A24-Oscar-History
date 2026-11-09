# A24-Oscar-History
Site that tracks A24's studio releases and their Oscar Award nominations/wins.

## The site

`index.html` is a static page for GitHub Pages: plain HTML, CSS and JavaScript with no build step.

- `index.html` is the page markup
- `styles.css` holds the styles, with light and dark themes
- `app.js` loads the data and renders every section
- `JSON Artifact` is the data: films, Oscar nominations, in-development titles, and TV and podcasts

To update the site, edit `JSON Artifact` and push. The page reads it each time it loads.

### Publish on GitHub Pages

In the repository's **Settings → Pages**, set **Source** to *Deploy from a branch*, then choose the branch and the `/ (root)` folder.

### Preview locally

Browsers block `fetch()` on `file://` pages, so serve the folder over HTTP:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.
