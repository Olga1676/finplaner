/*
 * logic.js — «мозг» планера: справочники статей и все расчёты.
 * Здесь нет ничего про внешний вид, только данные и формулы.
 * Файл работает и в браузере (window.Logic), и в Node.js (для проверки расчётов).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Logic = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
    'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

  // Три блока трат и один блок поступлений — как в таблице.
  const GROUPS = ['Платежи', 'Расходы', 'Долги'];
  const INCOME = 'Поступления';

  const BASE_CATEGORIES = {
    'Платежи': ['Жилье', 'Связь и интернет', 'Страхование', 'Абонементы', 'Подписки'],
    'Расходы': ['Жилье', 'Семейные расходы', 'Алина','Личные расходы', 'Транспорт', 'Еда',
      'Автомобиль', 'Развлечения и отдых', 'Покупки и вещи', 'Маркетплейсы',
      'Образование и развитие', 'Здоровье'],
    'Долги': ['Кредиты', 'Долги', 'Кредитные карты', 'Ипотека', 'Задолженности'],
    'Поступления': ['Зарплата', 'Пассивный доход', 'Прочие поступления'],
  };

  // Статья → категория → блок (справочник из таблицы).
  const BASE_ITEMS = [
    ['Аренда жилья', 'Жилье', 'Платежи'],
    ['Мобильная связь', 'Связь и интернет', 'Платежи'],
    ['Интернет', 'Связь и интернет', 'Платежи'],
    ['Страхование', 'Страхование', 'Платежи'],
    ['Абонементы', 'Абонементы', 'Платежи'],
    ['Подписки', 'Подписки', 'Платежи'],
    ['Коммуналка', 'Жилье', 'Расходы'],
    ['Семья', 'Семейные расходы', 'Расходы'],
    ['Домашние животные', 'Семейные расходы', 'Расходы'],
    ['Алина', 'Алина', 'Расходы'],
    ['Личное', 'Личные расходы', 'Расходы'],
    ['Уход за собой', 'Личные расходы', 'Расходы'],
    ['Благотворительность', 'Личные расходы', 'Расходы'],
    ['Транспорт', 'Транспорт', 'Расходы'],
    ['Такси', 'Транспорт', 'Расходы'],
    ['Еда', 'Еда', 'Расходы'],
    ['Кафе & Рестораны', 'Еда', 'Расходы'],
    ['Автомобиль', 'Автомобиль', 'Расходы'],
    ['Бензин', 'Автомобиль', 'Расходы'],
    ['Путешествия', 'Развлечения и отдых', 'Расходы'],
    ['Отпуск', 'Развлечения и отдых', 'Расходы'],
    ['Развлечения', 'Развлечения и отдых', 'Расходы'],
    ['Алкоголь', 'Развлечения и отдых', 'Расходы'],
    ['Сигареты', 'Развлечения и отдых', 'Расходы'],
    ['Покупки', 'Покупки и вещи', 'Расходы'],
    ['Одежда', 'Покупки и вещи', 'Расходы'],
    ['Маркетплейсы', 'Маркетплейсы', 'Расходы'],
    ['Образование', 'Образование и развитие', 'Расходы'],
    ['Хобби', 'Образование и развитие', 'Расходы'],
    ['Спорт', 'Образование и развитие', 'Расходы'],
    ['Медицина', 'Здоровье', 'Расходы'],
    ['Кредиты', 'Кредиты', 'Долги'],
    ['Долги', 'Долги', 'Долги'],
    ['Кредитные карты', 'Кредитные карты', 'Долги'],
    ['Ипотека', 'Ипотека', 'Долги'],
    ['Задолженности', 'Задолженности', 'Долги'],
  ].map(([name, category, group]) => ({ name, category, group }));

  const BASE_INCOME_ITEMS = [
    ['Зарплата', 'Зарплата'],
    ['Пассивный доход', 'Пассивный доход'],
    ['Прочие поступления', 'Прочие поступления'],
  ].map(([name, category]) => ({ name, category }));

  // Поля блока «Накопления», которые человек вводит сам.
  const SAVINGS_FIELDS = [
    ['current', 'Отложено в этом месяце'],
    ['cushion', 'Подушка безопасности'],
    ['deposits', 'Вклады'],
    ['dividends', 'Дивиденды'],
    ['crypto', 'Криптовалюта'],
  ];
  // Это ОСТАТКИ: вводятся один раз и сами переходят в следующие месяцы, пока их не изменят.
  // null = «в этом месяце не вводили, берём из прошлого».
  const BALANCE_KEYS = ['cushion', 'deposits', 'dividends', 'crypto'];

  const OTHER = 'Другое';

  /* ---------- Месяцы: ключ вида «2025-11» ---------- */

  function ymKey(year, month) { return year + '-' + String(month).padStart(2, '0'); }
  function parseYm(ym) {
    const p = ym.split('-').map(Number);
    return { year: p[0], month: p[1] };
  }
  function shiftYm(ym, delta) {
    const p = parseYm(ym);
    const idx = p.year * 12 + (p.month - 1) + delta;
    return ymKey(Math.floor(idx / 12), (idx % 12) + 1);
  }
  function ymLabel(ym) {
    const p = parseYm(ym);
    return MONTHS[p.month - 1] + ' ' + p.year;
  }

  /* ---------- Данные ---------- */

  let idCounter = 0;
  function newId() {
    idCounter += 1;
    return Date.now().toString(36) + '-' + idCounter.toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function emptyState() {
    return { version: 1, currency: '₽', months: {}, customItems: [], customIncomeItems: [] };
  }
  function emptyMonth() {
    return {
      plan: { 'Платежи': {}, 'Расходы': {}, 'Долги': {}, 'Поступления': {} },
      savings: { current: 0, cushion: null, deposits: null, dividends: null, crypto: null },
      expenses: [],
      incomes: [],
    };
  }
  function getMonth(state, ym) { return state.months[ym] || emptyMonth(); }
  function ensureMonth(state, ym) {
    if (!state.months[ym]) state.months[ym] = emptyMonth();
    return state.months[ym];
  }
  function monthHasData(m) {
    if (!m) return false;
    if (m.expenses.length || m.incomes.length) return true;
    if (Object.values(m.savings).some(v => v)) return true;
    return Object.values(m.plan).some(g => Object.values(g).some(v => v));
  }

  function allItems(state) { return BASE_ITEMS.concat(state.customItems || []); }
  function allIncomeItems(state) { return BASE_INCOME_ITEMS.concat(state.customIncomeItems || []); }

  /** Список категорий блока: стандартные + добавленные своими статьями. */
  function categories(state, group) {
    const list = BASE_CATEGORIES[group].slice();
    const custom = group === INCOME ? (state.customIncomeItems || [])
      : (state.customItems || []).filter(i => i.group === group);
    custom.forEach(i => { if (!list.includes(i.category)) list.push(i.category); });
    return list;
  }

  function itemInfo(state, name) {
    const it = allItems(state).find(i => i.name === name);
    return it ? { category: it.category, group: it.group } : { category: OTHER, group: 'Расходы' };
  }
  function incomeCategory(state, name) {
    const it = allIncomeItems(state).find(i => i.name === name);
    return it ? it.category : 'Прочие поступления';
  }

  function toNumber(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function normEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const amount = Number(e.amount);
    const item = String(e.item || '').trim();
    if (!item || !Number.isFinite(amount) || amount <= 0) return null;
    return {
      id: e.id ? String(e.id) : newId(),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || '') ? e.date : '',
      item,
      amount,
      note: String(e.note || '').trim(),
      by: String(e.by || '').slice(0, 40),
    };
  }

  /** Собирает state из данных облачной базы (см. sync.js). */
  function stateFromCloud(raw) {
    const s = { currency: raw.settings.currency || '₽', months: {},
      customItems: raw.settings.customItems || [], customIncomeItems: raw.settings.customIncomeItems || [] };
    raw.months.forEach((m, ym) => { s.months[ym] = { plan: m.plan || {}, savings: m.savings || {}, expenses: [], incomes: [] }; });
    raw.entries.forEach(e => {
      const ym = /^\d{4}-\d{2}$/.test(e.ym || '') ? e.ym : String(e.date || '').slice(0, 7);
      if (!s.months[ym]) s.months[ym] = { plan: {}, savings: {}, expenses: [], incomes: [] };
      s.months[ym][e.kind === 'income' ? 'incomes' : 'expenses'].push(e);
    });
    return normalizeState(s);
  }

  /** Приводит загруженные данные к правильной форме. Бросает ошибку, если это не копия планера. */
  function normalizeState(raw) {
    if (!raw || typeof raw !== 'object' || !raw.months || typeof raw.months !== 'object') {
      throw new Error('Это не файл копии планера');
    }
    const s = emptyState();
    if (typeof raw.currency === 'string' && raw.currency.trim()) s.currency = raw.currency.trim().slice(0, 4);
    Object.keys(raw.months).forEach(ym => {
      if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(ym)) return;
      const src = raw.months[ym] || {};
      const m = emptyMonth();
      Object.keys(m.plan).forEach(g => {
        const p = (src.plan && src.plan[g]) || {};
        Object.keys(p).forEach(cat => { const n = toNumber(p[cat]); if (n > 0) m.plan[g][cat] = n; });
      });
      Object.keys(m.savings).forEach(k => {
        const v = src.savings ? src.savings[k] : null;
        const empty = v === null || v === undefined || v === '';
        m.savings[k] = BALANCE_KEYS.includes(k) && empty ? null : Math.max(0, toNumber(v));
      });
      m.expenses = (Array.isArray(src.expenses) ? src.expenses : []).map(normEntry).filter(Boolean);
      m.incomes = (Array.isArray(src.incomes) ? src.incomes : []).map(normEntry).filter(Boolean);
      s.months[ym] = m;
    });
    (Array.isArray(raw.customItems) ? raw.customItems : []).forEach(i => {
      const name = String((i && i.name) || '').trim();
      const category = String((i && i.category) || '').trim();
      if (name && category && GROUPS.includes(i.group)) s.customItems.push({ name, category, group: i.group });
    });
    (Array.isArray(raw.customIncomeItems) ? raw.customIncomeItems : []).forEach(i => {
      const name = String((i && i.name) || '').trim();
      const category = String((i && i.category) || '').trim();
      if (name && category) s.customIncomeItems.push({ name, category });
    });
    return s;
  }

  /* ---------- Расчёты ---------- */

  function buildBlock(state, group, planMap) {
    const rows = categories(state, group).map(name => ({ name, plan: toNumber(planMap[name]), fact: 0 }));
    return { rows, plan: 0, fact: 0 };
  }
  function addFact(block, category, amount) {
    let row = block.rows.find(r => r.name === category);
    if (!row) { row = { name: category, plan: 0, fact: 0 }; block.rows.push(row); }
    row.fact += amount;
  }
  function closeBlock(block) {
    block.plan = block.rows.reduce((s, r) => s + r.plan, 0);
    block.fact = block.rows.reduce((s, r) => s + r.fact, 0);
    return block;
  }

  /** Сколько отложено («Отложено в этом месяце») за все месяцы ДО указанного. */
  function savedBefore(state, ym) {
    return Object.keys(state.months)
      .filter(k => k < ym)
      .reduce((s, k) => s + toNumber(state.months[k].savings.current), 0);
  }

  /**
   * Остатки (подушка, вклады, дивиденды, крипта) на месяц:
   * если в этом месяце вводили — берём их, иначе — из последнего прошлого месяца, где вводили.
   * carried[k] = true, если значение пришло из прошлого месяца.
   */
  function balancesFor(state, ym) {
    const values = {};
    const carried = {};
    const earlier = Object.keys(state.months).filter(k => k <= ym).sort().reverse();
    BALANCE_KEYS.forEach(k => {
      const src = earlier.find(key => state.months[key].savings[k] !== null && state.months[key].savings[k] !== undefined);
      values[k] = src ? toNumber(state.months[src].savings[k]) : 0;
      carried[k] = !!src && src !== ym;
    });
    return { values, carried };
  }

  /** Вся сводка одного месяца: блоки план/факт, остаток, накопления, траты по категориям. */
  function monthSummary(state, ym) {
    const m = getMonth(state, ym);
    const blocks = {};
    GROUPS.forEach(g => { blocks[g] = buildBlock(state, g, m.plan[g] || {}); });
    const income = buildBlock(state, INCOME, m.plan[INCOME] || {});

    m.expenses.forEach(e => {
      const info = itemInfo(state, e.item);
      addFact(blocks[info.group], info.category, e.amount);
    });
    m.incomes.forEach(e => addFact(income, incomeCategory(state, e.item), e.amount));

    GROUPS.forEach(g => closeBlock(blocks[g]));
    closeBlock(income);

    const spent = GROUPS.reduce((s, g) => s + blocks[g].fact, 0);
    const spentPlan = GROUPS.reduce((s, g) => s + blocks[g].plan, 0);
    const balanceFact = income.fact - spent;
    const balancePlan = income.plan - spentPlan;

    const prev = savedBefore(state, ym);
    const current = toNumber(m.savings.current);
    const bal = balancesFor(state, ym);
    const sv = bal.values;
    const capital = prev + current + sv.cushion + sv.deposits + sv.dividends + sv.crypto;

    // Одна и та же категория (например «Жилье») может быть и в платежах, и в расходах — складываем.
    const merged = {};
    GROUPS.forEach(g => blocks[g].rows.forEach(r => {
      if (r.fact > 0) merged[r.name] = (merged[r.name] || 0) + r.fact;
    }));
    const byCategory = Object.keys(merged)
      .map(name => ({ name, amount: merged[name] }))
      .sort((a, b) => b.amount - a.amount);

    return {
      ym,
      hasData: monthHasData(state.months[ym]),
      income,
      payments: blocks['Платежи'],
      expenses: blocks['Расходы'],
      debts: blocks['Долги'],
      blocks,
      spent,
      spentPlan,
      spentShare: income.fact > 0 ? spent / income.fact : null,
      balanceFact,
      balancePlan,
      savings: {
        prev,
        current, cushion: sv.cushion, deposits: sv.deposits,
        dividends: sv.dividends, crypto: sv.crypto,
        carried: bal.carried,
        capital,
      },
      endBalance: balanceFact + capital,
      byCategory,
    };
  }

  /** Сводка за год: 12 месяцев, итоги, траты и поступления по категориям. */
  function yearSummary(state, year) {
    const months = [];
    const totals = { income: 0, payments: 0, expenses: 0, debts: 0, spent: 0, balance: 0 };
    const cat = {};
    const incCat = {};
    let capital = 0;
    for (let i = 1; i <= 12; i += 1) {
      const s = monthSummary(state, ymKey(year, i));
      months.push({
        ym: s.ym, name: MONTHS[i - 1], hasData: s.hasData,
        income: s.income.fact, payments: s.payments.fact, expenses: s.expenses.fact,
        debts: s.debts.fact, spent: s.spent, balance: s.balanceFact,
      });
      totals.income += s.income.fact;
      totals.payments += s.payments.fact;
      totals.expenses += s.expenses.fact;
      totals.debts += s.debts.fact;
      totals.spent += s.spent;
      totals.balance += s.balanceFact;
      s.byCategory.forEach(c => { cat[c.name] = (cat[c.name] || 0) + c.amount; });
      s.income.rows.forEach(r => { if (r.fact > 0) incCat[r.name] = (incCat[r.name] || 0) + r.fact; });
      if (s.hasData) capital = s.savings.capital;
    }
    const sorted = o => Object.keys(o).map(name => ({ name, amount: o[name] })).sort((a, b) => b.amount - a.amount);
    return { year, months, totals, capital, byCategory: sorted(cat), byIncomeCategory: sorted(incCat) };
  }

  return {
    MONTHS, GROUPS, INCOME, SAVINGS_FIELDS, BALANCE_KEYS, OTHER,
    ymKey, parseYm, shiftYm, ymLabel, newId,
    emptyState, emptyMonth, getMonth, ensureMonth, monthHasData,
    allItems, allIncomeItems, categories, itemInfo, incomeCategory,
    normalizeState, normEntry, stateFromCloud, monthSummary, yearSummary,
  };
});
