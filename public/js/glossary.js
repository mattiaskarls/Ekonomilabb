/* Glossary tooltip runtime (script-tag friendly)
   Works on:
   - Astro pages (when included via <script defer src="/js/glossary.js"></script>)
   - Static HTML in /public/tools/*

   Markup:
   <span class="glossary-term" data-glossary="nettolön" tabindex="0">
     nettolön<span class="glossary-i" aria-hidden="true">i</span>
   </span>
*/

(function () {
  let _glossaryCache = null;
  let _tooltipEl = null;
  let _activeTarget = null;

  async function loadGlossary() {
    if (_glossaryCache) return _glossaryCache;

    try {
      const res = await fetch("/ordlista.json", { credentials: "same-origin" });
      if (!res.ok) throw new Error(`Failed to load glossary: ${res.status}`);
      _glossaryCache = await res.json();
    } catch (e) {
      _glossaryCache = {};
    }

    return _glossaryCache;
  }

  function ensureTooltip() {
    if (_tooltipEl) return _tooltipEl;

    const el = document.createElement("div");
    el.id = "glossary-tooltip";
    el.style.position = "fixed";
    el.style.zIndex = "9999";
    el.style.maxWidth = "380px";
    el.style.display = "none";
    el.style.pointerEvents = "none";
    document.body.appendChild(el);

    _tooltipEl = el;
    return el;
  }

  function buildTooltipHtml(entry) {
    const esc = (s) =>
      String(s)
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;");

    const term = esc(entry.term ?? "");
    const short = entry.short
      ? `<div class="text-sm text-[var(--text-muted)] mb-2">${esc(entry.short)}</div>`
      : "";
    const def = entry.definition ? `<div class="text-sm">${esc(entry.definition)}</div>` : "";

    const seeAlso =
      Array.isArray(entry.seeAlso) && entry.seeAlso.length
        ? `<div class="text-xs text-[var(--text-muted)] mt-2">Se även: ${entry.seeAlso
            .map(esc)
            .join(", ")}</div>`
        : "";

    return `
      <div class="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 shadow-lg">
        <div class="font-medium mb-1">${term}</div>
        ${short}
        ${def}
        ${seeAlso}
      </div>
    `;
  }

  function positionTooltip(tip, targetRect) {
    const margin = 10;
    const maxW = 380;

    let x = targetRect.left;
    let y = targetRect.bottom + margin;

    x = Math.max(12, Math.min(x, window.innerWidth - maxW - 12));

    const estimatedH = 180;
    if (y + estimatedH > window.innerHeight - 12) {
      y = targetRect.top - margin - estimatedH;
    }
    y = Math.max(12, Math.min(y, window.innerHeight - 12 - estimatedH));

    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  async function showForTarget(target) {
    const keyRaw = target && target.dataset ? target.dataset.glossary : null;
    if (!keyRaw) return;

    const key = String(keyRaw).trim().toLowerCase();
    if (!key) return;

    const glossary = await loadGlossary();
    const entry = glossary[key];
    if (!entry) return;

    const tip = ensureTooltip();
    tip.innerHTML = buildTooltipHtml(entry);

    const rect = target.getBoundingClientRect();
    positionTooltip(tip, rect);

    tip.style.display = "block";
    _activeTarget = target;
  }

  function hideTooltip() {
    if (_tooltipEl) _tooltipEl.style.display = "none";
    _activeTarget = null;
  }

  function closestGlossaryTerm(el) {
    if (!el || !el.closest) return null;
    return el.closest(".glossary-term[data-glossary]");
  }

  function onPointerOver(e) {
    const t = closestGlossaryTerm(e.target);
    if (!t) return;
    if (_activeTarget === t) return;
    showForTarget(t);
  }

  function onPointerOut(e) {
    const from = closestGlossaryTerm(e.target);
    const to = closestGlossaryTerm(e.relatedTarget);
    if (from && to && from === to) return;
    hideTooltip();
  }

  function onFocusIn(e) {
    const t = closestGlossaryTerm(e.target);
    if (!t) return;
    showForTarget(t);
  }

  function onFocusOut(e) {
    const t = closestGlossaryTerm(e.target);
    if (!t) return;
    hideTooltip();
  }

  function onKeyDown(e) {
    if (e.key === "Escape") hideTooltip();
  }

  function onScrollOrResize() {
    if (_activeTarget) hideTooltip();
  }

  function initGlossary() {
    if (window.__glossaryInitialized) return;
    window.__glossaryInitialized = true;

    if ("requestIdleCallback" in window) {
      window.requestIdleCallback(() => loadGlossary());
    } else {
      setTimeout(() => loadGlossary(), 300);
    }

    document.addEventListener("pointerover", onPointerOver);
    document.addEventListener("pointerout", onPointerOut);
    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("focusout", onFocusOut);
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("scroll", onScrollOrResize, { passive: true });
    window.addEventListener("resize", onScrollOrResize);
  }

  // Expose + auto-init
  window.initGlossary = initGlossary;
  initGlossary();
})();
