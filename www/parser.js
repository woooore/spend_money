// 음성/텍스트 문장 & 영수증 → 거래 데이터 파서 (브라우저/앱/Node 공용)
(function (root) {
  const DIG = { 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9 };
  const SUB = { 십: 10, 백: 100, 천: 1000 };
  const BIG = { 만: 1e4, 억: 1e8 };

  // "삼만오천", "3만 5000", "30,000", "3.5만" → 숫자
  function koreanToNumber(s) {
    if (!s) return 0;
    const dec = String(s).match(/(\d+\.\d+)\s*(억|만|천)/);
    if (dec) {
      const mult = dec[2] === '억' ? 1e8 : dec[2] === '만' ? 1e4 : 1e3;
      return Math.round(parseFloat(dec[1]) * mult);
    }
    let total = 0, section = 0, num = 0, prevDigit = false;
    const toks = String(s).match(/[0-9,]+|[가-힣]/g) || [];
    for (const t of toks) {
      if (/^[0-9,]+$/.test(t)) {
        const v = parseInt(t.replace(/,/g, ''), 10);
        // 단위 없이 숫자 토큰이 연속되면 마지막 숫자만 취함 ("17 150" 방어)
        num = prevDigit ? v : v;
        prevDigit = true;
      } else if (DIG[t]) {
        num = DIG[t];
        prevDigit = false;
      } else if (SUB[t]) {
        section += (num || 1) * SUB[t];
        num = 0;
        prevDigit = false;
      } else if (BIG[t]) {
        section += num;
        total += (section || 1) * BIG[t];
        section = 0;
        num = 0;
        prevDigit = false;
      }
    }
    return total + section + num;
  }

  // 자주 나오는 음성인식 띄어쓰기·동음이의어 보정
  function normalizeSpeechText(raw) {
    return String(raw || '')
      .replace(/11\s*[조도]/g, '십일조')
      .replace(/스타\s+벅스/g, '스타벅스')
      .replace(/쿠팡\s+이츠/g, '쿠팡이츠')
      .replace(/배달의\s*민족/g, '배민')
      .replace(/올리브\s+영/g, '올리브영')
      .replace(/다이\s+소/g, '다이소')
      .replace(/편의\s+점/g, '편의점')
      .replace(/지\s*에스\s*25/gi, 'GS25')
      .replace(/메가\s+커피/g, '메가커피')
      .replace(/컴포즈\s+커피/g, '컴포즈커피')
      .replace(/빽\s+다방/g, '빽다방')
      .replace(/서브\s+웨이/g, '서브웨이')
      .replace(/카카오\s+택시/g, '카카오택시');
  }

  const CATEGORIES = {
    식비: [
      '점심', '저녁', '아침', '야식', '브런치', '밥', '식당', '식사', '식비', '회식',
      '카페', '커피', '아메리카노', '라떼', '스타벅스', '메가커피', '컴포즈', '빽다방', '투썸', '이디야', '폴바셋',
      '배달', '배민', '요기요', '쿠팡이츠', '치킨', '피자', '맥도날드', '버거', '버거킹', '맘스터치', '롯데리아', '서브웨이',
      '국밥', '김밥', '찌개', '제육', '삼겹살', '고기', '초밥', '마라탕', '떡볶이', '쌀국수', '파스타', '라면', '우동', '돈까스', '냉면', '칼국수', '순대', '족발', '보쌈', '닭볶음탕', '찜닭', '샤브', '샐러드', '샌드위치', '도시락',
      '음식', '편의점', 'gs25', '지에스', 'cu', '세븐일레븐', '이마트24',
      '술', '맥주', '소주', '호프', '포차', '이자카야', '와인',
      '간식', '빵', '베이커리', '디저트', '케이크', '아이스크림', '배스킨', '도넛', '음료',
      '마트', '장보기', '이마트', '홈플러스', '롯데마트', '코스트코', '컬리', '마켓컬리', '과일', '반찬', '정육'
    ],
    교통: [
      '택시', '카카오택시', '카카오t', '우버', '버스', '지하철', '전철', '티머니', '후불교통', '교통', '교통비',
      '기름', '주유', '주유소', '세차', '충전소', '전기차충전',
      '기차', 'ktx', 'srt', '고속버스', '시외버스', '항공', '비행기', '항공권',
      '주차', '주차비', '톨게이트', '하이패스', '통행료', '대리', '대리운전', '킥보드', '따릉이'
    ],
    쇼핑: [
      '쿠팡', '네이버쇼핑', '쇼핑', '지마켓', '11번가', '옥션', '알리', '테무', '당근', '번개장터',
      '올리브영', '무신사', '에이블리', '지그재그', '29cm', '크림', '백화점', '아울렛', '유니클로', '자라', '나이키', '아디다스', '이케아',
      '충전기', '케이블', '옷', '의류', '티셔츠', '바지', '자켓', '코트', '패딩', '신발', '운동화', '가방', '모자', '양말', '안경', '렌즈', '시계',
      '컴퓨터', '노트북', '태블릿', '아이패드', '아이폰', '애플', 'apple', '갤럭시', '자급제', '이어폰', '에어팟', '버즈', '헤드폰', '키보드', '마우스', '모니터', '케이스', '가전', '전자제품'
    ],
    생활: [
      '다이소', '세제', '휴지', '물티슈', '생필품', '샴푸', '린스', '바디워시', '치약', '칫솔', '비누', '수건', '건전지', '전구', '쓰레기봉투', '우산',
      '청소', '세탁', '세탁소', '크린토피아', '수선', '수리', '철물점', '가구', '침구', '인테리어', '생활', '사료', '배변패드', '반려동물', '애견', '고양이'
    ],
    주거통신: [
      '월세', '집세', '전세', '대출이자', '관리비', '공과금', '전기', '전기세', '전기요금', '가스', '도시가스', '수도', '수도세',
      '인터넷', '통신', '통신비', '핸드폰', '휴대폰', '폰요금', '알뜰폰', 'skt', 'kt', '유플러스', '요금'
    ],
    의료건강: [
      '병원', '내과', '외과', '이비인후과', '피부과', '안과', '정형외과', '치과', '산부인과', '소아과', '한의원', '동물병원', '건강검진', '도수치료', '물리치료',
      '약', '약국', '영양제', '비타민', '유산균', '홍삼', '프로틴', '단백질',
      '헬스', '헬스장', '운동', 'pt', '필라테스', '요가', '수영', '테니스', '배드민턴', '골프', '건강'
    ],
    문화여가: [
      '영화', 'cgv', '롯데시네마', '메가박스', '넷플릭스', '유튜브', '유튜브프리미엄', '티빙', '쿠팡플레이', '웨이브', '디즈니', '스포티파이', '멜론', '구독',
      '게임', 'pc방', '노래방', '볼링', '당구', '만화방', '보드게임', '사진', '인생네컷',
      '여행', '숙박', '호텔', '펜션', '에어비앤비', '야놀자', '여기어때', '캠핑',
      '공연', '콘서트', '뮤지컬', '전시', '전시회', '박물관', '미술관', '놀이공원', '에버랜드', '롯데월드', '입장료', '책', '도서', '서점', '교보문고'
    ],
    교육: [
      '학원', '영어학원', '수학학원', '태권도', '피아노', '미술학원', '유치원', '어린이집',
      '강의', '인강', '수강료', '등록금', '교재', '문제집', '수업', '과외', '교육', '스터디카페', '독서실', '자격증', '시험', '응시료', '토익', '오픽'
    ],
    경조사: [
      '축의금', '조의금', '부의금', '부조', '선물', '생일', '생일선물', '기프티콘', '꽃', '꽃다발', '화환', '경조사', '결혼식', '장례식', '돌잔치', '명절', '어버이날'
    ],
    미용: [
      '미용실', '머리', '헤어', '커트', '염색', '파마', '펌', '네일', '왁싱', '속눈썹', '화장품', '스킨케어', '립스틱', '향수', '팩', '선크림', '피부', '마사지', '에스테틱'
    ],
    기타지출: []
  };

  const INCOME_CATEGORIES = {
    급여: ['월급', '급여', '봉급', '주급'],
    용돈: ['용돈'],
    부수입: ['부수입', '알바', '아르바이트', '상여', '상여금', '보너스', '성과급', '이자', '배당', '배당금', '환급', '환불', '캐시백', '당근판매', '중고판매', '판매'],
    기타수입: []
  };
  const INCOME_WORDS = ['월급', '급여', '봉급', '주급', '용돈', '입금', '받았', '수입', '보너스', '성과급', '상여', '이자', '배당', '환급', '환불', '캐시백', '들어왔', '들어옴', '벌었'];

  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  const WEEKDAYS = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };

  function detectDate(text, now) {
    const d = new Date(now);
    let m;
    if (/사흘\s?전/.test(text)) d.setDate(d.getDate() - 3);
    else if (/나흘\s?전/.test(text)) d.setDate(d.getDate() - 4);
    else if (/그저께|그제|엊그제/.test(text)) d.setDate(d.getDate() - 2);
    else if (/어제/.test(text)) d.setDate(d.getDate() - 1);
    else if ((m = text.match(/(\d+)\s?일\s?전/))) d.setDate(d.getDate() - +m[1]);
    else if ((m = text.match(/(\d{1,2})\s?월\s?(\d{1,2})\s?일/))) {
      d.setDate(1); d.setMonth(+m[1] - 1); d.setDate(+m[2]);
      if (d > new Date(now.getTime() + 864e5 * 31)) d.setFullYear(d.getFullYear() - 1);
    } else if ((m = text.match(/(?:지난\s*주?\s*)?([일월화수목금토])요일/))) {
      const target = WEEKDAYS[m[1]];
      let diff = (d.getDay() - target + 7) % 7;
      if (diff === 0 && /지난/.test(m[0])) diff = 7;
      d.setDate(d.getDate() - diff);
    } else if ((m = text.match(/(?<![0-9])(\d{1,2})\s?일(?!\s?(?:전|간|동안|차|시불))/))) {
      if (+m[1] >= 1 && +m[1] <= 31) d.setDate(+m[1]);
    }
    return ymd(d);
  }

  function matchCategory(text, table, fallback) {
    const low = text.toLowerCase();
    for (const [cat, kws] of Object.entries(table)) if (kws.some(k => low.includes(k))) return cat;
    return fallback;
  }

  // 입력 중인 메모로 카테고리 실시간 추론 (직접입력 폼용)
  function inferCategory(text, keywords, type) {
    const s = normalizeSpeechText(text).trim();
    if (!s) return null;
    for (const [cat, words] of Object.entries(keywords || {})) {
      if ((words || []).some(w => w && s.includes(w))) return cat;
    }
    if (type === 'income') {
      const c = matchCategory(s, INCOME_CATEGORIES, '');
      return c || null;
    }
    const c = matchCategory(s, CATEGORIES, '');
    return c || null;
  }

  // 문장에서 금액 추출 (연속 숫자 병합 버그 방지 + 소수점 단위 + '원' 생략 지원)
  function extractAmount(work) {
    let m;
    // 1) 소수점 단위: "3.5만원", "1.2억", "3.5만"
    if ((m = work.match(/(\d+\.\d+\s*(?:억|만|천))\s*원?/))) {
      return { amount: koreanToNumber(m[1]), matched: m[0] };
    }
    // 2) 단위 포함 + '원': "삼만 오천원", "3만 5,000원", "만원", "150만원"
    const unitChunk = '(?:[0-9,]+|[일이삼사오육칠팔구십백천]+)?\\s*(?:억|만|천|백|십)';
    const withUnitWon = new RegExp('(?:^|[^가-힣0-9])((' + unitChunk + '(?:\\s*' + unitChunk + ')*(?:\\s*(?:[0-9,]+|[일이삼사오육칠팔구]+))?)\\s*원)');
    if ((m = work.match(withUnitWon))) {
      const amt = koreanToNumber(m[2]);
      if (amt > 0) return { amount: amt, matched: m[1] };
    }
    // 3) 순수 숫자 + '원': "30,000원", "4500원" (앞의 모델번호 '아이폰 17' 등과 분리)
    if ((m = work.match(/([1-9][0-9,]*)\s*원/))) {
      return { amount: parseInt(m[1].replace(/,/g, ''), 10), matched: m[0] };
    }
    // 4) 순수 한글 수사 + '원': "오원" 등
    if ((m = work.match(/(?:^|[^가-힣])([일이삼사오육칠팔구]+)\s*원/))) {
      return { amount: koreanToNumber(m[1]), matched: m[1] + '원' };
    }
    // 5) '원' 생략: 숫자 + 단위 ("3만 5천", "3만 5000", "3만", "5천")
    if ((m = work.match(/([0-9][0-9,]*\s*(?:억|만|천)(?:\s*(?:[0-9,]+|[일이삼사오육칠팔구십백천]+)\s*(?:만|천|백)?)?)(?![가-힣])/))) {
      return { amount: koreanToNumber(m[1]), matched: m[1] };
    }
    // 6) '원' 생략: 한글 금액 ("만이천", "사천오백", "삼만오천", "오만", "삼천")
    if ((m = work.match(/(?:^|\s)([일이삼사오육칠팔구십백천만억]*[백천만억][일이삼사오육칠팔구십백천만억]*[십백천만억])(?=\s|$|(?:주고|어치|정도))/))) {
      if (m[1].length >= 2) return { amount: koreanToNumber(m[1]), matched: m[1] };
    }
    // 7) '원' 생략: 콤마 숫자("12,000") 또는 0으로 끝나는 3~7자리 단독 금액("4500", "12000")
    if ((m = work.match(/(?:^|\s)([1-9][0-9]{0,2}(?:,[0-9]{3})+|[1-9][0-9]{1,5}0)(?=\s|$)/))) {
      return { amount: parseInt(m[1].replace(/,/g, ''), 10), matched: m[1] };
    }
    return { amount: 0, matched: '' };
  }

  /**
   * @param {string} rawText 인식된 문장
   * @param {{cards?:Array<{id:string,name:string,nickname:string,company?:string}>, salary?:number, now?:Date, defaultCardId?:string, keywords?:Object, incomeCats?:string[]}} ctx
   */
  function parseTransaction(rawText, ctx) {
    ctx = ctx || {};
    const cards = ctx.cards || [];
    const now = ctx.now || new Date();
    const text = normalizeSpeechText(rawText);
    let work = text.trim();

    // 할부 먼저 추출 ("12개월 할부", "3개월 무이자" — 금액 오인식 방지)
    let installment = 1;
    let interestFree = !/유이자/.test(work);
    const instM = work.match(/(\d{1,2})\s*개월\s*(?:무이자|유이자)?\s*(?:할부)?/);
    if (instM && +instM[1] >= 2 && +instM[1] <= 60) {
      installment = +instM[1];
      work = work.replace(instM[0], ' ');
    }
    work = work.replace(/일시불|무이자\s*할부|유이자\s*할부|무이자|할부로?/g, ' ');

    // 날짜 표현을 먼저 파악 후 숫자형 날짜("11월 10일", "3일 전")는 work에서 제거해 금액 오인식 방지
    const date = detectDate(text, now);
    work = work
      .replace(/사흘\s?전|나흘\s?전|그저께|그제|엊그제|어제|오늘|\d+\s?일\s?전|\d{1,2}\s?월\s?\d{1,2}\s?일|(?:지난\s*주?\s*)?[일월화수목금토]요일/g, ' ')
      .replace(/(?<![0-9])\d{1,2}\s?일(?!\s?(?:전|간|동안|차|시불))/g, ' ');

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
      let re = tryMatch(nick, '(?:으로|로)?') || tryMatch(stem, '\\s?(?:이|2|二)(?:로|으로)?(?![가-힣0-9])') || tryMatch(stem, '\\s?(?:이로|으로)') || tryMatch(c.name, '(?:으로|로)?');
      if (re) { card = c; work = work.replace(re, ' '); break; }
    }
    if (!card) {
      const hit = cards.filter(c => c.company && work.includes(c.company.replace(/카드|뱅크/g, '')) && c.company.replace(/카드|뱅크/g, '').length >= 2);
      if (hit.length === 1) {
        card = hit[0];
        const coName = card.company.replace(/카드|뱅크/g, '');
        work = work.replace(new RegExp(escRe(coName) + '\\s*(?:카드|뱅크)?(?:로|으로)?', 'g'), ' ');
      }
    }
    const cash = !card && /현금/.test(work);
    let usedDefault = false;
    if (!card && !cash && ctx.defaultCardId && !INCOME_WORDS.some(w => text.includes(w))) {
      card = cards.find(c => c.id === ctx.defaultCardId) || null;
      usedDefault = !!card;
    }

    // 금액 추출
    let { amount, matched } = extractAmount(work);
    if (matched) work = work.replace(matched, ' ');

    // 사용자 지정 키워드가 있으면 최우선 (카테고리 종류도 따라감)
    let userCat = null;
    for (const [cat, words] of Object.entries(ctx.keywords || {})) {
      if ((words || []).some(w => w && text.includes(w))) { userCat = cat; break; }
    }
    const isIncome = userCat
      ? (ctx.incomeCats || []).includes(userCat)
      : INCOME_WORDS.some(w => text.includes(w)) && !/(샀|삿|썼|결제|사용|냈|먹었)/.test(text);
    if (isIncome && !amount && /월급|급여|봉급/.test(text) && ctx.salary) amount = ctx.salary;

    const type = isIncome ? 'income' : 'expense';
    if (isIncome && usedDefault) card = null;
    const category = userCat || (type === 'income'
      ? matchCategory(text, INCOME_CATEGORIES, '기타수입')
      : matchCategory(text, CATEGORIES, '기타지출'));

    // 메모: 군더더기 서술어·조사 정리
    let memo = work
      .replace(/(?:체크|신용)?\s*카드(?:로|으로)?|현금(?:으로|로)?/g, ' ')
      .replace(/(?:주고|사|시켜)\s*(?:먹었어(?:요)?|마셨어(?:요)?|샀어(?:요)?)/g, ' ')
      .replace(/타고\s*왔어(?:요)?|하고\s*왔어(?:요)?|다녀왔어(?:요)?/g, ' ')
      .replace(/샀어요?|삿어요?|샀다|샀음|썼어요?|썼다|썼음|결제(?:했어요?|했음|함)?|사용(?:했어요?|함)?|입금(?:됐어요?|되었어요?|됨)?|들어왔어요?|받았어요?|받음|냈어요?|냈음|먹었어요?|먹음|마셨어요?|탔어요?|했어요?|했어/g, ' ')
      .replace(/(?:^|\s)(?:나는|내가|나|저|제가)(?=\s|$)/g, ' ')
      .replace(/(?:으로|로|에서|에서는|에|을|를|이|가|은|는|짜리|어치|정도)(?=\s|$)/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (!memo) memo = category;

    return {
      type, amount, date, category, memo,
      installment: type === 'expense' ? installment : 1,
      interestFree,
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

    const ignoreRe = /^(?:\d{1,2}월\s*\d{1,2}[일d]\s*(?:[월화수목금토일]요일)?|포인트\s*적립|\+?\d+P$)/i;
    const amtRe = /([1-9][0-9,]{1,})\s*원/;
    const items = [];

    for (let k = 0; k < dateHits.length; k++) {
      const cur = dateHits[k];
      const prevEnd = k === 0 ? 0 : dateHits[k - 1].idx + 1;
      let start = prevEnd;
      while (start < cur.idx && ignoreRe.test(lines[start])) start++;
      const chunk = lines.slice(start, cur.idx + 1).filter(l => !ignoreRe.test(l));
      const chunkText = chunk.join(' ');

      let amount = 0;
      for (const l of chunk) {
        const am = l.match(amtRe);
        if (am) { amount = parseInt(am[1].replace(/,/g, ''), 10) || 0; break; }
      }
      if (!amount) continue;

      let installment = 1;
      const im = chunkText.match(/(\d{1,2})\s*(?:개월|months?)/i);
      if (im && +im[1] >= 2 && +im[1] <= 60) installment = +im[1];

      const memoLines = chunk.map(l => l
        .replace(dateLineRe, ' ')
        .replace(amtRe, ' ')
        .replace(/일시불|할부|\d{1,2}\s*개월|\|/g, ' ')
        .replace(/^[\s>"'=*\-·•ㅁ□■○●]+|[\s>"'=*\-·•ㅁ□■○●]+$/g, '')
        .replace(/^[A-Za-z]{1,2}\s+(?=[가-힣])/, '')
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

    let date = ymd(now);
    const dm = full.match(/((?:20)?\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})/);
    if (dm) {
      const y = dm[1].length === 2 ? '20' + dm[1] : dm[1];
      date = `${y}-${dm[2].padStart(2, '0')}-${dm[3].padStart(2, '0')}`;
    }

    let installment = 1;
    const im = full.match(/(?:할부(?:개월)?\s*[:：]?\s*)?(\d{1,2})\s*(?:개월|months?|개월할부)/i);
    if (im && +im[1] >= 2 && +im[1] <= 60) installment = +im[1];
    const interestFree = !/유이자/.test(full);

    let amount = 0;
    const amRe = /(?:합계금액|총\s?결제금액|결제금액|승인금액|합계|총액|총금액)\s*[:：]?\s*([0-9][0-9,.\s]*)\s*원?/;
    const am = full.match(amRe);
    if (am) amount = parseInt(am[1].replace(/[^0-9]/g, ''), 10) || 0;
    if (!amount) {
      const nums = [...full.matchAll(/([1-9][0-9,]{2,})\s*원/g)].map(x => parseInt(x[1].replace(/,/g, ''), 10)).filter(n => n > 0 && n < 1e9);
      if (nums.length) amount = Math.max(...nums);
    }

    const card = matchCardFromText(full, cards, ctx.defaultCardId);

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

    const category = catFromText(full + ' ' + memo, ctx.keywords);

    return {
      type: 'expense', amount, date, category, memo,
      installment, interestFree,
      cardId: card ? card.id : null,
      payment: card ? 'card' : 'none',
      ok: amount > 0
    };
  }

  const api = { parseTransaction, parseReceipt, parseReceiptList, inferCategory, normalizeSpeechText, koreanToNumber, CATEGORIES, INCOME_CATEGORIES, ymd };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Parser = api;
})(typeof window !== 'undefined' ? window : globalThis);
