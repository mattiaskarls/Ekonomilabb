// public/js/balansrakning.client.js

// Chart.js via CDN (samma mönster som tidTillFire)
const chartScript = document.createElement("script");
chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
document.head.appendChild(chartScript);

const $ = (id) => document.getElementById(id);

const STORAGE_KEY = "ekonomismedjan:balansrakning:v1";
const URL_HASH_KEY = "br";
const SCHEMA_VERSION = 1;

const LIMITS = {
  maxValue: 1_000_000_000,
  maxUrlLenHint: 1800,
  maxUrlLenHard: 3500,
};

const LABELS = {
  assets: {
    bank: "Bank",
    isk: "ISK",
    pension: "Pension",
    housing: "Bostad",
    other: "Övrigt",
  },
  liabilities: {
    mortgage: "Bolån",
    loans: "Privatlån",
    credit: "Kreditkort",
    other: "Övrigt",
  },
};

function defaultState() {
  return {
    v: SCHEMA_VERSION,
    updatedAt: new Date(0).toISOString(),
    currency: "SEK",
    assets: { bank: 0, isk: 0, pension: 0, housing: 0, other: 0 },
    liabilities: { mortgage: 0, loans: 0, credit: 0, other: 0 },
  };
}

let state = defaultState();
let donutChart = null;
let barChart = null;

// ---------- formatting / parsing ----------
function money(n) {
  return Math.round(Number(n) || 0).toLocaleString("sv-SE") + " kr";
}

function clampInt(n) {
  let v = Math.round(Number(n) || 0);
  if (!isFinite(v) || v < 0) v = 0;
  if (v > LIMITS.maxValue) v = LIMITS.maxValue;
  return v;
}

function parseMoneyInput(s) {
  // Accept: "25000", "25 000", "25,000", "25.000"
  const raw = String(s || "").trim();
  if (!raw) return 0;

  const cleaned = raw
    .replace(/\s+/g, "")
    .replace(/[,_]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(/[^\d-]/g, "");

  const n = parseInt(cleaned, 10);
  return clampInt(isFinite(n) ? n : 0);
}

function niceTime(iso) {
  const d = new Date(iso);
  if (!isFinite(d.getTime())) return "–";
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

// ---------- calc ----------
function sumObj(o) {
  return Object.values(o || {}).reduce((a, b) => a + (Number(b) || 0), 0);
}

function calc(s) {
  const assets = sumObj(s.assets);
  const liabs = sumObj(s.liabilities);
  const equity = assets - liabs;
  return { assets, liabs, equity };
}

// ---------- sanitize/migrate ----------
function sanitizeAndMigrate(input) {
  const base = defaultState();
  if (!input || typeof input !== "object") return base;

  const v = Number(input.v) || 0;
  let s = input;

  if (v !== SCHEMA_VERSION) {
    s = { ...base, ...input, v: SCHEMA_VERSION };
    s.assets = { ...base.assets, ...(input.assets || {}) };
    s.liabilities = { ...base.liabilities, ...(input.liabilities || {}) };
  }

  for (const k of Object.keys(base.assets)) s.assets[k] = clampInt(s.assets?.[k]);
  for (const k of Object.keys(base.liabilities)) s.liabilities[k] = clampInt(s.liabilities?.[k]);

  s.currency = "SEK";
  s.updatedAt = typeof s.updatedAt === "string" ? s.updatedAt : new Date().toISOString();
  return s;
}

// ---------- storage ----------
function saveLocal(s) {
  const toSave = { ...s, updatedAt: new Date().toISOString() };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(toSave));
  state = toSave;
  $("brLastSaved").textContent = niceTime(state.updatedAt);
}

function loadLocal() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return sanitizeAndMigrate(JSON.parse(raw));
  } catch {
    return null;
  }
}

