# Marwa Static Gallery (GitHub Pages)

This is a plain HTML/CSS/JavaScript website. No Node.js, backend, build step, or server hosting is needed.

## GitHub Pages deployment

1. Create a GitHub repository (for example, `marwa-gallery`).
2. Upload `index.html`, `style.css`, `script.js`, `config.js`, and `README.md` to the repository root.
3. Configure `config.js` as described below and commit the changes.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**, choose `main` and `/ (root)`, then save.
6. Wait for GitHub Pages to publish the site.

## Google Drive setup

A fully static site cannot keep an API key private or securely read a private Drive folder. This version therefore requires the gallery folder and its images to be accessible to anyone with the link as Viewer.

1. Open Google Cloud Console and create/select a project.
2. Enable **Google Drive API**.
3. Create an API key.
4. Restrict that key to the **Google Drive API** and to your GitHub Pages website referrer, for example:
   - `https://YOUR-USERNAME.github.io/*`
   - `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/*`
5. Share the Drive gallery folder as **Anyone with the link — Viewer**. Check your privacy requirements before doing this.
6. Open the Drive folder and copy its folder ID from the URL.
7. Edit `config.js` and fill in `GOOGLE_API_KEY` and `DRIVE_FOLDER_ID`.

Never commit an unrestricted API key. A key in a static website is visible to visitors, so restrict it by API and website referrer.

## Features

- Editorial responsive gallery inspired by the provided screenshot.
- Dynamic listing of JPEG/JPG, PNG, WebP, and GIF files from one Drive folder.
- Pagination, duplicate prevention, automatic refresh every 30–60 seconds, and refresh on tab focus.
- Grid thumbnails; click to open a contain-fit image viewer.
- Previous/next buttons, Escape, arrow keys, image counter, and scroll restoration.
- Download link to the original Drive file.
- No hardcoded photos, frameworks, or backend.

## Important static-site limitation

Because this uses public-link Drive files, direct original-image display/download relies on Google's public Drive file endpoints. Depending on the account, browser, or file type, Google may display a confirmation page rather than immediately download. If you must keep the Drive folder private and guarantee authenticated original downloads, a backend or Google Apps Script web app is required; GitHub Pages alone cannot safely do that.
\n\n## Image quality and aspect ratios\n\n- Gallery thumbnails request a larger 1600px Drive thumbnail when available.\n- Gallery frames use each image’s width/height metadata and preserve the original photo ratio without cropping.\n- The lightbox continues to use the original-image endpoint.\n

## Layout behavior

Gallery cards use each image's width/height ratio and compact, varied column spans. Portraits remain narrow and tall; landscape images get more width. Images fill their frames without the large side gaps caused by contain-fit inside mismatched frames.


## Gap-free masonry layout

The gallery uses CSS columns for masonry-style packing, so cards flow vertically without large blank grid cells. Each card keeps its own image aspect ratio and images fill their frame. Desktop uses four columns (five on very wide screens); mobile uses two columns. Progressive Drive API batches remain in script.js.


## Faster reloads

The gallery caches the last successfully fetched file list in browser localStorage. On subsequent reloads it renders cached metadata immediately, then refreshes from Drive in the background in batches of 25. The cache is per gallery folder and contains metadata only, not the image files; thumbnails still load from Drive. If browser storage is disabled or full, normal online loading continues.


## Reliable fetching and unlimited pagination

The gallery follows Google Drive's nextPageToken until there are no more pages, with 25 files per request. Each completed page is rendered and cached immediately. Requests time out after 15 seconds instead of leaving the UI stuck forever; a previously cached gallery remains visible when Drive is slow or unavailable. This is still limited to image files directly inside the configured Drive folder and permitted by the API key/Drive permissions.


## Automatic recovery

The gallery now retries a failed or timed-out Drive fetch every 3 seconds automatically. It does not rely on clicking the page or changing tabs to trigger another sync. Successful refreshes clear the retry timer and resume the normal interval. Requests still time out after 15 seconds; batches are rendered as they arrive and saved metadata is used immediately when available.
