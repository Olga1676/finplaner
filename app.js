/*
 * app.js — экраны приложения: показывает данные и реагирует на нажатия.
 * Все формулы — в logic.js. Данные хранятся в браузере (localStorage) на этом устройстве.
 */
(function () {
  'use strict';
  const L = window.Logic;
  const STORAGE_KEY = 'finplaner-v1';
  const main = document.getElementById('main');

  /* ---------- Хранение ---------- */

  let storageOk = true;
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return L.normalizeState(JSON.parse(raw));
    } catch (e) { storageOk = false; }
    return L.emptyState();
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      toast('Не удалось сохранить в браузере. Сделайте резервную копию в разделе «Ещё».');
    }
  }

  let state = load();
  const today = new Date();
  const ui = {
    tab: 'overview',
    ym: L.ymKey(today.getFullYear(), today.getMonth() + 1),   // всегда открываем текущий месяц
    kind: 'expense',      // какой тип записи добавляем: expense | income
    editId: null,         // id записи, которую редактируем
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY + '-ui') || '{}');
    if (saved.tab) ui.tab = saved.tab;
  } catch (e) { /* не важно */ }

  function saveUi() {
    try { localStorage.setItem(STORAGE_KEY + '-ui', JSON.stringify({ tab: ui.tab, ym: ui.ym })); } catch (e) { /* не важно */ }
  }

  /* ---------- Помощники ---------- */

  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const nf = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });
  function money(n) {
    const v = Math.round(n * 100) / 100;
    return (v < 0 ? '−' : '') + nf.format(Math.abs(v)) + ' ' + state.currency;
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function dateLabel(iso) {
    if (!iso) return 'без даты';
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }
  function parseAmount(str) {
    const n = Number(String(str).replace(/\s/g, '').replace(',', '.'));
    return Number.isFinite(n) ? n : NaN;
  }
  let toastTimer;
  function toast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  function currentYear() { return L.parseYm(ui.ym).year; }

  /* ---------- Шапка ---------- */

  function renderHeader() {
    document.getElementById('period-label').textContent =
      ui.tab === 'year' ? currentYear() + ' год' : L.ymLabel(ui.ym);
    document.querySelectorAll('.tab').forEach(b => {
      if (b.dataset.tab === ui.tab) b.setAttribute('aria-current', 'page');
      else b.removeAttribute('aria-current');
    });
    const hidePeriod = ui.tab === 'settings';
    document.querySelector('.period').style.visibility = hidePeriod ? 'hidden' : 'visible';
  }

  /* ---------- Обзор месяца ---------- */

  function blockTable(title, block, isIncome) {
    const rows = block.rows.filter(r => r.plan || r.fact);
    const body = rows.length ? rows.map(r => {
      const over = !isIncome && r.plan > 0 && r.fact > r.plan;
      return `<tr><td>${esc(r.name)}</td><td class="num muted">${r.plan ? money(r.plan) : '—'}</td>` +
        `<td class="num${over ? ' over' : ''}">${money(r.fact)}${over ? ' <span class="visually-hidden">больше плана</span>▲' : ''}</td></tr>`;
    }).join('') : '<tr class="empty-row"><td colspan="3">Пока ничего нет</td></tr>';
    return `<div class="card"><h3>${title}</h3>
      <table class="table"><thead><tr><th>Категория</th><th class="num">План</th><th class="num">Факт</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot><tr><td>Итого</td><td class="num">${money(block.plan)}</td><td class="num">${money(block.fact)}</td></tr></tfoot></table></div>`;
  }

  function barsList(items, cls) {
    if (!items.length) return '<p class="muted small">Пока нет данных.</p>';
    const max = items[0].amount || 1;
    const total = items.reduce((s, c) => s + c.amount, 0);
    return '<ul class="bars">' + items.map(c =>
      `<li class="bar-row"><span>${esc(c.name)}</span><span>${money(c.amount)} <span class="muted small">${pct(c.amount / total)}</span></span>` +
      `<span class="bar-track" aria-hidden="true"><span class="bar-fill ${cls || ''}" style="width:${(c.amount / max * 100).toFixed(1)}%"></span></span></li>`
    ).join('') + '</ul>';
  }

  function renderOverview() {
    const s = L.monthSummary(state, ui.ym);
    if (!s.hasData) {
      return `<div class="card empty"><p><b>${L.ymLabel(ui.ym)}</b> — пока пусто.</p>
        ${s.savings.capital > 0 ? `<p>Капитал и накопления: <b>${money(s.savings.capital)}</b></p>` : ''}
        <p class="muted small">Добавьте первую трату или поступление, а в разделе «План» задайте бюджет.</p>
        <button type="button" class="btn btn-primary" data-go="entries">Добавить запись</button></div>`;
    }
    const share = s.spentShare;
    const plan = L.GROUPS.map(g => ({ g, b: s.blocks[g] }));
    return `
      <h2 class="visually-hidden">Обзор за ${L.ymLabel(ui.ym)}</h2>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Поступления</div><div class="kpi-value pos">${money(s.income.fact)}</div>
          <div class="kpi-sub">план ${money(s.income.plan)}</div></div>
        <div class="kpi"><div class="kpi-label">Траты</div><div class="kpi-value">${money(s.spent)}</div>
          <div class="kpi-sub">план ${money(s.spentPlan)}</div></div>
        <div class="kpi"><div class="kpi-label">Остаток месяца</div><div class="kpi-value ${s.balanceFact < 0 ? 'neg' : ''}">${money(s.balanceFact)}</div>
          <div class="kpi-sub">поступления − траты</div></div>
        <div class="kpi"><div class="kpi-label">Капитал и накопления</div><div class="kpi-value">${money(s.savings.capital)}</div>
          <div class="kpi-sub">на конец месяца: ${money(s.endBalance)}</div></div>
      </div>

      <div class="meter card">
        <div class="meter-head"><span>Потрачено от поступлений</span><b>${share === null ? '—' : pct(share)}</b></div>
        <div class="meter-track" role="img" aria-label="Потрачено ${share === null ? 'неизвестно' : pct(share)} от поступлений">
          <div class="meter-fill" style="width:${share === null ? 0 : Math.min(100, share * 100).toFixed(1)}%"></div></div>
        <p class="hint">Платежи ${money(s.payments.fact)} · Расходы ${money(s.expenses.fact)} · Долги ${money(s.debts.fact)}</p>
      </div>

      <section class="section">
        <h2>Траты по категориям</h2>
        <div class="card">${barsList(s.byCategory, 'spend')}</div>
      </section>

      <section class="section">
        <h2>План и факт</h2>
        <div class="grid-2">
          ${blockTable('Поступления', s.income, true)}
          ${plan.map(p => blockTable(p.g, p.b)).join('')}
        </div>
      </section>`;
  }

  /* ---------- Записи ---------- */

  function itemOptions(selected) {
    if (ui.kind === 'income') {
      return L.allIncomeItems(state).map(i =>
        `<option value="${esc(i.name)}"${i.name === selected ? ' selected' : ''}>${esc(i.name)}</option>`).join('');
    }
    return L.GROUPS.map(g => `<optgroup label="${g}">` +
      L.allItems(state).filter(i => i.group === g).map(i =>
        `<option value="${esc(i.name)}"${i.name === selected ? ' selected' : ''}>${esc(i.name)}</option>`).join('') +
      '</optgroup>').join('');
  }

  function defaultDate() {
    const t = L.ymKey(today.getFullYear(), today.getMonth() + 1);
    const day = t === ui.ym ? today.getDate() : 1;
    return ui.ym + '-' + String(day).padStart(2, '0');
  }

  function renderEntries() {
    const m = L.getMonth(state, ui.ym);
    const list = ui.kind === 'income' ? m.incomes : m.expenses;
    const editing = ui.editId ? list.find(e => e.id === ui.editId) : null;
    if (ui.editId && !editing) ui.editId = null;
    const isInc = ui.kind === 'income';

    const sorted = list.slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const total = list.reduce((s, e) => s + e.amount, 0);
    const items = sorted.map(e => {
      const info = isInc ? { category: L.incomeCategory(state, e.item), group: 'Поступления' } : L.itemInfo(state, e.item);
      return `<li class="entry${e.id === ui.editId ? ' editing' : ''}">
        <div class="entry-main"><div class="entry-title">${esc(e.item)}</div>
          <div class="entry-meta">${isInc ? '' : `<span class="tag">${esc(info.group)}</span>`}${esc(info.category)} · ${dateLabel(e.date)}${e.note ? ' · ' + esc(e.note) : ''}</div></div>
        <div class="entry-amount ${isInc ? 'pos' : ''}">${money(e.amount)}</div>
        <div class="entry-actions">
          <button type="button" class="btn btn-small" data-edit="${esc(e.id)}" aria-label="Изменить: ${esc(e.item)}, ${money(e.amount)}">Изм.</button>
          <button type="button" class="btn btn-small btn-danger" data-del="${esc(e.id)}" aria-label="Удалить: ${esc(e.item)}, ${money(e.amount)}">✕</button>
        </div></li>`;
    }).join('');

    return `
      <h2>${editing ? 'Изменить запись' : 'Новая запись'}</h2>
      <div class="seg" role="group" aria-label="Тип записи">
        <button type="button" data-kind="expense" aria-pressed="${!isInc}">Трата</button>
        <button type="button" data-kind="income" aria-pressed="${isInc}">Поступление</button>
      </div>
      <form class="card form" id="entry-form" novalidate>
        <div class="field"><label for="f-date">Дата</label>
          <input class="input" type="date" id="f-date" value="${editing ? esc(editing.date) : defaultDate()}"></div>
        <div class="field"><label for="f-item">${isInc ? 'Статья поступлений' : 'Статья расходов'}</label>
          <select class="input" id="f-item">${itemOptions(editing ? editing.item : null)}</select></div>
        <div class="field"><label for="f-amount">Сумма, ${esc(state.currency)}</label>
          <input class="input num" id="f-amount" inputmode="decimal" autocomplete="off" placeholder="0" value="${editing ? editing.amount : ''}"></div>
        <div class="field full"><label for="f-note">Примечание</label>
          <input class="input" id="f-note" maxlength="120" placeholder="необязательно" value="${editing ? esc(editing.note) : ''}"></div>
        <div class="form-actions full">
          <button class="btn btn-primary" type="submit">${editing ? 'Сохранить' : 'Добавить'}</button>
          ${editing ? '<button class="btn" type="button" id="cancel-edit">Отмена</button>' : ''}
        </div>
        <p class="error full" id="f-error" role="alert" hidden></p>
      </form>
      <p class="hint">Дата вне ${L.ymLabel(ui.ym).toLowerCase()} — запись попадёт в свой месяц.</p>

      <section class="section" style="margin-top:24px">
        <h2>${isInc ? 'Поступления' : 'Траты'} за ${L.ymLabel(ui.ym).toLowerCase()} <span class="muted small">· ${list.length} шт. · ${money(total)}</span></h2>
        ${list.length ? `<ul class="entries">${items}</ul>`
          : `<div class="card empty"><p class="muted">${isInc ? 'Поступлений' : 'Трат'} в этом месяце ещё нет.</p></div>`}
      </section>`;
  }

  function submitEntry(form) {
    const err = form.querySelector('#f-error');
    const amount = parseAmount(form.querySelector('#f-amount').value);
    const date = form.querySelector('#f-date').value;
    if (!(amount > 0)) {
      err.textContent = 'Введите сумму больше нуля, например 1500 или 99,90.';
      err.hidden = false;
      form.querySelector('#f-amount').focus();
      return;
    }
    const entry = L.normEntry({
      id: ui.editId || L.newId(),
      date,
      item: form.querySelector('#f-item').value,
      amount,
      note: form.querySelector('#f-note').value,
    });
    const key = ui.kind === 'income' ? 'incomes' : 'expenses';
    // Если редактировали — убираем старую версию из её месяца.
    if (ui.editId) {
      Object.values(state.months).forEach(m => { m[key] = m[key].filter(e => e.id !== ui.editId); });
    }
    const target = entry.date ? entry.date.slice(0, 7) : ui.ym;
    L.ensureMonth(state, target)[key].push(entry);
    const wasEdit = !!ui.editId;
    ui.editId = null;
    save();
    if (target !== ui.ym) toast(`Сохранено в ${L.ymLabel(target).toLowerCase()}`);
    else toast(wasEdit ? 'Запись изменена' : 'Запись добавлена');
    render();
    const amt = document.getElementById('f-amount');
    if (amt) amt.focus();
  }

  /* ---------- План ---------- */

  function renderPlan() {
    const m = L.getMonth(state, ui.ym);
    const s = L.monthSummary(state, ui.ym);
    const groups = [L.INCOME].concat(L.GROUPS);
    const cards = groups.map(g => {
      const cats = L.categories(state, g);
      const plan = m.plan[g] || {};
      const total = cats.reduce((sum, c) => sum + (Number(plan[c]) || 0), 0);
      return `<div class="card"><h3>${g}</h3><div class="plan-list">` +
        cats.map((c, i) => {
          const id = `p-${groups.indexOf(g)}-${i}`;
          return `<div class="plan-row"><label for="${id}">${esc(c)}</label>
            <input class="input num" id="${id}" inputmode="decimal" placeholder="0" data-plan-group="${g}" data-plan-cat="${esc(c)}" value="${plan[c] || ''}"></div>`;
        }).join('') +
        `</div><div class="plan-total"><span>Итого</span><span data-total="${g}">${money(total)}</span></div></div>`;
    }).join('');

    const sv = L.SAVINGS_FIELDS.map(([k, label]) => {
      const isBalance = L.BALANCE_KEYS.includes(k);
      const own = m.savings[k];
      const value = own === null || own === undefined || (!isBalance && !own) ? '' : own;
      const carried = isBalance && s.savings.carried[k];
      const ph = carried ? nf.format(s.savings[k]) : '0';
      return `<div class="plan-row"><label for="s-${k}">${label}${carried ? '<span class="carry">из прошлого месяца</span>' : ''}</label>
        <input class="input num" id="s-${k}" inputmode="decimal" placeholder="${ph}" data-sav="${k}" value="${value}"></div>`;
    }).join('');

    return `
      <h2>План на ${L.ymLabel(ui.ym).toLowerCase()}</h2>
      <p class="muted small" style="margin-top:-6px">Впишите, сколько планируете получить и потратить. Факт считается сам из записей.</p>
      <div style="margin-bottom:16px"><button type="button" class="btn" id="copy-plan">Скопировать план из${L.ymLabel(L.shiftYm(ui.ym, -1)).toLowerCase()}</button></div>
      <div class="grid-2">${cards}
        <div class="card"><h3>Накопления</h3>
          <div class="plan-list">
            <div class="plan-row"><span>Накоплено в прошлые месяцы</span><span class="num" style="text-align:right">${money(s.savings.prev)}</span></div>
            ${sv}
          </div>
          <div class="plan-total"><span>Капитал и накопления</span><span id="cap-total">${money(s.savings.capital)}</span></div>
          <p class="hint">Подушку, вклады, дивиденды и крипту достаточно вписать один раз — суммы сами перейдут в следующие месяцы. Изменились — впишите новую сумму в нужном месяце.</p>
          <p class="hint">«Отложено в этом месяце» копится: в следующих месяцах оно входит в «Накоплено в прошлые месяцы».</p>
        </div>
      </div>`;
  }

  function onPlanInput(input) {
    const raw = input.value.trim();
    const isBalance = L.BALANCE_KEYS.includes(input.dataset.sav);
    // Пустое поле остатка = «брать из прошлого месяца».
    const n = raw === '' ? (isBalance ? null : 0) : parseAmount(raw);
    if (n === null) {
      L.ensureMonth(state, ui.ym).savings[input.dataset.sav] = null;
      document.getElementById('cap-total').textContent = money(L.monthSummary(state, ui.ym).savings.capital);
      save();
      return;
    }
    if (!Number.isFinite(n) || n < 0) { input.setAttribute('aria-invalid', 'true'); return; }
    input.removeAttribute('aria-invalid');
    const m = L.ensureMonth(state, ui.ym);
    if (input.dataset.planGroup) {
      const g = input.dataset.planGroup, c = input.dataset.planCat;
      if (n > 0) m.plan[g][c] = n; else delete m.plan[g][c];
      const total = Object.values(m.plan[g]).reduce((s, v) => s + v, 0);
      const el = main.querySelector(`[data-total="${g}"]`);
      if (el) el.textContent = money(total);
    } else if (input.dataset.sav) {
      m.savings[input.dataset.sav] = n;
      document.getElementById('cap-total').textContent = money(L.monthSummary(state, ui.ym).savings.capital);
    }
    save();
  }

  function copyPlan() {
    const prev = state.months[L.shiftYm(ui.ym, -1)];
    if (!prev) { toast('В прошлом месяце нет плана'); return; }
    const m = L.ensureMonth(state, ui.ym);
    m.plan = JSON.parse(JSON.stringify(prev.plan));
    save();
    render();
    toast('План скопирован');
  }

  /* ---------- Год ---------- */

  function renderYear() {
    const y = L.yearSummary(state, currentYear());
    const t = y.totals;
    if (!y.months.some(m => m.hasData)) {
      return `<div class="card empty"><p>За ${y.year} год пока нет записей.</p></div>`;
    }
    const max = Math.max(1, ...y.months.map(m => Math.max(m.income, m.spent)));
    const short = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];
    const rows = y.months.map(m => `<tr class="${m.hasData ? '' : 'empty-row'}">
      <td><button type="button" class="btn btn-small" data-open-month="${m.ym}">${m.name}</button></td>
      <td class="num">${money(m.income)}</td><td class="num">${money(m.spent)}</td>
      <td class="num ${m.balance < 0 ? 'neg' : ''}">${money(m.balance)}</td></tr>`).join('');
    return `
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">Поступления за год</div><div class="kpi-value pos">${money(t.income)}</div></div>
        <div class="kpi"><div class="kpi-label">Траты за год</div><div class="kpi-value">${money(t.spent)}</div>
          <div class="kpi-sub">${t.income > 0 ? pct(t.spent / t.income) + ' от поступлений' : ''}</div></div>
        <div class="kpi"><div class="kpi-label">Остаток за год</div><div class="kpi-value ${t.balance < 0 ? 'neg' : ''}">${money(t.balance)}</div></div>
        <div class="kpi"><div class="kpi-label">Капитал и накопления</div><div class="kpi-value">${money(y.capital)}</div>
          <div class="kpi-sub">на последний месяц с данными</div></div>
      </div>

      <section class="section card">
        <div class="legend"><span><i style="background:var(--bar)"></i>Поступления</span><span><i style="background:var(--spend)"></i>Траты</span></div>
        <div class="cols" role="img" aria-label="Поступления и траты по месяцам — подробно в таблице ниже">
          ${y.months.map(m => `<div class="col"><span class="c-in" style="height:${(m.income / max * 100).toFixed(1)}%"></span><span class="c-out" style="height:${(m.spent / max * 100).toFixed(1)}%"></span></div>`).join('')}
        </div>
        <div class="col-labels" aria-hidden="true">${short.map(s => `<span>${s}</span>`).join('')}</div>
      </section>

      <section class="section">
        <h2>По месяцам</h2>
        <div class="card"><table class="table">
          <thead><tr><th>Месяц</th><th class="num">Поступления</th><th class="num">Траты</th><th class="num">Остаток</th></tr></thead>
          <tbody>${rows}</tbody>
          <tfoot><tr><td>Итого</td><td class="num">${money(t.income)}</td><td class="num">${money(t.spent)}</td><td class="num">${money(t.balance)}</td></tr></tfoot>
        </table>
        <p class="hint">Платежи ${money(t.payments)} · Расходы ${money(t.expenses)} · Долги ${money(t.debts)}</p></div>
      </section>

      <div class="grid-2">
        <section class="card"><h3>Траты по категориям</h3>${barsList(y.byCategory, 'spend')}</section>
        <section class="card"><h3>Поступления по категориям</h3>${barsList(y.byIncomeCategory)}</section>
      </div>`;
  }

  /* ---------- Ещё: валюта, статьи, резервная копия ---------- */

  function renderSettings() {
    const custom = state.customItems.map((i, idx) =>
      `<li class="entry"><div class="entry-main"><div class="entry-title">${esc(i.name)}</div><div class="entry-meta"><span class="tag">${esc(i.group)}</span>${esc(i.category)}</div></div><span></span>
        <div class="entry-actions"><button type="button" class="btn btn-small btn-danger" data-del-item="${idx}" aria-label="Удалить статью ${esc(i.name)}">✕</button></div></li>`).join('') +
      state.customIncomeItems.map((i, idx) =>
      `<li class="entry"><div class="entry-main"><div class="entry-title">${esc(i.name)}</div><div class="entry-meta"><span class="tag">Поступления</span>${esc(i.category)}</div></div><span></span>
        <div class="entry-actions"><button type="button" class="btn btn-small btn-danger" data-del-inc-item="${idx}" aria-label="Удалить статью ${esc(i.name)}">✕</button></div></li>`).join('');

    return `
      <section class="section">
        <h2>Своя статья</h2>
        <form class="card form" id="item-form" novalidate>
          <div class="field"><label for="ni-group">Блок</label>
            <select class="input" id="ni-group">${L.GROUPS.concat([L.INCOME]).map(g => `<option>${g}</option>`).join('')}</select></div>
          <div class="field"><label for="ni-name">Название статьи</label>
            <input class="input" id="ni-name" maxlength="40" placeholder="например, Кофе"></div>
          <div class="field"><label for="ni-cat">Категория</label>
            <input class="input" id="ni-cat" maxlength="40" list="ni-cats" placeholder="например, Еда">
            <datalist id="ni-cats"></datalist></div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Добавить</button></div>
          <p class="error full" id="ni-error" role="alert" hidden></p>
        </form>
        ${custom ? `<ul class="entries" style="margin-top:12px">${custom}</ul>` : '<p class="hint">Своих статей пока нет — используются стандартные из таблицы.</p>'}
      </section>

      <section class="section">
        <h2>Валюта</h2>
        <div class="card"><div class="plan-row"><label for="currency">Знак валюты</label>
          <select class="input" id="currency">${['₽', '$', '€', '₸', '₴', 'Br', '₾', 'сум'].map(c => `<option${c === state.currency ? ' selected' : ''}>${c}</option>`).join('')}</select></div></div>
      </section>

      <section class="section">
        <h2>Резервная копия</h2>
        <div class="card">
          <p class="small" style="margin-top:0">Данные хранятся только в этом браузере на этом устройстве.
          Сохраните копию в файл, чтобы не потерять записи или перенести их на телефон.</p>
          ${storageOk ? '' : '<p class="error">Браузер не даёт сохранять данные (например, в режиме инкогнито). Обязательно сохраните копию.</p>'}
          <div class="form-actions" style="flex-wrap:wrap">
            <button type="button" class="btn btn-primary" id="export">Сохранить копию в файл</button>
            <label class="btn" for="import" style="display:inline-flex;align-items:center">Загрузить из файла</label>
            <input type="file" id="import" accept="application/json,.json" class="visually-hidden">
          </div>
          <p class="hint">Загрузка из файла заменит все текущие данные.</p>
        </div>
      </section>`;
  }

  function fillCats() {
    const g = document.getElementById('ni-group');
    const dl = document.getElementById('ni-cats');
    if (g && dl) dl.innerHTML = L.categories(state, g.value).map(c => `<option value="${esc(c)}">`).join('');
  }

  function addItem(form) {
    const group = form.querySelector('#ni-group').value;
    const name = form.querySelector('#ni-name').value.trim();
    const category = form.querySelector('#ni-cat').value.trim();
    const err = form.querySelector('#ni-error');
    const exists = (group === L.INCOME ? L.allIncomeItems(state) : L.allItems(state)).some(i => i.name.toLowerCase() === name.toLowerCase());
    let msg = '';
    if (!name) msg = 'Введите название статьи.';
    else if (!category) msg = 'Выберите или впишите категорию.';
    else if (exists) msg = 'Такая статья уже есть.';
    if (msg) { err.textContent = msg; err.hidden = false; return; }
    if (group === L.INCOME) state.customIncomeItems.push({ name, category });
    else state.customItems.push({ name, category, group });
    save();
    render();
    toast('Статья добавлена');
  }

  function exportData() {
    const blob = new Blob([JSON.stringify(state, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'finplaner-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  function importData(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = L.normalizeState(JSON.parse(reader.result));
        if (!confirm('Заменить все текущие данные данными из файла?')) return;
        state = next;
        save();
        render();
        toast('Данные загружены');
      } catch (e) {
        toast('Не получилось прочитать файл: это не копия планера.');
      }
    };
    reader.readAsText(file);
  }

  /* ---------- Отрисовка и события ---------- */

  const views = { overview: renderOverview, entries: renderEntries, plan: renderPlan, year: renderYear, settings: renderSettings };

  function render() {
    renderHeader();
    main.innerHTML = (views[ui.tab] || renderOverview)();
    if (ui.tab === 'settings') fillCats();
  }

  function go(tab) {
    ui.tab = tab;
    ui.editId = null;
    saveUi();
    render();
    window.scrollTo(0, 0);
  }

  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('[data-tab]');
    if (b) go(b.dataset.tab);
  });
  function step(dir) {
    ui.ym = L.shiftYm(ui.ym, ui.tab === 'year' ? dir * 12 : dir);
    ui.editId = null;
    saveUi();
    render();
  }
  document.getElementById('prev').addEventListener('click', () => step(-1));
  document.getElementById('next').addEventListener('click', () => step(1));

  main.addEventListener('click', e => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.go) return go(t.dataset.go);
    if (t.dataset.kind) { ui.kind = t.dataset.kind; ui.editId = null; return render(); }
    if (t.dataset.edit) {
      ui.editId = t.dataset.edit;
      render();
      window.scrollTo(0, 0);
      document.getElementById('f-amount').focus();
      return;
    }
    if (t.id === 'cancel-edit') { ui.editId = null; return render(); }
    if (t.dataset.del) {
      const key = ui.kind === 'income' ? 'incomes' : 'expenses';
      const m = L.ensureMonth(state, ui.ym);
      const entry = m[key].find(x => x.id === t.dataset.del);
      if (!entry || !confirm(`Удалить «${entry.item}» на ${money(entry.amount)}?`)) return;
      m[key] = m[key].filter(x => x.id !== entry.id);
      if (ui.editId === entry.id) ui.editId = null;
      save();
      render();
      toast('Запись удалена');
      return;
    }
    if (t.id === 'copy-plan') return copyPlan();
    if (t.dataset.openMonth) { ui.ym = t.dataset.openMonth; return go('overview'); }
    if (t.id === 'export') return exportData();
    if (t.dataset.delItem !== undefined || t.dataset.delIncItem !== undefined) {
      const inc = t.dataset.delIncItem !== undefined;
      const arr = inc ? state.customIncomeItems : state.customItems;
      const idx = Number(inc ? t.dataset.delIncItem : t.dataset.delItem);
      if (!arr[idx] || !confirm(`Удалить статью «${arr[idx].name}»? Старые записи останутся, но попадут в «${inc ? 'Прочие поступления' : L.OTHER}».`)) return;
      arr.splice(idx, 1);
      save();
      render();
    }
  });

  main.addEventListener('submit', e => {
    e.preventDefault();
    if (e.target.id === 'entry-form') submitEntry(e.target);
    if (e.target.id === 'item-form') addItem(e.target);
  });
  main.addEventListener('input', e => {
    if (e.target.matches('[data-plan-group], [data-sav]')) onPlanInput(e.target);
  });
  main.addEventListener('change', e => {
    if (e.target.id === 'currency') { state.currency = e.target.value; save(); toast('Валюта изменена'); }
    if (e.target.id === 'ni-group') fillCats();
    if (e.target.id === 'import' && e.target.files[0]) { importData(e.target.files[0]); e.target.value = ''; }
  });
  // Обновляем итоги «Обзора», когда возвращаемся с поля плана.
  main.addEventListener('focusout', e => {
    if (e.target.matches('[data-plan-group]')) e.target.value = e.target.value.trim();
  });

  render();
})();
