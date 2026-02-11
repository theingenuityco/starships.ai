export const FAVICON_ICON_PATHS =
  `<path d="m11 16-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 21 3c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/>` +
  `<path d="M8 13H3s.55-3.03 2-4c1.62-1.08 5 0 5 0"/>` +
  `<path d="M11 16v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>` +
  `<circle cx="14.5" cy="9" r="1.5"/>` +
  `<line x1="6" y1="15" x2="2.5" y2="18.5"/>` +
  `<line x1="7.5" y1="16.5" x2="5.4" y2="18.6"/>` +
  `<line x1="9" y1="18" x2="7.6" y2="19.4"/>`

export function buildFaviconBaseSvg(args: {
  tile: string
  stroke: string
  opacity: string
  strokeWidth: string
  ts: number
}): string {
  const { tile, stroke, opacity, strokeWidth, ts } = args
  // Keep this SVG tiny: no whitespace beyond what's needed.
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" data-ts="${ts}">` +
    `<rect x="0.75" y="0.75" width="22.5" height="22.5" rx="5" fill="${tile}"/>` +
    `<g fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" opacity="${opacity}" vector-effect="non-scaling-stroke" transform="translate(2.5 2.5) scale(0.7916667)">` +
    FAVICON_ICON_PATHS +
    `</g></svg>`
  )
}

/**
 * Builds the smallest possible pre-hydration init script that:
 * - avoids Chrome favicon caching/ordering issues by using a data URL
 * - removes competing icon links so Chrome can't "lock onto" a static one
 *
 * Keep this in sync with the client-side `applyAppFavicon` behavior.
 */
export function buildFaviconInitScriptSource(): string {
  // IMPORTANT: keep JS source simple; no dependencies, no fancy syntax.
  // We embed the shared icon geometry so the icon can't drift.
  const pathsJson = JSON.stringify(FAVICON_ICON_PATHS)
  return `(function () {
  try {
    var now = Date.now();
    var theme = null;
    try { theme = window.localStorage ? window.localStorage.getItem('theme') : null; } catch (e) { theme = null; }
    var prefersDark = null;
    try { prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches; } catch (e) { prefersDark = null; }
    var isDark = theme === 'dark' ? true : theme === 'light' ? false : !!prefersDark;
    // Match app theme background:
    // - light: hsl(38 30% 97.5%) ≈ #fbf9f7
    // - dark:  hsl(0 0% 0%)     = #000000
    var tile = isDark ? '#000000' : '#fbf9f7';
    var stroke = isDark ? '#ffffff' : '#111827';
    var opacity = isDark ? '1' : '0.75';
    var strokeWidth = '1.25';
    var paths = ${pathsJson};
    var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 24 24" data-ts="' + now + '">' +
      '<rect x="0.75" y="0.75" width="22.5" height="22.5" rx="5" fill="' + tile + '"/>' +
      '<g fill="none" stroke="' + stroke + '" stroke-width="' + strokeWidth + '" stroke-linecap="round" stroke-linejoin="round" opacity="' + opacity + '" vector-effect="non-scaling-stroke" transform="translate(2.5 2.5) scale(0.7916667)">' +
      paths +
      '</g></svg>';
    var href = 'data:image/svg+xml,' + encodeURIComponent(svg);

    // Deliberate trade-off:
    // remove *all* other rel~="icon" entries so Chrome can't stick to a static favicon.
    // (A MutationObserver will re-assert this ordering later.)
    try {
      var icons = document.querySelectorAll('link[rel~="icon"]');
      for (var i = 0; i < icons.length; i++) {
        var el = icons[i];
        if (el && (el.id === 'app-favicon' || el.id === 'app-favicon-shortcut')) continue;
        if (el && el.parentNode) el.parentNode.removeChild(el);
      }
    } catch (e) {}

    var existing = document.querySelector('link#app-favicon');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    var existingShortcut = document.querySelector('link#app-favicon-shortcut');
    if (existingShortcut && existingShortcut.parentNode) existingShortcut.parentNode.removeChild(existingShortcut);

    var link = document.createElement('link');
    link.id = 'app-favicon';
    link.rel = 'icon';
    link.type = 'image/svg+xml';
    link.setAttribute('sizes', 'any');
    link.setAttribute('href', href);

    var shortcut = document.createElement('link');
    shortcut.id = 'app-favicon-shortcut';
    shortcut.rel = 'shortcut icon';
    shortcut.type = 'image/svg+xml';
    shortcut.setAttribute('sizes', 'any');
    shortcut.setAttribute('href', href);

    // Prepend so it's first.
    if (document.head && document.head.firstChild) {
      document.head.insertBefore(shortcut, document.head.firstChild);
      document.head.insertBefore(link, document.head.firstChild);
    } else if (document.head) {
      document.head.appendChild(link);
      document.head.appendChild(shortcut);
    }

    // Keep it first even if head mutates later.
    try {
      var obs = new MutationObserver(function () {
        var app = document.querySelector('link#app-favicon');
        var first = document.querySelector('link[rel~="icon"]');
        if (!app || (first && first.id !== 'app-favicon')) {
          try {
            var icons2 = document.querySelectorAll('link[rel~="icon"]');
            for (var j = 0; j < icons2.length; j++) {
              var el2 = icons2[j];
              if (el2 && (el2.id === 'app-favicon' || el2.id === 'app-favicon-shortcut')) continue;
              if (el2 && el2.parentNode) el2.parentNode.removeChild(el2);
            }
            var app2 = document.querySelector('link#app-favicon');
            var short2 = document.querySelector('link#app-favicon-shortcut');
            if (app2 && document.head) document.head.insertBefore(app2, document.head.firstChild);
            if (short2 && document.head) document.head.insertBefore(short2, document.head.firstChild);
          } catch (e) {}
        }
      });
      if (document.head) obs.observe(document.head, { childList: true });
    } catch (e) {}
  } catch (e) {}
})();`
}

