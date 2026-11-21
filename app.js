(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const KEY = 'howSpendMoney.v1';
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
  S.customCats ||= []; S.keywords ||= {};
  const save = () => localStorage.setItem(KEY, JSON.stringify(S));
  const mKey = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
  const curKey = () => mKey(cur);
  const prevKey = () => { const d = new Date(cur); d.setMonth(d.getMonth() - 1); return mKey(d); };
  const monthTxs = k => S.txs.filter(t => t.date.startsWith(k));
  const cardOf = id => S.cards.find(c => c.id === id);
  function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 2600); }

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

  // ---------- 렌더 ----------
  function render() {
    S.customCats ||= []; S.keywords ||= {}; refreshCats();
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
    return `<div class="tx" data-id="${t.id}"><div class="ic">${ICON[t.category] || '💸'}</div>
      <div class="mid"><div>${esc(t.memo || t.category)}</div><small>${t.category}${pay ? ' · ' + esc(pay) : ''}${t.date ? ' · ' + t.date.slice(5) : ''}</small></div>
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
    let txs = monthTxs(curKey()).sort((a, b) => b.date.localeCompare(a.date));
    if (query) txs = txs.filter(t => (t.memo + t.category).includes(query));
    let h = `<input id="q" placeholder="🔍 검색 (메모/카테고리)" value="${esc(query)}">`;
    if (!txs.length) h += '<div class="empty">내역이 없어요</div>';
    let last = '';
    for (const t of txs) {
      if (t.date !== last) { last = t.date; const day = S.txs.filter(x => x.date === t.date);
        h += `<div class="dayhdr"><span>${t.date.slice(5)} (${'일월화수목금토'[new Date(t.date).getDay()]})</span><span>-${won(day.filter(x => x.type === 'expense').reduce((a, x) => a + x.amount, 0))}</span></div>`; }
      h += `<div class="box" style="padding:0 12px;margin-bottom:4px">${txRow(t)}</div>`;
    }
    el.innerHTML = h; bindTx(el);
    $('#q').oninput = e => { query = e.target.value; const pos = e.target.selectionStart; renderList(); const q = $('#q'); q.focus(); q.setSelectionRange(pos, pos); };
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
    openModal(`<h3 style="margin-top:0">${isNew ? '🏷️ 새 카테고리' : esc(name) + ' 설정'}</h3>
      ${builtin ? '' : `<label>이름</label><input id="kName" value="${esc(name || '')}" placeholder="예: 헌금">
        <label>이모지</label><input id="kEmoji" value="${esc(custom ? custom.emoji : '⛪')}" maxlength="4" style="width:90px;font-size:22px">
        <label>종류</label><div class="seg" id="kType"><button data-t="expense" class="e ${type === 'expense' ? 'on' : ''}">지출</button><button data-t="income" class="i ${type === 'income' ? 'on' : ''}">수입</button></div>`}
      <label>이 단어가 들어가면 자동으로 ${builtin ? esc(name) : '이 카테고리'}로 분류 (쉼표로 구분)</label>
      <textarea id="kWords" rows="3" placeholder="예: 교회, 헌금, 십일조, 감사헌금">${esc(kw)}</textarea>
      <p class="muted">내가 등록한 단어는 기본 분류보다 우선해요. 음성/문장 입력 모두 적용돼요.</p>
      <div class="btns">${custom ? '<button class="btn red" id="kDel">삭제</button>' : ''}<button class="btn gray" id="kCancel">취소</button><button class="btn" id="kSave">저장</button></div>`);
    let t = type;
    if (!builtin) $('#kType').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; t = b.dataset.t; document.querySelectorAll('#kType button').forEach(x => x.classList.toggle('on', x === b)); };
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
  }

  function renderSettings() {
    const el = $('#tab-settings');
    el.innerHTML = `<div class="box"><h3>화면 모드</h3><div class="seg" id="themeSeg">
      <button data-th="auto" class="${!S.settings.theme || S.settings.theme === 'auto' ? 'on i' : ''}">자동</button>
      <button data-th="light" class="${S.settings.theme === 'light' ? 'on i' : ''}">라이트</button>
      <button data-th="dark" class="${S.settings.theme === 'dark' ? 'on i' : ''}">다크</button></div>
      <p class="muted" style="margin:8px 0 0">자동은 휴대폰의 다크/라이트 설정을 따라가요.</p></div>
    <div class="box"><h3>기본 정보</h3>
      <label>월급 (음성으로 "월급 들어왔어" 라고 하면 자동 입력돼요)</label><input id="sSalary" type="number" value="${S.settings.salary || ''}">
      <label>월 예산</label><input id="sBudget" type="number" value="${S.settings.budget || ''}">
      <label>🤖 AI 영수증 분석 키 (Gemini API Key · 선택)</label><input id="sGemini" type="password" value="${esc(S.settings.geminiKey || '')}" placeholder="AIza... (입력하면 AI가 영수증/내역 캡처를 정확히 분석해요)">
      <p class="muted" style="margin:6px 0 0"><a href="https://aistudio.google.com/apikey" target="_blank" style="color:var(--accent)">Google AI Studio에서 무료 API 키 발급</a> · 키는 내 폰/브라우저에만 저장돼요</p>
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
    $('#addCat').onclick = () => openCatForm();
    el.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => openCatForm(b.dataset.cat));
    $('#themeSeg').onclick = e => { const b = e.target.closest('[data-th]'); if (!b) return; S.settings.theme = b.dataset.th; applyTheme(); save(); renderSettings(); };
    $('#sSave').onclick = () => { S.settings.salary = +$('#sSalary').value || 0; S.settings.budget = +$('#sBudget').value || 0; S.settings.geminiKey = $('#sGemini').value.trim(); save(); toast('저장됐어요'); render(); };
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

  function openForm(t, preset) {
    const isNew = !t;
    t = t || Object.assign({ id: uid(), type: 'expense', amount: '', date: selDay, category: '식비', memo: '', installment: 1, interestFree: true, cardId: (S.cards.find(c => c.isDefault) || {}).id || null, payment: S.cards.some(c => c.isDefault) ? 'card' : 'none' }, preset || {});
    const instOpts = [1, 2, 3, 4, 5, 6, 10, 12, 18, 24, 36];
    const initInst = t.installment || 1;
    if (!instOpts.includes(initInst)) instOpts.push(initInst);
    instOpts.sort((a, b) => a - b);
    openModal(`<h3 style="margin-top:0">${isNew ? '내역 추가' : '내역 수정'}</h3>
      ${isNew ? `<div style="display:flex;gap:6px;margin-bottom:8px"><button type="button" class="btn gray" id="fPhoto" style="flex:1">📷 영수증 사진 올리기</button></div>
        <label>🎤 문장으로 입력 (예: 어제 삼성이로 점심 만원)</label><div style="display:flex;gap:6px"><input id="fSent" placeholder="말하듯이 적어보세요"><button class="btn" id="fParse" style="white-space:nowrap">분석</button></div>` : ''}
      <div class="seg" style="margin-top:10px"><button class="e" data-t="expense">지출</button><button class="i" data-t="income">수입</button></div>
      <label>금액 (할부면 총 결제금액)</label><input id="fAmt" type="number" inputmode="numeric" value="${t.amount}">
      <label>날짜</label><input id="fDate" type="date" value="${t.date}">
      <label>카테고리</label><select id="fCat"></select>
      <label>결제수단</label><select id="fPay"></select>
      ${isNew ? `<div id="instWrap">
        <label>할부</label><select id="fInst">${instOpts.map(n => `<option value="${n}" ${n === initInst ? 'selected' : ''}>${n === 1 ? '일시불' : n + '개월 할부'}</option>`).join('')}</select>
        <div id="instDetail" style="display:none;margin-top:8px;padding:10px;border-radius:12px;background:var(--surface2)">
          <label style="display:flex;align-items:center;gap:8px;margin:0 0 8px;color:var(--txt);font-size:14px"><input type="checkbox" id="fFree" style="width:auto" ${t.interestFree !== false ? 'checked' : ''}> 무이자 할부</label>
          <div id="fRateBox" style="display:none"><label style="margin-top:0">연 할부 수수료율 (%)</label><input id="fRate" type="number" step="0.1" value="14.0"></div>
          <label>첫 결제일 (카드 결제일 기준, 수정 가능)</label><input id="fFirstPay" type="date" value="${firstPayDate(t.date, (cardOf(t.cardId) || {}).payDay)}">
          <div id="instPreview" class="note"></div>
        </div>
      </div>` : ''}
      <label>메모</label><input id="fMemo" value="${esc(t.memo)}">
      <div class="btns">${isNew ? '' : '<button class="btn red" id="fDel">삭제</button>'}<button class="btn gray" id="fCancel">취소</button><button class="btn" id="fSave">저장</button></div>`);
    let type = t.type;
    const fill = () => {
      document.querySelectorAll('.seg button').forEach(b => b.classList.toggle('on', b.dataset.t === type));
      document.querySelectorAll('.seg button').forEach(b => b.classList.toggle(b.classList[0], true));
      const cats = type === 'income' ? INC_CATS : EXP_CATS;
      $('#fCat').innerHTML = cats.map(c => `<option ${c === t.category ? 'selected' : ''}>${c}</option>`).join('');
      $('#fPay').innerHTML = `<option value="none">선택 안 함</option><option value="cash" ${t.payment === 'cash' ? 'selected' : ''}>현금</option>` + S.cards.map(c => `<option value="${c.id}" ${t.cardId === c.id ? 'selected' : ''}>${c.emoji || '💳'} ${esc(c.nickname || c.name)} (${esc(c.name)})</option>`).join('');
      if (isNew) $('#instWrap').style.display = type === 'expense' ? 'block' : 'none';
    };
    fill();
    const updateInst = (recalcDate) => {
      if (!isNew) return;
      const n = +$('#fInst').value || 1;
      $('#instDetail').style.display = (type === 'expense' && n > 1) ? 'block' : 'none';
      if (n <= 1) return;
      const free = $('#fFree').checked;
      $('#fRateBox').style.display = free ? 'none' : 'block';
      if (recalcDate) {
        const c = cardOf($('#fPay').value);
        $('#fFirstPay').value = firstPayDate($('#fDate').value, c && c.payDay);
      }
      const amt = +$('#fAmt').value || 0;
      const rate = free ? 0 : (+$('#fRate').value || 0);
      const totalPay = free ? amt : Math.round(amt * (1 + (rate / 100) * (n + 1) / 24));
      const per = Math.floor(totalPay / n);
      const fp = $('#fFirstPay').value || $('#fDate').value;
      $('#instPreview').textContent = amt > 0
        ? `월 ${won(per)} × ${n}개월 (${free ? '무이자' : '이자 포함 총 ' + won(totalPay)}) · ${fp.slice(5)}부터 매월 기록`
        : '금액을 입력하면 월 납입금이 계산돼요';
    };
    if (isNew) {
      updateInst(false);
      $('#fPhoto').onclick = () => { closeModal(); $('#receiptFile').click(); };
      $('#fInst').onchange = () => updateInst(true);
      $('#fFree').onchange = () => updateInst(false);
      $('#fAmt').oninput = () => updateInst(false);
      $('#fRate').oninput = () => updateInst(false);
      $('#fPay').onchange = () => updateInst(true);
      $('#fDate').onchange = () => updateInst(true);
      $('#fFirstPay').onchange = () => updateInst(false);
    }
    document.querySelectorAll('.seg button').forEach(b => b.onclick = () => { type = b.dataset.t; t.category = type === 'income' ? '급여' : '식비'; fill(); });
    $('#fCancel').onclick = closeModal;
    if (!isNew) $('#fDel').onclick = () => {
      if (t.installmentGroup) {
        const cnt = S.txs.filter(x => x.installmentGroup === t.installmentGroup).length;
        if (cnt > 1 && confirm(`같은 할부 내역이 ${cnt}건 있어요.\n확인: ${cnt}건 모두 삭제 / 취소: 이 회차만 삭제`)) {
          S.txs = S.txs.filter(x => x.installmentGroup !== t.installmentGroup);
        } else S.txs = S.txs.filter(x => x.id !== t.id);
      } else S.txs = S.txs.filter(x => x.id !== t.id);
      save(); closeModal(); render();
    };
    if (isNew) $('#fParse').onclick = () => { const r = Parser.parseTransaction($('#fSent').value, { cards: S.cards, salary: S.settings.salary, now: nowKST(), defaultCardId: (S.cards.find(c => c.isDefault) || {}).id, keywords: S.keywords, incomeCats: incomeCatNames() }); closeModal(); openForm(null, r); };
    $('#fSave').onclick = () => {
      const amt = +$('#fAmt').value; if (!(amt > 0)) return toast('금액을 입력해 주세요');
      const pay = $('#fPay').value;
      const cardId = cardOf(pay) ? pay : null, payment = cardId ? 'card' : pay;
      const n = (isNew && type === 'expense') ? (+$('#fInst').value || 1) : 1;
      if (n > 1) {
        const free = $('#fFree').checked;
        const rate = free ? 0 : (+$('#fRate').value || 0);
        const totalPay = free ? amt : Math.round(amt * (1 + (rate / 100) * (n + 1) / 24));
        const base = Math.floor(totalPay / n), rem = totalPay - base * n;
        const fp = $('#fFirstPay').value || $('#fDate').value;
        const gid = uid(), memo = $('#fMemo').value.trim() || $('#fCat').value;
        for (let i = 0; i < n; i++) {
          S.txs.push({
            id: uid(), type: 'expense', amount: i === 0 ? base + rem : base,
            date: addMonths(fp, i), category: $('#fCat').value,
            memo: `[${i + 1}/${n}] ${memo}`, cardId, payment,
            installmentGroup: gid, installmentInfo: `${i + 1}/${n}`
          });
        }
        save(); selDay = fp; const d = new Date(fp); cur = new Date(d.getFullYear(), d.getMonth(), 1);
        closeModal(); render(); toast(`${n}개월 할부(${won(base)}/월)로 등록됐어요`);
      } else {
        Object.assign(t, { type, amount: amt, date: $('#fDate').value, category: $('#fCat').value, memo: $('#fMemo').value, cardId, payment });
        if (isNew) S.txs.push(t);
        save(); selDay = t.date; const d = new Date(t.date); cur = new Date(d.getFullYear(), d.getMonth(), 1);
        closeModal(); render(); toast('저장됐어요');
      }
    };
  }

  function openCardForm(c) {
    const isNew = !c;
    const DB = window.CARD_DB;
    c = c || { id: uid(), company: '', name: '', nickname: '', emoji: DB.emojis[Math.floor(Math.random() * DB.emojis.length)], color: DB.colors[Math.floor(Math.random() * DB.colors.length)], kind: 'credit', defaultRate: 0.5, rules: {}, minSpend: 0, cap: 0 };
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
      <div class="chips" id="cNickChips">${DB.nicknames.map(n => `<button type="button" class="chip">${n}</button>`).join('')}</div>
      <label>캐릭터</label><div class="chips" id="cEmoji">${DB.emojis.map(e => `<button type="button" class="chip em ${e === c.emoji ? 'on' : ''}" data-e="${e}">${e}</button>`).join('')}</div>
      <label>카드 색상</label><div class="chips" id="cColor">${DB.colors.map(x => `<button type="button" class="sw ${x === c.color ? 'on' : ''}" data-c="${x}" style="background:${x}"></button>`).join('')}</div>
      <label>종류</label><select id="cKind"><option value="credit" ${c.kind === 'credit' ? 'selected' : ''}>신용카드</option><option value="check" ${c.kind === 'check' ? 'selected' : ''}>체크카드</option></select>
      <label>혜택 (적립/할인율 %, 카테고리별)</label><textarea id="cRules" rows="3" placeholder="기본:0.5, 식비:5, 교통:10, 쇼핑:3">${esc(rulesToStr(c))}</textarea>
      <label>전월실적 조건 (원, 없으면 0)</label><input id="cMin" type="number" value="${c.minSpend || 0}">
      <label>월 적립/할인 한도 (원, 없으면 0)</label><input id="cCap" type="number" value="${c.cap || 0}">
      <label>카드 결제일 (매월 1~28일, 할부 시 이 날짜에 자동 기록 · 없으면 0)</label><input id="cPayDay" type="number" min="0" max="28" value="${c.payDay || 0}">
      <label style="display:flex;align-items:center;gap:8px;margin-top:16px;color:var(--txt);font-size:14px"><input type="checkbox" id="cDef" style="width:auto" ${c.isDefault ? 'checked' : ''}> ⭐ 기본 카드로 설정 (카드를 말하지 않으면 이 카드로 결제한 걸로 기록)</label>
      <div class="btns">${isNew ? '' : '<button class="btn red" id="cDel">삭제</button>'}<button class="btn gray" id="cCancel">취소</button><button class="btn" id="cSave">저장</button></div>`);
    $('#cCancel').onclick = closeModal;
    const kindSel = () => $('#cKind').value;
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
      $('#cName').value = p.name; $('#cKind').value = p.kind; $('#cCompany').value = p.company;
      $('#cRules').value = rulesToStr(p); $('#cMin').value = p.minSpend; $('#cCap').value = p.cap;
      $('#cNote').style.display = 'block'; $('#cNote').textContent = '📌 ' + p.note + ' (참고용 · ' + DB.checked + ' 기준, 정확한 조건은 카드사에서 확인!)';
      if (!$('#cNick').value) $('#cNick').value = p.company.replace(/카드|뱅크/g, '') + '이';
      toast('혜택을 불러왔어요 ✨');
    };
    $('#cNickChips').onclick = e => { if (e.target.classList.contains('chip')) $('#cNick').value = e.target.textContent; };
    $('#cEmoji').onclick = e => { const b = e.target.closest('[data-e]'); if (!b) return; c.emoji = b.dataset.e; document.querySelectorAll('#cEmoji .chip').forEach(x => x.classList.toggle('on', x === b)); };
    $('#cColor').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; c.color = b.dataset.c; document.querySelectorAll('#cColor .sw').forEach(x => x.classList.toggle('on', x === b)); };
    if (!isNew) $('#cDel').onclick = () => { if (confirm('카드를 삭제할까요? (기존 내역은 유지)')) { S.cards = S.cards.filter(x => x.id !== c.id); S.txs.forEach(t => { if (t.cardId === c.id) { t.cardId = null; t.payment = 'none'; } }); save(); closeModal(); render(); } };
    $('#cSave').onclick = () => {
      if (!$('#cName').value.trim()) return toast('카드 이름을 입력해 주세요');
      const { rules, def } = parseRules($('#cRules').value);
      Object.assign(c, { company: $('#cCompany').value, name: $('#cName').value.trim(), nickname: $('#cNick').value.trim(), kind: $('#cKind').value, rules, defaultRate: def, minSpend: +$('#cMin').value || 0, cap: +$('#cCap').value || 0, payDay: Math.min(28, Math.max(0, +$('#cPayDay').value || 0)) });
      if (isNew) S.cards.push(c);
      c.isDefault = $('#cDef').checked;
      if (c.isDefault) S.cards.forEach(x => { if (x.id !== c.id) x.isDefault = false; });
      else if (S.cards.length === 1) c.isDefault = true;
      save(); closeModal(); render();
    };
  }

  // ---------- 음성 ----------
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  let rec = null;
  $('#micBtn').onclick = () => {
    if (!SR) { toast('이 브라우저는 음성인식을 지원하지 않아요 (Chrome 권장). 문장 입력을 사용해 보세요.'); return openForm(); }
    if (rec) { rec.finish(); return; }   // 다시 누르면 바로 종료
    const SILENCE_MS = 3000;             // 말이 멈춘 뒤 이만큼 기다렸다가 종료
    const r = rec = new SR();
    r.lang = 'ko-KR'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 1;
    let finalText = '', interim = '', done = false, timer = null;
    const heard = () => (finalText + ' ' + interim).trim();
    const arm = ms => { clearTimeout(timer); timer = setTimeout(finish, ms); };
    function finish() {
      if (done) return; done = true; clearTimeout(timer);
      try { r.stop(); } catch (e) {}
      $('#micBtn').classList.remove('rec'); rec = null;
      const text = heard();
      if (!text) return toast('잘 못 들었어요 🐣 다시 눌러서 말해 주세요');
      handleVoice(text);
    }
    r.finish = finish;
    r.onstart = () => { $('#micBtn').classList.add('rec'); toast('듣고 있어요 🎤 천천히 말씀하세요 (다 끝나면 마이크를 다시 눌러요)'); };
    r.onresult = e => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += ' ' + t; else interim += t;
      }
      toast('👂 ' + heard());
      arm(SILENCE_MS);
    };
    r.onerror = e => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      toast('음성 인식 오류: ' + e.error + (e.error === 'not-allowed' ? ' (마이크 권한을 허용해 주세요)' : ''));
      done = true; clearTimeout(timer); $('#micBtn').classList.remove('rec'); rec = null;
    };
    // 브라우저가 중간에 끊어도(침묵 등) 계속 듣기
    r.onend = () => { if (!done) { try { r.start(); } catch (e) {} } };
    arm(12000); // 아무 말도 없으면 12초 뒤 종료
    r.start();
  };

  // 한국 시간 기준 현재 시각
  function nowKST() { return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })); }

  // 음성 결과를 확인창 없이 바로 등록 (금액을 못 알아들었을 때만 입력창)
  function handleVoice(text) {
    const p = Parser.parseTransaction(text, { cards: S.cards, salary: S.settings.salary, now: nowKST(), defaultCardId: (S.cards.find(c => c.isDefault) || {}).id, keywords: S.keywords, incomeCats: incomeCatNames() });
    if (!p.ok) { toast('금액을 못 알아들었어요: ' + text); return openForm(null, p); }
    const tx = { id: uid(), type: p.type, amount: p.amount, date: p.date, category: p.category, memo: p.memo, cardId: p.cardId, payment: p.payment };
    S.txs.push(tx); save();
    selDay = tx.date; const d = new Date(tx.date); cur = new Date(d.getFullYear(), d.getMonth(), 1);
    render();
    const c = cardOf(tx.cardId);
    const t = $('#toast');
    t.innerHTML = `✅ ${tx.date.slice(5)} · ${esc(tx.memo)} · ${tx.category} · ${tx.type === 'income' ? '+' : '-'}${won(tx.amount)}${c ? ' · ' + (c.emoji || '💳') + esc(c.nickname || c.name) : ''}<br><small>"${esc(text)}"</small> <button id="undoV" class="chip">되돌리기</button>`;
    t.classList.remove('hidden'); clearTimeout(toast.h); toast.h = setTimeout(() => t.classList.add('hidden'), 7000);
    $('#undoV').onclick = () => { S.txs = S.txs.filter(x => x.id !== tx.id); save(); t.classList.add('hidden'); render(); };
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
  async function analyzeWithGemini(file, apiKey) {
    const b64 = await fileToBase64(file);
    const today = Parser.ymd(nowKST());
    const cardDesc = S.cards.map(c => `${c.id}:${c.company || ''}/${c.name}/${c.nickname || ''}`).join(', ');
    const kwDesc = Object.entries(S.keywords || {}).map(([k, v]) => `${k}:[${v.join(',')}]`).join(', ');
    const prompt = `이미지는 카드 영수증 또는 카드사 앱 이용내역 목록이다. 모든 결제 건을 JSON 배열로 추출하라.
규칙:
- 오늘 날짜는 ${today}. 날짜 형식은 YYYY-MM-DD (예: 26.11.21 -> 2026-11-21).
- memo는 가맹점명 또는 상품명만 깔끔히 적고 아이콘·포인트 적립·날짜구분선('11월 20일 금요일')은 제외.
- amount는 정수(원). 포인트(+39P)는 제외.
- installment는 할부 개월수(일시불이면 1). interestFree는 무이자면 true, 유이자면 false.
- category는 반드시 다음 중 하나: ${EXP_CATS.join(', ')}${kwDesc ? `. 사용자 키워드 우선: ${kwDesc}` : ''}
- cardId는 다음 등록 카드 중 일치하는 id 또는 null: [${cardDesc || '없음'}]
출력 JSON 스키마: [{"date":"YYYY-MM-DD","memo":"string","amount":number,"category":"string","installment":number,"interestFree":boolean,"cardId":string|null}]`;

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: file.type || 'image/jpeg', data: b64 } }] }],
        generationConfig: { responseMimeType: 'application/json' }
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error?.message || `API 오류 (${res.status})`);
    }
    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    const arr = JSON.parse(raw);
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
  async function scanReceipt(file) {
    if (S.settings.geminiKey) {
      toast('🤖 AI가 영수증을 분석하고 있어요...');
      try {
        const items = await analyzeWithGemini(file, S.settings.geminiKey);
        if (items.length >= 2) {
          toast(`🤖 AI가 ${items.length}건을 정확히 읽어왔어요 ✨`);
          return openBatchForm(items);
        }
        toast('🤖 AI가 영수증을 읽어왔어요 ✨');
        return openForm(null, items[0]);
      } catch (err) {
        toast('AI 분석 실패(' + (err.message || err) + ') → 기본 OCR로 시도할게요');
      }
    }
    toast('🔍 영수증 글자를 읽고 있어요... (첫 실행은 5~10초 걸릴 수 있어요)');
    try {
      const T = await loadTesseract();
      const { data: { text } } = await T.recognize(file, 'kor+eng', {
        logger: m => { if (m.status === 'recognizing text') toast(`🔍 영수증 분석 중... ${Math.round((m.progress || 0) * 100)}%`); }
      });
      const r = Parser.parseReceipt(text, {
        cards: S.cards, now: nowKST(),
        defaultCardId: (S.cards.find(c => c.isDefault) || {}).id,
        keywords: S.keywords
      });
      if (r.batch && r.batch.length) {
        toast(`📋 내역 ${r.batch.length}건을 읽어왔어요! 확인 후 저장해 주세요`);
        openBatchForm(r.batch);
      } else {
        toast(r.ok ? '영수증을 읽어왔어요! 확인 후 저장해 주세요 ✨' : '금액을 못 찾았어요. 직접 입력해 주세요');
        openForm(null, r);
      }
    } catch (err) {
      toast('영수증 분석 오류: ' + (err.message || err));
      openForm();
    }
  }
  // 카드 이용내역 캡처 등 다건 일괄 등록 모달
  function openBatchForm(items) {
    const defCardId = (items[0] && items[0].cardId) || (S.cards.find(c => c.isDefault) || {}).id || 'none';
    const cardOpts = `<option value="none">선택 안 함</option><option value="cash">현금</option>` +
      S.cards.map(c => `<option value="${c.id}" ${defCardId === c.id ? 'selected' : ''}>${c.emoji || '💳'} ${esc(c.nickname || c.name)} (${esc(c.name)})</option>`).join('');
    const rows = items.map((it, i) => `
      <div class="box" style="padding:10px;margin-bottom:8px;background:var(--surface2);box-shadow:none">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <input type="checkbox" class="bChk" data-i="${i}" checked style="width:auto">
          <input type="date" class="bDate" data-i="${i}" value="${it.date}" style="flex:1;padding:6px 8px;font-size:13px">
          <select class="bCat" data-i="${i}" style="width:110px;padding:6px 8px;font-size:13px">${EXP_CATS.map(c => `<option ${c === it.category ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
        <div style="display:flex;gap:8px">
          <input class="bMemo" data-i="${i}" value="${esc(it.memo)}" placeholder="내용" style="flex:1;padding:6px 8px;font-size:14px">
          <input type="number" class="bAmt" data-i="${i}" value="${it.amount}" style="width:110px;padding:6px 8px;font-size:14px;text-align:right">
        </div>
      </div>`).join('');
    openModal(`<h3 style="margin-top:0">📋 이용내역 ${items.length}건 한 번에 등록</h3>
      <label style="margin-top:0">공통 결제수단</label><select id="bPay" style="margin-bottom:10px">${cardOpts}</select>
      ${rows}
      <div class="btns"><button class="btn gray" id="bCancel">취소</button><button class="btn" id="bSave">${items.length}건 저장</button></div>`);
    $('#bCancel').onclick = closeModal;
    $('#bSave').onclick = () => {
      const pay = $('#bPay').value;
      const cardId = cardOf(pay) ? pay : null, payment = cardId ? 'card' : pay;
      let added = 0, lastDate = selDay;
      items.forEach((it, i) => {
        if (!$(`.bChk[data-i="${i}"]`).checked) return;
        const amt = +$(`.bAmt[data-i="${i}"]`).value; if (!(amt > 0)) return;
        const date = $(`.bDate[data-i="${i}"]`).value || selDay;
        const cat = $(`.bCat[data-i="${i}"]`).value;
        const memo = $(`.bMemo[data-i="${i}"]`).value.trim() || cat;
        S.txs.push({ id: uid(), type: 'expense', amount: amt, date, category: cat, memo, cardId, payment });
        added++; lastDate = date;
      });
      if (!added) return toast('저장할 내역을 선택해 주세요');
      save(); selDay = lastDate; const d = new Date(lastDate); cur = new Date(d.getFullYear(), d.getMonth(), 1);
      closeModal(); render(); toast(`${added}건이 등록됐어요 ✨`);
    };
  }
  $('#photoBtn').onclick = () => $('#receiptFile').click();
  $('#receiptFile').onchange = e => {
    const f = e.target.files[0]; e.target.value = '';
    if (f) scanReceipt(f);
  };

  document.querySelectorAll('nav button').forEach(b => b.onclick = () => { tab = b.dataset.tab; render(); });
  $('#prevM').onclick = () => { cur.setMonth(cur.getMonth() - 1); render(); };
  $('#nextM').onclick = () => { cur.setMonth(cur.getMonth() + 1); render(); };
  render();
})();
