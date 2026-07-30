// app.js — Składka. A shared pot for group expenses, entirely in the browser.

import { parseAmount, formatAmount, splitEqual, splitWeights, computeBalances, settle } from './money.js';
import { initPot } from './pot.js';
import { STR, plural } from './i18n.js';

/* ───────────────────────── state & storage ───────────────────────── */

const LS_KEY = 'skladka.v1';
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* currencies: settlement per kitty, any of these per expense */
const CURS = {
  PLN: { sym: 'zł', suffix: true },
  EUR: { sym: '€', suffix: true },
  USD: { sym: '$', suffix: false },
  GBP: { sym: '£', suffix: false },
  CZK: { sym: 'Kč', suffix: true },
  CHF: { sym: 'CHF', suffix: true },
};
const SYM2CODE = { 'zł': 'PLN', '€': 'EUR', '$': 'USD', '£': 'GBP' };

const db = load();
function load() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      // pre-multicurrency kitties stored the symbol — migrate to ISO code
      Object.values(d.kitties ?? {}).forEach((k) => {
        if (SYM2CODE[k.currency]) k.currency = SYM2CODE[k.currency];
        if (!CURS[k.currency]) k.currency = 'PLN';
      });
      return d;
    }
  } catch { /* fresh start */ }
  return { kitties: {}, lang: 'pl' };
}
function save() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(db)); } catch { /* private mode */ }
}

const uid = () => Math.random().toString(36).slice(2, 9);
const t = (key) => STR[db.lang][key] ?? STR.pl[key] ?? key;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function fmtMoney(minor, cur, signed = false) {
  const c = CURS[cur] ?? CURS.PLN;
  const n = formatAmount(Math.abs(minor), db.lang);
  const sign = signed ? (minor > 0 ? '+' : minor < 0 ? '−' : '') : (minor < 0 ? '−' : '');
  return c.suffix ? `${sign}${n} ${c.sym}` : `${sign}${c.sym}${n}`;
}
const fmtRate = (r) => String(r).replace('.', db.lang === 'pl' ? ',' : '.');

/** Parse a user-typed FX rate ("4,3078"). */
function parseRate(s) {
  const v = parseFloat(String(s).trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(v) && v > 0 && v < 100000 ? Math.round(v * 1e6) / 1e6 : null;
}

/** ECB reference rate for a date (weekends fall back to the previous fix). */
async function fetchRate(from, to, date) {
  try {
    const res = await fetch(`https://api.frankfurter.dev/v1/${date}?from=${from}&to=${to}`);
    if (!res.ok) return null;
    const j = await res.json();
    const rate = j?.rates?.[to];
    return rate ? { rate: Math.round(rate * 1e6) / 1e6, date: j.date } : null;
  } catch { return null; }
}

/**
 * Convert an expense into the kitty's settlement currency.
 * The rate is frozen on the expense, so shared links settle identically everywhere.
 */
function settleExpense(e, kitty) {
  if (!e.cur || e.cur === kitty.currency) return e;
  const amount = Math.round(e.amount * e.rate);
  let values = e.values;
  if (e.mode === 'exact' && values) {
    values = values.map((v) => Math.round(v * e.rate));
    const drift = amount - values.reduce((a, b) => a + b, 0);
    if (values.length) values[0] += drift; // exact split keeps summing exactly after conversion
  }
  return { ...e, amount, values };
}
const settled = (kitty) => kitty.expenses.map((e) => settleExpense(e, kitty));

/** One person's settlement-currency share of one expense. */
function shareOf(e, kitty, personId) {
  const s = settleExpense(e, kitty);
  const among = s.among.filter((id) => kitty.people.some((p) => p.id === id));
  const i = among.indexOf(personId);
  if (i < 0) return 0;
  if (s.mode === 'weights') return splitWeights(s.amount, s.values.slice(0, among.length))[i] ?? 0;
  if (s.mode === 'exact') return s.values[i] ?? 0;
  return splitEqual(s.amount, among.length)[i] ?? 0;
}

/* ───────────────────────── people: coins & colors ───────────────────────── */

const COIN_COLORS = ['#2E8B67', '#B0532F', '#A8761B', '#56689E', '#8A5FA0', '#38808F', '#C2703F', '#6B8F3E'];
function coinColor(kitty, personId) {
  const i = kitty.people.findIndex((p) => p.id === personId);
  return COIN_COLORS[(i >= 0 ? i : 0) % COIN_COLORS.length];
}
function coin(kitty, personId, size = '') {
  const p = kitty.people.find((x) => x.id === personId);
  if (!p) return '';
  return `<span class="coin ${size}" style="--coin:${coinColor(kitty, personId)}" aria-hidden="true">${esc(p.name.trim()[0].toUpperCase())}</span>`;
}
const personName = (kitty, id) => kitty.people.find((p) => p.id === id)?.name ?? '?';

/* ───────────────────────── categories ───────────────────────── */

const CAT_RULES = [
  ['groceries', /zakup|biedronk|lidl|żabk|aldi|spożyw|market|sklep|grocer|supermarket|prowiant/i],
  ['stay', /nocleg|hotel|airbnb|apartament|domek|hostel|kwater|stay|night/i],
  ['transport', /paliw|benzyn|taxi|uber|bolt|pociąg|autobus|przejazd|parking|autostrad|fuel|train|bus|gas/i],
  ['tickets', /bilet|wstęp|muzeum|kino|koncert|wyciąg|karnet|ticket|entry|museum|cinema/i],
  ['drinks', /piwo|piw[an]|wino|drink|bar\b|browar|beer|wine|pub/i],
  ['food', /obiad|kolacj|śniadan|restaura|pizz|kebab|jedzeni|lunch|dinner|food|oscyp|lody|kaw[aey]|karczm|tawern|gospod|coffee/i],
  ['gear', /sprzęt|wypożycz|nart|rower|rental|gear|ski|czarter|jacht|rejs|żagl|kajak/i],
];
const detectCat = (title) => (CAT_RULES.find(([, re]) => re.test(title)) ?? ['other'])[0];

const IC = (d) => `<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
const CAT_ICONS = {
  food: IC('<path d="M7 3v7c0 1 .8 2 2 2v9M9 3v6M11 3v6"/><path d="M16 3c-1.7 0-3 2-3 5 0 2 .7 3 2 3v10M15 11h2"/>'),
  groceries: IC('<path d="M5 9h14l-1.5 11h-11L5 9z"/><path d="M8.5 9V7a3.5 3.5 0 0 1 7 0v2"/>'),
  transport: IC('<path d="M5 17h-1v-5l2-5h9l2 5h2a2 2 0 0 1 2 2v3h-2"/><circle cx="7.5" cy="17" r="1.8"/><circle cx="15.5" cy="17" r="1.8"/><path d="M9.3 17h4.4"/>'),
  stay: IC('<path d="M3 18v-8m0 5h18v3m0-3v-2a3 3 0 0 0-3-3h-8v5"/><circle cx="7" cy="12" r="1.6"/>'),
  drinks: IC('<path d="M8 3h8l-1 9a3 3 0 0 1-6 0L8 3z"/><path d="M12 15v5m-3 1h6M8.5 7h7"/>'),
  tickets: IC('<path d="M4 8a2 2 0 0 0 0 4v4h16v-4a2 2 0 0 1 0-4V4H4v4z"/><path d="M14 4v12" stroke-dasharray="2 2.4"/>'),
  gear: IC('<path d="M9 7V5a3 3 0 0 1 6 0v2"/><path d="M6 7h12l1 13H5L6 7z"/>'),
  other: IC('<path d="M6 3h12v18l-2-1.4L14 21l-2-1.4L10 21l-2-1.4L6 21V3z"/><path d="M9 8h6M9 12h6"/>'),
};

/* ───────────────────────── share links ───────────────────────── */

async function encodeShare(kitty) {
  const compact = {
    v: 2, id: kitty.id, n: kitty.name, c: kitty.currency,
    p: kitty.people.map((p) => [p.id, p.name]),
    e: kitty.expenses.map((e) => [e.id, e.title, e.amount, e.paidBy, e.among, e.mode, e.values ?? null, e.cat, e.ts, e.cur ?? null, e.rate ?? null]),
    m: kitty.paid ?? {},
    r: kitty.rates ?? {},
  };
  const json = JSON.stringify(compact);
  const bytes = new TextEncoder().encode(json);
  let payload, tag;
  if ('CompressionStream' in window) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    payload = new Uint8Array(await new Response(stream).arrayBuffer());
    tag = 'd';
  } else {
    payload = bytes; tag = 'p';
  }
  let bin = '';
  payload.forEach((b) => { bin += String.fromCharCode(b); });
  const b64 = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}${location.pathname}#s=${tag}.${b64}`;
}

