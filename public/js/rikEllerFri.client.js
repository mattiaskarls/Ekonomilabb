// public/js/rikEllerFri.client.js
// Scenario A vs B (Rik eller fri) med nettolön + kostnader + (sparande kr/mån <-> sparkvot %)

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
 * Sparlogik:
 * - startCapital är kapital vid startAge (realt)
 * - annualSave sätts in i början av varje år
 * - kapital växer med r
 * - vi interpolerar när kapitalet korsar fireTarget inom året
 */
function simulate({ startAge, maxAge, startCapital, annualSave, r, fireTarget }) {
  const ages = [];
  const capSeries = [];
  const targetSeries = [];

  let capPrev = Math.max(0, Number(startCapital) || 0);
  let cap = capPrev;

  let fireAt = null;

  for (let age = startAge; age <= maxAge; age++) {
    ages.push(age);

    cap = (capPrev + annualSave) * (1 + r);

    capSeries.push(cap);
    targetSeries.push(fireTarget);

    if (fireAt === null && capPrev < fireTarget && cap >= fireTarget) {
      const denom = cap - capPrev;
      const frac = denom > 0 ? clamp((fireTarget - capPrev) / denom, 0, 1) : 1;
      fireAt = (age - 1) + frac;
    }

    capPrev = cap;
  }

  if (fireAt === null && (Number(startCapital) || 0) >= fireTarget) {
    fireAt = startAge;
  }

  return { ages, capSeries, targetSeries, fireAt };
}

/**
 * Synkar sparande (kr/mån) och sparkvot (%) mot nettolön.
 * - lastChanged: "kr" eller "pct" (vilket användaren senast redigerade)
 * - clamp: sparande får inte överstiga (netto - kostnad)
 *
 * Returnerar sparande i kr/mån (synkat + clampat).
 */
function syncSavings({ netId, spendId, saveId, rateId, lastChanged }) {
  const net = Math.max(0, Number($(netId)?.value) || 0);
  const spend = Math.max(0, Number($(spendId)?.value) || 0);

  let save = Math.max(0, Number($(saveId)?.value) || 0);
  let rate = Number($(rateId)?.value) || 0;

  const maxSave = Math.max(0, net - spend);

  if (lastChanged === "pct") {
    rate = clamp(rate, 0, 95);
    save = (rate / 100) * net;
  } // else "kr": keep save as typed

  // Clamp to reality
  save = clamp(save, 0, maxSave);

  // Update the other field based on resulting save
  rate = net > 0 ? (save / net) * 100 : 0;

  // Write back (nice formatting)
  if ($(saveId)) $(saveId).value = String(Math.round(save));
  if ($(rateId)) $(rateId).value = String(Math.round(rate * 10) / 10);

  return save;
}

function computeScenario({
  startAge,
  maxAge,
  startCapital,
  monthlySpend,
  monthlySave,
  r,
  sw,
}) {
  const annualSpend = Math.max(0, Number(monthlySpend) || 0) * 12;
  const annualSave = Math.max(0, Number(monthlySave) || 0) * 12;
  const target = sw > 0 ? annualSpend / sw : Infinity;

  const sim = simulate({
    startAge,
    maxAge,
    startCapital,
    annualSave,
    r,
    fireTarget: target,
  });

  return {
    annualSpend,
    annualSave,
    target,
    fireAt: sim.fireAt,
    chart: {
      ages: sim.ages,
      cap: sim.capSeries,
      target: sim.targetSeries,
    },
  };
}

let chart;

function renderDetails(rowsEl, label, s) {
  const tr = document.createElement("tr");
  tr.className = "border-b border-[var(--border)]";
  tr.innerHTML = `
    <td class="py-2 pr-4 font-semibold">${label}</td>
    <td class="py-2 pr-4">${money(s.annualSpend)} kr/år</td>
    <td class="py-2 pr-4">${money(s.annualSave)} kr/år</td>
    <td class="py-2 pr-4">${money(s.target)} kr</td>
    <td class="py-2 pr-4">${formatAgeYearsMonths(s.fireAt)}</td>
  `;
  rowsEl.appendChild(tr);
}

