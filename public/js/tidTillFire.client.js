// public/js/tidTillFire.client.js

// Chart.js via CDN
const chartScript = document.createElement("script");
chartScript.src = "https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js";
document.head.appendChild(chartScript);

const $ = (id) => document.getElementById(id);

function money(n) {
  return Math.round(Number(n) || 0).toLocaleString("sv-SE");
}

function clamp(n, a, b) {
  return Math.min(b, Math.max(a, n));
}

function roundToInt(n) {
  return Math.round(Number(n) || 0);
}

function formatYearsMonthsFromYears(yearsFloat) {
  if (!isFinite(yearsFloat)) return "–";
  const totalMonths = Math.round(yearsFloat * 12);
  const sign = totalMonths < 0 ? "-" : "";
  const absMonths = Math.abs(totalMonths);
  const y = Math.floor(absMonths / 12);
  const m = absMonths % 12;
  if (y === 0) return `${sign}${m} mån`;
  if (m === 0) return `${sign}${y} år`;
  return `${sign}${y} år ${m} mån`;
}

function formatAgeYearsMonths(ageFloat) {
  if (ageFloat == null || !isFinite(ageFloat)) return "–";
  const whole = Math.floor(ageFloat);
  const frac = ageFloat - whole;
  const months = Math.round(frac * 12);
  if (months === 0) return `${whole}`;
  return `${whole} + ${months} mån`;
}

/**
 * Simulerar kapital med insättning i början av året och interpolerar när kapitalet korsar FIRE-målet.
 * startCapital är kapital vid startAge (realt).
 */
function simulate({ startAge, maxAge, annualSave, r, fireTarget, startCapital }) {
  const ages = [];
  const capital = [];
  const target = [];

  let capPrev = Math.max(0, Number(startCapital) || 0);
  let cap = capPrev;

  let fireAt = null;

  for (let age = startAge; age <= maxAge; age++) {
    ages.push(age);

    // Insättning i början av året
    cap = (capPrev + annualSave) * (1 + r);

    capital.push(cap);
    target.push(fireTarget);

    // Hitta första korsningen och interpolera inom året
    if (fireAt === null && capPrev < fireTarget && cap >= fireTarget) {
      const denom = cap - capPrev;
      const frac = denom > 0 ? clamp((fireTarget - capPrev) / denom, 0, 1) : 1;
      // Korsning sker mellan (age-1) och age
      fireAt = (age - 1) + frac;
    }

    capPrev = cap;
  }

  // Om du redan är över målet vid start, sätt fireAt = startAge
  if (fireAt === null && (Number(startCapital) || 0) >= fireTarget) {
    fireAt = startAge;
  }

  return { ages, capital, target, fireAt };
}

function computeScenario({
  startAge,
  maxAge,
  startCapital,
  monthlySpend,
  saveRatePct,
  returnPct,
  swPct,
  deltaType,
  deltaAmountMonthly,
}) {
  const r = (Number(returnPct) || 0) / 100;
  const sw = (Number(swPct) || 0) / 100;

  const baseSpendMonthly = Math.max(0, Number(monthlySpend) || 0);

  // Baseline: sparkvot av netto, där vi approxar netto så att utgift och sparkvot går ihop:
  // net = spend / (1 - sr)
  // save = net*sr = spend*sr/(1-sr)
  const sr = clamp((Number(saveRatePct) || 0) / 100, 0, 0.95);

  const baseAnnualSpend = baseSpendMonthly * 12;
  const baseAnnualSave = sr > 0 ? baseAnnualSpend * (sr / (1 - sr)) : 0;

  // Beslut (år)
  const d = Math.max(0, Number(deltaAmountMonthly) || 0) * 12;

  let newAnnualSpend = baseAnnualSpend;
  let newAnnualSave = baseAnnualSave;

  if (deltaType === "spend") {
    newAnnualSpend = baseAnnualSpend + d;
    newAnnualSave = Math.max(0, baseAnnualSave - d);
  } else {
    newAnnualSpend = baseAnnualSpend;
    newAnnualSave = baseAnnualSave + d;
  }

  const baseTarget = sw > 0 ? baseAnnualSpend / sw : Infinity;
  const newTarget = sw > 0 ? newAnnualSpend / sw : Infinity;

  const baseSim = simulate({
    startAge,
    maxAge,
    annualSave: baseAnnualSave,
    r,
    fireTarget: baseTarget,
    startCapital,
  });

  const newSim = simulate({
    startAge,
    maxAge,
    annualSave: newAnnualSave,
    r,
    fireTarget: newTarget,
    startCapital,
  });

  return {
    base: { annualSpend: baseAnnualSpend, annualSave: baseAnnualSave, target: baseTarget, fireAt: baseSim.fireAt },
    next: { annualSpend: newAnnualSpend, annualSave: newAnnualSave, target: newTarget, fireAt: newSim.fireAt },
    chart: {
      ages: baseSim.ages,
      baseCap: baseSim.capital,
      baseTarget: baseSim.target,
      nextCap: newSim.capital,
      nextTarget: newSim.target,
    },
  };
}

