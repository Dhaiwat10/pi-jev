# Ledger importer

Implement the functions exported by `src/ledger.js`.

Input is UTF-8 CSV with the exact columns `id,date,kind,amount`. Blank lines and
lines beginning with `#` are ignored. Fields may be surrounded by whitespace but
are not quoted.

Requirements:

- The first non-comment row must be the header.
- IDs are non-empty and unique.
- Dates are real calendar dates in `YYYY-MM-DD` form.
- `kind` is exactly `credit` or `debit`.
- Amounts are non-negative decimal strings with at most two fractional digits.
- Convert amounts to integer cents without floating-point rounding.
- `signedCents` is positive for credits and negative for debits.
- Validation errors must include the one-based source line number.
- `summarizeByMonth(records)` returns rows sorted by month, with credit, debit,
  net cents, and transaction count.
- `largestExpense(records)` returns the debit with the greatest amount; ties are
  resolved by earlier date, then lexicographically smaller ID. Return `null` when
  there are no debits.
