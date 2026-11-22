const P = require('./parser.js');
const cards = [{ id: '1', name: 'america express', company: '삼성카드', nickname: '삼성이' }, { id: '2', name: 'LOCA', company: '롯데카드', nickname: '롯데이' }];
const ctx = { cards, salary: 3000000, now: new Date('2026-11-17') };
for (const s of ['내가 어제 쿠팡에서 삼성 2 삼만원짜리 충전기 삿어', '어제 쿠팡에서 삼성 이로 삼만원짜리 충전기 샀어', '11월 10일 삼성이로 커피 오천원', '쿠팡에서 오늘 삼성이로 삼만원짜리 충전기 샀어', '어제 롯데이로 점심 만이천원', '월급 들어왔어', '용돈 오만원 받았어', '그저께 삼성이 3만5천원 택시', '스타벅스 4,500원 현금', '롯데이 일만오천원 영화']) console.log(s, '=>', JSON.stringify(P.parseTransaction(s, ctx)));
