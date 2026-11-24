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

// 다건 복합 문장 분리 테스트
const multi1 = P.parseTransactions('떡볶이 만원어치 현금으로 먹고 카페가서 오천원 더 썻어', ctx);
assert.strictEqual(multi1.length, 2);
assert.deepStrictEqual(
  multi1.map(x => ({ memo: x.memo, amount: x.amount, payment: x.payment, cardId: x.cardId, category: x.category })),
  [
    { memo: '떡볶이', amount: 10000, payment: 'cash', cardId: null, category: '식비' },
    { memo: '카페', amount: 5000, payment: 'card', cardId: '1', category: '식비' }
  ]
);

const multi2 = P.parseTransactions('어제 택시 만이천원 타고 스타벅스 사천오백원 쿠팡 충전기 삼만원 샀어', ctx);
assert.strictEqual(multi2.length, 3);
assert.deepStrictEqual(
  multi2.map(x => ({ date: x.date, memo: x.memo, amount: x.amount, category: x.category })),
  [
    { date: '2026-11-23', memo: '택시', amount: 12000, category: '교통' },
    { date: '2026-11-23', memo: '스타벅스', amount: 4500, category: '식비' },
    { date: '2026-11-23', memo: '쿠팡 충전기', amount: 30000, category: '쇼핑' }
  ]
);

const multi3 = P.parseTransactions('만원짜리 충전기랑 오천원짜리 케이블 샀어', ctx);
assert.strictEqual(multi3.length, 2);
assert.strictEqual(multi3[0].amount, 10000);
assert.strictEqual(multi3[1].amount, 5000);

// 단건에서 '타고' 등이 있어도 금액이 하나면 1건 유지
const singleWithConn = P.parseTransactions('택시 타고 만원 냈어', ctx);
assert.strictEqual(singleWithConn.length, 1);
assert.strictEqual(singleWithConn[0].amount, 10000);
assert.strictEqual(singleWithConn[0].memo, '택시');

// 음성인식이 숫자를 '5,000원' 형태로 천 단위 쉼표를 넣어도 다건 분리가 깨지지 않아야 함
const commaMulti = P.parseTransactions('떡볶이 만원 현금으로 먹고 카페 5,000원 썼어', ctx);
assert.strictEqual(commaMulti.length, 2);
assert.deepStrictEqual(
  commaMulti.map(x => ({ memo: x.memo, amount: x.amount, payment: x.payment })),
  [
    { memo: '떡볶이', amount: 10000, payment: 'cash' },
    { memo: '카페', amount: 5000, payment: 'card' }
  ]
);

const commaSepMulti = P.parseTransactions('떡볶이 10,000원, 카페 5,000원', ctx);
assert.strictEqual(commaSepMulti.length, 2);
assert.strictEqual(commaSepMulti[0].amount, 10000);
assert.strictEqual(commaSepMulti[1].amount, 5000);

console.log('MULTI-TX TESTS PASSED!', JSON.stringify(multi1));
console.log('ALL TESTS PASSED!');