async function decodeShare(str) {
  const [tag, b64] = [str.slice(0, 1), str.slice(2)];
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  let json;
  if (tag === 'd') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    json = await new Response(stream).text();
  } else {
    json = new TextDecoder().decode(bytes);
  }
  const c = JSON.parse(json);
  if ((c.v !== 1 && c.v !== 2) || !c.id || !Array.isArray(c.p)) throw new Error('bad payload');
  const currency = c.v === 1 ? (SYM2CODE[c.c] ?? 'PLN') : (CURS[c.c] ? c.c : 'PLN');
  return {
    id: c.id, name: String(c.n).slice(0, 80), currency,
    people: c.p.map(([id, name]) => ({ id: String(id), name: String(name).slice(0, 40) })),
    expenses: c.e.map(([id, title, amount, paidBy, among, mode, values, cat, ts, cur, rate]) => ({
      id: String(id), title: String(title).slice(0, 120), amount: amount | 0, paidBy, among, mode,
      values: values ?? undefined, cat, ts,
      ...(cur && CURS[cur] && cur !== currency && +rate > 0 ? { cur, rate: +rate } : {}),
    })),
    paid: c.m ?? {},
    rates: c.r ?? {},
    createdAt: Date.now(),
  };
}

/* ───────────────────────── toasts ───────────────────────── */

let toastEl;
function toast(msg, { actionLabel, onAction, timeout = 4200 } = {}) {
  toastEl?.remove();
  toastEl = document.createElement('div');
  toastEl.className = 'toast';
  toastEl.setAttribute('role', 'status');
  toastEl.innerHTML = `<span>${esc(msg)}</span>${actionLabel ? `<button class="toast-act">${esc(actionLabel)}</button>` : ''}`;
  document.body.appendChild(toastEl);
  const self = toastEl;
  if (actionLabel) {
    self.querySelector('.toast-act').addEventListener('click', () => { onAction?.(); self.remove(); });
  }
  requestAnimationFrame(() => self.classList.add('show'));
  setTimeout(() => { if (self.isConnected) { self.classList.remove('show'); setTimeout(() => self.remove(), 400); } }, timeout);
}

/* ───────────────────────── demo kitty ───────────────────────── */

function makeDemo() {
  const d = (offset) => {
    const x = new Date(); x.setDate(x.getDate() - offset);
    return x.toISOString().slice(0, 10);
  };
  const [ola, bartek, kasia, michal] = ['ola', 'bartek', 'kasia', 'michal'];
  const all = [ola, bartek, kasia, michal];
  const ex = (title, amt, paidBy, among, ts, mode = 'equal', values) => ({
    id: uid(), title, amount: amt, paidBy, among, mode, values, cat: detectCat(title), ts,
  });
  return {
    id: 'demo', name: 'Majówka w Zakopanem', currency: 'PLN',
    people: [{ id: ola, name: 'Ola' }, { id: bartek, name: 'Bartek' }, { id: kasia, name: 'Kasia' }, { id: michal, name: 'Michał' }],
    expenses: [
      ex('Nocleg — domek pod Giewontem', 72000, ola, all, d(2)),
      ex('Zakupy w Biedronce', 18743, kasia, all, d(2)),
      ex('Paliwo i autostrada', 21400, michal, all, d(2)),
      ex('Obiad na Gubałówce', 25600, bartek, all, d(1)),
      ex('Oscypki z żurawiną', 3600, kasia, [ola, kasia, michal], d(1)),
      ex('Wieczór w Karczmie', 16850, bartek, all, d(1)),
      ex('Bilety na Kasprowy', 33600, ola, all, d(0), 'weights', [2, 2, 1, 1]),
      Object.assign(ex('Obiad po słowackiej stronie Tatr', 4650, bartek, all, d(0)), { cur: 'EUR', rate: 4.3078 }),
      ex('Kawa i szarlotka', 6400, michal, [michal, kasia], d(0)),
    ],
    paid: {}, rates: { EUR: 4.3078 }, createdAt: Date.now(),
  };
}

/* ───────────────────────── router ───────────────────────── */

const $landing = document.getElementById('landing');
const $app = document.getElementById('app');

function navigate(hash) {
  if (location.hash === hash) route();
  else location.hash = hash;
}

