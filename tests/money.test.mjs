import assert from 'node:assert/strict';
import { parseAmount, formatAmount, splitEqual, splitWeights, computeBalances, settle } from '../js/money.js';

// parseAmount
assert.equal(parseAmount('12'), 1200);
assert.equal(parseAmount('12,50'), 1250);
assert.equal(parseAmount('12.5'), 1250);
assert.equal(parseAmount('1\u00A0234,56'), 123456);
assert.equal(parseAmount('0'), null);          // zero not a valid expense
assert.equal(parseAmount('-5'), null);
assert.equal(parseAmount('abc'), null);
assert.equal(parseAmount('1,234'), null);      // 3 decimals invalid
assert.equal(parseAmount(''), null);

// formatAmount
assert.equal(formatAmount(1250, 'pl'), '12,50');
assert.equal(formatAmount(123456, 'pl'), '1\u00A0234,56');
assert.equal(formatAmount(123456, 'en'), '1,234.56');
assert.equal(formatAmount(-500, 'pl'), '−5,00');

// splitEqual: exact sums, max 1 grosz spread
assert.deepEqual(splitEqual(10000, 3), [3334, 3333, 3333]);
assert.deepEqual(splitEqual(100, 3), [34, 33, 33]);
assert.deepEqual(splitEqual(1, 2), [1, 0]);
for (let t = 1; t < 500; t++) for (const n of [1, 2, 3, 5, 7]) {
  const parts = splitEqual(t, n);
  assert.equal(parts.reduce((a, b) => a + b, 0), t, `splitEqual(${t},${n}) sums`);
  assert.ok(Math.max(...parts) - Math.min(...parts) <= 1);
}

// splitWeights: exact sums
assert.deepEqual(splitWeights(1000, [1, 1]), [500, 500]);
assert.deepEqual(splitWeights(1000, [2, 1]), [667, 333]);
for (let i = 0; i < 300; i++) {
  const t = 1 + ((i * 7919) % 100000);
  const ws = [1 + (i % 5), 1 + ((i * 3) % 4), 1 + ((i * 5) % 3)];
  const parts = splitWeights(t, ws);
  assert.equal(parts.reduce((a, b) => a + b, 0), t, `splitWeights(${t}) sums`);
}

// computeBalances + settle: end to end
const ppl = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
const exps = [
  { amount: 30000, paidBy: 'a', mode: 'equal', among: ['a', 'b', 'c'] },
  { amount: 9000, paidBy: 'b', mode: 'equal', among: ['b', 'c'] },
  { amount: 12000, paidBy: 'c', mode: 'weights', among: ['a', 'b', 'c'], values: [2, 1, 1] },
];
const bal = computeBalances(ppl, exps);
assert.equal([...bal.values()].reduce((a, b) => a + b, 0), 0, 'balances sum to zero');
const transfers = settle(bal);
assert.ok(transfers.length <= ppl.length - 1, 'at most n-1 transfers');
// applying transfers zeroes everyone out
const after = new Map(bal);
for (const t of transfers) {
  after.set(t.from, after.get(t.from) + t.amount);
  after.set(t.to, after.get(t.to) - t.amount);
}
for (const [id, v] of after) assert.equal(v, 0, `${id} settled`);

// fuzz: random groups always settle exactly
let seed = 42;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
for (let round = 0; round < 200; round++) {
  const n = 2 + Math.floor(rnd() * 6);
  const people = Array.from({ length: n }, (_, i) => ({ id: 'p' + i }));
  const es = Array.from({ length: 1 + Math.floor(rnd() * 10) }, () => {
    const among = people.filter(() => rnd() > 0.3).map((p) => p.id);
    if (among.length === 0) among.push(people[0].id);
    return {
      amount: 1 + Math.floor(rnd() * 100000),
      paidBy: people[Math.floor(rnd() * n)].id,
      mode: 'equal', among,
    };
  });
  const b = computeBalances(people, es);
  assert.equal([...b.values()].reduce((a, c) => a + c, 0), 0);
  const ts = settle(b);
  const aft = new Map(b);
  for (const t of ts) {
    assert.ok(t.amount > 0);
    aft.set(t.from, aft.get(t.from) + t.amount);
    aft.set(t.to, aft.get(t.to) - t.amount);
  }
  for (const v of aft.values()) assert.equal(v, 0);
}

console.log('money.test: all assertions passed');