// ---------- small compressor (byte-oriented, LZ-ish) ----------
function toBase64Url(bytes) {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function compressUtf8ToBytes(str) {
  const utf8 = new TextEncoder().encode(str);
  const out = [];
  const windowSize = 2048;
  let i = 0;

  while (i < utf8.length) {
    let bestLen = 0;
    let bestOff = 0;

    const start = Math.max(0, i - windowSize);
    for (let j = i - 1; j >= start; j--) {
      let k = 0;
      while (k < 255 && i + k < utf8.length && utf8[j + k] === utf8[i + k]) k++;
      if (k > bestLen && k >= 4) {
        bestLen = k;
        bestOff = i - j;
        if (k >= 64) break;
      }
    }

    if (bestLen >= 4) {
      out.push(1, (bestOff >> 8) & 0xff, bestOff & 0xff, bestLen & 0xff);
      i += bestLen;
    } else {
      const litStart = i;
      let litLen = 1;
      i++;

      while (i < utf8.length && litLen < 255) {
        let hasMatch = false;
        const lookStart = Math.max(0, i - windowSize);
        for (let j = i - 1; j >= lookStart; j--) {
          let k = 0;
          while (k < 20 && i + k < utf8.length && utf8[j + k] === utf8[i + k]) k++;
          if (k >= 4) {
            hasMatch = true;
            break;
          }
        }
        if (hasMatch) break;
        litLen++;
        i++;
      }

      out.push(0, litLen & 0xff);
      for (let x = 0; x < litLen; x++) out.push(utf8[litStart + x]);
    }
  }

  return new Uint8Array(out);
}

function decompressBytesToUtf8(bytes) {
  const out = [];
  let i = 0;

  while (i < bytes.length) {
    const flag = bytes[i++];
    if (flag === 0) {
      const len = bytes[i++];
      for (let k = 0; k < len; k++) out.push(bytes[i++]);
    } else if (flag === 1) {
      const off = (bytes[i++] << 8) | bytes[i++];
      const len = bytes[i++];
      const start = out.length - off;
      for (let k = 0; k < len; k++) out.push(out[start + k]);
    } else {
      throw new Error("Okänt komprimeringsformat.");
    }
  }

  return new TextDecoder().decode(new Uint8Array(out));
}

function encodeStateToHash(s) {
  const json = JSON.stringify(s);
  const bytes = compressUtf8ToBytes(json);
  const b64u = toBase64Url(bytes);
  return `${URL_HASH_KEY}=${b64u}`;
}

function decodeStateFromHash(hash) {
  const h = String(hash || "").replace(/^#/, "");
  if (!h) return null;

  const params = new URLSearchParams(h);
  const raw = params.get(URL_HASH_KEY);
  if (!raw) return null;

  const bytes = fromBase64Url(raw);
  const json = decompressBytesToUtf8(bytes);
  return sanitizeAndMigrate(JSON.parse(json));
}

// ---------- warnings ----------
function renderWarnings() {
  const host = $("brWarnings");
  if (!host) return;

  const { assets, liabs, equity } = calc(state);
  host.innerHTML = "";

  const items = [];

  if (assets === 0 && liabs === 0) {
    items.push({ kind: "info", title: "Inget ifyllt ännu", text: "Börja med bankkonto och eventuella lån." });
  } else {
    if (equity < 0) {
      items.push({
        kind: "bad",
        title: "Negativt eget kapital",
        text: "Skulderna är större än tillgångarna. Det här är en signal att dubbelkolla marginaler och risk.",
      });
    } else if (equity === 0) {
      items.push({ kind: "warn", title: "Eget kapital är 0", text: "Tillgångar och skulder tar ut varandra." });
    } else {
      items.push({ kind: "ok", title: "Positivt eget kapital", text: "Tillgångarna är större än skulderna." });
    }

    if (state.assets.pension === 0 && (state.assets.isk > 0 || state.assets.housing > 0 || assets > 200000)) {
      items.push({
        kind: "info",
        title: "Pension är 0",
        text: "Vill du ha helhetsbild: gör en grov uppskattning. Annars är det okej att lämna tomt.",
      });
    }
  }

  const box = document.createElement("div");
  box.className = "space-y-2";

  for (const w of items) {
    const border =
      w.kind === "bad"
        ? "border-rose-500/40"
        : w.kind === "warn"
        ? "border-amber-400/40"
        : w.kind === "ok"
        ? "border-emerald-400/30"
        : "border-[var(--border)]";

    const el = document.createElement("div");
    el.className = `rounded-2xl border ${border} bg-[var(--surface-soft)]/40 p-3`;
    el.innerHTML = `
      <div class="text-sm font-semibold">${escapeHtml(w.title)}</div>
      <div class="text-sm text-[var(--text-muted)] mt-1">${escapeHtml(w.text)}</div>
    `;
    box.appendChild(el);
  }

  host.appendChild(box);
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ---------- charts ----------
function chartColors() {
  // Lite mer "krispigt" på mörk bakgrund, men fortfarande nedtonat.
  return [
    "#d4af37", // gold
    "#22c55e", // green
    "#60a5fa", // blue
    "#a78bfa", // violet
    "#f97316", // orange
  ];
}

// Plugin: ritar EK-klammer mellan två bars (Tillgångar & Skulder)
const equityBracketPlugin = {
  id: "equityBracket",
  afterDatasetsDraw(chart, args, pluginOptions) {
    const opts = pluginOptions || {};
    const assets = Number(opts.assets) || 0;
    const liabs = Number(opts.liabs) || 0;
    const equity = assets - liabs;

    const meta = chart.getDatasetMeta(0);
    if (!meta?.data || meta.data.length < 2) return;

    const barAssets = meta.data[0]; // "Tillgångar"
    const barLiabs = meta.data[1]; // "Skulder"

    const yA = barAssets.y;
    const yL = barLiabs.y;

    const xMid = (barAssets.x + barLiabs.x) / 2;
    const pad = 10;

    const yTop = Math.min(yA, yL);
    const yBot = Math.max(yA, yL);

    const col = equity >= 0 ? "rgba(34,197,94,0.95)" : "rgba(244,63,94,0.95)";
    const text = `EK: ${Math.abs(equity).toLocaleString("sv-SE")} kr${equity < 0 ? " (neg)" : ""}`;

    const { ctx } = chart;
    ctx.save();

    // bracket-linje
    ctx.lineWidth = 2;
    ctx.strokeStyle = col;

    ctx.beginPath();
    ctx.moveTo(xMid, yTop);
    ctx.lineTo(xMid, yBot);
    ctx.stroke();

    // “hakar”
    ctx.beginPath();
    ctx.moveTo(xMid - pad, yTop);
    ctx.lineTo(xMid + pad, yTop);
    ctx.moveTo(xMid - pad, yBot);
    ctx.lineTo(xMid + pad, yBot);
    ctx.stroke();

    // text med liten mörk platta bakom
    ctx.font = "12px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const midY = (yTop + yBot) / 2;
    const w = ctx.measureText(text).width + 12;
    const h = 18;

    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(xMid - w / 2, midY - h / 2, w, h);

    ctx.fillStyle = col;
    ctx.fillText(text, xMid, midY);

    ctx.restore();
  },
};

function renderCharts() {
  if (!window.Chart) return;

  const { assets, liabs, equity } = calc(state);

  // Donut: tillgångsfördelning
  const assetEntries = Object.entries(state.assets)
    .map(([k, v]) => ({ key: k, label: LABELS.assets[k] || k, value: Number(v) || 0 }))
    .filter((x) => x.value > 0);

  const donutData = {
    labels: assetEntries.length ? assetEntries.map((x) => x.label) : ["Inget ifyllt"],
    datasets: [
      {
        data: assetEntries.length ? assetEntries.map((x) => x.value) : [1],
        borderWidth: 0,
        backgroundColor: assetEntries.length ? chartColors().slice(0, assetEntries.length) : ["rgba(255,255,255,0.08)"],
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { labels: { color: "#e5e7eb" } },
      tooltip: {
        callbacks: {
          label: (c) => `${c.label}: ${Math.round(c.parsed).toLocaleString("sv-SE")} kr`,
        },
      },
    },
  };

  const donutCtx = $("chartDonut")?.getContext("2d");
  if (donutCtx) {
    if (donutChart) donutChart.destroy();
    donutChart = new Chart(donutCtx, { type: "doughnut", data: donutData, options: donutOptions });
  }

  // Bar: två staplar (Tillgångar & Skulder) + EK som diff mellan topparna (klammer)
  const barData = {
    labels: ["Tillgångar", "Skulder"],
    datasets: [
      {
        label: "Belopp",
        data: [assets, liabs],
        borderWidth: 0,
        backgroundColor: [
          "rgba(148,163,184,0.45)", // Tillgångar: neutral
          "rgba(212,175,55,0.70)",  // Skulder: guld
        ],
        borderRadius: 10,
      },
    ],
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c) => `${Math.round(c.parsed.y).toLocaleString("sv-SE")} kr`,
        },
      },
      equityBracket: { assets, liabs },
    },
    scales: {
      x: {
        ticks: { color: "#e5e7eb" },
        grid: { display: false },
      },
      y: {
        ticks: {
          color: "#e5e7eb",
          callback: (v) => Math.round(v).toLocaleString("sv-SE"),
        },
        grid: { color: "rgba(148,163,184,0.12)" },
        beginAtZero: true,
      },
    },
  };

  const barCtx = $("chartBar")?.getContext("2d");
  if (barCtx) {
    if (barChart) barChart.destroy();
    barChart = new Chart(barCtx, {
      type: "bar",
      data: barData,
      options: barOptions,
      plugins: [equityBracketPlugin],
    });
  }
}

