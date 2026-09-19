function parseAmount(value) {
  // BUG: floating point conversion loses cents for some decimal values and
  // silently accepts malformed values.
  return Math.round(Number.parseFloat(value) * 100);
}

export function parseLedger(csv) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith("#"));
  if (lines.length === 0) return [];

  const records = [];
  for (const line of lines.slice(1)) {
    const [id, date, kind, amount] = line.split(",").map((part) => part.trim());
    const cents = parseAmount(amount);
    records.push({
      id,
      date,
      kind,
      amountCents: cents,
      signedCents: kind === "debit" ? -cents : cents,
    });
  }
  return records;
}

export function summarizeByMonth(records) {
  const byMonth = new Map();
  for (const record of records) {
    const month = record.date.slice(0, 7);
    const summary = byMonth.get(month) ?? { month, creditCents: 0, debitCents: 0, netCents: 0, count: 0 };
    if (record.kind === "credit") summary.creditCents += record.amountCents;
    else summary.debitCents += record.amountCents;
    summary.netCents += record.signedCents;
    summary.count += 1;
    byMonth.set(month, summary);
  }
  return [...byMonth.values()];
}

export function largestExpense(records) {
  return records.filter((record) => record.kind === "debit").sort((a, b) => b.amountCents - a.amountCents)[0] ?? null;
}
