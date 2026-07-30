// money.js — integer minor-unit arithmetic for Składka.
// All amounts are integers in grosze/cents. No floats touch money.

/** Parse a user-typed amount ("12", "12,50", "1 234.56") into minor units. Returns null if invalid. */
export function parseAmount(str) {
  if (typeof str !== 'string') return null;
  const s = str.trim().replace(/[\s ]/g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  const minor = parseInt(whole, 10) * 100 + parseInt((frac + '00').slice(0, 2), 10);
  if (!Number.isSafeInteger(minor) || minor <= 0 || minor > 99999999999) return null;
  return minor;
}

/** Format minor units for display: 123456 -> "1 234,56" (pl) / "1,234.56" (en). */
export function formatAmount(minor, locale = 'pl') {
  const sign = minor < 0 ? '−' : '';
  const abs = Math.abs(minor);
  const whole = Math.floor(abs / 100).toString();
  const frac = (abs % 100).toString().padStart(2, '0');
  const sep = locale === 'pl' ? ',' : '.';
  const thou = locale === 'pl' ? '\u00A0' : ','; // NBSP thousands sep (pl)
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thou);
  return `${sign}${grouped}${sep}${frac}`;
}

/** Split `total` into n parts differing by at most 1, summing exactly to total. */
export function splitEqual(total, n) {
  if (n <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < rem ? 1 : 0));
}

/** Split `total` proportionally to positive weights, summing exactly (largest remainder). */
export function splitWeights(total, weights) {
  const wsum = weights.reduce((a, b) => a + b, 0);
  if (wsum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (total * w) / wsum);
  const floors = raw.map(Math.floor);
  let rem = total - floors.reduce((a, b) => a + b, 0);
  // hand out the remainder to the largest fractional parts (stable by index)
  const order = raw
    .map((r, i) => ({ frac: r - Math.floor(r), i }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  const out = floors.slice();
  for (let k = 0; k < rem; k++) out[order[k].i] += 1;
  return out;
}

/**
 * Net balance per participant: paid minus owed share.
 * expense: { amount, paidBy, among: [ids], mode: 'equal'|'weights'|'exact', values?: [] }
 * Returns Map id -> net minor units (positive = should get money back).
 */
export function computeBalances(participants, expenses) {
  const net = new Map(participants.map((p) => [p.id, 0]));
  for (const e of expenses) {
    if (!net.has(e.paidBy)) continue;
    const among = e.among.filter((id) => net.has(id));
    if (among.length === 0) continue;
    let shares;
    if (e.mode === 'weights') {
      shares = splitWeights(e.amount, e.values.slice(0, among.length));
    } else if (e.mode === 'exact') {
      shares = e.values.slice(0, among.length);
    } else {
      shares = splitEqual(e.amount, among.length);
    }
    net.set(e.paidBy, net.get(e.paidBy) + e.amount);
    among.forEach((id, i) => net.set(id, net.get(id) - (shares[i] || 0)));
  }
  return net;
}

/**
 * Greedy minimal-cash-flow settlement: repeatedly match the largest debtor
 * with the largest creditor. Produces at most n-1 transfers.
 * Returns [{ from, to, amount }].
 */
export function settle(balances) {
  const creditors = [];
  const debtors = [];
  for (const [id, v] of balances) {
    if (v > 0) creditors.push({ id, v });
    else if (v < 0) debtors.push({ id, v: -v });
  }
  creditors.sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  debtors.sort((a, b) => b.v - a.v || (a.id < b.id ? -1 : 1));
  const out = [];
  let ci = 0, di = 0;
  while (ci < creditors.length && di < debtors.length) {
    const pay = Math.min(creditors[ci].v, debtors[di].v);
    if (pay > 0) out.push({ from: debtors[di].id, to: creditors[ci].id, amount: pay });
    creditors[ci].v -= pay;
    debtors[di].v -= pay;
    if (creditors[ci].v === 0) ci++;
    if (debtors[di].v === 0) di++;
  }
  return out;
}