// ---------- render outputs ----------
function renderOutputs() {
  const { assets, liabs, equity } = calc(state);

  $("outAssets").textContent = money(assets);
  $("outLiabs").textContent = money(liabs);
  $("outEquity").textContent = money(equity);

  const hint = $("outEquityHint");
  if (hint) {
    hint.textContent = equity < 0 ? "Skulder > tillgångar." : equity === 0 ? "På noll." : "Buffert i balansräkningen.";
  }

  $("brLastSaved").textContent = niceTime(state.updatedAt);

  renderWarnings();
  renderCharts();
}

// ---------- input binding ----------
function setInputsFromState() {
  $("a_bank").value = state.assets.bank ? String(state.assets.bank) : "";
  $("a_isk").value = state.assets.isk ? String(state.assets.isk) : "";
  $("a_pension").value = state.assets.pension ? String(state.assets.pension) : "";
  $("a_housing").value = state.assets.housing ? String(state.assets.housing) : "";
  $("a_other").value = state.assets.other ? String(state.assets.other) : "";

  $("l_mortgage").value = state.liabilities.mortgage ? String(state.liabilities.mortgage) : "";
  $("l_loans").value = state.liabilities.loans ? String(state.liabilities.loans) : "";
  $("l_credit").value = state.liabilities.credit ? String(state.liabilities.credit) : "";
  $("l_other").value = state.liabilities.other ? String(state.liabilities.other) : "";
}

