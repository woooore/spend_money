// 음성/텍스트 문장 → 거래 데이터 파서 (브라우저/Node 공용)
(function (root) {
  const DIG = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  const SUB = { 십: 10, 백: 100, 천: 1000 };
  const BIG = { 만: 1e4, 억: 1e8 };

  // "삼만오천", "3만5천", "30,000" → 숫자
  function koreanToNumber(s) {
    let total = 0, section = 0, num = 0;
    const toks = s.match(/[0-9,]+|[가-힣]/g) || [];
    for (const t of toks) {
      if (/^[0-9,]+$/.test(t)) num = num * 1 + parseInt(t.replace(/,/g, ''), 10);
      else if (DIG[t]) num = DIG[t];
      else if (SUB[t]) { section += (num || 1) * SUB[t]; num = 0; }
      else if (BIG[t]) { section += num; total += (section || 1) * BIG[t]; section = 0; num = 0; }
    }
    return total + section + num;
  }

  const NUMCH = '[0-9,]+|[일이삼사오육칠팔구십백천만억]+';
  const AMOUNT_RE = new RegExp('((?:' + NUMCH + ')(?:\\s?(?:' + NUMCH + '))*)\\s?원');
  const AMOUNT_RE2 = /([0-9][0-9,]*\s?(?:만|천)(?:\s?[0-9,]*\s?천?)?)/;

  const CATEGORIES = {
    식비: ['점심', '저녁', '아침', '밥', '식당', '카페', '커피', '스타벅스', '배달', '치킨', '피자', '맥도날드', '버거', '음식', '배민', '요기요', '쿠팡이츠', '편의점', 'gs25', '지에스', 'cu', '세븐일레븐', '이마트24', '술', '맥주', '간식', '빵', '마트', '장보기', '식비'],
    교통: ['택시', '버스', '지하철', '기름', '주유', '교통', '카카오택시', '기차', 'ktx', '주차', '톨게이트', '하이패스'],
    쇼핑: ['쿠팡', '충전기', '옷', '신발', '네이버쇼핑', '쇼핑', '가방', '지마켓', '11번가', '올리브영', '무신사', '다이소', '이케아', '컴퓨터', '노트북', '이어폰', '케이스', '가전', '아이폰', '애플', 'apple', '갤럭시', '자급제'],
    생활: ['세제', '휴지', '생필품', '청소', '수리', '가구', '생활'],
    주거통신: ['월세', '관리비', '전기', '가스', '수도', '인터넷', '통신', '핸드폰', '휴대폰', '요금'],
    의료건강: ['병원', '약', '약국', '치과', '헬스', '운동', '필라테스', '건강'],
    문화여가: ['영화', '넷플릭스', '유튜브', '게임', '여행', '공연', '책', '도서', '노래방', '숙박', '호텔', '구독', '디즈니'],
    교육: ['학원', '강의', '교재', '수업', '교육', '인강'],
    경조사: ['축의금', '조의금', '선물', '경조사', '부조'],
    미용: ['미용실', '머리', '헤어', '네일', '화장품', '피부'],
    기타지출: []
  };
  const INCOME_CATEGORIES = {
    급여: ['월급', '급여', '봉급'],
    용돈: ['용돈'],
    부수입: ['부수입', '알바', '상여', '보너스', '이자', '배당', '환급', '환불', '캐시백', '판매'],
    기타수입: []
  };
  const INCOME_WORDS = ['월급', '급여', '봉급', '용돈', '입금', '받았', '수입', '보너스', '이자', '배당', '환급', '들어왔', '들어옴', '벌었', '상여'];

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function detectDate(text, now) {
    const d = new Date(now);
    let m;
    if (/그저께|그제/.test(text)) d.setDate(d.getDate() - 2);
    else if (/어제/.test(text)) d.setDate(d.getDate() - 1);
    else if ((m = text.match(/(\d+)\s?일\s?전/))) d.setDate(d.getDate() - +m[1]);
    else if ((m = text.match(/(\d{1,2})\s?월\s?(\d{1,2})\s?일/))) { d.setDate(1); d.setMonth(+m[1] - 1); d.setDate(+m[2]); if (d > new Date(now.getTime() + 864e5 * 31)) d.setFullYear(d.getFullYear() - 1); }
    else if ((m = text.match(/(?<![0-9])(\d{1,2})\s?일(?!\s?전)/))) d.setDate(+m[1]);
    return ymd(d);
  }

  function matchCategory(text, table, fallback) {
    const low = text.toLowerCase();
    for (const [cat, kws] of Object.entries(table)) if (kws.some(k => low.includes(k))) return cat;
    return fallback;
  }

  /**
   * @param {string} text 인식된 문장
   * @param {{cards?:Array<{id:string,name:string,nickname:string}>, salary?:number, now?:Date}} ctx
   */
  function parseTransaction(text, ctx) {
    ctx = ctx || {};
    const cards = ctx.cards || [];
    const now = ctx.now || new Date();
    let work = text.trim();

    // 결제수단(카드 별명) 찾기: 긴 별명 우선
    // 음성인식은 "삼성이로"를 "삼성 2", "삼성 이로", "삼성이로" 등으로 적기 때문에 유연하게 매칭
    let card = null;
    const sorted = [...cards].sort((a, b) => (b.nickname || '').length - (a.nickname || '').length);
    const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tryMatch = (key, trailing) => {
      if (!key) return null;
      const chars = key.replace(/\s+/g, '').split('').map(escRe).join('\\s?');
      const re = new RegExp(chars + (trailing || ''), 'i');
      return re.test(work) ? re : null;
    };
    for (const c of sorted) {
      const nick = (c.nickname || '').replace(/\s+/g, '');
      const stem = nick.length > 2 ? nick.replace(/이$/, '') : nick;   // 삼성이 → 삼성
      // 1) 별명 그대로 / 어간 + (이|2|으로|로) 2) 카드 이름
      let re = tryMatch(nick) || tryMatch(stem, '\\s?(?:이|2|二)(?![가-힣])') || tryMatch(stem, '\\s?(?:이로|으로)') || tryMatch(c.name);
      if (re) { card = c; work = work.replace(re, ' '); break; }
    }
    // 3) 그래도 없으면 카드사 이름(삼성, 롯데…)이 포함된 카드가 하나뿐일 때 선택
    if (!card) {
      const hit = cards.filter(c => c.company && work.includes(c.company.replace(/카드|뱅크/g, '')) && c.company.replace(/카드|뱅크/g, '').length >= 2);
      if (hit.length === 1) { card = hit[0]; work = work.replace(card.company.replace(/카드|뱅크/g, ''), ' '); }
    }
    const cash = !card && /현금/.test(work);
    // 카드를 말하지 않았으면 기본 카드(지출일 때만)
    let usedDefault = false;
    if (!card && !cash && ctx.defaultCardId && !INCOME_WORDS.some(w => text.includes(w))) {
      card = cards.find(c => c.id === ctx.defaultCardId) || null; usedDefault = !!card;
    }

    // 금액
    let amount = 0;
    let m = work.match(AMOUNT_RE);
    if (m) { amount = koreanToNumber(m[1]); work = work.replace(m[0], ' '); }
    else if ((m = work.match(AMOUNT_RE2))) { amount = koreanToNumber(m[1]); work = work.replace(m[0], ' '); }

    // 사용자 지정 키워드가 있으면 최우선 (카테고리 종류도 따라감)
    let userCat = null;
    for (const [cat, words] of Object.entries(ctx.keywords || {})) {
      if ((words || []).some(w => w && text.includes(w))) { userCat = cat; break; }
    }
    const isIncome = userCat
      ? (ctx.incomeCats || []).includes(userCat)
      : INCOME_WORDS.some(w => text.includes(w)) && !/(샀|삿|썼|결제|사용)/.test(text);
    if (isIncome && !amount && /월급|급여|봉급/.test(text) && ctx.salary) amount = ctx.salary;

    const date = detectDate(text, now);
    const type = isIncome ? 'income' : 'expense';
    if (isIncome && usedDefault) card = null;
    const category = userCat || (type === 'income'
      ? matchCategory(text, INCOME_CATEGORIES, '기타수입')
      : matchCategory(text, CATEGORIES, '기타지출'));

    // 메모: 군더더기 제거
    let memo = work
      .replace(/오늘|어제|그저께|그제|\d+\s?일\s?전|\d{1,2}\s?월\s?\d{1,2}\s?일|\d{1,2}\s?일/g, ' ')
      .replace(/(으로|로)\s/g, ' ')
      .replace(/샀어요?|삿어요?|샀다|썼어요?|샀음|썼음|결제(했어요?|함)?|사용(했어요?)?|입금(됐어요?|되었어요?|됨)?|들어왔어요?|받았어요?|했어요?|했어|현금|나는|나\s|내가/g, ' ')
      .replace(/에서|에서는|을|를|짜리/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (type === 'income' && !memo) memo = category;
    if (!memo) memo = category;

    return {
      type, amount, date, category, memo,
      cardId: card ? card.id : null,
      payment: card ? 'card' : (cash ? 'cash' : 'none'),
      ok: amount > 0
    };
  }

  // 카드 매칭 공통 헬퍼
  function matchCardFromText(full, cards, defaultCardId) {
    const ALIASES = [['국민', 'KB'], ['삼성', '삼성카드'], ['신한', '신한카드'], ['현대', '현대카드'], ['롯데', '롯데카드'], ['우리', '우리카드'], ['하나', '하나카드'], ['농협', 'NH'], ['비씨', 'BC'], ['토스', '토스뱅크'], ['카카오', '카카오뱅크']];
    for (const c of cards) {
      const keys = [c.name, c.nickname, c.company].filter(Boolean);
      if (keys.some(k => k.length >= 2 && full.toLowerCase().includes(k.replace(/카드|뱅크/g, '').toLowerCase()))) return c;
      for (const grp of ALIASES) {
        if (grp.some(a => (c.company || c.name || '').toUpperCase().includes(a.toUpperCase())) && grp.some(a => full.toUpperCase().includes(a.toUpperCase()))) return c;
      }
    }
    return defaultCardId ? (cards.find(c => c.id === defaultCardId) || null) : null;
  }

  function catFromText(text, keywords) {
    for (const [cat, words] of Object.entries(keywords || {})) {
      if ((words || []).some(w => w && text.includes(w))) return cat;
    }
    return matchCategory(text, CATEGORIES, '기타지출');
  }

  // 카드사 앱 이용내역 목록 캡처 → 다건 파싱 (예: "26.11.21 17:26 | 일시불" 형태가 2건 이상일 때)
  function parseReceiptList(text, ctx) {
    ctx = ctx || {};
    const cards = ctx.cards || [];
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const full = lines.join('\n');
    const card = matchCardFromText(full, cards, ctx.defaultCardId);

    // 날짜 줄 인덱스 찾기 (YY.MM.DD 또는 YYYY.MM.DD, 선택적 HH:MM)
    const dateLineRe = /(?:^|\s)((?:20)?\d{2})[./-](\d{1,2})[./-](\d{1,2})(?:\s+\d{1,2}:\d{2})?/;
    const dateHits = [];
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(dateLineRe);
      if (m) {
        const y = m[1].length === 2 ? '20' + m[1] : m[1];
        const mm = +m[2], dd = +m[3];
        if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
          dateHits.push({ idx: i, date: `${y}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}` });
        }
      }
    }
    if (dateHits.length < 2) return null;

    const ignoreRe = /^(?:\d{1,2}월\s*\d{1,2}일|포인트\s*적립|\+?\d+P$)/;
    const amtRe = /([1-9][0-9,]{1,})\s*원/;
    const items = [];

    for (let k = 0; k < dateHits.length; k++) {
      const cur = dateHits[k];
      // 이전 날짜줄 다음(단, 포인트/구분선 제외) ~ 현재 날짜줄까지가 한 블록
      const prevEnd = k === 0 ? 0 : dateHits[k - 1].idx + 1;
      let start = prevEnd;
      while (start < cur.idx && ignoreRe.test(lines[start])) start++;
      // 혹시 이전 거래의 포인트 줄이 있다면 건너뜀
      const chunk = lines.slice(start, cur.idx + 1).filter(l => !ignoreRe.test(l));
      const chunkText = chunk.join(' ');

      // 금액 찾기 (현재 블록에서 가장 먼저/큰 원 단위 금액)
      let amount = 0;
      for (const l of chunk) {
        const am = l.match(amtRe);
        if (am) { amount = parseInt(am[1].replace(/,/g, ''), 10) || 0; break; }
      }
      if (!amount) continue;

      // 할부 개월
      let installment = 1;
      const im = chunkText.match(/(\d{1,2})\s*(?:개월|months?)/i);
      if (im && +im[1] >= 2 && +im[1] <= 60) installment = +im[1];

      // 가맹점명(메모): 날짜·시간·일시불·금액·특수기호 제거
      const memoLines = chunk.map(l => l
        .replace(dateLineRe, ' ')
        .replace(amtRe, ' ')
        .replace(/일시불|할부|\d{1,2}\s*개월|\|/g, ' ')
        .replace(/\s+/g, ' ').trim()
      ).filter(Boolean);
      const memo = (memoLines[0] || memoLines.join(' ') || '카드결제').slice(0, 45);
      const category = catFromText(memo + ' ' + chunkText, ctx.keywords);

      items.push({
        type: 'expense', amount, date: cur.date, category, memo,
        installment, interestFree: true,
        cardId: card ? card.id : null,
        payment: card ? 'card' : 'none',
        ok: true
      });
    }
    return items.length >= 2 ? items : null;
  }

  // 영수증 OCR 텍스트 → 거래 데이터 파서 (단건 또는 다건 { batch: [...] })
  function parseReceipt(text, ctx) {
    ctx = ctx || {};
    const list = parseReceiptList(text, ctx);
    if (list) return { batch: list, ok: true };

    const cards = ctx.cards || [];
    const now = ctx.now || new Date();
    const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    const full = lines.join('\n');

    // 1. 날짜 (YYYY/MM/DD 또는 YY.MM.DD)
    let date = ymd(now);
    const dm = full.match(/((?:20)?\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
    if (dm) {
      const y = dm[1].length === 2 ? '20' + dm[1] : dm[1];
      date = `${y}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
    }

    // 2. 할부개월
    let installment = 1;
    const im = full.match(/(?:할부(?:개월)?\s*[:：]?\s*)?(\d{1,2})\s*(?:개월|months?|개월할부)/i);
    if (im && +im[1] >= 2 && +im[1] <= 60) installment = +im[1];
    const interestFree = !/유이자/.test(full);

    // 3. 합계/결제/승인 금액 우선 추출
    let amount = 0;
    const amRe = /(?:합계금액|총\s?결제금액|결제금액|승인금액|합계|총액|총금액)\s*[:：]?\s*([0-9][0-9,.\s]*)\s*원?/;
    const am = full.match(amRe);
    if (am) amount = parseInt(am[1].replace(/[^0-9]/g, ''), 10) || 0;
    if (!amount) {
      const nums = [...full.matchAll(/([1-9][0-9,]{2,})\s*원/g)].map(x => parseInt(x[1].replace(/,/g, ''), 10)).filter(n => n > 0 && n < 1e9);
      if (nums.length) amount = Math.max(...nums);
    }

    // 4. 카드 매칭
    const card = matchCardFromText(full, cards, ctx.defaultCardId);

    // 5. 상품명 / 상호 추출 (다음 라벨 전까지)
    const grab = (labelRe, stopRe) => {
      for (let i = 0; i < lines.length; i++) {
        if (labelRe.test(lines[i])) {
          let val = lines[i].replace(labelRe, '').trim();
          if (i + 1 < lines.length && !stopRe.test(lines[i + 1]) && val.length < 40) {
            if (!/[0-9,]+\s*원$/.test(lines[i + 1])) val = (val + ' ' + lines[i + 1]).trim();
          }
          if (val) return val;
        }
      }
      return '';
    };
    const stopLabels = /^(과세금액|비과세|부가세|합계|주문번호|판매자|이용상점|사업자|주소|거래일시|승인번호|카드|할부)/;
    const prod = grab(/^상품명\s*[:：]?\s*/, stopLabels);
    const shop = grab(/^(?:판매자상호|가맹점명|상호)\s*[:：]?\s*/, stopLabels).replace(/\(주\)|주식회사/g, '').trim();
    let memo = [shop, prod].filter(Boolean).join(' · ') || '카드영수증';
    if (memo.length > 45) memo = memo.slice(0, 45);

    // 6. 카테고리
    const category = catFromText(full + ' ' + memo, ctx.keywords);

    return {
      type: 'expense', amount, date, category, memo,
      installment, interestFree,
      cardId: card ? card.id : null,
      payment: card ? 'card' : 'none',
      ok: amount > 0
    };
  }

  const api = { parseTransaction, parseReceipt, parseReceiptList, koreanToNumber, CATEGORIES, INCOME_CATEGORIES, ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);