async function route() {
  const h = location.hash;
  if (h.startsWith('#s=')) {
    try {
      const kitty = await decodeShare(h.slice(3));
      db.kitties[kitty.id] = kitty; save();
      history.replaceState(null, '', location.pathname + '#/k/' + kitty.id);
      route();
    } catch {
      history.replaceState(null, '', location.pathname);
      toast(db.lang === 'pl' ? 'Ten link wygląda na uszkodzony.' : 'That link looks damaged.');
      route();
    }
    return;
  }
  const m = h.match(/^#\/k\/([a-z0-9]+)/i);
  const swap = () => {
    if (m && db.kitties[m[1]]) {
      $landing.hidden = true; $app.hidden = false;
      renderKitty(db.kitties[m[1]]);
      window.scrollTo(0, 0);
    } else {
      $app.hidden = true; $app.innerHTML = '';
      $landing.hidden = false;
      renderSavedList();
    }
  };
  if (document.startViewTransition && !reducedMotion) {
    const vt = document.startViewTransition(swap);
    vt.finished?.catch(() => {}); vt.ready?.catch(() => {});
  } else swap();
}

/* ───────────────────────── landing ───────────────────────── */

let pot = null;
const newPeople = []; // names typed into the create form

function applyI18n() {
  document.documentElement.lang = db.lang;
  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-ph]').forEach((el) => {
    const v = t(el.dataset.i18nPh);
    el.placeholder = Array.isArray(v) ? v[0] : v;
  });
  document.querySelectorAll('.lang-btn').forEach((b) => {
    b.setAttribute('aria-pressed', String(b.dataset.lang === db.lang));
  });
}

function setLang(lang) {
  db.lang = lang; save();
  applyI18n();
  renderSavedList();
  renderPeopleChips();
  const m = location.hash.match(/^#\/k\/([a-z0-9]+)/i);
  if (m && db.kitties[m[1]] && !$app.hidden) renderKitty(db.kitties[m[1]]);
}

function initLanding() {
  // the pot
  const canvas = document.getElementById('pot-canvas');
  pot = initPot(canvas, { reducedMotion });
  if (!pot) canvas.closest('.hero').classList.add('no-gl');
  pot?.setPeople(3);

  // scroll: gold drains as the hero leaves
  const hero = document.querySelector('.hero');
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = window.scrollY;
      pot?.setSink(Math.min(1, y / (hero.offsetHeight * 0.85)));
      if (!reducedMotion) {
        const inner = hero.querySelector('.hero-inner');
        const k = Math.min(1, y / hero.offsetHeight);
        inner.style.transform = `translateY(${y * 0.22}px)`;
        inner.style.opacity = String(1 - k * 0.9);
      }
      ticking = false;
    });
  }, { passive: true });

  // reveals
  const io = new IntersectionObserver((entries) => {
    entries.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); } });
  }, { threshold: 0.18 });
  document.querySelectorAll('.reveal').forEach((el) => io.observe(el));

  // gold thread through the acts
  const thread = document.getElementById('thread-path');
  if (thread) {
    const len = thread.getTotalLength();
    thread.style.strokeDasharray = len;
    thread.style.strokeDashoffset = len;
    const acts = document.querySelector('.acts');
    const drawThread = () => {
      const r = acts.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (window.innerHeight * 0.85 - r.top) / (r.height + window.innerHeight * 0.3)));
      thread.style.strokeDashoffset = len * (1 - p);
    };
    window.addEventListener('scroll', drawThread, { passive: true });
    drawThread();
  }

  // rotating name placeholder
  const nameInput = document.getElementById('create-name');
  let phIdx = 0;
  setInterval(() => {
    if (document.activeElement === nameInput || nameInput.value) return;
    const phs = t('create_name_ph');
    phIdx = (phIdx + 1) % phs.length;
    nameInput.placeholder = phs[phIdx];
  }, 3200);

  // people chip input
  const peopleInput = document.getElementById('create-people');
  peopleInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addNewPeople(peopleInput.value);
      peopleInput.value = '';
    } else if (e.key === 'Backspace' && !peopleInput.value && newPeople.length) {
      newPeople.pop();
      renderPeopleChips();
      pot?.setPeople(3 + newPeople.length);
    }
  });
  peopleInput.addEventListener('blur', () => {
    if (peopleInput.value.trim()) { addNewPeople(peopleInput.value); peopleInput.value = ''; }
  });
  peopleInput.addEventListener('paste', (e) => {
    const text = e.clipboardData?.getData('text') ?? '';
    if (text.includes(',') || text.includes('\n')) {
      e.preventDefault();
      addNewPeople(text);
    }
  });

  // create submit
  document.getElementById('create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (peopleInput.value.trim()) { addNewPeople(peopleInput.value); peopleInput.value = ''; }
    if (newPeople.length < 2) {
      toast(t('create_need_two'));
      peopleInput.focus();
      return;
    }
    const phs = t('create_name_ph');
    const name = nameInput.value.trim() || phs[phIdx];
    const currency = document.querySelector('input[name="currency"]:checked')?.value ?? 'PLN';
    const kitty = {
      id: uid(), name, currency,
      people: newPeople.map((n) => ({ id: uid(), name: n })),
      expenses: [], paid: {}, createdAt: Date.now(),
    };
    db.kitties[kitty.id] = kitty; save();
    newPeople.length = 0; renderPeopleChips();
    nameInput.value = '';
    navigate('#/k/' + kitty.id);
  });

  // demo
  document.querySelectorAll('[data-demo]').forEach((b) => b.addEventListener('click', () => {
    db.kitties.demo = makeDemo(); save();
    navigate('#/k/demo');
  }));

  // CTA scrolls to create
  document.querySelectorAll('[data-goto-create]').forEach((b) => b.addEventListener('click', () => {
    document.getElementById('create').scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth' });
    setTimeout(() => nameInput.focus({ preventScroll: true }), reducedMotion ? 0 : 600);
  }));

  // language
  document.querySelectorAll('.lang-btn').forEach((b) => {
    b.addEventListener('click', () => setLang(b.dataset.lang));
  });
}

function addNewPeople(text) {
  text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean).forEach((name) => {
    if (newPeople.length < 12) newPeople.push(name.slice(0, 40));
  });
  renderPeopleChips();
  pot?.setPeople(3 + newPeople.length);
  pot?.splash();
}

function renderPeopleChips() {
  const box = document.getElementById('people-chips');
  if (!box) return;
  box.innerHTML = newPeople.map((n, i) =>
    `<span class="chip" style="--coin:${COIN_COLORS[i % COIN_COLORS.length]}">
      <span class="chip-dot" aria-hidden="true"></span>${esc(n)}
      <button type="button" class="chip-x" data-i="${i}" aria-label="${esc(n)} — ×">×</button>
    </span>`).join('');
  box.querySelectorAll('.chip-x').forEach((b) => b.addEventListener('click', () => {
    newPeople.splice(+b.dataset.i, 1);
    renderPeopleChips();
    pot?.setPeople(3 + newPeople.length);
  }));
}