function readInputsToState() {
  state.assets.bank = parseMoneyInput($("a_bank")?.value);
  state.assets.isk = parseMoneyInput($("a_isk")?.value);
  state.assets.pension = parseMoneyInput($("a_pension")?.value);
  state.assets.housing = parseMoneyInput($("a_housing")?.value);
  state.assets.other = parseMoneyInput($("a_other")?.value);

  state.liabilities.mortgage = parseMoneyInput($("l_mortgage")?.value);
  state.liabilities.loans = parseMoneyInput($("l_loans")?.value);
  state.liabilities.credit = parseMoneyInput($("l_credit")?.value);
  state.liabilities.other = parseMoneyInput($("l_other")?.value);
}

// ---------- autosave ----------
let t = null;
function scheduleAutosave() {
  if (t) clearTimeout(t);
  t = setTimeout(() => {
    try {
      saveLocal(state);
    } catch {}
  }, 300);
}

// ---------- share ----------
function showShare(url) {
  const panel = $("sharePanel");
  if (!panel) return;
  panel.classList.remove("hidden");

  $("shareUrl").value = url;

  const len = url.length;
  const hint = $("shareHint");
  if (!hint) return;

  if (len > LIMITS.maxUrlLenHard) {
    hint.textContent = `Varning: länken är väldigt lång (${len} tecken). Vissa appar kan klippa den.`;
  } else if (len > LIMITS.maxUrlLenHint) {
    hint.textContent = `Notis: länken är ganska lång (${len} tecken). Oftast ok, men vissa appar kan kapa URL.`;
  } else {
    hint.textContent = `Längd: ${len} tecken.`;
  }
}

