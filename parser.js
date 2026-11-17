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
    식비: ['점심', '저녁', '아침', '밥', '식당', '카페', '커피', '스타벅스', '배달', '치킨', '피자', '맥도날드', '버거', '음식', '배민', '요기요', '편의점', '술', '맥주', '간식', '빵', '마트', '장보기', '식비'],
    교통: ['택시', '버스', '지하철', '기름', '주유', '교통', '카카오택시', '기차', 'ktx', '주차', '톨게이트', '하이패스'],
    쇼핑: ['쿠팡', '충전기', '옷', '신발', '네이버쇼핑', '쇼핑', '가방', '지마켓', '11번가', '올리브영', '무신사', '다이소', '이케아', '컴퓨터', '노트북', '이어폰', '케이스', '가전'],
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

    // 금액
    let amount = 0;
    let m = work.match(AMOUNT_RE);
    if (m) { amount = koreanToNumber(m[1]); work = work.replace(m[0], ' '); }
    else if ((m = work.match(AMOUNT_RE2))) { amount = koreanToNumber(m[1]); work = work.replace(m[0], ' '); }

    const isIncome = INCOME_WORDS.some(w => text.includes(w)) && !/(샀|썼|결제|사용)/.test(text);
    if (isIncome && !amount && /월급|급여|봉급/.test(text) && ctx.salary) amount = ctx.salary;

    const date = detectDate(text, now);
    const type = isIncome ? 'income' : 'expense';
    const category = type === 'income'
      ? matchCategory(text, INCOME_CATEGORIES, '기타수입')
      : matchCategory(text, CATEGORIES, '기타지출');

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

  const api = { parseTransaction, koreanToNumber, CATEGORIES, INCOME_CATEGORIES, ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);

