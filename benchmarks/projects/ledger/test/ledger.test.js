import assert from "node:assert/strict";
import test from "node:test";
import { largestExpense, parseLedger, summarizeByMonth } from "../src/ledger.js";

const validCsv = `# exported ledger
id,date,kind,amount
c2,2026-02-03,credit,0.29
d2,2026-02-02,debit,30.05
c1,2026-01-01,credit,1000
d1,2026-01-15,debit,12.50
d3,2026-02-02,debit,30.05
`;

test("parses exact integer cents and signs", () => {
  const records = parseLedger(validCsv);
  assert.equal(records.length, 5);
  assert.deepEqual(records[0], {
    id: "c2", date: "2026-02-03", kind: "credit", amountCents: 29, signedCents: 29,
  });
  assert.equal(records[3].signedCents, -1250);
});

test("summarizes months in sorted order", () => {
  assert.deepEqual(summarizeByMonth(parseLedger(validCsv)), [
    { month: "2026-01", creditCents: 100000, debitCents: 1250, netCents: 98750, count: 2 },
    { month: "2026-02", creditCents: 29, debitCents: 6010, netCents: -5981, count: 3 },
  ]);
});

test("largest expense uses date and id tie breakers", () => {
  assert.equal(largestExpense(parseLedger(validCsv))?.id, "d2");
});

test("returns null without expenses", () => {
  assert.equal(largestExpense(parseLedger("id,date,kind,amount\na,2026-01-01,credit,1")), null);
});

for (const [name, csv, fragment] of [
  ["requires header", "a,2026-01-01,credit,1", "line 1"],
  ["rejects duplicate ids", "id,date,kind,amount\na,2026-01-01,credit,1\na,2026-01-02,debit,2", "line 3"],
  ["rejects impossible dates", "id,date,kind,amount\na,2026-02-30,credit,1", "line 2"],
  ["rejects date formatting", "id,date,kind,amount\na,2026-2-03,credit,1", "line 2"],
  ["rejects kinds", "id,date,kind,amount\na,2026-01-01,refund,1", "line 2"],
  ["rejects negative amounts", "id,date,kind,amount\na,2026-01-01,debit,-1", "line 2"],
  ["rejects excess precision", "id,date,kind,amount\na,2026-01-01,credit,1.005", "line 2"],
  ["rejects malformed amounts", "id,date,kind,amount\na,2026-01-01,credit,1x", "line 2"],
  ["rejects missing fields", "id,date,kind,amount\na,2026-01-01,credit", "line 2"],
  ["rejects empty ids", "id,date,kind,amount\n ,2026-01-01,credit,1", "line 2"],
]) {
  test(name, () => assert.throws(() => parseLedger(csv), new RegExp(fragment)));
}