function makeShareUrl() {
  const toShare = sanitizeAndMigrate({ ...state, updatedAt: new Date().toISOString() });
  const hash = encodeStateToHash(toShare);
  const url = new URL(window.location.href);
  url.hash = hash;
  return url.toString();
}

async function copyShareUrl() {
  const txt = $("shareUrl")?.value || "";
  if (!txt) return;

  try {
    await navigator.clipboard.writeText(txt);
    $("shareHint").textContent = "Kopierat.";
  } catch {
    $("shareUrl").focus();
    $("shareUrl").select();
    document.execCommand("copy");
    $("shareHint").textContent = "Kopierat (fallback).";
  }
}

// ---------- init ----------
function initState() {
  // 1) URL hash
  try {
    const fromUrl = decodeStateFromHash(window.location.hash);
    if (fromUrl) {
      state = fromUrl;
      // keep as “senaste”
      try { saveLocal(state); } catch {}
      return;
    }
  } catch {}

  // 2) localStorage
  const fromLocal = loadLocal();
  if (fromLocal) {
    state = fromLocal;
    return;
  }

  // 3) default
  state = defaultState();
}

function bindEvents() {
  const ids = [
    "a_bank", "a_isk", "a_pension", "a_housing", "a_other",
    "l_mortgage", "l_loans", "l_credit", "l_other",
  ];

  ids.forEach((id) => {
    const el = $(id);
    if (!el) return;
    el.addEventListener("input", () => {
      readInputsToState();
      scheduleAutosave();
      renderOutputs();
    });
  });

  $("brSave")?.addEventListener("click", () => {
    readInputsToState();
    saveLocal(state);
    renderOutputs();
  });

  $("brReset")?.addEventListener("click", () => {
    state = defaultState();
    try { saveLocal(state); } catch {}
    setInputsFromState();
    renderOutputs();
    // remove hash (no server)
    if (window.location.hash) history.replaceState(null, "", window.location.pathname + window.location.search);
    $("sharePanel")?.classList.add("hidden");
  });

  $("brShare")?.addEventListener("click", () => {
    readInputsToState();
    try { saveLocal(state); } catch {}
    const url = makeShareUrl();
    showShare(url);
  });

  $("copyUrl")?.addEventListener("click", copyShareUrl);

  window.addEventListener("hashchange", () => {
    try {
      const fromUrl = decodeStateFromHash(window.location.hash);
      if (!fromUrl) return;
      state = fromUrl;
      try { saveLocal(state); } catch {}
      setInputsFromState();
      renderOutputs();
    } catch {}
  });
}

chartScript.onload = () => {
  initState();
  setInputsFromState();
  renderOutputs();
  bindEvents();
};
