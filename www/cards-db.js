// 카드 프리셋 DB (웹 검색으로 정리한 참고용 혜택 - 정확한 조건은 카드사 공식 안내를 확인하세요)
// rate 키는 앱 카테고리: 식비 교통 쇼핑 생활 주거통신 의료건강 문화여가 교육 경조사 미용 기타지출
window.CARD_DB = {
  checked: '2026-11',
  companies: ['삼성카드', '신한카드', '현대카드', '롯데카드', 'KB국민카드', '우리카드', '하나카드', 'NH농협카드', 'BC카드', '토스뱅크', '카카오뱅크', '기타'],
  cards: [
    { company: '삼성카드', name: 'iD ON 카드', kind: 'credit', defaultRate: 0.5, rules: { 식비: 5, 교통: 10, 주거통신: 10, 문화여가: 10, 쇼핑: 2 }, minSpend: 300000, cap: 0,
      note: '가장 많이 쓴 영역(커피·배달 등) 최대 30% 할인, 교통/통신/스트리밍 10%' },
    { company: '신한카드', name: 'Deep Dream', kind: 'credit', defaultRate: 0.7, rules: { 식비: 2.1, 쇼핑: 2.1, 문화여가: 2.1 }, minSpend: 300000, cap: 0,
      note: '기본 0.7% 무실적, 선택영역 2.1~3.5% 적립 (전월 30만원)' },
    { company: '현대카드', name: 'ZERO Edition3 (포인트형)', kind: 'credit', defaultRate: 1.2, rules: {}, minSpend: 0, cap: 0,
      note: '실적·한도 없이 1.2% M포인트 적립' },
    { company: '현대카드', name: 'ZERO Edition3 (할인형)', kind: 'credit', defaultRate: 0.8, rules: {}, minSpend: 0, cap: 0,
      note: '실적·한도 없이 0.8% 청구할인' },
    { company: '롯데카드', name: 'LOCA LIKIT 1.2', kind: 'credit', defaultRate: 1.2, rules: {}, minSpend: 0, cap: 0,
      note: '무실적 1.2% 결제일 할인' },
    { company: '롯데카드', name: 'LOCA 365', kind: 'credit', defaultRate: 0.5, rules: { 주거통신: 10, 교통: 10, 식비: 5, 교육: 10 }, minSpend: 500000, cap: 36500,
      note: '관리비·공과금·통신·교통·배달앱 10% (월 최대 약 3.65만원)' },
    { company: '신한카드', name: '처음 체크', kind: 'check', defaultRate: 0.2, rules: { 식비: 5, 쇼핑: 5, 주거통신: 10, 문화여가: 10 }, minSpend: 300000, cap: 0,
      note: '음식·카페·편의점·온라인쇼핑 5%, 통신/OTT 최대 20% 적립' },
    { company: '토스뱅크', name: '토스뱅크 체크카드', kind: 'check', defaultRate: 0, rules: { 식비: 2, 교통: 2, 쇼핑: 1, 문화여가: 2 }, minSpend: 0, cap: 5000,
      note: '무실적, 생활영역 건당 100~500원 캐시백 (월 5천원 한도, 대략치)' },
    { company: '카카오뱅크', name: '더(The) 체크카드', kind: 'check', defaultRate: 0.5, rules: { 식비: 2, 교통: 5, 의료건강: 5, 문화여가: 3 }, minSpend: 0, cap: 20000,
      note: '무실적, 혜택팩 선택제 (월 2만원 한도, 팩에 따라 5%)' },
    { company: 'KB국민카드', name: '노리2 체크카드 (KB Pay)', kind: 'check', defaultRate: 0.3, rules: { 식비: 5, 미용: 5, 문화여가: 10, 주거통신: 5 }, minSpend: 200000, cap: 20000,
      note: '커피·편의점·뷰티·통신 할인, KB Pay 추가 2% (전월 20만원)' }
  ],
  // 카드 별명 추천 & 이모지
  nicknames: ['콩이', '몽실이', '방울이', '뽀로로', '꿀꿀이', '통통이', '보물이', '초코', '두리', '복실이', '말랑이', '반짝이'],
  emojis: ['🐻', '🐰', '🐱', '🐶', '🐹', '🦊', '🐼', '🐥', '🐷', '🐸', '🍑', '🍓', '🍀', '⭐', '🌈', '🍩'],
  colors: ['#ff8fab', '#ffb86b', '#ffd86b', '#8fd694', '#7cc6fe', '#b49cff', '#ff9aa2', '#a0e7e5']
};