function renderSavedList() {
  const box = document.getElementById('saved-list');
  const wrap = document.getElementById('saved');
  const kitties = Object.values(db.kitties).sort((a, b) => b.createdAt - a.createdAt);
  wrap.hidden = kitties.length === 0;
  box.innerHTML = kitties.map((k) => {
    const total = settled(k).reduce((a, e) => a + e.amount, 0);
    return `<li class="saved-item">
      <a href="#/k/${k.id}" class="saved-link">
        <strong class="saved-name">${esc(k.name)}</strong>
        <span class="saved-meta">${k.people.length} ${plural(k.people.length, t('person_pl'), db.lang)}
          · ${k.expenses.length} ${plural(k.expenses.length, t('expense_pl'), db.lang)}
          · ${fmtMoney(total, k.currency)}</span>
      </a>
      <button class="saved-del" data-id="${k.id}" aria-label="${esc(t('ex_delete'))}: ${esc(k.name)}">×</button>
    </li>`;
  }).join('');
  box.querySelectorAll('.saved-del').forEach((b) => b.addEventListener('click', () => {
    if (confirm(t('saved_delete_confirm'))) {
      delete db.kitties[b.dataset.id]; save(); renderSavedList();
    }
  }));
}

/* ───────────────────────── kitty screen ───────────────────────── */