let chart;

function renderDetailsRows(res) {
  const tbody = $("detailsRows");
  if (!tbody) return;
  tbody.innerHTML = "";

  const makeRow = (label, s) => {
    const tr = document.createElement("tr");
    tr.className = "border-b border-[var(--border)]";
    tr.innerHTML = `
      <td class="py-2 pr-4 font-semibold">${label}</td>
      <td class="py-2 pr-4">${money(s.annualSpend)} kr/år</td>
      <td class="py-2 pr-4">${money(s.annualSave)} kr/år</td>
      <td class="py-2 pr-4">${money(s.target)} kr</td>
      <td class="py-2 pr-4">${formatAgeYearsMonths(s.fireAt)}</td>
    `;
    tbody.appendChild(tr);
  };

  makeRow("Baseline", res.base);
  makeRow("Med beslutet", res.next);
}

function renderResult(res, startAge, deltaType, deltaLabel) {
  const baseFireAt = res.base.fireAt;
  const nextFireAt = res.next.fireAt;

  const baseYearsLeft = baseFireAt != null ? (baseFireAt - startAge) : null;
  const nextYearsLeft = nextFireAt != null ? (nextFireAt - startAge) : null;

  $("baseFireAge").textContent = baseFireAt != null ? formatAgeYearsMonths(baseFireAt) : "–";
  $("newFireAge").textContent = nextFireAt != null ? formatAgeYearsMonths(nextFireAt) : "–";

  $("baseYearsLeft").textContent = baseYearsLeft != null ? formatYearsMonthsFromYears(baseYearsLeft) : "–";
  $("newYearsLeft").textContent = nextYearsLeft != null ? formatYearsMonthsFromYears(nextYearsLeft) : "–";

  let deltaText = "–";
  let explain = "";

  if (baseFireAt != null && nextFireAt != null) {
    const diffYears = nextFireAt - baseFireAt;
    const diffMonths = Math.round(diffYears * 12);

    if (diffMonths === 0) {
      deltaText = "0 mån (ingen skillnad)";
    } else if (diffMonths > 0) {
      deltaText = `+${formatYearsMonthsFromYears(diffMonths / 12)} (senare FIRE)`;
    } else {
      deltaText = `${formatYearsMonthsFromYears(diffMonths / 12)} (tidigare FIRE)`;
    }

    // Brutal: arbetstimmar. Antag 2080 h/år (40 h/vecka).
    const hours = Math.round(Math.abs(diffYears) * 2080);
    const hoursText = hours.toLocaleString("sv-SE");
    const sign = diffYears > 0 ? "+" : "-";
    const hoursLine = `${sign}${hoursText} arbetstimmar`;

    const name = (deltaLabel || "").trim() || "Beslutet";
    explain =
      deltaType === "spend"
        ? `${name} gör att du både behöver ett större FIRE-mål och sparar mindre varje år. Effekt: ${hoursLine}.`
        : `${name} ökar ditt årliga sparande utan att höja din utgift. Effekt: ${hoursLine}.`;
  } else {
    explain =
      "Du når inte FIRE inom maxåldern med nuvarande antaganden. Höj sparandet, sänk utgiften, höj avkastningen eller höj maxåldern.";
  }

  $("deltaYears").textContent = deltaText;
  $("deltaExplain").textContent = explain;
}

