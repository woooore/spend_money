(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const KEY = 'howSpendMoney.v1';
  const AUTH_KEY = 'howSpendMoney.auth.v1';
  // Cloudflare Workers 배포 후 받은 주소를 여기에 넣으면 사용자에게 입력받지 않고 바로 연결됩니다
  const DEFAULT_SERVER_URL = '';
  const BUILTIN_EXP = Object.keys(Parser.CATEGORIES);
  const BUILTIN_INC = Object.keys(Parser.INCOME_CATEGORIES);
  const EXP_CATS = [...BUILTIN_EXP], INC_CATS = [...BUILTIN_INC];
  const ICON = { 식비: '🍚', 교통: '🚌', 쇼핑: '🛍️', 생활: '🧻', 주거통신: '🏠', 의료건강: '💊', 문화여가: '🎬', 교육: '📚', 경조사: '🎁', 미용: '💇', 기타지출: '💸', 급여: '💰', 용돈: '🧧', 부수입: '💵', 기타수입: '➕' };
  const BASE_ICON = { ...ICON };
  // 사용자 카테고리/키워드를 목록·아이콘에 반영 (기타지출/기타수입은 맨 뒤 유지)
  function refreshCats() {
    const cc = S.customCats || [];
    const build = (builtin, type, last) => [...builtin.filter(c => c !== last), ...cc.filter(c => c.type === type).map(c => c.name), last];
    EXP_CATS.splice(0, EXP_CATS.length, ...build(BUILTIN_EXP, 'expense', '기타지출'));
    INC_CATS.splice(0, INC_CATS.length, ...build(BUILTIN_INC, 'income', '기타수입'));
    Object.keys(ICON).forEach(k => delete ICON[k]); Object.assign(ICON, BASE_ICON);
    cc.forEach(c => ICON[c.name] = c.emoji || '🏷️');
  }
  const incomeCatNames = () => [...BUILTIN_INC, ...(S.customCats || []).filter(c => c.type === 'income').map(c => c.name)];
  const won = n => Math.round(n).toLocaleString('ko-KR') + '원';
  const uid = () => Math.random().toString(36).slice(2, 10);
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const moneyVal = el => el ? (parseInt(String(el.value || '').replace(/[^0-9]/g, ''), 10) || 0) : 0;
  const fmtMoney = n => (+n > 0 ? Math.round(+n).toLocaleString('ko-KR') : '');

  // 커서 위치를 유지하며 3자리 콤마 자동 포맷
  function bindMoneyInput(el, onChange) {
    if (!el) return;
    el.addEventListener('input', () => {
      const raw = el.value;
      const digitsBefore = (raw.slice(0, el.selectionStart || 0).match(/\d/g) || []).length;
      const digits = raw.replace(/\D/g, '');
      if (!digits) { el.value = ''; if (onChange) onChange(0); return; }
      const num = parseInt(digits, 10);
      const fmt = num.toLocaleString('ko-KR');
      el.value = fmt;
      let pos = 0, seen = 0;
      while (pos < fmt.length && seen < digitsBefore) {
        if (/\d/.test(fmt[pos])) seen++;
        pos++;
      }
      try { el.setSelectionRange(pos, pos); } catch (e) {}
      if (onChange) onChange(num);
    });
  }

  // 엔터키로 다음 입력칸·선택지로 자동 이동 (한글 조합 중 중복 실행 방지)
  function bindEnterFlow(root, getSteps, onFinal) {
    const clearStepHi = () => root.querySelectorAll('.step-active').forEach(x => x.classList.remove('step-active'));
    const visibleSteps = () => (getSteps() || []).filter(el => el && el.offsetParent !== null && !el.disabled);

    function focusStep(el) {
      clearStepHi();
      if (!el) { if (onFinal) onFinal(); return; }
      if (el.hasAttribute('data-choice-group')) {
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
        const box = el.closest('.step-box') || el;
        box.classList.add('step-active');
        box.scrollIntoView({ behavior: 'smooth', block: 'center' });
        const target = el.querySelector('.on') || el.querySelector('button');
        if (target) setTimeout(() => { try { target.focus({ preventScroll: true }); } catch (e) {} }, 40);
      } else {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        setTimeout(() => {
          try { el.focus({ preventScroll: true }); } catch (e) {}
          if (el.tagName === 'SELECT' && el.showPicker) { try { el.showPicker(); } catch (e) {} }
        }, 40);
      }
    }

    function advanceFrom(curEl) {
      const steps = visibleSteps();
      const idx = steps.findIndex(s => s === curEl || s.contains(curEl));
      if (idx >= 0 && idx + 1 < steps.length) focusStep(steps[idx + 1]);
      else { clearStepHi(); if (onFinal) onFinal(); }
    }

    const syncHints = () => {
      const steps = visibleSteps();
      steps.forEach((s, i) => {
        if (s.tagName === 'INPUT' || s.tagName === 'TEXTAREA') {
          s.setAttribute('enterkeyhint', i === steps.length - 1 ? 'done' : 'next');
        }
      });
    };
    syncHints();

    root.addEventListener('focusin', e => {
      const grp = e.target.closest('[data-choice-group]');
      clearStepHi();
      if (grp) (grp.closest('.step-box') || grp).classList.add('step-active');
    });

    root.addEventListener('keydown', e => {
      if (e.isComposing || e.keyCode === 229) return;
      const grp = e.target.closest('[data-choice-group]');
      if (grp && ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) {
        const btns = [...grp.querySelectorAll('button')];
        if (!btns.length) return;
        e.preventDefault();
        let idx = btns.indexOf(document.activeElement);
        if (idx < 0) idx = btns.findIndex(b => b.classList.contains('on'));
        const dir = (e.key === 'ArrowRight' || e.key === 'ArrowDown') ? 1 : -1;
        const next = btns[(idx + dir + btns.length) % btns.length];
        if (next) { next.click(); next.focus({ preventScroll: true }); }
        return;
      }
      if (e.key !== 'Enter' || e.shiftKey) return;
      const t = e.target;
      if (t.id === 'fSent') return; // 문장 분석칸은 자체 엔터 처리
      if (t.tagName === 'BUTTON' && !grp) return; // 일반 버튼(저장/취소)은 기본 클릭 유지
      const steps = visibleSteps();
      const hit = steps.find(s => s === t || s.contains(t));
      if (!hit) return;
      e.preventDefault();
      syncHints();
      advanceFrom(hit);
    });

    return { focusStep, syncHints };
  }

  let S = load();
  let cur = new Date(); cur.setDate(1);
  let selDay = Parser.ymd(new Date());
  let tab = 'calendar';
  let query = '';

  function load() {
    try { const d = JSON.parse(localStorage.getItem(KEY)); if (d) return d; } catch (e) {}
    return { txs: [], cards: [], settings: { salary: 0, budget: 0 } };
  }
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.dataset.theme = t; else delete document.documentElement.dataset.theme;
  }
  applyTheme();
  S.customCats ||= []; S.keywords ||= {}; S.recurring ||= []; S.recurringSkips ||= [];
  let AUTH = loadAuth();
  function loadAuth() {
    try { return JSON.parse(localStorage.getItem(AUTH_KEY)) || {}; } catch (e) { return {}; }
  }
  const saveAuth = () => localStorage.setItem(AUTH_KEY, JSON.stringify(AUTH));
  const getServerUrl = () => (AUTH.serverUrl || DEFAULT_SERVER_URL || '').replace(/\/+$/, '');
  async function apiFetch(path, opts = {}) {
    const base = getServerUrl();
    if (!base) throw new Error('서버 주소가 설정되지 않았어요');
    const headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (AUTH.token) headers.Authorization = 'Bearer ' + AUTH.token;
    const res = await fetch(base + path, Object.assign({}, opts, { headers }));
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `서버 오류 (${res.status})`);
    return data;
  }
  let syncTimer = null;
  function scheduleSync() {
    if (!AUTH.token || !getServerUrl()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => apiFetch('/api/data', { method: 'PUT', body: JSON.stringify({ data: S }) }).catch(() => {}), 500);
  }
  const save = () => { localStorage.setItem(KEY, JSON.stringify(S)); scheduleSync(); };
  const mKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const curKey = () => mKey(cur);
  const prevKey = () => { const d = new Date(cur); d.setMonth(d.getMonth() - 1); return mKey(d); };
  const monthTxs = k => S.txs.filter(t => t.date.startsWith(k));
  const cardOf = id => S.cards.find(c => c.id === id);
  function toast(msg, ms = 2600) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); if (ms > 0) toast.h = setTimeout(() => t.classList.add('hidden'), ms); }

  // ---------- 카드 혜택 계산 ----------
  function rateOf(card, cat) {
    if (card.rules && card.rules[cat] != null) return card.rules[cat];
    return card.defaultRate || 0;
  }
  function parseRules(str) {
    const rules = {}; let def = 0;
    (str || '').split(/[,\n]/).forEach(p => {
      const m = p.split(/[:=]/); if (m.length < 2) return;
      const k = m[0].trim(), v = parseFloat(m[1]);
      if (isNaN(v)) return;
      if (/기본|전체|default/.test(k)) def = v; else rules[k] = v;
    });
    return { rules, def };
  }
  const rulesToStr = c => ['기본:' + (c.defaultRate || 0), ...Object.entries(c.rules || {}).map(([k, v]) => k + ':' + v)].join(', ');

  function cardStats(key, pKey) {
    const out = {};
    S.cards.forEach(c => {
      const spend = monthTxs(key).filter(t => t.type === 'expense' && t.cardId === c.id).reduce((a, t) => a + t.amount, 0);
      const prev = monthTxs(pKey).filter(t => t.type === 'expense' && t.cardId === c.id).reduce((a, t) => a + t.amount, 0);
      let pts = monthTxs(key).filter(t => t.type === 'expense' && t.cardId === c.id).reduce((a, t) => a + t.amount * rateOf(c, t.category) / 100, 0);
      const eligible = !c.minSpend || prev >= c.minSpend;
      if (c.cap && pts > c.cap) pts = c.cap;
      out[c.id] = { spend, prev, pts, eligible };
    });
    return out;
  }

  // ---------- 매달 고정비 자동 생성 엔진 ----------
  function resolveRecurringDay(r) {
    if (r.dayMode === 'cardPayDay') {
      const c = cardOf(r.cardId);
      if (c && c.payDay >= 1 && c.payDay <= 28) return c.payDay;
    }
    return Math.min(31, Math.max(1, +r.day || 1));
  }
  function recurringDayLabel(r) {
    if (r.dayMode === 'cardPayDay') {
      const c = cardOf(r.cardId);
      if (c && c.payDay >= 1 && c.payDay <= 28) return `카드결제일(매월 ${c.payDay}일)`;
      return `카드결제일(미설정→매월 ${r.day || 1}일)`;
    }
    return (+r.day >= 31) ? '매월 말일' : `매월 ${r.day || 1}일`;
  }
  function ensureRecurringForMonth(ym) {
    if (!S.recurring || !S.recurring.length) return false;
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    let changed = false;
    for (const r of S.recurring) {
      if (r.active === false) continue;
      if (r.startMonth && ym < r.startMonth) continue;
      const skipKey = r.id + ':' + ym;
      if ((S.recurringSkips || []).includes(skipKey)) continue;
      if (S.txs.some(t => t.recurringId === r.id && t.recurringMonth === ym)) continue;
      const day = Math.min(lastDay, resolveRecurringDay(r));
      const date = `${ym}-${String(day).padStart(2, '0')}`;
      S.txs.push({
        id: uid(), type: r.type || 'expense', amount: r.amount, date,
        category: r.category, memo: r.memo, cardId: r.cardId || null,
        payment: r.cardId ? 'card' : (r.payment || 'none'),
        recurringId: r.id, recurringMonth: ym
      });
      changed = true;
    }
    return changed;
  }
  function ensureRecurringAhead() {
    let changed = false;
    const base = nowKST();
    for (let i = 0; i <= 3; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      if (ensureRecurringForMonth(mKey(d))) changed = true;
    }
    if (ensureRecurringForMonth(curKey())) changed = true;
    if (changed) save();
  }

  // ---------- 렌더 ----------
  function render() {
    S.customCats ||= []; S.keywords ||= {}; S.recurring ||= []; S.recurringSkips ||= []; refreshCats();
    ensureRecurringAhead();
    const ab = $('#authBtn');
    if (ab) {
      ab.textContent = AUTH.user ? '👤 ' + AUTH.user.username : '로그인';
      ab.classList.toggle('on', !!AUTH.user);
    }
    $('#monthTitle').textContent = cur.getFullYear() + '년 ' + (cur.getMonth() + 1) + '월';
    const txs = monthTxs(curKey());
    const inc = txs.filter(t => t.type === 'income').reduce((a, t) => a + t.amount, 0);
    const exp = txs.filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0);
    $('#summary').innerHTML = `<div><small>수입</small><b class="inc">${won(inc)}</b></div><div><small>지출</small><b class="exp">${won(exp)}</b></div><div><small>합계</small><b>${won(inc - exp)}</b></div>`;
    document.querySelectorAll('.tab').forEach(e => e.classList.toggle('active', e.id === 'tab-' + tab));
    document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.tab === tab));
    ({ calendar: renderCalendar, list: renderList, stats: renderStats, cards: renderCards, settings: renderSettings })[tab]();
  }

  function txRow(t) {
    const c = cardOf(t.cardId);
    const pay = c ? (c.emoji || '💳') + (c.nickname || c.name) : (t.payment === 'cash' ? '💵현금' : '');
    const feeTxt = t.interestFee > 0 ? ` · 이자 ${won(t.interestFee)} 포함` : '';
    return `<div class="tx" data-id="${t.id}"><div class="ic">${ICON[t.category] || '💸'}</div>
      <div class="mid"><div>${t.recurringId ? '<span class="badge" style="margin-left:0;margin-right:4px">🔁고정</span>' : ''}${esc(t.memo || t.category)}</div><small>${t.category}${pay ? ' · ' + esc(pay) : ''}${feeTxt}${t.date ? ' · ' + t.date.slice(5) : ''}</small></div>
      <div class="amt ${t.type === 'income' ? 'inc' : 'exp'}">${t.type === 'income' ? '+' : '-'}${won(t.amount)}</div></div>`;
  }
  function bindTx(root) { root.querySelectorAll('.tx').forEach(e => e.onclick = () => openForm(S.txs.find(t => t.id === e.dataset.id))); }

  function renderCalendar() {
    const el = $('#tab-calendar');
    const y = cur.getFullYear(), m = cur.getMonth();
    const first = new Date(y, m, 1).getDay(), days = new Date(y, m + 1, 0).getDate();
    const todayS = Parser.ymd(new Date());
    const byDay = {};
    monthTxs(curKey()).forEach(t => { (byDay[t.date] ||= { i: 0, e: 0 })[t.type === 'income' ? 'i' : 'e'] += t.amount; });
    let h = '<div class="cal">' + '일월화수목금토'.split('').map(d => `<div class="dow">${d}</div>`).join('');
    for (let i = 0; i < first; i++) h += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const ds = `${curKey()}-${String(d).padStart(2, '0')}`, w = (first + d - 1) % 7, b = byDay[ds];
      h += `<div class="day ${ds === todayS ? 'today' : ''} ${ds === selDay ? 'sel' : ''} ${w === 0 ? 'sun' : w === 6 ? 'sat' : ''}" data-d="${ds}"><div class="n">${d}</div>${b?.i ? `<div class="i">+${b.i.toLocaleString()}</div>` : ''}${b?.e ? `<div class="e">-${b.e.toLocaleString()}</div>` : ''}</div>`;
    }
    h += '</div>';
    const list = S.txs.filter(t => t.date === selDay);
    h += `<div class="box" style="margin-top:12px"><h3>${selDay} 내역</h3>${list.length ? list.map(txRow).join('') : '<div class="empty">내역이 없어요</div>'}</div>`;
    el.innerHTML = h;
    el.querySelectorAll('.day').forEach(e => e.onclick = () => { selDay = e.dataset.d; renderCalendar(); });
    bindTx(el);
  }

  function renderList() {
    const el = $('#tab-list');
    // 검색창을 DOM에 고정 유지해야 한글 IME 조합(자모 결합)이 끊기지 않음
    if (!$('#q', el)) {
      el.innerHTML = `<input id="q" enterkeyhint="search" placeholder="🔍 검색 (메모/카테고리)" value="${esc(query)}"><div id="qResults"></div>`;
      const qEl = $('#q', el);
      qEl.oninput = e => { query = e.target.value; renderListRows(); };
      qEl.onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); qEl.blur(); } };
    }
    renderListRows();
  }
  function renderListRows() {
    const box = $('#qResults');
    if (!box) return;
    let txs = monthTxs(curKey()).sort((a, b) => b.date.localeCompare(a.date));
    const q = query.trim().toLowerCase();
    if (q) txs = txs.filter(t => (t.memo + ' ' + t.category).toLowerCase().includes(q));
    let h = '';
    if (!txs.length) h = '<div class="empty">내역이 없어요</div>';
    let last = '';
    for (const t of txs) {
      if (t.date !== last) {
        last = t.date;
        const day = S.txs.filter(x => x.date === t.date);
        h += `<div class="dayhdr"><span>${t.date.slice(5)} (${'일월화수목금토'[new Date(t.date).getDay()]})</span><span>-${won(day.filter(x => x.type === 'expense').reduce((a, x) => a + x.amount, 0))}</span></div>`;
      }
      h += `<div class="box" style="padding:0 12px;margin-bottom:4px">${txRow(t)}</div>`;
    }
    box.innerHTML = h;
    bindTx(box);
  }

  function renderStats() {
    const el = $('#tab-stats');
    const txs = monthTxs(curKey()).filter(t => t.type === 'expense');
    const total = txs.reduce((a, t) => a + t.amount, 0);
    const by = {}; txs.forEach(t => by[t.category] = (by[t.category] || 0) + t.amount);
    const arr = Object.entries(by).sort((a, b) => b[1] - a[1]);
    const bud = +S.settings.budget || 0;
    let h = '';
    if (bud) { const p = Math.min(100, total / bud * 100);
      h += `<div class="box"><h3>이번 달 예산</h3><div class="bar ${total > bud ? 'over' : ''}"><i style="width:${p}%"></i></div>
      <p class="muted">${won(total)} / ${won(bud)} (${Math.round(total / bud * 100)}%) · ${total > bud ? '<b class="exp">' + won(total - bud) + ' 초과</b>' : '남은 예산 ' + won(bud - total)}</p></div>`; }
    const ct = S.settings.chartType === 'bar' ? 'bar' : 'donut';
    h += `<div class="box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">카테고리별 지출</h3>
      <div class="seg mini" id="chartSeg"><button data-ct="donut" class="${ct === 'donut' ? 'on i' : ''}">원형</button><button data-ct="bar" class="${ct === 'bar' ? 'on i' : ''}">막대</button></div></div>`;
    if (!arr.length) h += '<div class="empty">지출이 없어요</div>';
    else if (ct === 'bar') h += arr.map(([k, v]) => `<div class="row"><span class="l">${ICON[k] || ''} ${k}</span><div class="bar"><i style="width:${v / arr[0][1] * 100}%"></i></div><span class="r">${won(v)}<br><small class="muted">${Math.round(v / total * 100)}%</small></span></div>`).join('');
    else h += donut(arr, total);
    h += '</div>';
    // 최근 6개월 추이
    const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(cur); d.setMonth(d.getMonth() - i); months.push(mKey(d)); }
    const vals = months.map(k => monthTxs(k).filter(t => t.type === 'expense').reduce((a, t) => a + t.amount, 0)); const mx = Math.max(...vals, 1);
    h += `<div class="box"><h3>최근 6개월 지출</h3>${months.map((k, i) => `<div class="row"><span class="l">${k.slice(2)}</span><div class="bar"><i style="width:${vals[i] / mx * 100}%"></i></div><span class="r">${won(vals[i])}</span></div>`).join('')}</div>`;
    el.innerHTML = h;
    $('#chartSeg').onclick = e => { const b = e.target.closest('[data-ct]'); if (!b) return; S.settings.chartType = b.dataset.ct; save(); renderStats(); };
    el.querySelectorAll('.lg').forEach(x => x.onmouseenter = x.onclick = () => {
      const k = x.dataset.k; const v = by[k];
      el.querySelector('#dcLabel').textContent = k; el.querySelector('#dcVal').textContent = won(v);
      el.querySelectorAll('.seg-arc').forEach(a => a.classList.toggle('dim', a.dataset.k !== k));
    });
  }

  const PALETTE = ['#f0627f', '#ffa45c', '#ffd15c', '#6fcf97', '#56ccf2', '#9b8cff', '#ff8fd0', '#4fd1c5', '#c0a080', '#a0aec0', '#e07a5f'];
  // 반투명 도넛 차트 (SVG)
  function donut(arr, total) {
    const R = 70, C = 2 * Math.PI * R; let off = 0;
    const arcs = arr.map(([k, v], i) => {
      const len = v / total * C, col = PALETTE[i % PALETTE.length];
      const s = `<circle class="seg-arc" data-k="${k}" r="${R}" cx="90" cy="90" fill="none" stroke="${col}" stroke-width="26" stroke-opacity=".78"
        stroke-dasharray="${Math.max(len - 2, 0)} ${C - Math.max(len - 2, 0)}" stroke-dashoffset="${-off}" transform="rotate(-90 90 90)"/>`;
      off += len; return s;
    }).join('');
    const legend = arr.map(([k, v], i) => `<div class="lg" data-k="${k}"><i style="background:${PALETTE[i % PALETTE.length]}"></i><span>${ICON[k] || ''} ${k}</span><b>${Math.round(v / total * 100)}%</b><small>${won(v)}</small></div>`).join('');
    return `<div class="donut"><svg viewBox="0 0 180 180"><circle r="${R}" cx="90" cy="90" fill="none" stroke="var(--surface2)" stroke-width="26"/>${arcs}
      <text x="90" y="84" text-anchor="middle" class="dc-l" id="dcLabel">총 지출</text><text x="90" y="104" text-anchor="middle" class="dc-v" id="dcVal">${won(total)}</text></svg>
      <div class="legend">${legend}</div></div>`;
  }

  function renderCards() {
    const el = $('#tab-cards');
    const st = cardStats(curKey(), prevKey());
    let h = '<div class="box"><h3>💳 내 카드</h3>';
    if (!S.cards.length) h += '<div class="empty">카드를 등록하면 포인트/절약 분석을 볼 수 있어요</div>';
    S.cards.forEach(c => {
      const s = st[c.id];
      h += `<div class="tx" data-card="${c.id}"><div class="avatar" style="background:${c.color || '#ffd6e0'}">${c.emoji || (c.kind === 'check' ? '🏧' : '💳')}</div><div class="mid">
        <div><b>${esc(c.nickname || c.name)}</b>${c.isDefault ? '<span class="badge">⭐ 기본</span>' : ''}<span class="badge">${esc(c.company || '')} ${esc(c.name)}</span><span class="badge">${c.kind === 'check' ? '체크' : '신용'}</span></div>
        <small>사용 ${won(s.spend)} · 예상 적립/할인 <b class="inc">${won(s.pts)}</b>${c.cap ? ' (한도 ' + won(c.cap) + ')' : ''}</small>
        ${c.minSpend ? `<br><small style="color:${s.eligible ? 'var(--inc)' : 'var(--exp)'}">전월실적 ${won(s.prev)} / ${won(c.minSpend)} ${s.eligible ? '✔ 충족' : '✖ 미충족 (혜택 못 받을 수 있어요)'}</small>` : ''}
      </div></div>`;
    });
    h += '<div class="btns"><button class="btn" id="addCard">+ 카드 추가</button></div></div>';

    // 절약 분석
    const txs = monthTxs(curKey()).filter(t => t.type === 'expense');
    const totalPts = Object.values(st).reduce((a, s) => a + s.pts, 0);
    h += `<div class="box"><h3>💡 절약 분석</h3>`;
    if (S.cards.length) {
      h += `<div class="tip good">이번 달 카드로 받은 예상 포인트/할인: <b>${won(totalPts)}</b></div>`;
      const byCat = {};
      txs.forEach(t => {
        const used = cardOf(t.cardId);
        const usedRate = used ? rateOf(used, t.category) : 0;
        let best = null;
        S.cards.forEach(c => { const r = rateOf(c, t.category); if (!best || r > best.r) best = { c, r }; });
        if (best && best.r > usedRate) {
          const o = byCat[t.category] ||= { gain: 0, spend: 0, best, usedRate: 0, n: 0 };
          o.gain += t.amount * (best.r - usedRate) / 100; o.spend += t.amount; o.n++;
        }
      });
      const recs = Object.entries(byCat).sort((a, b) => b[1].gain - a[1].gain);
      let totalGain = 0;
      recs.forEach(([cat, o]) => {
        totalGain += o.gain;
        h += `<div class="tip"><b>${ICON[cat] || ''} ${cat}</b> ${won(o.spend)} 사용 → <b>${esc(o.best.c.nickname || o.best.c.name)}</b> (${o.best.r}%)로 결제했다면 <b>${won(o.gain)}</b> 더 절약!</div>`;
      });
      if (recs.length) h += `<div class="tip">총 <b>${won(totalGain)}</b>을 더 아낄 수 있었어요.</div>`;
      else if (txs.length) h += '<div class="tip good">카드를 잘 활용하고 있어요! 더 유리한 카드가 없어요 👍</div>';
      const cashSpend = txs.filter(t => !t.cardId).reduce((a, t) => a + t.amount, 0);
      if (cashSpend) h += `<div class="tip">카드 없이(현금/미지정) 쓴 금액 ${won(cashSpend)} — 카드로 결제하면 포인트를 받을 수 있어요.</div>`;
      // 카테고리별 최고 카드 표
      h += '<h3 style="margin-top:12px">카테고리별 추천 카드</h3>';
      EXP_CATS.filter(c => c !== '기타지출').forEach(cat => {
        let best = null; S.cards.forEach(c => { const r = rateOf(c, cat); if (!best || r > best.r) best = { c, r }; });
        if (best && best.r > 0) h += `<div class="row"><span class="l">${ICON[cat]} ${cat}</span><span style="flex:1">${esc(best.c.nickname || best.c.name)}</span><span class="r inc">${best.r}%</span></div>`;
      });
    } else h += '<div class="empty">카드를 등록해 주세요</div>';
    h += '</div>';
    el.innerHTML = h;
    $('#addCard').onclick = () => openCardForm();
    el.querySelectorAll('[data-card]').forEach(e => e.onclick = () => openCardForm(cardOf(e.dataset.card)));
  }

  function catChip(c) {
    const n = (S.keywords[c] || []).length;
    return `<button class="chip" data-cat="${esc(c)}">${ICON[c] || '🏷️'} ${esc(c)}${n ? ` <span class="badge" style="margin:0 0 0 4px">${n}</span>` : ''}</button>`;
  }
  // 카테고리 추가/수정 + 자동 분류 단어 등록
  function openCatForm(name) {
    const custom = (S.customCats || []).find(c => c.name === name);
    const isNew = !name;
    const builtin = !isNew && !custom;
    const kw = (S.keywords[name] || []).join(', ');
    const type = custom ? custom.type : (BUILTIN_INC.includes(name) ? 'income' : 'expense');
    const quickEmojis = ['⛪', '☕', '🐶', '🏋️', '🎮', '👶', '🚗', '💼', '🏦', '💝', '🍺', '✈️'];
    openModal(`<h3 style="margin-top:0">${isNew ? '🏷️ 새 카테고리' : esc(name) + ' 설정'}</h3>
      ${builtin ? '' : `<label>이름</label><input id="kName" value="${esc(name || '')}" placeholder="예: 헌금">
        <label>이모지</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><input id="kEmoji" value="${esc(custom ? custom.emoji : '⛪')}" maxlength="4" style="width:76px;font-size:22px;text-align:center"><div class="chips" id="kEmojiPick" style="margin:0">${quickEmojis.map(em => `<button type="button" class="chip em" tabindex="-1">${em}</button>`).join('')}</div></div>
        <div class="step-box"><label>종류</label><div class="seg" id="kType" data-choice-group><button type="button" data-t="expense" class="e ${type === 'expense' ? 'on' : ''}">지출</button><button type="button" data-t="income" class="i ${type === 'income' ? 'on' : ''}">수입</button></div></div>`}
      <label>이 단어가 들어가면 자동으로 ${builtin ? esc(name) : '이 카테고리'}로 분류 (쉼표로 구분)</label>
      <textarea id="kWords" rows="3" placeholder="예: 교회, 헌금, 십일조, 감사헌금">${esc(kw)}</textarea>
      <p class="muted">내가 등록한 단어는 기본 분류보다 우선해요. 엔터키로 다음 항목으로 넘어가요.</p>
      <div class="btns">${custom ? '<button class="btn red" id="kDel">삭제</button>' : ''}<button class="btn gray" id="kCancel">취소</button><button class="btn" id="kSave">저장</button></div>`);
    let t = type;
    if (!builtin) {
      $('#kType').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; t = b.dataset.t; document.querySelectorAll('#kType button').forEach(x => x.classList.toggle('on', x === b)); };
      $('#kEmojiPick').onclick = e => { const b = e.target.closest('button'); if (b) $('#kEmoji').value = b.textContent; };
    }
    $('#kCancel').onclick = closeModal;
    if (custom) $('#kDel').onclick = () => {
      if (!confirm('카테고리를 삭제할까요? 기존 내역은 기타로 옮겨져요.')) return;
      S.txs.forEach(x => { if (x.category === name) x.category = x.type === 'income' ? '기타수입' : '기타지출'; });
      S.customCats = S.customCats.filter(c => c.name !== name); delete S.keywords[name]; save(); closeModal(); render();
    };
    $('#kSave').onclick = () => {
      const words = $('#kWords').value.split(/[,\n]/).map(s => s.trim()).filter(Boolean);
      let finalName = name;
      if (!builtin) {
        finalName = $('#kName').value.trim();
        if (!finalName) return toast('이름을 입력해 주세요');
        if (finalName !== name && [...BUILTIN_EXP, ...BUILTIN_INC, ...S.customCats.map(c => c.name)].includes(finalName)) return toast('이미 있는 이름이에요');
        const emoji = $('#kEmoji').value.trim() || '🏷️';
        if (custom) {
          if (finalName !== name) { S.txs.forEach(x => { if (x.category === name) x.category = finalName; }); delete S.keywords[name]; }
          Object.assign(custom, { name: finalName, emoji, type: t });
        } else S.customCats.push({ name: finalName, emoji, type: t });
      }
      if (words.length) S.keywords[finalName] = words; else delete S.keywords[finalName];
      save(); closeModal(); render(); toast('저장했어요');
    };
    bindEnterFlow($('#modalBox'), () => builtin ? [$('#kWords')] : [$('#kName'), $('#kEmoji'), $('#kType'), $('#kWords')], () => $('#kSave').click());
    setTimeout(() => (builtin ? $('#kWords') : $('#kName'))?.focus(), 60);
  }

  function renderSettings() {
    const el = $('#tab-settings');
    const srv = getServerUrl();
    const recTotal = (S.recurring || []).filter(r => r.active !== false && r.type !== 'income').reduce((a, r) => a + (+r.amount || 0), 0);
    const recListHtml = (S.recurring && S.recurring.length)
      ? S.recurring.map(r => {
          const c = cardOf(r.cardId);
          const pay = c ? `${c.emoji || '💳'}${esc(c.nickname || c.name)}` : (r.payment === 'cash' ? '💵현금' : '');
          return `<div class="tx" data-rec="${r.id}" style="${r.active === false ? 'opacity:.5' : ''}">
            <div class="ic">${ICON[r.category] || '🔁'}</div>
            <div class="mid"><div>${esc(r.memo || r.category)}${r.active === false ? '<span class="badge">일시중지</span>' : ''}</div>
              <small>${recurringDayLabel(r)}${pay ? ' · ' + pay : ''} · ${esc(r.category)}</small></div>
            <div class="amt ${r.type === 'income' ? 'inc' : 'exp'}">${r.type === 'income' ? '+' : '-'}${won(r.amount)}</div>
          </div>`;
        }).join('')
      : '<div class="empty">등록된 고정비가 없어요 · 예: "매달 보험비 96800원 지출있어"</div>';

    el.innerHTML = `<div class="box"><h3>👤 계정 · 서버 동기화</h3>
      <p class="muted" style="margin:0 0 8px">${AUTH.user ? `<b>${esc(AUTH.user.username)}</b>님으로 로그인 중 (자동 동기화)` : '로그인하면 휴대폰·PC 어디서나 내역이 동기화되고, API 키 없이 AI 영수증 인식을 쓸 수 있어요.'}</p>
      <div class="btns" style="margin-top:8px"><button class="btn" id="openAuth">${AUTH.user ? '계정 관리 / 동기화' : '로그인 · 회원가입'}</button></div></div>
    <div class="box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
        <h3 style="margin:0">🔁 매달 고정비 ${recTotal ? `<small class="muted" style="font-weight:500">(월 ${won(recTotal)})</small>` : ''}</h3>
        <button class="chip" id="addRec">+ 고정비 추가</button></div>
      <p class="muted" style="margin:0 0 8px">OTT·보험·월세 등 매달 나가는 돈을 등록하면 매월 지정일(또는 카드 결제일)에 달력에 미리 자동 기록돼요.</p>
      ${recListHtml}</div>
    <div class="box"><h3>화면 모드</h3><div class="seg" id="themeSeg">
      <button data-th="auto" class="${!S.settings.theme || S.settings.theme === 'auto' ? 'on i' : ''}">자동</button>
      <button data-th="light" class="${S.settings.theme === 'light' ? 'on i' : ''}">라이트</button>
      <button data-th="dark" class="${S.settings.theme === 'dark' ? 'on i' : ''}">다크</button></div>
      <p class="muted" style="margin:8px 0 0">자동은 휴대폰의 다크/라이트 설정을 따라가요.</p></div>
    <div class="box" id="sBasicBox"><h3>기본 정보</h3>
      <label>월급 (음성으로 "월급 들어왔어" 라고 하면 자동 입력돼요)</label><div class="amt-box"><input id="sSalary" type="text" inputmode="numeric" value="${fmtMoney(S.settings.salary)}" placeholder="0"><span class="unit">원</span></div>
      <label>월 예산</label><div class="amt-box"><input id="sBudget" type="text" inputmode="numeric" value="${fmtMoney(S.settings.budget)}" placeholder="0"><span class="unit">원</span></div>
      <label>🤖 AI 영수증 분석 키 (Gemini API Key · 선택)</label><input id="sGemini" type="password" value="${esc(S.settings.geminiKey || '')}" placeholder="앱 버전은 내장 오프라인 AI가 자동 동작해요">
      <p class="muted" style="margin:6px 0 0"><a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent)">Google AI Studio에서 무료 API 키 발급</a> · 웹 브라우저에서 AI 분석을 쓸 때만 필요해요</p>
      <div class="btns"><button class="btn" id="sSave">저장</button></div></div>
    <div class="box"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px"><h3 style="margin:0">카테고리 · 자동 분류 단어</h3><button class="chip" id="addCat">+ 새 카테고리</button></div>
      <p class="muted" style="margin:0 0 8px">카테고리를 눌러 단어를 등록하세요. 예: 교회·헌금·십일조 → ⛪ 헌금</p>
      <div class="muted" style="margin:8px 0 4px">지출</div><div class="chips">${EXP_CATS.map(catChip).join('')}</div>
      <div class="muted" style="margin:12px 0 4px">수입</div><div class="chips">${INC_CATS.map(catChip).join('')}</div></div>
    <div class="box"><h3>데이터</h3><div class="btns">
      <button class="btn gray" id="exJson">백업(JSON)</button><button class="btn gray" id="exCsv">CSV 내보내기</button><button class="btn gray" id="imJson">불러오기</button></div>
      <div class="btns"><button class="btn red" id="reset">전체 삭제</button></div>
      <input type="file" id="file" accept=".json" style="display:none"></div>
    <div class="box"><h3>🎤 음성 입력 예시</h3><p class="muted">"쿠팡에서 오늘 삼성이로 삼만원짜리 충전기 샀어"<br>"어제 롯데로 점심 만이천원"<br>"월급 들어왔어" (설정한 월급 자동 입력)<br>"용돈 오만원 받았어"<br>카드 별명은 [카드혜택] 탭에서 등록하세요.</p></div>`;
    $('#openAuth').onclick = openAuthModal;
    $('#addRec').onclick = () => openForm(null, { isRecurring: true, recurringDayMode: S.cards.some(c => c.isDefault && c.payDay) ? 'cardPayDay' : 'custom', recurringDay: 1 });
    el.querySelectorAll('[data-rec]').forEach(x => x.onclick = () => {
      const r = (S.recurring || []).find(item => item.id === x.dataset.rec);
      if (r) openRecurringForm(r);
    });
    $('#addCat').onclick = () => openCatForm();
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => openCatForm(b.dataset.cat));
    $('#themeSeg').onclick = e => { const b = e.target.closest('[data-th]'); if (!b) return; S.settings.theme = b.dataset.th; applyTheme(); save(); renderSettings(); };
    bindMoneyInput($('#sSalary'));
    bindMoneyInput($('#sBudget'));
    $('#sSave').onclick = () => { S.settings.salary = moneyVal($('#sSalary')); S.settings.budget = moneyVal($('#sBudget')); S.settings.geminiKey = $('#sGemini').value.trim(); save(); toast('저장됐어요'); render(); };
    bindEnterFlow($('#sBasicBox'), () => [$('#sSalary'), $('#sBudget'), $('#sGemini')], () => $('#sSave').click());
    $('#exJson').onclick = () => download('가계부백업.json', JSON.stringify(S, null, 2), 'application/json');
    $('#exCsv').onclick = () => download('가계부.csv', '\ufeff날짜,구분,카테고리,금액,결제수단,메모\n' + S.txs.map(t => [t.date, t.type === 'income' ? '수입' : '지출', t.category, t.amount, cardOf(t.cardId)?.name || (t.payment === 'cash' ? '현금' : ''), '"' + (t.memo || '').replace(/"/g, '""') + '"'].join(',')).join('\n'), 'text/csv');
    $('#imJson').onclick = () => $('#file').click();
    $('#file').onchange = e => { const f = e.target.files[0]; if (!f) return; f.text().then(x => { try { const d = JSON.parse(x); if (!d.txs) throw 0; S = d; save(); render(); toast('불러왔어요'); } catch (err) { toast('올바른 파일이 아니에요'); } }); };
    $('#reset').onclick = () => { if (confirm('모든 데이터를 삭제할까요?')) { S = { txs: [], cards: [], settings: { salary: 0, budget: 0 } }; save(); render(); } };
  }
  function download(name, text, type) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click(); }

  // ---------- 모달 ----------
  const closeModal = () => $('#modal').classList.add('hidden');
  const openModal = html => { $('#modalBox').innerHTML = html; $('#modal').classList.remove('hidden'); };
  $('#modal').onclick = e => { if (e.target.id === 'modal') closeModal(); };

  // 날짜에 n개월 더하기 (말일 보정)
  function addMonths(ymdStr, n) {
    const [y, m, d] = ymdStr.split('-').map(Number);
    const dt = new Date(y, m - 1 + n, 1);
    const last = new Date(dt.getFullYear(), dt.getMonth() + 1, 0).getDate();
    dt.setDate(Math.min(d, last));
    return Parser.ymd(dt);
  }
  // 거래일 + 카드 결제일 → 첫 청구일 계산
  function firstPayDate(txDate, payDay) {
    if (!payDay || payDay < 1 || payDay > 28) return txDate;
    const [y, m, d] = txDate.split('-').map(Number);
    const dt = new Date(y, m - 1 + (d >= payDay ? 1 : 0), payDay);
    return Parser.ymd(dt);
  }
  // 한국 카드사 표준 할부 상환 스케줄 (원금균등 + 미결제 잔액 기준 체감 수수료, 부분무이자 지원)
  function calcInstallmentSchedule(amt, n, mode, annualRate, freeMonths) {
    const months = Math.max(1, +n || 1);
    const base = Math.floor(amt / months), rem = amt - base * months;
    const rate = (mode === 'free') ? 0 : (Math.max(0, +annualRate || 0) / 100);
    const fm = mode === 'partial' ? Math.max(0, Math.min(months - 1, +freeMonths || 0)) : 0;
    let remaining = amt, totalFee = 0;
    const items = [];
    for (let i = 0; i < months; i++) {
      const principal = i === 0 ? base + rem : base;
      const isFreeTurn = mode === 'free' || (mode === 'partial' && i < fm);
      const fee = isFreeTurn ? 0 : Math.round(remaining * rate / 12);
      remaining -= principal;
      totalFee += fee;
      items.push({ turn: i + 1, principal, fee, total: principal + fee });
    }
    return { items, totalFee, totalPay: amt + totalFee };
  }

  function openForm(t, preset) {
    const isNew = !t;
    t = t || Object.assign({ id: uid(), type: 'expense', amount: '', date: selDay, category: '식비', memo: '', installment: 1, interestFree: true, cardId: (S.cards.find(c => c.isDefault) || {}).id || null, payment: S.cards.some(c => c.isDefault) ? 'card' : 'none' }, preset || {});
    const instOpts = [1, 2, 3, 6, 10, 12, 24];
    const initInst = t.installment || 1;
    if (!instOpts.includes(initInst)) instOpts.push(initInst);
    instOpts.sort((a, b) => a - b);
    const recentMemos = [...new Set(S.txs.slice().reverse().map(x => (x.memo || '').replace(/^\[\d+\/\d+\]\s*/, '').trim()).filter(m => m && !EXP_CATS.includes(m) && !INC_CATS.includes(m)))].slice(0, 6);

    openModal(`<h3 style="margin-top:0">${isNew ? '내역 추가' : '내역 수정'}</h3>
      ${isNew ? `<div style="display:flex;gap:6px;margin-bottom:8px">
          <button type="button" class="btn gray" id="fPhoto" style="flex:1;padding:10px">📷 영수증 사진</button>
          <button type="button" class="btn gray" id="fVoice" style="flex:1;padding:10px">🎤 음성 채우기</button>
        </div>
        <div style="display:flex;gap:6px"><input id="fSent" enterkeyhint="go" placeholder="💬 한 줄 입력 (예: 어제 삼성이로 점심 만이천원)"><button type="button" class="btn" id="fParse" style="white-space:nowrap">분석</button></div>` : ''}
      <div class="seg" id="fTypeSeg" style="margin-top:12px"><button type="button" class="e" data-t="expense">지출</button><button type="button" class="i" data-t="income">수입</button></div>

      <label>금액 ${isNew ? '<span class="muted">(엔터 누르면 다음 칸으로 이동)</span>' : ''}</label>
      <div class="amt-box"><input id="fAmt" type="text" inputmode="numeric" autocomplete="off" placeholder="0" value="${fmtMoney(t.amount)}"><span class="unit">원</span></div>
      <div class="chips" id="fQuickAmt">${[['+1천', 1000], ['+5천', 5000], ['+1만', 10000], ['+5만', 50000], ['+10만', 100000], ['초기화', 0]].map(([lb, v]) => `<button type="button" class="chip" data-add="${v}" tabindex="-1">${lb}</button>`).join('')}</div>

      <label>내용 (메모)</label>
      <input id="fMemo" placeholder="예: 스타벅스, 쿠팡 충전기 (입력 시 카테고리 자동 추천)" value="${esc(t.memo)}">
      ${isNew && recentMemos.length ? `<div class="chips" id="fRecentMemo">${recentMemos.map(m => `<button type="button" class="chip" tabindex="-1">${esc(m)}</button>`).join('')}</div>` : ''}

      <div class="step-box"><label>카테고리</label><div class="chips" id="fCatChips" data-choice-group></div></div>

      <div class="step-box" id="payStep"><label>결제수단</label><div class="chips" id="fPayChips" data-choice-group></div></div>

      <label>날짜</label>
      <div style="display:flex;gap:6px;align-items:center">
        <input id="fDate" type="date" value="${t.date}" style="flex:1">
        <button type="button" class="chip dquick" data-off="0" tabindex="-1">오늘</button>
        <button type="button" class="chip dquick" data-off="-1" tabindex="-1">어제</button>
        <button type="button" class="chip dquick" data-off="-2" tabindex="-1">그제</button>
      </div>

      ${isNew ? `<div class="step-box" style="margin-top:12px">
        <label style="display:flex;align-items:center;gap:8px;margin:0;color:var(--txt);font-size:14px">
          <input type="checkbox" id="fRec" style="width:auto" ${t.isRecurring ? 'checked' : ''}> 🔁 매달 고정비로 자동 등록 (달력에 미리 기록)
        </label>
        <div id="recDetail" style="display:none;margin-top:10px;padding:10px;border-radius:12px;background:var(--surface2)">
          <div class="seg mini" id="recModeSeg" style="margin-bottom:8px">
            <button type="button" data-rm="custom" class="${t.recurringDayMode !== 'cardPayDay' ? 'on i' : ''}">날짜 직접 지정</button>
            <button type="button" data-rm="cardPayDay" class="${t.recurringDayMode === 'cardPayDay' ? 'on i' : ''}">카드 결제일</button>
          </div>
          <div id="recDayBox">
            <label style="margin-top:0">매월 몇 일 (31 입력 시 말일)</label>
            <input id="fRecDay" type="number" inputmode="numeric" min="1" max="31" value="${t.recurringDay || +t.date.slice(8) || 1}">
          </div>
          <div id="recPayHint" class="note" style="display:none;margin-top:4px"></div>
        </div>
      </div>` : ''}
      ${isNew ? `<div id="instWrap" class="step-box">
        <label>할부</label>
        <div class="chips" id="fInstChips" data-choice-group>${instOpts.map(n => `<button type="button" class="chip ${n === initInst ? 'on' : ''}" data-inst="${n}">${n === 1 ? '일시불' : n + '개월'}</button>`).join('')}</div>
        <div id="instDetail" style="display:none;margin-top:8px;padding:10px;border-radius:12px;background:var(--surface2)">
          <div class="seg mini" id="fInstMode" style="margin-bottom:8px">
            <button type="button" data-im="free" class="i">무이자</button>
            <button type="button" data-im="paid" class="i">유이자</button>
            <button type="button" data-im="partial" class="i">부분무이자</button>
          </div>
          <div id="fRateBox" style="display:none">
            <label style="margin-top:0">연 할부 수수료율 (%) · 카드사 평균 12~19.9%</label>
            <input id="fRate" type="number" step="0.1" value="${t.interestRate || 14.5}">
            <div class="chips" id="fRateChips" style="margin-top:6px">${[10, 12, 14.5, 16.9, 19.9].map(r => `<button type="button" class="chip" data-r="${r}" tabindex="-1">${r}%</button>`).join('')}</div>
          </div>
          <div id="fPartialBox" style="display:none;margin-top:8px">
            <label style="margin-top:0">앞 몇 개월(회차) 이자 면제?</label>
            <div class="chips" id="fFreeMChips">${[2, 3, 4, 5, 6].map(m => `<button type="button" class="chip" data-fm="${m}" tabindex="-1">1~${m}회차 면제</button>`).join('')}</div>
          </div>
          <label>첫 결제일 (카드 결제일 기준, 수정 가능)</label><input id="fFirstPay" type="date" value="${firstPayDate(t.date, (cardOf(t.cardId) || {}).payDay)}">
          <div id="instPreview" class="note"></div>
        </div>
      </div>` : ''}
      <div class="btns">${isNew ? '' : '<button type="button" class="btn red" id="fDel">삭제</button>'}<button type="button" class="btn gray" id="fCancel">취소</button><button type="button" class="btn" id="fSave">저장</button></div>`);

    let type = t.type;
    let selCat = t.category || (type === 'income' ? '급여' : '식비');
    let selPay = t.cardId ? t.cardId : (t.payment === 'cash' ? 'cash' : 'none');
    let selInst = initInst;
    let instMode = t.interestMode || (t.interestFree === false ? 'paid' : 'free');
    let freeMonths = t.freeMonths || 3;
    let catTouched = !isNew || !!(preset && preset.category);

    const renderCatChips = () => {
      const cats = type === 'income' ? INC_CATS : EXP_CATS;
      if (!cats.includes(selCat)) selCat = cats[0];
      $('#fCatChips').innerHTML = cats.map(c => `<button type="button" class="chip ${c === selCat ? 'on' : ''}" data-c="${esc(c)}">${ICON[c] || '🏷️'} ${esc(c)}</button>`).join('');
    };
    const renderPayChips = () => {
      const opts = [
        ...S.cards.map(c => ({ v: c.id, lb: `${c.emoji || '💳'} ${esc(c.nickname || c.name)}` })),
        { v: 'cash', lb: '💵 현금' },
        { v: 'none', lb: '선택 안 함' }
      ];
      if (!opts.some(o => o.v === selPay)) selPay = 'none';
      $('#fPayChips').innerHTML = opts.map(o => `<button type="button" class="chip ${o.v === selPay ? 'on' : ''}" data-p="${esc(o.v)}">${o.lb}</button>`).join('');
    };
    const fill = () => {
      document.querySelectorAll('#fTypeSeg button').forEach(b => {
        b.classList.toggle('on', b.dataset.t === type);
        b.classList.toggle(b.dataset.t === 'income' ? 'i' : 'e', true);
      });
      renderCatChips();
      renderPayChips();
      $('#payStep').style.display = type === 'expense' ? 'block' : 'none';
      if (isNew) $('#instWrap').style.display = type === 'expense' ? 'block' : 'none';
    };
    fill();

    const updateInst = (recalcDate) => {
      if (!isNew) return;
      const n = selInst || 1;
      $('#instDetail').style.display = (type === 'expense' && n > 1) ? 'block' : 'none';
      if (n <= 1) return;
      document.querySelectorAll('#fInstMode button').forEach(b => b.classList.toggle('on', b.dataset.im === instMode));
      $('#fRateBox').style.display = instMode === 'free' ? 'none' : 'block';
      $('#fPartialBox').style.display = instMode === 'partial' ? 'block' : 'none';
      if (instMode === 'partial') {
        if (freeMonths >= n) freeMonths = Math.max(1, Math.floor(n / 2));
        document.querySelectorAll('#fFreeMChips button').forEach(b => {
          const fm = +b.dataset.fm;
          b.style.display = fm < n ? '' : 'none';
          b.classList.toggle('on', fm === freeMonths);
        });
      }
      if (recalcDate) {
        const c = cardOf(selPay);
        $('#fFirstPay').value = firstPayDate($('#fDate').value, c && c.payDay);
      }
      const amt = moneyVal($('#fAmt'));
      const rate = instMode === 'free' ? 0 : (+$('#fRate').value || 0);
      const fp = $('#fFirstPay').value || $('#fDate').value;
      if (!(amt > 0)) {
        $('#instPreview').textContent = '금액을 입력하면 월 납입금과 할부이자가 계산돼요';
        return;
      }
      const sch = calcInstallmentSchedule(amt, n, instMode, rate, freeMonths);
      if (instMode === 'free') {
        $('#instPreview').innerHTML = `월 <b>${won(sch.items[0].total)}</b> × ${n}개월 (무이자 · 총 ${won(amt)}) · ${fp.slice(5)}부터 매월 기록`;
      } else {
        const first = sch.items[0].total, last = sch.items[sch.items.length - 1].total;
        const partTxt = instMode === 'partial' ? `1~${freeMonths}회차 면제 · ` : '';
        $('#instPreview').innerHTML = `💡 ${partTxt}총 할부이자 <b class="exp">+${won(sch.totalFee)}</b> (원금+이자 총 <b>${won(sch.totalPay)}</b>)<br>1회차 ${won(first)} → ${n}회차 ${won(last)} (잔액 기준 체감 · ${fp.slice(5)}부터 기록)`;
      }
    };

    bindMoneyInput($('#fAmt'), () => updateInst(false));
    $('#fQuickAmt').onclick = e => {
      const b = e.target.closest('[data-add]'); if (!b) return;
      const v = +b.dataset.add;
      $('#fAmt').value = v === 0 ? '' : fmtMoney(moneyVal($('#fAmt')) + v);
      updateInst(false);
      $('#fAmt').focus();
    };
    $('#fMemo').oninput = () => {
      if (catTouched) return;
      const g = Parser.inferCategory($('#fMemo').value, S.keywords, type);
      if (g && g !== selCat) { selCat = g; renderCatChips(); }
    };
    if ($('#fRecentMemo')) {
      $('#fRecentMemo').onclick = e => {
        const b = e.target.closest('button'); if (!b) return;
        $('#fMemo').value = b.textContent;
        const g = Parser.inferCategory(b.textContent, S.keywords, type);
        if (g) { selCat = g; renderCatChips(); }
        $('#fMemo').focus();
      };
    }
    $('#fCatChips').onclick = e => {
      const b = e.target.closest('[data-c]'); if (!b) return;
      selCat = b.dataset.c; catTouched = true; renderCatChips();
    };
    $('#fPayChips').onclick = e => {
      const b = e.target.closest('[data-p]'); if (!b) return;
      selPay = b.dataset.p; renderPayChips(); updateInst(true);
    };
    $('#modalBox').querySelectorAll('.dquick').forEach(b => b.onclick = () => {
      const d = nowKST(); d.setDate(d.getDate() + (+b.dataset.off));
      $('#fDate').value = Parser.ymd(d);
      updateInst(true);
    });

    if (isNew) {
      let recMode = t.recurringDayMode === 'cardPayDay' ? 'cardPayDay' : 'custom';
      const syncRecUI = () => {
        const on = $('#fRec').checked;
        $('#recDetail').style.display = on ? 'block' : 'none';
        if (!on) return;
        document.querySelectorAll('#recModeSeg button').forEach(b => b.classList.toggle('on', b.dataset.rm === recMode));
        const c = cardOf(selPay);
        const hasPayDay = !!(c && c.payDay >= 1 && c.payDay <= 28);
        $('#recDayBox').style.display = (recMode === 'custom' || !hasPayDay) ? 'block' : 'none';
        const hint = $('#recPayHint');
        if (recMode === 'cardPayDay') {
          hint.style.display = 'block';
          hint.textContent = hasPayDay
            ? `💳 ${c.nickname || c.name} 결제일(매월 ${c.payDay}일)에 자동 기록돼요`
            : '⚠️ 선택한 카드의 결제일이 설정되지 않았어요. 아래 날짜를 쓰거나 [카드] 탭에서 결제일을 입력해 주세요.';
        } else {
          hint.style.display = 'none';
        }
      };
      syncRecUI();
      $('#fRec').onchange = syncRecUI;
      $('#recModeSeg').onclick = e => {
        const b = e.target.closest('[data-rm]'); if (!b) return;
        recMode = b.dataset.rm; syncRecUI();
      };
      $('#fPayChips').addEventListener('click', () => setTimeout(syncRecUI, 0));
      updateInst(false);
      $('#fPhoto').onclick = () => { closeModal(); $('#receiptFile').click(); };
      $('#fVoice').onclick = () => {
        closeModal();
        startVoiceSession(text => {
          const list = Parser.parseTransactions(text, { cards: S.cards, salary: S.settings.salary, now: nowKST(), defaultCardId: (S.cards.find(c => c.isDefault) || {}).id, keywords: S.keywords, incomeCats: incomeCatNames() });
          if (list.length >= 2) openBatchForm(list, '🎤 음성 다건 자동 분리');
          else openForm(null, list[0]);
        });
      };
      $('#fInstChips').onclick = e => {
        const b = e.target.closest('[data-inst]'); if (!b) return;
        selInst = +b.dataset.inst;
        document.querySelectorAll('#fInstChips button').forEach(x => x.classList.toggle('on', x === b));
        updateInst(true);
        flow.syncHints();
      };
      $('#fInstMode').onclick = e => {
        const b = e.target.closest('[data-im]'); if (!b) return;
        instMode = b.dataset.im; updateInst(false); flow.syncHints();
      };
      $('#fRateChips').onclick = e => {
        const b = e.target.closest('[data-r]'); if (!b) return;
        $('#fRate').value = b.dataset.r; updateInst(false);
      };
      $('#fFreeMChips').onclick = e => {
        const b = e.target.closest('[data-fm]'); if (!b) return;
        freeMonths = +b.dataset.fm; updateInst(false);
      };
      $('#fRate').oninput = () => updateInst(false);
      $('#fDate').onchange = () => updateInst(true);
      $('#fFirstPay').onchange = () => updateInst(false);
      const runSentenceParse = () => {
        const val = $('#fSent').value.trim();
        if (!val) return toast('문장을 입력해 주세요');
        const list = Parser.parseTransactions(val, { cards: S.cards, salary: S.settings.salary, now: nowKST(), defaultCardId: (S.cards.find(c => c.isDefault) || {}).id, keywords: S.keywords, incomeCats: incomeCatNames() });
        closeModal();
        if (list.length >= 2) openBatchForm(list, '💬 한 문장에서 ' + list.length + '건을 분리했어요');
        else openForm(null, list[0]);
      };
      $('#fParse').onclick = runSentenceParse;
      $('#fSent').onkeydown = e => { if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); runSentenceParse(); } };
    }

    document.querySelectorAll('#fTypeSeg button').forEach(b => b.onclick = () => {
      type = b.dataset.t; selCat = type === 'income' ? '급여' : '식비'; catTouched = false;
      fill(); if (flow) flow.syncHints();
    });
    $('#fCancel').onclick = closeModal;
    if (!isNew) $('#fDel').onclick = () => {
      if (t.recurringId && t.recurringMonth) {
        S.recurringSkips ||= [];
        const sk = t.recurringId + ':' + t.recurringMonth;
        if (!S.recurringSkips.includes(sk)) S.recurringSkips.push(sk);
      }
      if (t.installmentGroup) {
        const cnt = S.txs.filter(x => x.installmentGroup === t.installmentGroup).length;
        if (cnt > 1 && confirm(`같은 할부 내역이 ${cnt}건 있어요.\n확인: ${cnt}건 모두 삭제 / 취소: 이 회차만 삭제`)) {
          S.txs = S.txs.filter(x => x.installmentGroup !== t.installmentGroup);
        } else S.txs = S.txs.filter(x => x.id !== t.id);
      } else S.txs = S.txs.filter(x => x.id !== t.id);
      save(); closeModal(); render();
    };
    $('#fSave').onclick = () => {
      const amt = moneyVal($('#fAmt')); if (!(amt > 0)) { $('#fAmt').focus(); return toast('금액을 입력해 주세요'); }
      const cardId = cardOf(selPay) ? selPay : null, payment = cardId ? 'card' : selPay;
      const isRec = isNew && $('#fRec') && $('#fRec').checked;
      if (isRec) {
        const rm = document.querySelector('#recModeSeg .on')?.dataset.rm || 'custom';
        const rDay = Math.min(31, Math.max(1, +$('#fRecDay').value || 1));
        const startMonth = ($('#fDate').value || selDay).slice(0, 7);
        const rec = {
          id: uid(), type, amount: amt, memo: $('#fMemo').value.trim() || selCat,
          category: selCat, cardId, payment, dayMode: rm, day: rDay, active: true, startMonth
        };
        S.recurring ||= [];
        S.recurring.push(rec);
        ensureRecurringAhead();
        save(); selDay = `${startMonth}-${String(Math.min(28, resolveRecurringDay(rec))).padStart(2, '0')}`;
        const d = new Date(selDay); cur = new Date(d.getFullYear(), d.getMonth(), 1);
        closeModal(); render();
        return toast(`🔁 매달 고정비로 등록됐어요 (${recurringDayLabel(rec)})`);
      }
      const n = (isNew && type === 'expense') ? (selInst || 1) : 1;
      if (n > 1) {
        const rate = instMode === 'free' ? 0 : (+$('#fRate').value || 0);
        const sch = calcInstallmentSchedule(amt, n, instMode, rate, freeMonths);
        const fp = $('#fFirstPay').value || $('#fDate').value;
        const gid = uid(), memo = $('#fMemo').value.trim() || selCat;
        sch.items.forEach((it, i) => {
          S.txs.push({
            id: uid(), type: 'expense', amount: it.total,
            principal: it.principal, interestFee: it.fee,
            date: addMonths(fp, i), category: selCat,
            memo: `[${i + 1}/${n}] ${memo}`, cardId, payment,
            installmentGroup: gid, installmentInfo: `${i + 1}/${n}`
          });
        });
        save(); selDay = fp; const d = new Date(fp); cur = new Date(d.getFullYear(), d.getMonth(), 1);
        closeModal(); render();
        toast(sch.totalFee > 0 ? `${n}개월 할부 등록 완료 (총 이자 +${won(sch.totalFee)})` : `${n}개월 무이자 할부(${won(sch.items[0].total)}/월)로 등록됐어요`);
      } else {
        Object.assign(t, { type, amount: amt, date: $('#fDate').value, category: selCat, memo: $('#fMemo').value.trim() || selCat, cardId, payment });
        if (isNew) S.txs.push(t);
        save(); selDay = t.date; const d = new Date(t.date); cur = new Date(d.getFullYear(), d.getMonth(), 1);
        closeModal(); render(); toast('저장됐어요');
      }
    };

    const flow = bindEnterFlow($('#modalBox'), () => [
      $('#fAmt'),
      $('#fMemo'),
      $('#fCatChips'),
      type === 'expense' ? $('#fPayChips') : null,
      $('#fDate'),
      (isNew && type === 'expense') ? $('#fInstChips') : null,
      (isNew && type === 'expense' && selInst > 1 && instMode !== 'free') ? $('#fRate') : null,
      (isNew && type === 'expense' && selInst > 1) ? $('#fFirstPay') : null
    ], () => $('#fSave').click());

    if (isNew) {
      setTimeout(() => {
        if (!t.amount) $('#fAmt')?.focus();
        else if (!t.memo) $('#fMemo')?.focus();
      }, 60);
    }
  }

  function openRecurringForm(r) {
    const payOpts = [
      ...S.cards.map(c => ({ v: c.id, lb: `${c.emoji || '💳'} ${c.nickname || c.name}` })),
      { v: 'cash', lb: '💵 현금' },
      { v: 'none', lb: '선택 안 함' }
    ];
    let rm = r.dayMode === 'cardPayDay' ? 'cardPayDay' : 'custom';
    const cats = r.type === 'income' ? INC_CATS : EXP_CATS;
    openModal(`<h3 style="margin-top:0">🔁 고정비 수정</h3>
      <label>내용 (메모)</label><input id="rMemo" value="${esc(r.memo)}">
      <label>금액</label><div class="amt-box"><input id="rAmt" type="text" inputmode="numeric" value="${fmtMoney(r.amount)}"><span class="unit">원</span></div>
      <label>카테고리</label><select id="rCat">${cats.map(c => `<option ${c === r.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
      <label>결제수단</label><select id="rPay">${payOpts.map(o => `<option value="${esc(o.v)}" ${(r.cardId ? r.cardId : (r.payment || 'none')) === o.v ? 'selected' : ''}>${esc(o.lb)}</option>`).join('')}</select>
      <label>매달 기록 날짜</label>
      <div class="seg mini" id="rModeSeg" style="margin-bottom:8px">
        <button type="button" data-rm="custom" class="${rm === 'custom' ? 'on i' : ''}">날짜 직접 지정</button>
        <button type="button" data-rm="cardPayDay" class="${rm === 'cardPayDay' ? 'on i' : ''}">카드 결제일</button>
      </div>
      <div id="rDayWrap"><input id="rDay" type="number" inputmode="numeric" min="1" max="31" value="${r.day || 1}" placeholder="1~31 (31=말일)"></div>
      <div id="rPayHint" class="note" style="display:none;margin-top:4px"></div>
      <label style="display:flex;align-items:center;gap:8px;margin-top:14px;color:var(--txt);font-size:14px">
        <input type="checkbox" id="rActive" style="width:auto" ${r.active !== false ? 'checked' : ''}> 자동 등록 활성화
      </label>
      <div class="btns"><button type="button" class="btn red" id="rDel">삭제</button><button type="button" class="btn gray" id="rCancel">취소</button><button type="button" class="btn" id="rSave">저장</button></div>`);
    bindMoneyInput($('#rAmt'));
    const syncR = () => {
      document.querySelectorAll('#rModeSeg button').forEach(b => b.classList.toggle('on', b.dataset.rm === rm));
      const c = cardOf($('#rPay').value);
      const hasPay = !!(c && c.payDay >= 1 && c.payDay <= 28);
      $('#rDayWrap').style.display = (rm === 'custom' || !hasPay) ? 'block' : 'none';
      const hint = $('#rPayHint');
      if (rm === 'cardPayDay') {
        hint.style.display = 'block';
        hint.textContent = hasPay ? `💳 ${c.nickname || c.name} 결제일(매월 ${c.payDay}일)에 기록돼요` : '⚠️ 카드 결제일이 없어 아래 날짜를 사용해요';
      } else hint.style.display = 'none';
    };
    syncR();
    $('#rModeSeg').onclick = e => { const b = e.target.closest('[data-rm]'); if (!b) return; rm = b.dataset.rm; syncR(); };
    $('#rPay').onchange = syncR;
    $('#rCancel').onclick = closeModal;
    $('#rDel').onclick = () => {
      const curYm = mKey(nowKST());
      S.recurring = S.recurring.filter(x => x.id !== r.id);
      if (confirm('이미 달력에 미리 생성된 이번 달·다음 달 고정비 내역도 함께 지울까요?')) {
        S.txs = S.txs.filter(t => !(t.recurringId === r.id && (t.recurringMonth || '') >= curYm));
      }
      save(); closeModal(); render(); toast('고정비를 삭제했어요');
    };
    $('#rSave').onclick = () => {
      const amt = moneyVal($('#rAmt')); if (!(amt > 0)) return toast('금액을 입력해 주세요');
      const pay = $('#rPay').value;
      const cardId = cardOf(pay) ? pay : null;
      Object.assign(r, {
        memo: $('#rMemo').value.trim() || $('#rCat').value,
        amount: amt,
        category: $('#rCat').value,
        cardId,
        payment: cardId ? 'card' : pay,
        dayMode: rm,
        day: Math.min(31, Math.max(1, +$('#rDay').value || 1)),
        active: $('#rActive').checked
      });
      // 이번 달 이후 미리 생성된 내역도 새 설정으로 갱신
      const curYm = mKey(nowKST());
      S.txs = S.txs.filter(t => !(t.recurringId === r.id && (t.recurringMonth || '') >= curYm));
      ensureRecurringAhead();
      save(); closeModal(); render(); toast('고정비가 수정됐어요 ✨');
    };
  }

  function openCardForm(c) {
    const isNew = !c;
    const DB = window.CARD_DB;
    c = c || { id: uid(), company: '', name: '', nickname: '', emoji: DB.emojis[Math.floor(Math.random() * DB.emojis.length)], color: DB.colors[Math.floor(Math.random() * DB.colors.length)], kind: 'credit', defaultRate: 0.5, rules: {}, minSpend: 0, cap: 0 };
    let selKind = c.kind || 'credit';
    openModal(`<h3 style="margin-top:0">${isNew ? '🐣 새 카드 등록' : '✏️ 카드 수정'}</h3>
      <div class="box" style="background:var(--surface2);box-shadow:none">
        <b>✨ 카드사/카드 고르면 혜택이 자동으로 채워져요</b>
        <label>카드사</label><select id="cCompany"><option value="">선택</option>${DB.companies.map(x => `<option ${x === c.company ? 'selected' : ''}>${x}</option>`).join('')}</select>
        <label>카드 종류</label><select id="cPreset"><option value="">직접 입력</option></select>
        <div id="cNote" class="note" style="display:none"></div>
        <div style="margin-top:6px"><a id="cSearch" href="#" target="_blank" class="muted">🔍 목록에 없다면 웹에서 혜택 검색하기</a></div>
      </div>
      <label>카드 이름</label><input id="cName" value="${esc(c.name)}" placeholder="예: iD ON 카드">
      <label>별명 🎤 (음성으로 부를 이름)</label><input id="cNick" value="${esc(c.nickname)}" placeholder="예: 콩이, 삼성이">
      <div class="chips" id="cNickChips">${DB.nicknames.map(n => `<button type="button" class="chip" tabindex="-1">${n}</button>`).join('')}</div>
      <div class="step-box"><label>캐릭터</label><div class="chips" id="cEmoji" data-choice-group>${DB.emojis.map(e => `<button type="button" class="chip em ${e === c.emoji ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div></div>
      <div class="step-box"><label>카드 색상</label><div class="chips" id="cColor" data-choice-group>${DB.colors.map(x => `<button type="button" class="sw ${x === c.color ? 'on' : ''}" data-c="${x}" style="background:${x}"></button>`).join('')}</div></div>
      <div class="step-box"><label>종류</label><div class="seg" id="cKindSeg" data-choice-group><button type="button" data-k="credit" class="i ${selKind === 'credit' ? 'on' : ''}">신용카드</button><button type="button" data-k="check" class="i ${selKind === 'check' ? 'on' : ''}">체크카드</button></div></div>
      <label>혜택 (적립/할인율 %, 카테고리별)</label><textarea id="cRules" rows="3" placeholder="기본:0.5, 식비:5, 교통:10, 쇼핑:3">${esc(rulesToStr(c))}</textarea>
      <label>전월실적 조건 (없으면 0)</label><div class="amt-box"><input id="cMin" type="text" inputmode="numeric" value="${fmtMoney(c.minSpend)}" placeholder="0"><span class="unit">원</span></div>
      <label>월 적립/할인 한도 (없으면 0)</label><div class="amt-box"><input id="cCap" type="text" inputmode="numeric" value="${fmtMoney(c.cap)}" placeholder="0"><span class="unit">원</span></div>
      <label>카드 결제일 (매월 1~28일, 할부 시 이 날짜에 자동 기록 · 없으면 0)</label><input id="cPayDay" type="number" inputmode="numeric" min="0" max="28" value="${c.payDay || 0}">
      <label style="display:flex;align-items:center;gap:8px;margin-top:16px;color:var(--txt);font-size:14px"><input type="checkbox" id="cDef" style="width:auto" ${c.isDefault ? 'checked' : ''}> ⭐ 기본 카드로 설정 (카드를 말하지 않으면 이 카드로 결제한 걸로 기록)</label>
      <div class="btns">${isNew ? '' : '<button type="button" class="btn red" id="cDel">삭제</button>'}<button type="button" class="btn gray" id="cCancel">취소</button><button type="button" class="btn" id="cSave">저장</button></div>`);
    $('#cCancel').onclick = closeModal;
    bindMoneyInput($('#cMin'));
    bindMoneyInput($('#cCap'));
    const setKindUI = k => {
      selKind = k;
      document.querySelectorAll('#cKindSeg button').forEach(b => b.classList.toggle('on', b.dataset.k === selKind));
    };
    $('#cKindSeg').onclick = e => { const b = e.target.closest('[data-k]'); if (b) setKindUI(b.dataset.k); };
    const refreshPresets = () => {
      const co = $('#cCompany').value;
      $('#cPreset').innerHTML = '<option value="">직접 입력</option>' + DB.cards.map((p, i) => [p, i]).filter(([p]) => !co || p.company === co).map(([p, i]) => `<option value="${i}">${p.kind === 'check' ? '🏧' : '💳'} ${p.name}</option>`).join('');
      const q = encodeURIComponent((co || '') + ' ' + ($('#cName').value || '') + ' 혜택 전월실적');
      $('#cSearch').href = 'https://www.google.com/search?q=' + q;
    };
    refreshPresets();
    $('#cCompany').onchange = refreshPresets;
    $('#cName').oninput = refreshPresets;
    $('#cPreset').onchange = () => {
      const p = DB.cards[$('#cPreset').value]; if (!p) { $('#cNote').style.display = 'none'; return; }
      $('#cName').value = p.name; setKindUI(p.kind); $('#cCompany').value = p.company;
      $('#cRules').value = rulesToStr(p); $('#cMin').value = fmtMoney(p.minSpend); $('#cCap').value = fmtMoney(p.cap);
      $('#cNote').style.display = 'block'; $('#cNote').textContent = '📌 ' + p.note + ' (참고용 · ' + DB.checked + ' 기준, 정확한 조건은 카드사에서 확인!)';
      if (!$('#cNick').value) $('#cNick').value = p.company.replace(/카드|뱅크/g, '') + '이';
      toast('혜택을 불러왔어요 ✨');
      $('#cNick').focus();
    };
    $('#cNickChips').onclick = e => { if (e.target.classList.contains('chip')) { $('#cNick').value = e.target.textContent; $('#cNick').focus(); } };
    $('#cEmoji').onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; c.emoji = b.dataset.e; document.querySelectorAll('#cEmoji .chip').forEach(x => x.classList.toggle('on', x === b)); };
    $('#cColor').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; c.color = b.dataset.c; document.querySelectorAll('#cColor .sw').forEach(x => x.classList.toggle('on', x === b)); };
    if (!isNew) $('#cDel').onclick = () => { if (confirm('카드를 삭제할까요? (기존 내역은 유지)')) { S.cards = S.cards.filter(x => x.id !== c.id); S.txs.forEach(t => { if (t.cardId === c.id) { t.cardId = null; t.payment = 'none'; } }); save(); closeModal(); render(); } };
    $('#cSave').onclick = () => {
      if (!$('#cName').value.trim()) { $('#cName').focus(); return toast('카드 이름을 입력해 주세요'); }
      const { rules, def } = parseRules($('#cRules').value);
      Object.assign(c, { company: $('#cCompany').value, name: $('#cName').value.trim(), nickname: $('#cNick').value.trim(), kind: selKind, rules, defaultRate: def, minSpend: moneyVal($('#cMin')), cap: moneyVal($('#cCap')), payDay: Math.min(28, Math.max(0, +$('#cPayDay').value || 0)) });
      if (isNew) S.cards.push(c);
      c.isDefault = $('#cDef').checked;
      if (c.isDefault) S.cards.forEach(x => { if (x.id !== c.id) x.isDefault = false; });
      else if (S.cards.length === 1) c.isDefault = true;
      save(); closeModal(); render();
    };
    bindEnterFlow($('#modalBox'), () => [$('#cCompany'), $('#cPreset'), $('#cName'), $('#cNick'), $('#cEmoji'), $('#cColor'), $('#cKindSeg'), $('#cRules'), $('#cMin'), $('#cCap'), $('#cPayDay')], () => $('#cSave').click());
  }

  // ---------- 음성 (앱 네이티브 SpeechRecognizer 우선 + 웹 SpeechRecognition + 실시간 시트) ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let activeVoice = null;

  function nowKST() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); }

  function startVoiceSession(onComplete) {
    if (activeVoice) { activeVoice.finish(true); return; }
    const nativeSpeech = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.NativeSpeech;
    const sheet = $('#voiceSheet');
    sheet.innerHTML = `<div class="vsheet">
      <div class="vhead">
        <span class="vwave" id="vWave"><i></i><i></i><i></i></span>
        <span id="vStatus" style="flex:1;font-size:13px;font-weight:600">듣고 있어요 · 편하게 끊어서 말씀하세요</span>
        <button type="button" class="chip" id="vCancel">취소</button>
      </div>
      <input id="vInput" enterkeyhint="done" placeholder="예: 어제 삼성이로 쿠팡 충전기 삼만원 샀어">
      <div class="vtimer"><i id="vBar"></i></div>
      <div class="vprev" id="vPrev">💬 말씀하시면 금액·날짜·카테고리·카드가 실시간으로 분석돼요</div>
      <div class="btns" style="margin-top:10px">
        <button type="button" class="btn gray" id="vEdit">상세 수정</button>
        <button type="button" class="btn" id="vCommit">바로 등록 ↵</button>
      </div>
    </div>`;
    sheet.classList.remove('hidden');
    $('#micBtn').classList.add('rec');

    let finalText = '', interim = '', done = false, manualMode = false;
    let countdownId = null, animId = null;
    let webRec = null;

    const currentText = () => $('#vInput') ? $('#vInput').value.trim() : (finalText + ' ' + interim).trim();
    const parseCurrentList = txt => Parser.parseTransactions(txt, {
      cards: S.cards, salary: S.settings.salary, now: nowKST(),
      defaultCardId: (S.cards.find(c => c.isDefault) || {}).id,
      keywords: S.keywords, incomeCats: incomeCatNames()
    });

    function fmtItemLine(p) {
      const c = cardOf(p.cardId);
      const cardStr = c ? `${c.emoji || '💳'}${esc(c.nickname || c.name)}` : (p.payment === 'cash' ? '💵현금' : '');
      const recStr = p.isRecurring ? ` · <b>🔁매달(${p.recurringDayMode === 'cardPayDay' ? '카드결제일' : ((p.recurringDay >= 31 ? '말일' : p.recurringDay + '일'))})</b>` : '';
      let instStr = '';
      if (p.installment > 1) {
        if (p.interestMode && p.interestMode !== 'free') {
          const sch = calcInstallmentSchedule(p.amount, p.installment, p.interestMode, p.interestRate || 14.5, p.freeMonths || 3);
          instStr = ` · <b>${p.installment}개월(${p.interestMode === 'partial' ? `1~${p.freeMonths}회무이자·` : `연${p.interestRate || 14.5}%·`}이자+${won(sch.totalFee)})</b>`;
        } else {
          instStr = ` · <b>${p.installment}개월무이자</b>`;
        }
      }
      return `<b>${p.date.slice(5)}</b> · ${ICON[p.category] || '🏷️'} <b>${esc(p.category)}</b>${cardStr ? ' · ' + cardStr : ''}${recStr}${instStr} · <b class="${p.type === 'income' ? 'inc' : 'exp'}">${p.type === 'income' ? '+' : '-'}${won(p.amount)}</b> · "${esc(p.memo)}"`;
    }

    function updatePreview(txt) {
      const el = $('#vPrev'); if (!el) return;
      if (!txt) {
        el.innerHTML = '💬 예: "떡볶이 만원 현금으로 먹고 카페 오천원 썼어" (여러 건도 자동 분리!)';
        return;
      }
      const list = parseCurrentList(txt);
      const valid = list.filter(x => x.ok);
      if (valid.length >= 2) {
        el.innerHTML = `✅ <b>${valid.length}건 자동 분리!</b><br>` + valid.map((p, i) => `${i + 1}. ${fmtItemLine(p)}`).join('<br>');
      } else if (valid.length === 1) {
        el.innerHTML = `✅ ` + fmtItemLine(valid[0]);
      } else {
        el.innerHTML = `👂 인식 중: "${esc(txt)}" <span class="muted">(금액을 말씀해 주세요)</span>`;
      }
    }

    function stopTimer() {
      clearTimeout(countdownId); cancelAnimationFrame(animId);
      const bar = $('#vBar'); if (bar) bar.style.width = '0%';
    }

    function armAutoFinish(ms) {
      if (manualMode || done) return;
      stopTimer();
      const start = performance.now();
      const tick = now => {
        if (done || manualMode) return;
        const pct = Math.min(100, ((now - start) / ms) * 100);
        const bar = $('#vBar'); if (bar) bar.style.width = pct + '%';
        if (pct < 100) animId = requestAnimationFrame(tick);
      };
      animId = requestAnimationFrame(tick);
      countdownId = setTimeout(() => finish(true), ms);
    }

    function stopEngines() {
      if (webRec) { try { webRec.stop(); } catch (e) {} webRec = null; }
      if (nativeSpeech) {
        nativeSpeech.stop().catch(() => {});
        if (nativeSpeech.removeAllListeners) nativeSpeech.removeAllListeners().catch(() => {});
      }
    }

    function finish(commit) {
      if (done) return;
      done = true;
      stopTimer();
      stopEngines();
      const text = currentText();
      sheet.classList.add('hidden');
      $('#micBtn').classList.remove('rec');
      activeVoice = null;
      if (!commit) return;
      if (!text) return toast('잘 못 들었어요 🐣 다시 눌러서 말씀해 주세요');
      (onComplete || handleVoice)(text);
    }

    activeVoice = { finish };
    sheet.onclick = e => { if (e.target === sheet) finish(false); };
    $('#vCancel').onclick = () => finish(false);
    $('#vCommit').onclick = () => finish(true);
    $('#vEdit').onclick = () => {
      const txt = currentText();
      const list = txt ? parseCurrentList(txt) : [];
      finish(false);
      if (list.length >= 2) openBatchForm(list, '🎤 음성 다건 수정');
      else openForm(null, list[0] || null);
    };
    $('#vInput').onfocus = () => {
      manualMode = true;
      stopTimer();
      stopEngines();
      $('#vWave')?.classList.add('paused');
      const st = $('#vStatus'); if (st) st.textContent = '직접 다듬는 중 · 엔터를 누르면 바로 등록돼요';
    };
    $('#vInput').oninput = e => updatePreview(e.target.value);
    $('#vInput').onkeydown = e => {
      if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); finish(true); }
    };

    const onSpeechUpdate = () => {
      if (done || manualMode) return;
      const txt = (finalText + ' ' + interim).replace(/\s+/g, ' ').trim();
      const inp = $('#vInput'); if (inp) inp.value = txt;
      updatePreview(txt);
      const list = parseCurrentList(txt);
      // 금액까지 인식됐으면 3초 뒤 자동 등록, 아직 금액 말하기 전(뜸 들이는 중)이면 5초 여유!
      armAutoFinish(list.some(x => x.ok) ? 3000 : 5000);
    };

    if (nativeSpeech) {
      nativeSpeech.addListener('partial', ev => { interim = ev.text || ''; onSpeechUpdate(); });
      nativeSpeech.addListener('segment', ev => {
        if (ev.text) finalText = (finalText + ' ' + ev.text).trim();
        interim = '';
        onSpeechUpdate();
      });
      nativeSpeech.addListener('speechError', ev => {
        if (done || manualMode) return;
        const st = $('#vStatus');
        if (st && !currentText()) st.textContent = (ev && ev.message) || '말씀이 들리지 않았어요 · 직접 입력도 가능해요';
      });
      nativeSpeech.start({ lang: 'ko-KR' }).catch(err => {
        const st = $('#vStatus');
        if (st) st.textContent = (err && err.message) || '마이크를 시작할 수 없어요 · 아래 칸에 적어주세요';
        $('#vWave')?.classList.add('paused');
        setTimeout(() => $('#vInput')?.focus(), 60);
      });
      armAutoFinish(12000);
      return;
    }

    if (SR) {
      const r = webRec = new SR();
      r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
      r.onresult = e => {
        interim = '';
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const seg = e.results[i][0].transcript;
          if (e.results[i].isFinal) finalText += ' ' + seg; else interim += seg;
        }
        onSpeechUpdate();
      };
      r.onerror = e => {
        if (e.error === 'no-speech' || e.error === 'aborted') return;
        const st = $('#vStatus');
        if (st) st.textContent = '마이크 오류(' + e.error + ') · 아래 칸에 직접 입력할 수 있어요';
        $('#vWave')?.classList.add('paused');
      };
      r.onend = () => { if (!done && !manualMode && webRec) { try { r.start(); } catch (e) {} } };
      try { r.start(); armAutoFinish(12000); } catch (e) {}
      return;
    }

    // 음성 API 미지원 브라우저: 키보드 음성입력/타이핑으로 바로 유도
    manualMode = true;
    $('#vWave')?.classList.add('paused');
    $('#vStatus').textContent = '자판의 마이크 버튼이나 타이핑 후 엔터를 눌러주세요';
    setTimeout(() => $('#vInput')?.focus(), 60);
  }

  $('#micBtn').onclick = () => startVoiceSession(handleVoice);

  // 음성 결과를 확인창 없이 바로 등록 (한 문장 내 다건 분리 및 할부 분할 모두 지원!)
  function handleVoice(text) {
    const list = Parser.parseTransactions(text, { cards: S.cards, salary: S.settings.salary, now: nowKST(), defaultCardId: (S.cards.find(c => c.isDefault) || {}).id, keywords: S.keywords, incomeCats: incomeCatNames() });
    const valid = list.filter(x => x.ok);
    if (!valid.length) { toast('금액을 못 알아들었어요: ' + text); return openForm(null, list[0]); }

    const addedIds = [], addedGroups = [], addedRecIds = [];
    let lastDate = selDay;

    for (const p of valid) {
      const c = cardOf(p.cardId);
      if (p.isRecurring) {
        const startMonth = mKey(nowKST());
        const rec = {
          id: uid(), type: p.type, amount: p.amount, memo: p.memo,
          category: p.category, cardId: p.cardId, payment: p.payment,
          dayMode: p.recurringDayMode === 'cardPayDay' ? 'cardPayDay' : 'custom',
          day: p.recurringDay || nowKST().getDate(),
          active: true, startMonth
        };
        S.recurring ||= [];
        S.recurring.push(rec);
        addedRecIds.push(rec.id);
        ensureRecurringAhead();
        lastDate = `${startMonth}-${String(Math.min(28, resolveRecurringDay(rec))).padStart(2, '0')}`;
        continue;
      }
      const n = (p.type === 'expense' && p.installment > 1) ? p.installment : 1;
      if (n > 1) {
        const im = p.interestMode || (p.interestFree === false ? 'paid' : 'free');
        const sch = calcInstallmentSchedule(p.amount, n, im, p.interestRate || 14.5, p.freeMonths || 3);
        const fp = firstPayDate(p.date, c && c.payDay);
        const gid = uid();
        sch.items.forEach((it, i) => {
          S.txs.push({
            id: uid(), type: 'expense', amount: it.total,
            principal: it.principal, interestFee: it.fee,
            date: addMonths(fp, i), category: p.category,
            memo: `[${i + 1}/${n}] ${p.memo}`, cardId: p.cardId, payment: p.payment,
            installmentGroup: gid, installmentInfo: `${i + 1}/${n}`
          });
        });
        p._totalFee = sch.totalFee;
        addedGroups.push(gid);
        lastDate = fp;
      } else {
        const tx = { id: uid(), type: p.type, amount: p.amount, date: p.date, category: p.category, memo: p.memo, cardId: p.cardId, payment: p.payment };
        S.txs.push(tx);
        addedIds.push(tx.id);
        lastDate = tx.date;
      }
    }

    save();
    selDay = lastDate; const d = new Date(lastDate); cur = new Date(d.getFullYear(), d.getMonth(), 1);
    render();

    const t = $('#toast');
    if (valid.length === 1) {
      const p = valid[0], c = cardOf(p.cardId), n = (p.type === 'expense' && p.installment > 1) ? p.installment : 1;
      const recTag = p.isRecurring ? ` · 🔁매달(${p.recurringDayMode === 'cardPayDay' && c?.payDay ? `결제일 ${c.payDay}일` : (p.recurringDay >= 31 ? '말일' : (p.recurringDay || nowKST().getDate()) + '일')})` : '';
      const instTag = n > 1 ? ` (${n}개월${p._totalFee > 0 ? ` · 이자+${won(p._totalFee)}` : ' 무이자'})` : '';
      t.innerHTML = `✅ ${p.date.slice(5)} · ${esc(p.memo)} · ${p.category}${recTag}${instTag} · ${p.type === 'income' ? '+' : '-'}${won(p.amount)}${c ? ' · ' + (c.emoji || '💳') + esc(c.nickname || c.name) : (p.payment === 'cash' ? ' · 💵현금' : '')}<br><small>"${esc(text)}"</small> <button id="undoV" class="chip">되돌리기</button>`;
    } else {
      const sum = valid.reduce((a, x) => a + (x.type === 'income' ? x.amount : -x.amount), 0);
      const summaryNames = valid.map(x => `${esc(x.memo)}(${won(x.amount)})`).join(', ');
      t.innerHTML = `✅ <b>${valid.length}건 따로따로 등록 완료!</b> (${sum >= 0 ? '+' : '-'}${won(Math.abs(sum))})<br><small>${summaryNames}</small> <button id="undoV" class="chip">되돌리기</button>`;
    }
    t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 7500);
    $('#undoV').onclick = () => {
      S.txs = S.txs.filter(x => !addedIds.includes(x.id) && (!x.installmentGroup || !addedGroups.includes(x.installmentGroup)) && (!x.recurringId || !addedRecIds.includes(x.recurringId)));
      S.recurring = (S.recurring || []).filter(r => !addedRecIds.includes(r.id));
      save(); t.classList.add('hidden'); render();
    };
  }
  $('#addBtn').onclick = () => openForm();

  // ---------- 영수증 사진 분석 (AI 또는 브라우저 OCR) ----------
  function fileToBase64(file) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result.split(',')[1]);
      fr.onerror = rej;
      fr.readAsDataURL(file);
    });
  }
  function buildReceiptPrompt(today) {
    const cardDesc = S.cards.map(c => `${c.id}:${c.company || ''}/${c.name}/${c.nickname || ''}`).join(', ');
    const kwDesc = Object.entries(S.keywords || {}).map(([k, v]) => `${k}:[${v.join(',')}]`).join(', ');
    return `이미지는 카드 영수증 또는 카드사 앱 이용내역 목록이다. 모든 결제 건을 JSON 배열로 추출하라.
규칙:
- 오늘 날짜는 ${today}. 날짜 형식은 YYYY-MM-DD (예: 26.11.21 -> 2026-11-21).
- memo는 가맹점명 또는 상품명만 깔끔히 적고 아이콘·포인트 적립·날짜구분선('11월 20일 금요일')은 제외.
- amount는 정수(원). 포인트(+39P)는 제외.
- installment는 할부 개월수(일시불이면 1). interestFree는 무이자면 true, 유이자면 false.
- category는 반드시 다음 중 하나: ${EXP_CATS.join(', ')}${kwDesc ? `. 사용자 키워드 우선: ${kwDesc}` : ''}
- cardId는 다음 등록 카드 중 일치하는 id 또는 null: [${cardDesc || '없음'}]
출력 JSON 스키마: [{"date":"YYYY-MM-DD","memo":"string","amount":number,"category":"string","installment":number,"interestFree":boolean,"cardId":string|null}]`;
  }
  function normalizeAiItems(parsed, today) {
    const arr = Array.isArray(parsed) ? parsed : (parsed.items || parsed.transactions || [parsed]);
    if (!Array.isArray(arr) || !arr.length) throw new Error('내역을 찾지 못했어요');
    const defId = (S.cards.find(c => c.isDefault) || {}).id || null;
    return arr.map(x => {
      const cid = (x.cardId && cardOf(x.cardId)) ? x.cardId : defId;
      return {
        type: 'expense',
        amount: Math.round(+x.amount) || 0,
        date: /^\d{4}-\d{2}-\d{2}$/.test(x.date) ? x.date : today,
        category: EXP_CATS.includes(x.category) ? x.category : '기타지출',
        memo: String(x.memo || '카드결제').slice(0, 45),
        installment: Math.max(1, +x.installment || 1),
        interestFree: x.interestFree !== false,
        cardId: cid, payment: cid ? 'card' : 'none', ok: (+x.amount || 0) > 0
      };
    });
  }
  async function analyzeWithServer(file) {
    const b64 = await fileToBase64(file);
    const today = Parser.ymd(nowKST());
    const d = await apiFetch('/api/receipt', {
      method: 'POST',
      body: JSON.stringify({ imageBase64: b64, mimeType: file.type || 'image/jpeg', prompt: buildReceiptPrompt(today) })
    });
    return normalizeAiItems(d.items, today);
  }
  async function analyzeWithGemini(file, apiKey) {
    const b64 = await fileToBase64(file);
    const today = Parser.ymd(nowKST());
    const prompt = buildReceiptPrompt(today);

    let res, data, lastErr = '';
    const baseModels = ['gemini-2.5-flash-lite', 'gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.0-flash', 'gemini-2.5-flash', 'gemini-2.0-flash'];
    const savedM = S.settings.geminiModel;
    const models = savedM ? [savedM, ...baseModels.filter(m => m !== savedM)] : baseModels;
    for (const model of models) {
      toast(`🤖 AI 분석 중... (${model})`, 0);
      const ctrl = new AbortController();
      const to = setTimeout(() => ctrl.abort(), 18000);
      try {
        res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`, {
          method: 'POST',
          signal: ctrl.signal,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type || 'image/jpeg', data: b64 } }] }],
            generationConfig: { responseMimeType: 'application/json' }
          })
        });
        if (res.ok) {
          data = await res.json();
          if (S.settings.geminiModel !== model) { S.settings.geminiModel = model; save(); }
          break;
        }
        const err = await res.json().catch(() => ({}));
        lastErr = err.error?.message || `API 오류 (${res.status})`;
        if (res.status === 400 || res.status === 401 || res.status === 403 || /API key not valid/i.test(lastErr)) throw new Error(lastErr);
      } catch (e) {
        if (/API key not valid/i.test(e.message || '')) throw e;
        lastErr = e.name === 'AbortError' ? '응답 시간 초과' : (e.message || String(e));
      } finally { clearTimeout(to); }
    }
    if (!data) throw new Error(lastErr || '모든 모델 응답 실패');
    let raw = (data.candidates?.[0]?.content?.parts?.[0]?.text || '[]').trim();
    raw = raw.replace(/^```json\s*|^```\s*|```$/g, '').trim();
    const parsed = JSON.parse(raw);
    return normalizeAiItems(parsed, today);
  }
  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise((res, rej) => {
      const s = document.createElement('script');
      s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      s.onload = () => res(window.Tesseract);
      s.onerror = () => rej(new Error('OCR 엔진 로드 실패 (인터넷 연결을 확인해 주세요)'));
      document.head.appendChild(s);
    });
  }
  // 기본 OCR 인식률 개선용 2배 확대 전처리
  function preprocessForOcr(file) {
    return new Promise(res => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = img.width < 1200 ? 2 : 1;
        const cv = document.createElement('canvas');
        cv.width = img.width * scale; cv.height = img.height * scale;
        const ctx = cv.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height);
        ctx.drawImage(img, 0, 0, cv.width, cv.height);
        URL.revokeObjectURL(url);
        cv.toBlob(b => res(b || file), 'image/png');
      };
      img.onerror = () => { URL.revokeObjectURL(url); res(file); };
      img.src = url;
    });
  }
  async function scanReceipt(file) {
    // 1순위: 앱(Capacitor) 내장 오프라인 온디바이스 OCR (인터넷 불필요, API 키 불필요)
    const nativeOcr = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.OfflineOcr;
    if (nativeOcr) {
      toast('📱 기기 내장 AI로 영수증을 읽고 있어요...', 0);
      try {
        const b64 = await fileToBase64(file);
        const { text } = await nativeOcr.recognize({ base64: b64 });
        const r = Parser.parseReceipt(text, {
          cards: S.cards, now: nowKST(),
          defaultCardId: (S.cards.find(c => c.isDefault) || {}).id,
          keywords: S.keywords
        });
        if (r.batch && r.batch.length) {
          toast(`📱 오프라인 인식으로 ${r.batch.length}건을 읽어왔어요 ✨`);
          return openBatchForm(r.batch, '📱 기기 내장 온디바이스 OCR (오프라인)');
        }
        toast(r.ok ? '영수증을 읽어왔어요! 확인 후 저장해 주세요 ✨' : '금액을 못 찾았어요. 직접 입력해 주세요');
        return openForm(null, r);
      } catch (err) {
        toast('내장 OCR 오류: ' + (err.message || err));
      }
    }

    let aiErr = '';
    const srv = getServerUrl();
    const key = S.settings.geminiKey || ($('#sGemini') ? $('#sGemini').value.trim() : '');
    if (srv || key) {
      toast('🤖 AI가 영수증을 분석하고 있어요...', 0);
      try {
        const items = srv ? await analyzeWithServer(file) : await analyzeWithGemini(file, key);
        if (items.length >= 2) {
          toast(`🤖 AI가 ${items.length}건을 정확히 읽어왔어요 ✨`);
          return openBatchForm(items, '🤖 Gemini AI 분석');
        }
        toast('🤖 AI가 영수증을 읽어왔어요 ✨');
        return openForm(null, items[0]);
      } catch (err) {
        aiErr = err.name === 'AbortError' ? '응답 시간 초과(20초)' : (err.message || String(err));
        toast('AI 분석 실패 → 기본 OCR로 시도할게요', 0);
      }
    }
    toast('🔍 영수증 글자를 읽고 있어요... (첫 실행은 5~10초 걸릴 수 있어요)', 0);
    try {
      const T = await loadTesseract();
      const imgBlob = await preprocessForOcr(file);
      const { data: { text } } = await T.recognize(imgBlob, 'kor+eng', {
        logger: m => { if (m.status === 'recognizing text') toast(`🔍 영수증 분석 중... ${Math.round((m.progress || 0) * 100)}%`); }
      });
      const r = Parser.parseReceipt(text, {
        cards: S.cards, now: nowKST(),
        defaultCardId: (S.cards.find(c => c.isDefault) || {}).id,
        keywords: S.keywords
      });
      const note = aiErr
        ? `⚠️ AI 실패(${aiErr}) → 기본 OCR로 읽었어요`
        : '🔍 기본 OCR 결과예요 · ⚙️ 설정에 무료 Gemini API 키를 넣으면 훨씬 정확해져요';
      if (r.batch && r.batch.length) {
        toast(`📋 내역 ${r.batch.length}건을 읽어왔어요! 확인 후 저장해 주세요`);
        openBatchForm(r.batch, note);
      } else {
        toast(r.ok ? '영수증을 읽어왔어요! 확인 후 저장해 주세요 ✨' : '금액을 못 찾았어요. 직접 입력해 주세요');
        openForm(null, r);
      }
    } catch (err) {
      toast('영수증 분석 오류: ' + (err.message || err));
      openForm();
    }
  }
  // 카드 이용내역 캡처 / 음성 다건 등 일괄 등록 모달 (항목별 결제수단 유지 지원)
  function openBatchForm(items, sourceNote) {
    const payValOf = it => it.cardId ? it.cardId : (it.payment === 'cash' ? 'cash' : 'none');
    const makePayOpts = sel => `<option value="none" ${sel === 'none' ? 'selected' : ''}>미지정</option><option value="cash" ${sel === 'cash' ? 'selected' : ''}>💵 현금</option>` +
      S.cards.map(c => `<option value="${c.id}" ${sel === c.id ? 'selected' : ''}>${c.emoji || '💳'} ${esc(c.nickname || c.name)}</option>`).join('');
    const rows = items.map((it, i) => {
      const cats = it.type === 'income' ? INC_CATS : EXP_CATS;
      return `
      <div class="box" style="padding:10px;margin-bottom:8px;background:var(--surface2);box-shadow:none">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">
          <input type="checkbox" class="bChk" data-i="${i}" checked style="width:auto">
          <input type="date" class="bDate" data-i="${i}" value="${it.date}" style="flex:1;padding:6px 8px;font-size:13px">
          <select class="bCat" data-i="${i}" style="width:98px;padding:6px;font-size:13px">${cats.map(c => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
          <select class="bPayRow" data-i="${i}" style="width:104px;padding:6px;font-size:13px">${makePayOpts(payValOf(it))}</select>
        </div>
        <div style="display:flex;gap:8px">
          <input class="bMemo" data-i="${i}" value="${esc(it.memo)}" placeholder="내용" style="flex:1;padding:6px 8px;font-size:14px">
          <input type="text" inputmode="numeric" class="bAmt" data-i="${i}" value="${fmtMoney(it.amount)}" style="width:110px;padding:6px 8px;font-size:14px;text-align:right">
        </div>
      </div>`;
    }).join('');
    openModal(`<h3 style="margin-top:0">📋 내역 ${items.length}건 한 번에 등록</h3>
      ${sourceNote ? `<div class="note" style="margin:0 0 10px">${esc(sourceNote)}</div>` : ''}
      <label style="margin-top:0">전체 결제수단 일괄 변경 (선택 시 아래 항목 모두 변경)</label>
      <select id="bPayAll" style="margin-bottom:10px"><option value="">항목별 결제수단 그대로 유지</option>${makePayOpts('')}</select>
      ${rows}
      <div class="btns"><button class="btn gray" id="bCancel">취소</button><button class="btn" id="bSave">${items.length}건 저장</button></div>`);
    $('#modalBox').querySelectorAll('.bAmt').forEach(el => bindMoneyInput(el));
    $('#bPayAll').onchange = e => {
      if (!e.target.value) return;
      $('#modalBox').querySelectorAll('.bPayRow').forEach(s => { s.value = e.target.value; });
    };
    $('#bCancel').onclick = closeModal;
    $('#bSave').onclick = () => {
      let added = 0, lastDate = selDay;
      items.forEach((it, i) => {
        if (!$(`.bChk[data-i="${i}"]`).checked) return;
        const amt = moneyVal($(`.bAmt[data-i="${i}"]`)); if (!(amt > 0)) return;
        const date = $(`.bDate[data-i="${i}"]`).value || selDay;
        const cat = $(`.bCat[data-i="${i}"]`).value;
        const memo = $(`.bMemo[data-i="${i}"]`).value.trim() || cat;
        const pay = $(`.bPayRow[data-i="${i}"]`).value;
        const cardId = cardOf(pay) ? pay : null, payment = cardId ? 'card' : pay;
        S.txs.push({ id: uid(), type: it.type || 'expense', amount: amt, date, category: cat, memo, cardId, payment });
        added++; lastDate = date;
      });
      if (!added) return toast('저장할 내역을 선택해 주세요');
      save(); selDay = lastDate; const d = new Date(lastDate); cur = new Date(d.getFullYear(), d.getMonth(), 1);
      closeModal(); render(); toast(`${added}건이 등록됐어요 ✨`);
    };
    bindEnterFlow($('#modalBox'), () => [...$('#modalBox').querySelectorAll('.bDate, .bCat, .bPayRow, .bMemo, .bAmt')], () => $('#bSave').click());
  }
  $('#photoBtn').onclick = () => $('#receiptFile').click();
  $('#receiptFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) scanReceipt(f);
  };

  // ---------- 계정 / 서버 동기화 모달 ----------
  async function syncFromServer() {
    if (!AUTH.token || !getServerUrl()) return;
    const res = await apiFetch('/api/data');
    if (res.data && Array.isArray(res.data.txs)) {
      S = res.data; S.customCats ||= []; S.keywords ||= {}; applyTheme();
      localStorage.setItem(KEY, JSON.stringify(S));
      render();
    } else if (S.txs.length || S.cards.length) {
      await apiFetch('/api/data', { method: 'PUT', body: JSON.stringify({ data: S }) });
    }
  }
  function openAuthModal() {
    const srv = getServerUrl();
    if (AUTH.user) {
      openModal(`<h3 style="margin-top:0">👤 내 계정</h3>
        <p class="muted"><b>${esc(AUTH.user.username)}</b>님으로 로그인 중이에요.</p>
        <label>서버 주소</label><input id="aSrv" value="${esc(srv)}" placeholder="https://how-spend-money-api.xxx.workers.dev">
        <div class="btns">
          <button class="btn gray" id="aSync">지금 동기화</button>
          <button class="btn red" id="aLogout">로그아웃</button>
        </div>
        <div class="btns"><button class="btn gray" id="aClose">닫기</button></div>`);
      $('#aClose').onclick = closeModal;
      $('#aSync').onclick = async () => {
        AUTH.serverUrl = $('#aSrv').value.trim(); saveAuth();
        try { await syncFromServer(); toast('동기화 완료 ✨'); closeModal(); }
        catch (e) { toast('동기화 오류: ' + e.message); }
      };
      $('#aLogout').onclick = async () => {
        try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (e) {}
        AUTH = { serverUrl: $('#aSrv').value.trim() }; saveAuth(); closeModal(); render(); toast('로그아웃했어요');
      };
      return;
    }
    let mode = 'login';
    openModal(`<h3 style="margin-top:0">👤 로그인 · 회원가입</h3>
      <div class="seg" id="aSeg" style="margin-bottom:10px">
        <button data-m="login" class="on i">로그인</button><button data-m="reg">회원가입</button>
      </div>
      <label>아이디</label><input id="aId" autocomplete="username" placeholder="2자 이상">
      <label>비밀번호</label><input id="aPw" type="password" autocomplete="current-password" placeholder="4자 이상">
      ${DEFAULT_SERVER_URL ? '' : `<label>서버 주소 (Cloudflare Workers)</label><input id="aSrv" value="${esc(srv)}" placeholder="https://how-spend-money-api.xxx.workers.dev">`}
      <p class="muted" style="margin:8px 0 0">서버 배포 방법은 저장소의 <code>server/DEPLOY.md</code>를 참고하세요.</p>
      <div class="btns"><button class="btn gray" id="aCancel">취소</button><button class="btn" id="aGo">로그인</button></div>`);
    $('#aSeg').onclick = e => {
      const b = e.target.closest('[data-m]'); if (!b) return;
      mode = b.dataset.m;
      document.querySelectorAll('#aSeg button').forEach(x => x.classList.toggle('on', x === b));
      document.querySelectorAll('#aSeg button').forEach(x => x.classList.toggle('i', x === b));
      $('#aGo').textContent = mode === 'login' ? '로그인' : '회원가입';
    };
    $('#aCancel').onclick = closeModal;
    $('#aGo').onclick = async () => {
      if ($('#aSrv')) { AUTH.serverUrl = $('#aSrv').value.trim(); saveAuth(); }
      const username = $('#aId').value.trim(), password = $('#aPw').value;
      if (!username || !password) return toast('아이디와 비밀번호를 입력해 주세요');
      try {
        const path = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
        const d = await apiFetch(path, { method: 'POST', body: JSON.stringify({ username, password }) });
        AUTH.token = d.token; AUTH.user = d.user; saveAuth();
        await syncFromServer();
        closeModal(); render(); toast(`${d.user.username}님 환영해요 ✨`);
      } catch (e) { toast(e.message); }
    };
    bindEnterFlow($('#modalBox'), () => [$('#aId'), $('#aPw'), $('#aSrv')], () => $('#aGo').click());
    setTimeout(() => $('#aId')?.focus(), 60);
  }
  $('#authBtn').onclick = openAuthModal;
  if (AUTH.token && getServerUrl()) syncFromServer().catch(() => {});

  document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  $('#prevM').onclick = () => { cur.setMonth(cur.getMonth() - 1); render(); };
  $('#nextM').onclick = () => { cur.setMonth(cur.getMonth() + 1); render(); };
  render();
})();
