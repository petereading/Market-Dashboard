const journalStorageKey = 'mathofstars.marketDashboard.journalEntries.v1';
const pendingCaptureKey = 'mathofstars.marketDashboard.pendingChartCapture';

function canUseLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function loadEntries() {
  if (!canUseLocalStorage()) {
    return [];
  }

  try {
    const stored = localStorage.getItem(journalStorageKey);
    const entries = stored ? JSON.parse(stored) : [];
    return Array.isArray(entries) ? entries : [];
  } catch {
    return [];
  }
}

function persistEntries(entries) {
  if (!canUseLocalStorage()) {
    return;
  }

  try {
    localStorage.setItem(journalStorageKey, JSON.stringify(entries));
  } catch (error) {
    const compactEntries = entries.map((entry, index) => ({
      ...entry,
      chartImage: index < 8 ? entry.chartImage : ''
    }));
    localStorage.setItem(journalStorageKey, JSON.stringify(compactEntries));
    console.warn('Journal image storage trimmed to fit local storage.', error);
  }
}

function captureChartImage() {
  const chartWrap = document.querySelector('.chart-wrap');
  if (!chartWrap) {
    return '';
  }

  const wrapRect = chartWrap.getBoundingClientRect();
  if (wrapRect.width <= 0 || wrapRect.height <= 0) {
    return '';
  }

  const maxWidth = 960;
  const outputScale = Math.min(1, maxWidth / wrapRect.width);
  const outputWidth = Math.max(1, Math.round(wrapRect.width * outputScale));
  const outputHeight = Math.max(1, Math.round(wrapRect.height * outputScale));
  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;

  const context = outputCanvas.getContext('2d');
  if (!context) {
    return '';
  }

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, outputWidth, outputHeight);

  const canvasLayers = [...chartWrap.querySelectorAll('canvas')].filter((canvas) => canvas.width > 0 && canvas.height > 0);
  canvasLayers.forEach((canvas) => {
    const rect = canvas.getBoundingClientRect();
    context.drawImage(
      canvas,
      (rect.left - wrapRect.left) * outputScale,
      (rect.top - wrapRect.top) * outputScale,
      rect.width * outputScale,
      rect.height * outputScale
    );
  });

  if (canvasLayers.length === 0) {
    context.fillStyle = '#69726f';
    context.font = '16px sans-serif';
    context.textAlign = 'center';
    context.fillText('Chart preview unavailable', outputWidth / 2, outputHeight / 2);
  }

  try {
    return outputCanvas.toDataURL('image/jpeg', 0.78);
  } catch (error) {
    console.warn('Unable to capture chart image.', error);
    return '';
  }
}

function setPendingCapture(chartImage, previousIds) {
  window[pendingCaptureKey] = {
    chartImage,
    previousIds,
    createdAt: Date.now()
  };
}

function applyPendingCapture() {
  const pendingCapture = window[pendingCaptureKey];
  if (!pendingCapture?.chartImage || Date.now() - pendingCapture.createdAt > 5000) {
    return;
  }

  const entries = loadEntries();
  const entry = entries.find((item) => !pendingCapture.previousIds.includes(item.id)) ?? entries[0];
  if (!entry || entry.chartImage) {
    injectJournalImages();
    window[pendingCaptureKey] = null;
    return;
  }

  entry.chartImage = pendingCapture.chartImage;
  persistEntries(entries);
  window[pendingCaptureKey] = null;
  injectJournalImages();
}

function ensureStyles() {
  if (document.querySelector('[data-journal-capture-styles]')) {
    return;
  }

  const style = document.createElement('style');
  style.dataset.journalCaptureStyles = 'true';
  style.textContent = `
    .journal-entry-image,
    .journal-entry-image-placeholder {
      width: 100%;
      aspect-ratio: 16 / 9;
      border: 1px solid #e8e0d2;
      border-radius: 6px;
      background: #ffffff;
    }

    .journal-entry-image {
      display: block;
      object-fit: cover;
      object-position: right center;
    }

    .journal-entry-image-placeholder {
      display: grid;
      place-items: center;
      color: #69726f;
      font-size: 0.78rem;
    }
  `;
  document.head.append(style);
}

function injectJournalImages() {
  ensureStyles();

  const entries = loadEntries();
  document.querySelectorAll('.journal-entry').forEach((entryElement, index) => {
    if (entryElement.querySelector('.journal-entry-image, .journal-entry-image-placeholder')) {
      return;
    }

    const entry = entries[index];
    const imageElement = entry?.chartImage ? document.createElement('img') : document.createElement('div');
    imageElement.className = entry?.chartImage ? 'journal-entry-image' : 'journal-entry-image-placeholder';

    if (entry?.chartImage) {
      imageElement.src = entry.chartImage;
      imageElement.alt = `${entry.symbol ?? 'Symbol'} chart snapshot`;
      imageElement.loading = 'lazy';
    } else {
      imageElement.textContent = 'No chart image saved';
    }

    entryElement.prepend(imageElement);
  });
}

document.addEventListener(
  'click',
  (event) => {
    if (!event.target.closest('[data-save-journal]')) {
      return;
    }

    setPendingCapture(
      captureChartImage(),
      loadEntries()
        .map((entry) => entry.id)
        .filter(Boolean)
    );
    window.setTimeout(applyPendingCapture, 80);
    window.setTimeout(applyPendingCapture, 350);
  },
  true
);

new MutationObserver(() => {
  applyPendingCapture();
  injectJournalImages();
}).observe(document.body, { childList: true, subtree: true });

injectJournalImages();