function renderKitty(kitty) {
  if (SYM2CODE[kitty.currency]) kitty.currency = SYM2CODE[kitty.currency]; // stale in-memory guard
  $app.innerHTML = `
  <div class="k-wrap">
    <header class="k-top">
      <a class="k-back" href="#/">← <span>${esc(t('back'))}</span></a>
      <div class="k-top-actions">
        <button class="btn btn-gold btn-s" id="share-btn">${esc(t('share'))}</button>
        <span class="lang-sw" role="group" aria-label="Language">
          <button class="lang-btn" data-lang="pl" aria-pressed="${db.lang === 'pl'}">PL</button><button class="lang-btn" data-lang="en" aria-pressed="${db.lang === 'en'}">EN</button>
        </span>
      </div>
    </header>

    <div class="k-head">
      <input id="k-name" class="k-name" value="${esc(kitty.name)}" maxlength="80" aria-label="${esc(t('create_name_l'))}" />
      <div class="k-people" id="k-people"></div>
    </div>

    <div class="k-grid">
      <section class="k-col-main">
        <form class="qa card" id="qa-form" autocomplete="off">
          <h2 class="card-h">${esc(t('qa_h'))}</h2>
          <div class="qa-row">
            <label class="qa-field qa-payer">
              <span class="lbl">${esc(t('qa_payer'))}</span>
              <select id="qa-payer">${kitty.people.map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select>
            </label>
            <label class="qa-field qa-title">
              <span class="lbl">${esc(t('qa_what'))}</span>
              <input id="qa-title" placeholder="${esc(t('qa_title_ph'))}" maxlength="120" />
            </label>
            <label class="qa-field qa-amount">
              <span class="lbl">${esc(t('qa_amount_l'))}</span>
              <span class="money-field">
                <input id="qa-amount" placeholder="${esc(t('qa_amount_ph'))}" inputmode="decimal" />
                <select id="qa-cur" aria-label="${esc(t('create_currency_l'))}">${Object.keys(CURS).map((c) => `<option value="${c}" ${c === kitty.currency ? 'selected' : ''}>${CURS[c].sym}</option>`).join('')}</select>
              </span>
            </label>
          </div>
          <div class="rate-row" id="qa-rate-row" hidden>
            <span class="rate-eq">1&nbsp;<b id="qa-rate-cur"></b>&nbsp;=</span>
            <input id="qa-rate" class="rate-input" inputmode="decimal" placeholder="0,0000" aria-label="${esc(t('rate_l'))}" />
            <span>${esc(CURS[kitty.currency].sym)}</span>
            <button type="button" class="linklike" id="qa-rate-fetch">${esc(t('rate_fetch'))}</button>
            <span class="rate-approx" id="qa-approx" aria-live="polite"></span>
          </div>
          <div class="qa-extra" id="qa-extra" hidden>
            <fieldset class="qa-among">
              <legend class="lbl">${esc(t('qa_among'))}</legend>
              <span class="seg" role="group" aria-label="${esc(t('qa_among'))}">
                <button type="button" class="seg-btn" data-mode="equal" aria-pressed="true">${esc(t('qa_mode_equal'))}</button><button type="button" class="seg-btn" data-mode="weights" aria-pressed="false">${esc(t('qa_mode_weights'))}</button><button type="button" class="seg-btn" data-mode="exact" aria-pressed="false">${esc(t('qa_mode_exact'))}</button>
              </span>
              <div id="qa-among-list" class="among-list"></div>
              <p class="hint" id="qa-hint" hidden></p>
            </fieldset>
            <label class="qa-field qa-date">
              <span class="lbl">${esc(t('qa_date'))}</span>
              <input type="date" id="qa-date" />
            </label>
          </div>
          <div class="qa-actions">
            <button type="button" class="linklike" id="qa-more" aria-expanded="false">${esc(t('qa_more'))}</button>
            <button type="submit" class="btn btn-gold" id="qa-add">${esc(t('qa_add'))}</button>
          </div>
        </form>

        <section class="expenses">
          <h2 class="sec-h">${esc(t('ex_h'))}</h2>
          <div id="ex-list"></div>
        </section>
      </section>

      <aside class="k-col-side">
        <section class="card" id="balances-card">
          <h2 class="card-h">${esc(t('bal_h'))}</h2>
          <div id="bal-list"></div>
        </section>
        <section class="card card-settle" id="settle-card">
          <h2 class="card-h">${esc(t('st_h'))}</h2>
          <p class="card-sub">${esc(t('st_sub'))}</p>
          <div id="st-list"></div>
          <button class="linklike" id="st-copy">${esc(t('st_copy'))}</button>
        </section>
        <section class="card" id="stats-card"></section>
      </aside>
    </div>
  </div>`;

  /* — top bar — */
  $app.querySelectorAll('.lang-btn').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $app.querySelector('#share-btn').addEventListener('click', async () => {
    const url = await encodeShare(kitty);
    try {
      await navigator.clipboard.writeText(url);
      toast(t('share_done'));
    } catch {
      prompt('URL', url);
    }
  });
  const nameEl = $app.querySelector('#k-name');
  nameEl.addEventListener('change', () => {
    kitty.name = nameEl.value.trim() || kitty.name;
    nameEl.value = kitty.name; save();
  });

  /* — quick add — */
  const qa = {
    form: $app.querySelector('#qa-form'),
    payer: $app.querySelector('#qa-payer'),
    title: $app.querySelector('#qa-title'),
    amount: $app.querySelector('#qa-amount'),
    date: $app.querySelector('#qa-date'),
    extra: $app.querySelector('#qa-extra'),
    more: $app.querySelector('#qa-more'),
    amongList: $app.querySelector('#qa-among-list'),
    hint: $app.querySelector('#qa-hint'),
    mode: 'equal',
  };
  qa.date.value = new Date().toISOString().slice(0, 10);

  /* — expense currency & FX rate — */
  qa.cur = $app.querySelector('#qa-cur');
  qa.rateRow = $app.querySelector('#qa-rate-row');
  qa.rate = $app.querySelector('#qa-rate');
  qa.rateCur = $app.querySelector('#qa-rate-cur');
  qa.approx = $app.querySelector('#qa-approx');
  const updateApprox = () => {
    const a = parseAmount(qa.amount.value), r = parseRate(qa.rate.value);
    qa.approx.textContent = a && r ? `≈ ${fmtMoney(Math.round(a * r), kitty.currency)}` : '';
  };
  const syncCur = () => {
    const foreign = qa.cur.value !== kitty.currency;
    qa.rateRow.hidden = !foreign;
    if (foreign) {
      qa.rateCur.textContent = CURS[qa.cur.value].sym;
      if (!qa.rate.value && kitty.rates?.[qa.cur.value]) qa.rate.value = fmtRate(kitty.rates[qa.cur.value]);
      updateApprox();
    }
  };
  // typed "." or "," both accepted — normalized to the locale separator on blur
  const normalizeAmount = (el) => {
    const v = parseAmount(el.value);
    if (v != null) el.value = formatAmount(v, db.lang);
  };
  qa.amount.addEventListener('change', () => normalizeAmount(qa.amount));
  qa.rate.addEventListener('change', () => {
    const r = parseRate(qa.rate.value);
    if (r) qa.rate.value = fmtRate(r);
  });
  qa.cur.addEventListener('change', () => { qa.rate.value = ''; syncCur(); });
  qa.rate.addEventListener('input', updateApprox);
  qa.amount.addEventListener('input', () => { if (!qa.rateRow.hidden) updateApprox(); });
  $app.querySelector('#qa-rate-fetch').addEventListener('click', async () => {
    const d = qa.date.value || new Date().toISOString().slice(0, 10);
    const r = await fetchRate(qa.cur.value, kitty.currency, d);
    if (r) { qa.rate.value = fmtRate(r.rate); updateApprox(); toast(t('rate_fetched').replace('{d}', r.date)); }
    else toast(t('rate_fail'));
  });

  qa.more.addEventListener('click', () => {
    const open = qa.extra.hidden;
    qa.extra.hidden = !open;
    qa.more.setAttribute('aria-expanded', String(open));
    qa.more.textContent = open ? t('qa_less') : t('qa_more');
  });

  function renderAmong() {
    qa.amongList.innerHTML = kitty.people.map((p) => `
      <label class="among-item" style="--coin:${coinColor(kitty, p.id)}">
        <input type="checkbox" value="${p.id}" checked />
        <span class="among-coin" aria-hidden="true">${esc(p.name[0].toUpperCase())}</span>
        <span class="among-name">${esc(p.name)}</span>
        <input class="among-w" type="number" min="1" max="99" value="1" hidden aria-label="${esc(p.name)} — ${esc(t('qa_mode_weights'))}" />
        <input class="among-x" inputmode="decimal" placeholder="0,00" hidden aria-label="${esc(p.name)} — ${esc(t('qa_mode_exact'))}" />
      </label>`).join('');
    syncModeInputs();
  }
  function syncModeInputs() {
    qa.amongList.querySelectorAll('.among-item').forEach((row) => {
      row.querySelector('.among-w').hidden = qa.mode !== 'weights';
      const x = row.querySelector('.among-x');
      x.hidden = qa.mode !== 'exact';
      if (!x.dataset.norm) {
        x.dataset.norm = '1';
        x.addEventListener('change', () => {
          const v = parseAmount(x.value);
          if (v != null) x.value = formatAmount(v, db.lang);
        });
      }
    });
    qa.hint.hidden = qa.mode !== 'weights';
    if (qa.mode === 'weights') qa.hint.textContent = t('qa_weights_hint');
  }
  renderAmong();

  $app.querySelectorAll('.seg-btn').forEach((b) => b.addEventListener('click', () => {
    qa.mode = b.dataset.mode;
    $app.querySelectorAll('.seg-btn').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    syncModeInputs();
  }));

  const parseExact = (s) => {
    if (!s.trim()) return 0;
    if (/^0([.,]0{1,2})?$/.test(s.trim())) return 0;
    return parseAmount(s);
  };

  qa.form.addEventListener('submit', (e) => {
    e.preventDefault();
    const title = qa.title.value.trim();
    const amount = parseAmount(qa.amount.value);
    if (!title) { toast(t('qa_err_title')); qa.title.focus(); return; }
    if (amount == null) { toast(t('qa_err_amount')); qa.amount.focus(); return; }
    const fxCur = qa.cur.value !== kitty.currency ? qa.cur.value : null;
    let fxRate = null;
    if (fxCur) {
      fxRate = parseRate(qa.rate.value);
      if (!fxRate) { toast(t('rate_need')); qa.rate.focus(); return; }
      kitty.rates = { ...(kitty.rates ?? {}), [fxCur]: fxRate };
    }
    const rows = [...qa.amongList.querySelectorAll('.among-item')];
    const among = rows.filter((r) => r.querySelector('input[type=checkbox]').checked)
      .map((r) => r.querySelector('input[type=checkbox]').value);
    if (among.length === 0) { toast(t('qa_err_among')); return; }
    let mode = qa.mode, values;
    if (mode === 'weights') {
      values = rows.filter((r) => r.querySelector('input[type=checkbox]').checked)
        .map((r) => Math.max(1, Math.min(99, +r.querySelector('.among-w').value || 1)));
    } else if (mode === 'exact') {
      values = rows.filter((r) => r.querySelector('input[type=checkbox]').checked)
        .map((r) => parseExact(r.querySelector('.among-x').value));
      if (values.some((v) => v == null) || values.reduce((a, b) => a + b, 0) !== amount) {
        toast(t('qa_err_exact')); return;
      }
    }
    kitty.expenses.push({
      id: uid(), title, amount, paidBy: qa.payer.value, among, mode, values,
      cat: detectCat(title), ts: qa.date.value || new Date().toISOString().slice(0, 10),
      ...(fxCur ? { cur: fxCur, rate: fxRate } : {}),
    });
    save();
    qa.title.value = ''; qa.amount.value = '';
    qa.title.focus();
    renderExpenses(kitty);
    renderSide(kitty);
  });

  /* — people row — */
  renderPeopleRow(kitty);
  renderExpenses(kitty);
  renderSide(kitty);

  $app.querySelector('#st-copy').addEventListener('click', async () => {
    const text = settlementText(kitty);
    try { await navigator.clipboard.writeText(text); toast(t('st_copied')); }
    catch { prompt('', text); }
  });
}

