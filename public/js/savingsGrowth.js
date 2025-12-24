// src/lib/savingsGrowth.js

function sumAmounts(arr) {
  return (arr || []).reduce((acc, x) => acc + (Number(x?.amount) || 0), 0);
}

/**
 * Växer en serie med "insättning i början av året".
 * - oneTime=true: insättning bara vid första året (i=0)
 * - oneTime=false: samma insättning varje år
 */
function growSeries({ yearlyAmount, years, r, oneTime = false }) {
  let cap = 0;
  const series = [];

  for (let i = 0; i <= years; i++) {
    const add = oneTime ? (i === 0 ? yearlyAmount : 0) : yearlyAmount;
    cap = (cap + add) * (1 + r);
    series.push(cap);
  }

  return series;
}

export function simulateSavings({
  startAge,
  endAge,
  realReturnPct,
  oneTimeItems = [],
  yearlyItems = [],
  monthlyItems = [],
  dailyItems = [],
}) {
  const r = (Number(realReturnPct) || 0) / 100;

  const years = Math.max(0, (Number(endAge) || 0) - (Number(startAge) || 0));
  const ages = Array.from({ length: years + 1 }, (_, i) => (Number(startAge) || 0) + i);

  // Årliga insättningar (konsekvent årsmodell)
  const oneTime0 = sumAmounts(oneTimeItems);        // kr, bara år 0
  const yearly = sumAmounts(yearlyItems);           // kr/år
  const monthly = sumAmounts(monthlyItems) * 12;    // kr/år
  const daily = sumAmounts(dailyItems) * 365;       // kr/år (365 dagar)

  // Hinkar för stackad graf
  let capOne = 0;
  let capYear = 0;
  let capMonth = 0;
  let capDay = 0;

  const series = ages.map((age, idx) => {
    const addOne = idx === 0 ? oneTime0 : 0;

    // Insättning i början av året
    capOne = (capOne + addOne) * (1 + r);
    capYear = (capYear + yearly) * (1 + r);
    capMonth = (capMonth + monthly) * (1 + r);
    capDay = (capDay + daily) * (1 + r);

    return {
      age,
      buckets: { one: capOne, year: capYear, month: capMonth, day: capDay },
      total: capOne + capYear + capMonth + capDay,
    };
  });

  // Nominalt sparat (utan avkastning)
  const nominal = {
    one: oneTime0,
    year: yearly * (years + 1),
    month: monthly * (years + 1),
    day: daily * (years + 1),
  };

  const last = series.at(-1) ?? {
    buckets: { one: 0, year: 0, month: 0, day: 0 },
    total: 0,
  };

  const growth = {
    one: last.buckets.one - nominal.one,
    year: last.buckets.year - nominal.year,
    month: last.buckets.month - nominal.month,
    day: last.buckets.day - nominal.day,
  };

  const totalNominal = nominal.one + nominal.year + nominal.month + nominal.day;
  const totalGrowth = growth.one + growth.year + growth.month + growth.day;

  const pct = (v, t) => (t > 0 ? (v / t) * 100 : 0);

  const summary = {
    nominal,
    growth,
    final: last.buckets,
    total: {
      nominal: totalNominal,
      growth: totalGrowth,
      final: last.total,
    },
    sharePct: {
      one: pct(last.buckets.one, last.total),
      year: pct(last.buckets.year, last.total),
      month: pct(last.buckets.month, last.total),
      day: pct(last.buckets.day, last.total),
    },
  };

  // Per-post-beräkning (för underrader i tabellen)
  const perItem = {
    one: (oneTimeItems || []).map((item) => {
      const amount = Number(item?.amount) || 0;
      const s = growSeries({ yearlyAmount: amount, years, r, oneTime: true });
      const final = s.at(-1) || 0;
      return {
        label: item?.label || "",
        nominal: amount,
        growth: final - amount,
        final,
      };
    }),

    year: (yearlyItems || []).map((item) => {
      const amount = Number(item?.amount) || 0;
      const s = growSeries({ yearlyAmount: amount, years, r, oneTime: false });
      const final = s.at(-1) || 0;
      const nom = amount * (years + 1);
      return {
        label: item?.label || "",
        nominal: nom,
        growth: final - nom,
        final,
      };
    }),

    month: (monthlyItems || []).map((item) => {
      const amount = (Number(item?.amount) || 0) * 12;
      const s = growSeries({ yearlyAmount: amount, years, r, oneTime: false });
      const final = s.at(-1) || 0;
      const nom = amount * (years + 1);
      return {
        label: item?.label || "",
        nominal: nom,
        growth: final - nom,
        final,
      };
    }),

    day: (dailyItems || []).map((item) => {
      const amount = (Number(item?.amount) || 0) * 365;
      const s = growSeries({ yearlyAmount: amount, years, r, oneTime: false });
      const final = s.at(-1) || 0;
      const nom = amount * (years + 1);
      return {
        label: item?.label || "",
        nominal: nom,
        growth: final - nom,
        final,
      };
    }),
  };

  return {
    ages,
    series,
    inputs: { oneTime0, yearly, monthly, daily, years },
    summary,
    perItem,
  };
}