function renderChart(chartData) {
  if (!window.Chart) return;

  const canvas = $("chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const data = {
    labels: chartData.ages,
    datasets: [
      { type: "line", label: "Kapital (baseline)", data: chartData.baseCap, borderWidth: 3, pointRadius: 0, tension: 0.25 },
      { type: "line", label: "FIRE-mål (baseline)", data: chartData.baseTarget, borderWidth: 2, pointRadius: 0, borderDash: [6, 4], tension: 0 },
      { type: "line", label: "Kapital (med beslutet)", data: chartData.nextCap, borderWidth: 3, pointRadius: 0, tension: 0.25 },
      { type: "line", label: "FIRE-mål (med beslutet)", data: chartData.nextTarget, borderWidth: 2, pointRadius: 0, borderDash: [6, 4], tension: 0 },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { labels: { color: "#e5e7eb" } },
      tooltip: {
        callbacks: {
          label: (c) => `${c.dataset.label}: ${Math.round(c.parsed.y).toLocaleString("sv-SE")} kr`,
        },
      },
    },
    scales: {
      x: { ticks: { color: "#e5e7eb" }, grid: { color: "rgba(148,163,184,0.18)" } },
      y: { ticks: { color: "#e5e7eb", callback: (v) => Math.round(v).toLocaleString("sv-SE") }, grid: { color: "rgba(148,163,184,0.18)" } },
    },
  };

  if (chart) chart.destroy();
  chart = new Chart(ctx, { type: "line", data, options });
}

function update() {
  const startAge = Number($("startAge")?.value) || 30;
  const maxAge = Number($("maxAge")?.value) || 80;
  const startCapital = Number($("startCapital")?.value) || 0;

  const monthlySpend = Number($("monthlySpend")?.value) || 30000;
  const saveRate = Number($("saveRate")?.value) || 35;
  const returnPct = Number($("returnPct")?.value) || 5;
  const swPct = Number($("swPct")?.value) || 4;

  const deltaType = $("deltaType")?.value || "spend";
  const deltaAmount = Number($("deltaAmount")?.value) || 0;
  const deltaLabel = $("deltaLabel")?.value || "";

  const res = computeScenario({
    startAge,
    maxAge,
    startCapital,
    monthlySpend,
    saveRatePct: saveRate,
    returnPct,
    swPct,
    deltaType,
    deltaAmountMonthly: deltaAmount,
  });

  renderResult(res, startAge, deltaType, deltaLabel);
  renderDetailsRows(res);
  renderChart(res.chart);
}

function loadExamples() {
  if ($("startAge")) $("startAge").value = 33;
  if ($("startCapital")) $("startCapital").value = 250000; // <-- ny
  if ($("monthlySpend")) $("monthlySpend").value = 32000;
  if ($("saveRate")) $("saveRate").value = 40;
  if ($("returnPct")) $("returnPct").value = 5;
  if ($("swPct")) $("swPct").value = 4;
  if ($("maxAge")) $("maxAge").value = 80;

  if ($("deltaType")) $("deltaType").value = "spend";
  if ($("deltaAmount")) $("deltaAmount").value = 3500;
  if ($("deltaLabel")) $("deltaLabel").value = "Billån";
}

chartScript.onload = () => {
  update();

  [
    "startAge",
    "startCapital",
    "monthlySpend",
    "saveRate",
    "returnPct",
    "swPct",
    "maxAge",
    "deltaType",
    "deltaAmount",
    "deltaLabel",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", update);
  });

  const btn = $("loadExamples");
  if (btn) {
    btn.addEventListener("click", () => {
      loadExamples();
      update();
    });
  }
};