function renderPeopleRow(kitty) {
  const box = $app.querySelector('#k-people');
  box.innerHTML = kitty.people.map((p) => `
    <span class="pcoin-wrap">
      ${coin(kitty, p.id, 'coin-l')}
      <span class="pcoin-name" title="${esc(p.name)}">${esc(p.name)}</span>
      <button class="pcoin-x" data-id="${p.id}" aria-label="${esc(t('ex_delete'))}: ${esc(p.name)}">×</button>
    </span>`).join('') + `
    <button class="pcoin-add" id="p-add" aria-expanded="false">+ <span>${esc(t('add_person'))}</span></button>
    <input class="pcoin-input" id="p-add-input" placeholder="${esc(t('add_person_ph'))}" maxlength="40" hidden />`;

  const addBtn = box.querySelector('#p-add');
  const addInput = box.querySelector('#p-add-input');
  addBtn.addEventListener('click', () => {
    addBtn.hidden = true; addInput.hidden = false; addInput.focus();
  });
  const commit = () => {
    const name = addInput.value.trim();
    if (name) {
      kitty.people.push({ id: uid(), name: name.slice(0, 40) });
      save();
      renderKitty(kitty); // people appear in payer select, among list, etc.
      return;
    }
    addInput.hidden = true; addBtn.hidden = false;
  };
  addInput.addEventListener('keydown', (e) => {
    // Enter defers to blur — one commit path, no double-add
    if (e.key === 'Enter') { e.preventDefault(); addInput.blur(); }
    if (e.key === 'Escape') { addInput.value = ''; addInput.blur(); }
  });
  addInput.addEventListener('blur', commit);

  box.querySelectorAll('.pcoin-x').forEach((b) => b.addEventListener('click', () => {
    const id = b.dataset.id;
    const used = kitty.expenses.some((e) => e.paidBy === id || e.among.includes(id));
    if (used) { toast(t('person_has_expenses')); return; }
    if (kitty.people.length <= 2) { toast(t('create_need_two')); return; }
    kitty.people = kitty.people.filter((p) => p.id !== id);
    save(); renderKitty(kitty);
  }));
}

/* — expense list — */

function dayLabel(ts) {
  const today = new Date().toISOString().slice(0, 10);
  const y = new Date(Date.now() - 864e5).toISOString().slice(0, 10);
  if (ts === today) return t('today');
  if (ts === y) return t('yesterday');
  const d = new Date(ts + 'T12:00:00');
  return d.toLocaleDateString(db.lang === 'pl' ? 'pl-PL' : 'en-GB', { day: 'numeric', month: 'long' });
}

/* — the receipt: day-grouped timeline, filterable per person — */

let filterPerson = null;
let filterKittyId = null;

function renderExpenses(kitty) {
  const box = $app.querySelector('#ex-list');
  if (!box) return;
  if (filterKittyId !== kitty.id) { filterPerson = null; filterKittyId = kitty.id; }
  if (filterPerson && !kitty.people.some((p) => p.id === filterPerson)) filterPerson = null;
  const fp = filterPerson;

  if (kitty.expenses.length === 0) {
    box.innerHTML = `<p class="empty">${esc(t('ex_empty'))}</p>`;
    return;
  }

  // who-filter chips
  const chips = `<div class="ex-filter" role="group" aria-label="${esc(t('filter_l'))}">
    <button class="pfilter ${fp ? '' : 'on'}" data-p="" aria-pressed="${!fp}">${esc(t('filter_all'))}</button>
    ${kitty.people.map((p) => `<button class="pfilter ${fp === p.id ? 'on' : ''}" data-p="${p.id}" aria-pressed="${fp === p.id}" style="--coin:${coinColor(kitty, p.id)}"><span class="pf-dot" aria-hidden="true"></span>${esc(p.name)}</button>`).join('')}
  </div>`;

  // per-person summary strip: paid / share / balance
  let strip = '';
  if (fp) {
    const balances = computeBalances(kitty.people, settled(kitty));
    const paid = settled(kitty).filter((e) => e.paidBy === fp).reduce((a, e) => a + e.amount, 0);
    const bal = balances.get(fp) ?? 0;
    const share = paid - bal;
    const cls = bal > 0 ? 'pos' : bal < 0 ? 'neg' : 'zero';
    strip = `<div class="pp-strip">
      ${coin(kitty, fp)}<span class="pp-name">${esc(personName(kitty, fp))}</span>
      <span class="pp-stat"><i>${esc(t('pp_paid_total'))}</i><b>${fmtMoney(paid, kitty.currency)}</b></span>
      <span class="pp-stat"><i>${esc(t('pp_share'))}</i><b>${fmtMoney(share, kitty.currency)}</b></span>
      <span class="pp-stat ${cls}"><i>${esc(t('pp_balance'))}</i><b>${fmtMoney(bal, kitty.currency, true)}</b></span>
    </div>`;
  }

  const visible = fp ? kitty.expenses.filter((e) => e.paidBy === fp || e.among.includes(fp)) : kitty.expenses;
  const sorted = [...visible].sort((a, b) => b.ts.localeCompare(a.ts));
  const groups = [];
  for (const e of sorted) {
    const g = groups[groups.length - 1];
    if (g && g.ts === e.ts) g.items.push(e);
    else groups.push({ ts: e.ts, items: [e] });
  }

  const list = sorted.length === 0
    ? `<p class="empty">${esc(t('pp_none'))}</p>`
    : groups.map((g) => `
    <div class="ex-day">
      <h3 class="ex-day-h">${esc(dayLabel(g.ts))}</h3>
      ${g.items.map((e) => {
        const conv = settleExpense(e, kitty);
        const foreign = e.cur && e.cur !== kitty.currency;
        const allIn = e.among.length === kitty.people.length;
        const forWho = allIn ? t('ex_all') : e.among.map((id) => personName(kitty, id)).join(', ');
        const orig = foreign
          ? ` · <span class="ex-orig">${formatAmount(e.amount, db.lang)}\u00A0${CURS[e.cur].sym} @ ${fmtRate(e.rate)}</span>` : '';
        const shareTxt = fp && e.among.includes(fp)
          ? ` · <b class="ex-share">${esc(t('pp_share_inline'))} ${fmtMoney(shareOf(e, kitty, fp), kitty.currency)}</b>` : '';
        return `<article class="ex-item${fp && e.paidBy === fp ? ' by-fp' : ''}" data-id="${e.id}" tabindex="0">
          <span class="ex-cat" style="--coin:${coinColor(kitty, e.paidBy)}">${CAT_ICONS[e.cat] ?? CAT_ICONS.other}</span>
          <span class="ex-body">
            <span class="ex-title">${esc(e.title)}</span>
            <span class="ex-meta">${esc(personName(kitty, e.paidBy))} ${esc(t('ex_paid_by'))} · ${esc(t('ex_for'))} ${esc(forWho)}${orig}${shareTxt}</span>
          </span>
          <span class="ex-dots" aria-hidden="true"></span>
          <span class="ex-amount"${foreign ? ` title="${formatAmount(e.amount, db.lang)}\u00A0${CURS[e.cur].sym}"` : ''}>${fmtMoney(conv.amount, kitty.currency)}</span>
        </article>`;
      }).join('')}
    </div>`).join('');

  box.innerHTML = chips + strip + list;

  box.querySelectorAll('.pfilter').forEach((b) => b.addEventListener('click', () => {
    filterPerson = b.dataset.p || null;
    renderExpenses(kitty);
  }));
  // click / Enter opens the editor
  box.querySelectorAll('.ex-item').forEach((item) => {
    const open = () => openEditor(kitty, item.dataset.id, item);
    item.addEventListener('click', open);
    item.addEventListener('keydown', (e) => { if (e.key === 'Enter') open(); });
  });
}

