const assert = require('assert');
const P = require('./parser.js');

const cards = [
  { id: '1', name: 'america express', company: '삼성카드', nickname: '삼성이' },
  { id: '2', name: 'LOCA', company: '롯데카드', nickname: '롯데이' }
];
const ctx = {
  cards,
  salary: 3000000,
  defaultCardId: '1',
  keywords: { 헌금: ['교회', '십일조'] },
  now: new Date('2026-11-24T12:00:00') // 화요일
};

const cases = [
  ['내가 어제 쿠팡에서 삼성 2 삼만원짜리 충전기 삿어', { amount: 30000, date: '2026-11-23', category: '쇼핑', memo: '쿠팡 충전기', cardId: '1' }],
  ['11월 10일 삼성이로 커피 오천원', { amount: 5000, date: '2026-11-10', category: '식비', memo: '커피', cardId: '1' }],
  ['점심 제육볶음 만원 주고 먹었어', { amount: 10000, date: '2026-11-24', category: '식비', memo: '점심 제육볶음', cardId: '1' }],
  ['커피 사천오백', { amount: 4500, category: '식비', memo: '커피' }],
  ['점심 만이천', { amount: 12000, category: '식비', memo: '점심' }],
  ['택시 3.5만원', { amount: 35000, category: '교통', memo: '택시' }],
  ['아이폰 17 150만원 12개월 할부로 샀어', { amount: 1500000, category: '쇼핑', memo: '아이폰 17', installment: 12 }],
  ['GS25 3,900원', { amount: 3900, category: '식비', memo: 'GS25' }],
  ['일요일에 교회 11조 이십만원 냈어', { amount: 200000, date: '2026-11-22', category: '헌금', memo: '교회 십일조' }],
  ['월급 들어왔어', { type: 'income', amount: 3000000, category: '급여', cardId: null }],
  ['롯데이로 영화 일만오천원', { amount: 15000, category: '문화여가', cardId: '2' }],
  ['스타 벅스 4500 현금', { amount: 4500, category: '식비', memo: '스타벅스', payment: 'cash', cardId: null }]
];

for (const [input, expected] of cases) {
  const r = P.parseTransaction(input, ctx);
  for (const [k, v] of Object.entries(expected)) {
    assert.strictEqual(r[k], v, `"${input}" -> expected ${k}=${v}, got ${r[k]}`);
  }
  console.log('PASS:', input, '=>', JSON.stringify(r));
}

assert.strictEqual(P.inferCategory('스타벅스 아메리카노', ctx.keywords, 'expense'), '식비');
assert.strictEqual(P.inferCategory('교회 주일헌금', ctx.keywords, 'expense'), '헌금');
console.log('ALL TESTS PASSED!');