function renderChart(a, b) {
  if (!window.Chart) return;

  const canvas = $("chart");
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  const data = {
    labels: a.chart.ages,
    datasets: [
      { type: "line", label: "Kapital A", data: a.chart.cap, borderWidth: 3, pointRadius: 0, tension: 0.25 },
      { type: "line", label: "FIRE-mål A", data: a.chart.target, borderWidth: 2, pointRadius: 0, borderDash: [6, 4], tension: 0 },
      { type: "line", label: "Kapital B", data: b.chart.cap, borderWidth: 3, pointRadius: 0, tension: 0.25 },
      { type: "line", label: "FIRE-mål B", data: b.chart.target, borderWidth: 2, pointRadius: 0, borderDash: [6, 4], tension: 0 },
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

// Vilket fält som senast ändrades (per scenario)
let lastA = "kr";
let lastB = "kr";

function update() {
  const startAge = Number($("startAge")?.value) || 33;
  const maxAge = Number($("maxAge")?.value) || 80;
  const returnPct = Number($("returnPct")?.value) || 5;
  const swPct = Number($("swPct")?.value) || 4;
  const workHoursPerYear = Number($("workHoursPerYear")?.value) || 2080;

  const r = returnPct / 100;
  const sw = swPct / 100;

  // Synka sparande/rate för A & B först
  const monthlySaveA = syncSavings({
    netId: "netIncomeA",
    spendId: "monthlySpendA",
    saveId: "monthlySaveA",
    rateId: "saveRateA",
    lastChanged: lastA,
  });

  const monthlySaveB = syncSavings({
    netId: "netIncomeB",
    spendId: "monthlySpendB",
    saveId: "monthlySaveB",
    rateId: "saveRateB",
    lastChanged: lastB,
  });

  const a = computeScenario({
    startAge,
    maxAge,
    startCapital: Number($("startCapitalA")?.value) || 0,
    monthlySpend: Number($("monthlySpendA")?.value) || 0,
    monthlySave: monthlySaveA,
    r,
    sw,
  });

  const b = computeScenario({
    startAge,
    maxAge,
    startCapital: Number($("startCapitalB")?.value) || 0,
    monthlySpend: Number($("monthlySpendB")?.value) || 0,
    monthlySave: monthlySaveB,
    r,
    sw,
  });

  if ($("fireA")) $("fireA").textContent = a.fireAt != null ? formatAgeYearsMonths(a.fireAt) : "–";
  if ($("fireB")) $("fireB").textContent = b.fireAt != null ? formatAgeYearsMonths(b.fireAt) : "–";

  if ($("yearsLeftA")) $("yearsLeftA").textContent = a.fireAt != null ? formatYearsMonthsFromYears(a.fireAt - startAge) : "–";
  if ($("yearsLeftB")) $("yearsLeftB").textContent = b.fireAt != null ? formatYearsMonthsFromYears(b.fireAt - startAge) : "–";

  // Skillnad: B - A (negativt => B tidigare)
  let deltaTime = "–";
  let deltaHours = "–";
  let explain = "";

  if (a.fireAt != null && b.fireAt != null) {
    const diffYears = b.fireAt - a.fireAt;

    deltaTime =
      diffYears === 0
        ? "0 mån (ingen skillnad)"
        : diffYears < 0
          ? `${formatYearsMonthsFromYears(diffYears)} (B tidigare)`
          : `+${formatYearsMonthsFromYears(diffYears)} (B senare)`;

    const hours = Math.round(Math.abs(diffYears) * workHoursPerYear);
    const sign = diffYears > 0 ? "+" : "-";
    deltaHours = `${sign}${hours.toLocaleString("sv-SE")} arbetstimmar`;

    explain =
      diffYears < 0
        ? "Scenario B ger lägre FIRE-mål och/eller högre sparande → frihet tidigare."
        : "Scenario B har högre FIRE-mål och/eller lägre sparande → frihet senare.";
  } else {
    explain = "Minst ett scenario når inte FIRE inom maxåldern. Sänk utgifter, höj sparande, höj avkastning eller höj maxålder.";
  }

  if ($("deltaTime")) $("deltaTime").textContent = deltaTime;
  if ($("deltaHours")) $("deltaHours").textContent = deltaHours;
  if ($("deltaExplain")) $("deltaExplain").textContent = explain;

  const rows = $("detailsRows");
  if (rows) {
    rows.innerHTML = "";
    renderDetails(rows, "Scenario A", a);
    renderDetails(rows, "Scenario B", b);
  }

  renderChart(a, b);
}

function loadExamples() {
  // Gemensamma
  if ($("startAge")) $("startAge").value = 33;
  if ($("maxAge")) $("maxAge").value = 80;
  if ($("returnPct")) $("returnPct").value = 5;
  if ($("swPct")) $("swPct").value = 4;
  if ($("workHoursPerYear")) $("workHoursPerYear").value = 2080;

  // A (rik)
  if ($("startCapitalA")) $("startCapitalA").value = 250000;
  if ($("netIncomeA")) $("netIncomeA").value = 45000;
  if ($("monthlySpendA")) $("monthlySpendA").value = 38000;
  if ($("monthlySaveA")) $("monthlySaveA").value = 7000;

  // B (fri)
  if ($("startCapitalB")) $("startCapitalB").value = 250000;
  if ($("netIncomeB")) $("netIncomeB").value = 45000;
  if ($("monthlySpendB")) $("monthlySpendB").value = 30000;
  if ($("monthlySaveB")) $("monthlySaveB").value = 15000;

  // Efter att vi satt värden: välj att "kr" var senast (så rate räknas från kr)
  lastA = "kr";
  lastB = "kr";
}

chartScript.onload = () => {
  update();

  // Basinputs
  [
    "startAge","maxAge","returnPct","swPct","workHoursPerYear",
    "startCapitalA","startCapitalB",
  ].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", update);
  });

  // Nettolön/kostnad påverkar clamp och omräkning enligt senast ändrade fält
  ["netIncomeA","monthlySpendA"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", update);
  });
  ["netIncomeB","monthlySpendB"].forEach((id) => {
    const el = $(id);
    if (el) el.addEventListener("input", update);
  });

  // Tvåvägssynk (A)
  const saveA = $("monthlySaveA");
  if (saveA) saveA.addEventListener("input", () => { lastA = "kr"; update(); });
  const rateA = $("saveRateA");
  if (rateA) rateA.addEventListener("input", () => { lastA = "pct"; update(); });

  // Tvåvägssynk (B)
  const saveB = $("monthlySaveB");
  if (saveB) saveB.addEventListener("input", () => { lastB = "kr"; update(); });
  const rateB = $("saveRateB");
  if (rateB) rateB.addEventListener("input", () => { lastB = "pct"; update(); });

  // Exempelknapp
  const btn = $("loadExamples");
  if (btn) {
    btn.addEventListener("click", () => {
      loadExamples();
      update();
    });
  }
};