function openEditor(kitty, id, itemEl) {
  const e = kitty.expenses.find((x) => x.id === id);
  if (!e || itemEl.classList.contains('editing')) return;
  itemEl.classList.add('editing');
  const ed = document.createElement('div');
  ed.className = 'ex-editor';
  ed.innerHTML = `
    <div class="ed-row">
      <label class="qa-field"><span class="lbl">${esc(t('qa_payer'))}</span>
        <select class="ed-payer">${kitty.people.map((p) => `<option value="${p.id}" ${p.id === e.paidBy ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      </label>
      <label class="qa-field"><span class="lbl">${esc(t('qa_what'))}</span>
        <input class="ed-title" value="${esc(e.title)}" maxlength="120" /></label>
      <label class="qa-field"><span class="lbl">${esc(t('qa_amount_l'))}</span>
        <span class="money-field">
          <input class="ed-amount" inputmode="decimal" value="${formatAmount(e.amount, db.lang).replace(/\s/g, '')}" />
          <select class="ed-cur" aria-label="${esc(t('create_currency_l'))}">${Object.keys(CURS).map((c) => `<option value="${c}" ${c === (e.cur ?? kitty.currency) ? 'selected' : ''}>${CURS[c].sym}</option>`).join('')}</select>
        </span></label>
      <label class="qa-field"><span class="lbl">${esc(t('qa_date'))}</span>
        <input type="date" class="ed-date" value="${e.ts}" /></label>
    </div>
    <div class="rate-row ed-rate-row" ${e.cur && e.cur !== kitty.currency ? '' : 'hidden'}>
      <span class="rate-eq">1&nbsp;<b class="ed-rate-cur">${e.cur ? CURS[e.cur].sym : ''}</b>&nbsp;=</span>
      <input class="rate-input ed-rate" inputmode="decimal" value="${e.rate ? fmtRate(e.rate) : ''}" aria-label="${esc(t('rate_l'))}" />
      <span>${CURS[kitty.currency].sym}</span>
      <button type="button" class="linklike ed-rate-fetch">${esc(t('rate_fetch'))}</button>
    </div>
    <div class="ed-among">${kitty.people.map((p) => `
      <label class="among-item" style="--coin:${coinColor(kitty, p.id)}">
        <input type="checkbox" value="${p.id}" ${e.among.includes(p.id) ? 'checked' : ''} />
        <span class="among-coin" aria-hidden="true">${esc(p.name[0].toUpperCase())}</span>
        <span class="among-name">${esc(p.name)}</span>
      </label>`).join('')}</div>
    <div class="ed-actions">
      <button class="linklike ed-del">${esc(t('ex_delete'))}</button>
      <span class="ed-spacer"></span>
      <button class="linklike ed-cancel">${esc(t('ex_cancel'))}</button>
      <button class="btn btn-gold btn-s ed-save">${esc(t('ex_save'))}</button>
    </div>`;
  itemEl.after(ed);

  ed.querySelector('.ed-cancel').addEventListener('click', () => { ed.remove(); itemEl.classList.remove('editing'); });
  const edCur = ed.querySelector('.ed-cur');
  const edRate = ed.querySelector('.ed-rate');
  const edAmount = ed.querySelector('.ed-amount');
  edAmount.addEventListener('change', () => {
    const v = parseAmount(edAmount.value);
    if (v != null) edAmount.value = formatAmount(v, db.lang);
  });
  edRate.addEventListener('change', () => {
    const r = parseRate(edRate.value);
    if (r) edRate.value = fmtRate(r);
  });
  const edRateRow = ed.querySelector('.ed-rate-row');
  edCur.addEventListener('change', () => {
    const foreign = edCur.value !== kitty.currency;
    edRateRow.hidden = !foreign;
    if (foreign) {
      ed.querySelector('.ed-rate-cur').textContent = CURS[edCur.value].sym;
      if (!edRate.value && kitty.rates?.[edCur.value]) edRate.value = fmtRate(kitty.rates[edCur.value]);
    }
  });
  ed.querySelector('.ed-rate-fetch').addEventListener('click', async () => {
    const r = await fetchRate(edCur.value, kitty.currency, ed.querySelector('.ed-date').value || e.ts);
    if (r) { edRate.value = fmtRate(r.rate); toast(t('rate_fetched').replace('{d}', r.date)); }
    else toast(t('rate_fail'));
  });
  ed.querySelector('.ed-del').addEventListener('click', () => {
    const idx = kitty.expenses.findIndex((x) => x.id === id);
    const [removed] = kitty.expenses.splice(idx, 1);
    save(); renderExpenses(kitty); renderSide(kitty);
    toast(t('ex_deleted'), {
      actionLabel: t('undo'),
      onAction: () => { kitty.expenses.splice(idx, 0, removed); save(); renderExpenses(kitty); renderSide(kitty); },
    });
  });
  ed.querySelector('.ed-save').addEventListener('click', () => {
    const amount = parseAmount(ed.querySelector('.ed-amount').value);
    const title = ed.querySelector('.ed-title').value.trim();
    const among = [...ed.querySelectorAll('.ed-among input:checked')].map((c) => c.value);
    if (!title) { toast(t('qa_err_title')); return; }
    if (amount == null) { toast(t('qa_err_amount')); return; }
    if (among.length === 0) { toast(t('qa_err_among')); return; }
    const edFxCur = edCur.value !== kitty.currency ? edCur.value : null;
    let edFxRate = null;
    if (edFxCur) {
      edFxRate = parseRate(edRate.value);
      if (!edFxRate) { toast(t('rate_need')); edRate.focus(); return; }
      kitty.rates = { ...(kitty.rates ?? {}), [edFxCur]: edFxRate };
    }
    Object.assign(e, {
      title, amount, among,
      paidBy: ed.querySelector('.ed-payer').value,
      ts: ed.querySelector('.ed-date').value || e.ts,
      cat: detectCat(title),
      // editing the circle resets custom splits to equal — predictable, visible
      mode: among.length === e.among.length && e.mode !== 'equal' ? e.mode : 'equal',
      values: among.length === e.among.length ? e.values : undefined,
    });
    if (edFxCur) { e.cur = edFxCur; e.rate = edFxRate; }
    else { delete e.cur; delete e.rate; }
    save(); renderExpenses(kitty); renderSide(kitty);
  });
}

/* — balances, settlement, stats — */

// money numbers roll to their new value — the ledger feels alive
let prevNums = new Map();
let prevKittyId = null;
function animateNum(el, from, to, format) {
  if (reducedMotion || from === to) { el.textContent = format(to); return; }
  const t0 = performance.now();
  const dur = 650;
  const step = (now) => {
    const k = Math.min(1, (now - t0) / dur);
    const e = 1 - Math.pow(1 - k, 3);
    el.textContent = format(Math.round(from + (to - from) * e));
    if (k < 1 && el.isConnected) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

function renderSide(kitty) {
  if (prevKittyId !== kitty.id) { prevNums = new Map(); prevKittyId = kitty.id; }
  const balances = computeBalances(kitty.people, settled(kitty));

  // balances
  const balBox = $app.querySelector('#bal-list');
  const maxAbs = Math.max(1, ...[...balances.values()].map(Math.abs));
  balBox.innerHTML = kitty.people.map((p) => {
    const v = balances.get(p.id) ?? 0;
    const pct = Math.round((Math.abs(v) / maxAbs) * 100);
    const cls = v > 0 ? 'pos' : v < 0 ? 'neg' : 'zero';
    const word = v > 0 ? t('bal_plus') : v < 0 ? t('bal_minus') : t('bal_zero');
    return `<div class="bal-row ${cls}">
      <span class="bal-who">${coin(kitty, p.id)}<span class="bal-name" title="${esc(p.name)}">${esc(p.name)}</span></span>
      <span class="bal-track"><span class="bal-bar" style="width:0%" data-w="${pct}"></span></span>
      <span class="bal-val"><b data-person="${p.id}">${fmtMoney(v, kitty.currency, true)}</b><i>${esc(word)}</i></span>
    </div>`;
  }).join('');
  balBox.querySelectorAll('.bal-val b').forEach((el) => {
    const v = balances.get(el.dataset.person) ?? 0;
    animateNum(el, prevNums.get('p' + el.dataset.person) ?? 0, v, (x) => fmtMoney(x, kitty.currency, true));
    prevNums.set('p' + el.dataset.person, v);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => {
    balBox.querySelectorAll('.bal-bar').forEach((b) => { b.style.width = b.dataset.w + '%'; });
  }));

  // settlement
  const stBox = $app.querySelector('#st-list');
  const transfers = settle(balances);
  kitty.paid ??= {};
  if (transfers.length === 0) {
    stBox.innerHTML = `<p class="empty empty-s">${esc(t('st_empty'))}</p>`;
  } else {
    stBox.innerHTML = transfers.map((tr) => {
      const key = `${tr.from}>${tr.to}>${tr.amount}`;
      const done = !!kitty.paid[key];
      return `<label class="st-row ${done ? 'done' : ''}">
        <input type="checkbox" data-key="${key}" ${done ? 'checked' : ''} />
        <span class="st-flow">
          ${coin(kitty, tr.from)}
          <span class="st-arrow" aria-hidden="true"><svg viewBox="0 0 44 12" fill="none"><path d="M1 6 H37 M32 1.5 L38.5 6 L32 10.5" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>
          ${coin(kitty, tr.to)}
        </span>
        <span class="st-names" title="${esc(personName(kitty, tr.from))} → ${esc(personName(kitty, tr.to))}">${esc(personName(kitty, tr.from))} → ${esc(personName(kitty, tr.to))}</span>
        <span class="st-amount">${fmtMoney(tr.amount, kitty.currency)}</span>
      </label>`;
    }).join('');
    stBox.querySelectorAll('input[type=checkbox]').forEach((c) => c.addEventListener('change', () => {
      kitty.paid[c.dataset.key] = c.checked;
      if (!c.checked) delete kitty.paid[c.dataset.key];
      save();
      c.closest('.st-row').classList.toggle('done', c.checked);
    }));
  }

  // stats
  const statsBox = $app.querySelector('#stats-card');
  const total = settled(kitty).reduce((a, e) => a + e.amount, 0);
  const perHead = kitty.people.length ? Math.round(total / kitty.people.length) : 0;
  const byCat = {};
  settled(kitty).forEach((e) => { byCat[e.cat] = (byCat[e.cat] ?? 0) + e.amount; });
  const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxCat = cats[0]?.[1] ?? 1;
  queueMicrotask(() => {
    const tEl = statsBox.querySelector('#stat-total');
    const hEl = statsBox.querySelector('#stat-perhead');
    if (tEl) { animateNum(tEl, prevNums.get('total') ?? 0, total, (x) => fmtMoney(x, kitty.currency)); prevNums.set('total', total); }
    if (hEl) { animateNum(hEl, prevNums.get('perhead') ?? 0, perHead, (x) => fmtMoney(x, kitty.currency)); prevNums.set('perhead', perHead); }
  });
  statsBox.innerHTML = `
    <div class="stat-duo">
      <div class="stat"><span class="stat-l">${esc(t('stat_total'))}</span><span class="stat-v" id="stat-total">${fmtMoney(total, kitty.currency)}</span></div>
      <div class="stat"><span class="stat-l">${esc(t('stat_perhead'))}</span><span class="stat-v" id="stat-perhead">${fmtMoney(perHead, kitty.currency)}</span></div>
    </div>
    ${cats.length ? `<h2 class="card-h card-h-mt">${esc(t('stat_cats'))}</h2>
    <div class="cats">${cats.map(([cat, v]) => `
      <div class="cat-row">
        <span class="cat-ic">${CAT_ICONS[cat] ?? CAT_ICONS.other}</span>
        <span class="cat-body">
          <span class="cat-top"><span class="cat-name">${esc(t('cat_' + cat))}</span><span class="cat-val">${fmtMoney(v, kitty.currency)}</span></span>
          <span class="cat-track"><span class="cat-bar" style="width:${Math.max(4, Math.round((v / maxCat) * 100))}%"></span></span>
        </span>
      </div>`).join('')}</div>` : ''}`;
}

function settlementText(kitty) {
  const balances = computeBalances(kitty.people, settled(kitty));
  const transfers = settle(balances);
  const lines = [
    `${kitty.name} — ${t('st_h')}`,
    ...transfers.map((tr) => `${personName(kitty, tr.from)} ${t('st_gives')} ${personName(kitty, tr.to)}: ${fmtMoney(tr.amount, kitty.currency)}`),
  ];
  return lines.join('\n');
}

/* ───────────────────────── boot ───────────────────────── */

applyI18n();
initLanding();
window.addEventListener('hashchange', route);
route();
