(() => {
  "use strict";
  const config = window.MARWA_CONFIG || {};
  const grid = document.getElementById("gallery-grid");
  const statusRow = document.getElementById("status-row");
  const statusText = document.getElementById("status-text");
  const emptyState = document.getElementById("empty-state");
  const errorState = document.getElementById("error-state");
  const errorMessage = document.getElementById("error-message");
  const photoCount = document.getElementById("photo-count");
  const lightbox = document.getElementById("lightbox");
  const viewerImage = document.getElementById("viewer-image");
  const viewerLoading = document.getElementById("viewer-loading");
  const viewerName = document.getElementById("lightbox-name");
  const counter = document.getElementById("image-counter");
  const downloadButton = document.getElementById("download-button");
  const prevButton = document.getElementById("prev-image");
  const nextButton = document.getElementById("next-image");
  const closeButton = document.getElementById("close-lightbox");
  const menuToggle = document.getElementById("menu-toggle");
  const mobileNav = document.getElementById("mobile-nav");
  let images = [];
  let activeIndex = -1;
  let previousScrollY = 0;
  let timer = null;
  let retryTimer = null;
  let inFlight = false;
  const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
  const CACHE_KEY = `viso-drive-gallery:${config.DRIVE_FOLDER_ID || "default"}`;

  function readGalleryCache() {
    try {
      const saved = localStorage.getItem(CACHE_KEY);
      if (!saved) return [];
      const parsed = JSON.parse(saved);
      return Array.isArray(parsed)
        ? parsed.filter(file => file && file.id && allowedTypes.has(file.mimeType))
        : [];
    } catch (_) {
      return [];
    }
  }

  function writeGalleryCache(files) {
    try {
      const compact = files.map(file => ({
        id: file.id, name: file.name, mimeType: file.mimeType,
        thumbnailLink: file.thumbnailLink, webViewLink: file.webViewLink,
        createdTime: file.createdTime, imageMediaMetadata: file.imageMediaMetadata
      }));
      localStorage.setItem(CACHE_KEY, JSON.stringify(compact));
    } catch (_) {}
  }

  function setStatus(text, mode = "") {
    statusText.textContent = text;
    statusRow.classList.toggle("is-live", mode === "live");
    statusRow.classList.toggle("is-error", mode === "error");
  }
  function validateConfig() {
    if (!config.GOOGLE_API_KEY || config.GOOGLE_API_KEY.includes("PASTE_") ||
        !config.DRIVE_FOLDER_ID || config.DRIVE_FOLDER_ID.includes("PASTE_")) {
      throw new Error("Add your Google API key and Drive folder ID in config.js first.");
    }
  }
  function driveImageUrl(id) {
    // Use the Drive API media endpoint for the original file.
    // The file must be publicly accessible to anyone with the link.
    const params = new URLSearchParams({
      alt: "media",
      key: config.GOOGLE_API_KEY
    });
    return `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?${params.toString()}`;
  }

  function legacyDriveImageUrl(id) {
    // Fallback for cases where the API media endpoint is unavailable.
    return `https://drive.google.com/uc?export=view&id=${encodeURIComponent(id)}`;
  }
  function driveDownloadUrl(id) {
    return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
  }
  function thumbUrl(file) {
    // Request a larger Drive thumbnail for better quality in the gallery grid.
    // The original image is still opened in the lightbox.
    if (!file.thumbnailLink) return driveImageUrl(file.id);
    return file.thumbnailLink.replace(/=s\d+(?:-[a-z])?$/i, "=s1600");
  }
  async function listAllImages(onBatch) {
    const all = [];
    let pageToken = "";
    do {
      const params = new URLSearchParams({
        q: `'${config.DRIVE_FOLDER_ID}' in parents and trashed = false`,
        pageSize: "25",
        orderBy: "createdTime desc",
        fields: "nextPageToken,files(id,name,mimeType,thumbnailLink,webViewLink,createdTime,imageMediaMetadata(width,height))",
        key: config.GOOGLE_API_KEY
      });
      if (pageToken) params.set("pageToken", pageToken);
      let response;
      try {
        response = await fetch(
          `https://www.googleapis.com/drive/v3/files?${params.toString()}`,
          { signal: AbortSignal.timeout(15000) }
        );
      } catch (error) {
        if (error.name === "TimeoutError" || error.name === "AbortError") {
          throw new Error("Google Drive took too long to respond. Your saved gallery remains visible; try refreshing again.");
        }
        throw error;
      }

      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || `Google Drive API returned ${response.status}.`);
      const batch = (data.files || []).filter(file => file.id && allowedTypes.has(file.mimeType));
      const known = new Set(all.map(file => file.id));
      const fresh = batch.filter(file => !known.has(file.id));
      all.push(...fresh);
      if (fresh.length && typeof onBatch === "function") onBatch(fresh, [...all]);
      pageToken = data.nextPageToken || "";
    } while (pageToken);
    return [...new Map(all.map(file => [file.id, file])).values()];
  }

  function shape(file, index) {
    const width = file.imageMediaMetadata?.width;
    const height = file.imageMediaMetadata?.height;
    const ratio = width && height ? width / height : 1;
    if (ratio < 0.72) return "tall";
    if (ratio < 0.92) return index % 3 === 0 ? "tall-large" : "tall";
    if (ratio > 1.8) return index % 2 === 0 ? "wide-large" : "wide";
    if (ratio > 1.25) return index % 3 === 0 ? "wide" : "landscape";
    return index % 4 === 0 ? "square-large" : "square";
  }

  // Give each file a repeatable but irregular visual position. Using the file
  // ID keeps the order stable between refreshes instead of reshuffling tiles.
  function visualSortKey(id) {
    let hash = 2166136261;
    for (let i = 0; i < id.length; i += 1) {
      hash ^= id.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function render(nextImages) {
    const old = new Map(images.map(file => [file.id, file]));
    images = [...new Map(nextImages.map(file => [file.id, file])).values()]
      .sort((a, b) => visualSortKey(a.id) - visualSortKey(b.id));
    const ids = new Set(images.map(file => file.id));
    [...grid.children].forEach(card => { if (!ids.has(card.dataset.id)) card.remove(); });

    images.forEach((file, index) => {
      let card = [...grid.children].find(el => el.dataset.id === file.id);
      if (!card) {
        card = document.createElement("button");
        card.type = "button";
        card.className = "gallery-card";
        card.dataset.id = file.id;
        const img = document.createElement("img");
        img.loading = "lazy";
        img.decoding = "async";
        img.fetchPriority = "low";
        img.alt = file.name;
        img.src = thumbUrl(file);
        img.addEventListener("error", () => {
          if (img.dataset.fallback !== "1") {
            img.dataset.fallback = "1";
            img.src = driveImageUrl(file.id);
          }
        });
        const caption = document.createElement("span");
        caption.className = "photo-caption";
        card.append(img, caption);
        card.addEventListener("click", () => openViewer(file.id));
      } else if (old.get(file.id)?.name !== file.name) {
        card.querySelector("img").alt = file.name;
      }
      card.classList.remove("wide", "tall", "square");
      card.classList.add(shape(file, index));
      const photoWidth = file.imageMediaMetadata?.width;
      const photoHeight = file.imageMediaMetadata?.height;
      if (photoWidth && photoHeight) {
        card.style.setProperty("--photo-ratio", `${photoWidth} / ${photoHeight}`);
      } else {
        card.style.removeProperty("--photo-ratio");
      }
      card.querySelector(".photo-caption").textContent = file.name;
      card.querySelector("img").alt = file.name;
      grid.appendChild(card);
    });
    const n = images.length;
    photoCount.textContent = `${n} ${n === 1 ? "photograph" : "photographs"} in the archive`;
    emptyState.hidden = n !== 0;
    errorState.hidden = true;
    grid.hidden = n === 0;
    setStatus(n ? `Archive synced · ${n} ${n === 1 ? "image" : "images"}` : "Archive synced · waiting for your first image", "live");
    if (!lightbox.hidden && activeIndex >= 0) {
      const activeId = images[activeIndex]?.id;
      if (!activeId) closeViewer();
      else showActive();
    }
  }
  async function sync() {
    if (inFlight) return;
    inFlight = true;
    try {
      validateConfig();

      // Render cached file metadata immediately; refresh Drive in the background.
      if (!images.length) {
        const cached = readGalleryCache();
        if (cached.length) {
          render(cached);
          setStatus(`Showing ${cached.length} saved photos · refreshing Drive…`);
        } else {
          setStatus("Connecting to the archive…");
        }
      }

      const cachedAtStart = readGalleryCache();
      const loaded = await listAllImages((fresh, allSoFar) => {
        // Render and cache every page immediately, so a slow later page never
        // prevents the first 25+ photos from being available on the next reload.
        render(allSoFar);
        writeGalleryCache(allSoFar);
      });

      render(loaded);
      writeGalleryCache(loaded);

      clearTimeout(retryTimer);
      retryTimer = null;
      clearInterval(timer);
      timer = setInterval(
        sync,
        Math.max(30000, Math.min(60000, Number(config.SYNC_INTERVAL_MS) || 45000))
      );
    } catch (error) {
      console.error(error);
      if (!images.length) {
        setStatus("Archive connection failed", "error");
        grid.hidden = true;
        emptyState.hidden = true;
        errorState.hidden = false;
        errorMessage.textContent = error.message;
      } else {
        setStatus(`Showing ${images.length} saved photos · retrying Drive…`, "error");
        console.warn("Drive refresh failed; saved gallery remains visible.", error);
      }

      // Retry automatically. The page should never depend on a click or tab-focus
      // event to restart a stalled/failed initial request.
      clearTimeout(retryTimer);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        sync();
      }, 3000);
    } finally {
      inFlight = false;
    }
  }

  function openViewer(id) {
    activeIndex = images.findIndex(file => file.id === id);
    if (activeIndex < 0) return;
    previousScrollY = window.scrollY;
    lightbox.hidden = false;
    lightbox.setAttribute("aria-hidden", "false");
    document.body.classList.add("viewer-open");
    showActive();
    closeButton.focus({ preventScroll: true });
  }
  function showActive() {
    const file = images[activeIndex];
    if (!file) return;
    viewerImage.classList.remove("is-visible");
    viewerImage.removeAttribute("src");
    viewerLoading.hidden = false;
    viewerLoading.textContent = "Loading original…";
    viewerName.textContent = file.name;
    counter.textContent = `${String(activeIndex + 1).padStart(2, "0")} / ${String(images.length).padStart(2, "0")}`;
    downloadButton.href = driveDownloadUrl(file.id);
    downloadButton.setAttribute("download", file.name);
    prevButton.disabled = nextButton.disabled = images.length < 2;
    const img = new Image();
    img.onload = () => {
      if (images[activeIndex]?.id !== file.id) return;
      viewerImage.src = img.src;
      viewerImage.alt = file.name;
      viewerImage.classList.add("is-visible");
      viewerLoading.hidden = true;
    };
    img.onerror = () => {
      // Try Drive's legacy image endpoint once before showing an error.
      if (img.dataset.legacyFallback !== "1") {
        img.dataset.legacyFallback = "1";
        img.onload = () => {
          if (images[activeIndex]?.id !== file.id) return;
          viewerImage.src = img.src;
          viewerImage.alt = file.name;
          viewerImage.classList.add("is-visible");
          viewerLoading.hidden = true;
        };
        img.onerror = () => {
          if (images[activeIndex]?.id === file.id) {
            viewerLoading.textContent = "Original image unavailable. Check that this file is shared as Anyone with the link — Viewer.";
          }
        };
        img.src = legacyDriveImageUrl(file.id);
        return;
      }
      if (images[activeIndex]?.id === file.id) {
        viewerLoading.textContent = "Original image unavailable. Check that this file is shared as Anyone with the link — Viewer.";
      }
    };
    img.src = driveImageUrl(file.id);
  }
  function closeViewer() {
    if (lightbox.hidden) return;
    lightbox.hidden = true;
    lightbox.setAttribute("aria-hidden", "true");
    viewerImage.removeAttribute("src");
    viewerImage.classList.remove("is-visible");
    document.body.classList.remove("viewer-open");
    activeIndex = -1;
    window.scrollTo({ top: previousScrollY, behavior: "auto" });
  }
  function move(direction) {
    if (lightbox.hidden || images.length < 2) return;
    activeIndex = (activeIndex + direction + images.length) % images.length;
    showActive();
  }
  closeButton.addEventListener("click", closeViewer);
  prevButton.addEventListener("click", () => move(-1));
  nextButton.addEventListener("click", () => move(1));
  document.getElementById("retry-button").addEventListener("click", sync);
  lightbox.addEventListener("click", e => { if (e.target === lightbox) closeViewer(); });
  document.addEventListener("keydown", e => {
    if (lightbox.hidden) return;
    if (e.key === "Escape") closeViewer();
    if (e.key === "ArrowLeft") move(-1);
    if (e.key === "ArrowRight") move(1);
  });
  // The menu is optional; it may be disabled in the HTML for this page.
  // Do not let missing menu controls prevent the gallery from syncing.
  if (menuToggle && mobileNav) {
    menuToggle.addEventListener("click", () => {
      const expanded = menuToggle.getAttribute("aria-expanded") === "true";
      menuToggle.setAttribute("aria-expanded", String(!expanded));
      menuToggle.setAttribute("aria-label", expanded ? "Open navigation menu" : "Close navigation menu");
      mobileNav.hidden = expanded;
    });
    mobileNav.querySelectorAll("a").forEach(a => a.addEventListener("click", () => {
      mobileNav.hidden = true;
      menuToggle.setAttribute("aria-expanded", "false");
      menuToggle.setAttribute("aria-label", "Open navigation menu");
    }));
  }
  sync();
})();
