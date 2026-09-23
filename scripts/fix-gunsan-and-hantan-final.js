/**
 * 1. 상반기 event_budgets의 "4월 2회 군산CC 1박2일" 항목을
 *    실제 카카오뱅크 거래명/금액 기준으로 재분류
 *    (기존 라벨이 실제 거래와 뒤섞여 있었음 - 사용자 확인으로 교정)
 *    - 식사: 고향집(448,000) + 하제끝집(1,299,000) + 언니네(461,000) = 2,208,000원
 *    - 그린피/카트비: 옥구농협(100,100) + 군산레져산업(145,000) = 245,100원
 *    - 총액(2,453,100원)은 기존과 동일, 항목 재배치만
 * 2. 한탄강CC(10/31~11/1, 1박2일, 40명) 식사비 재계산
 *    군산CC 식사비 2,208,000원 / 24명 / 2끼(점심+저녁) = 1끼당 인당 46,000원
 *    한탄강은 점심 2회 + 저녁 1회(3끼) → 46,000원 x 3끼 x 40명 = 5,520,000원
 *    (그린피/카트비는 개인부담이라 예산 제외)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

const GUNSAN_MEAL_TOTAL = 2208000;
const GUNSAN_MEMBERS = 24;
const GUNSAN_MEALS = 2;
const PER_MEAL_PER_PERSON = Math.round(GUNSAN_MEAL_TOTAL / GUNSAN_MEMBERS / GUNSAN_MEALS); // 46,000원

const HANTAN_MEMBERS = 40;
const HANTAN_MEALS = 3;
const hantanMealTotal = PER_MEAL_PER_PERSON * HANTAN_MEMBERS * HANTAN_MEALS;

async function main() {
  console.log('군산CC 1끼당 인당 단가:', PER_MEAL_PER_PERSON);
  console.log('한탄강CC 식사비(점심2+저녁1, 40명):', hantanMealTotal);

  const budgets = await db.getTableAsync('event_budgets');

  // 1. 상반기 군산CC 항목 재분류
  const first = budgets.find(b => b.year === 2026 && b.half === 'first');
  const firstEvents = [...first.events];
  const gunsan = firstEvents.find(e => e.name.includes('군산'));
  if (!gunsan) throw new Error('군산CC 행사를 찾을 수 없습니다.');

  gunsan.items = [
    { name: '식사(고향집)', planned: 448000, actual: 448000 },
    { name: '식사(하제끝집)', planned: 1299000, actual: 1299000 },
    { name: '식사(언니네)', planned: 461000, actual: 461000 },
    { name: '그린피/카트비(옥구농협)', planned: 100100, actual: 100100 },
    { name: '그린피/카트비(군산레져산업)', planned: 145000, actual: 145000 },
  ];
  // budget/spent 총액은 기존과 동일(2,453,100원)하므로 변경 없음

  await db.update('event_budgets', first.id, { events: firstEvents });
  console.log('\n상반기 군산CC 항목 재분류 완료 (총액 유지: 2,453,100원)');

  // 2. 하반기 한탄강CC 식사비 재계산
  const second = budgets.find(b => b.year === 2026 && b.half === 'second');
  const secondEvents = [...second.events];
  const hantan = secondEvents.find(e => e.name.includes('한탄강'));
  if (!hantan) throw new Error('한탄강CC 행사를 찾을 수 없습니다.');

  hantan.budget = hantanMealTotal;
  hantan.items = [
    { name: `식사 점심 2회+저녁 1회 (그린피/카트비 개인부담, 군산CC 1끼 인당단가 ${PER_MEAL_PER_PERSON.toLocaleString()}원 x 3끼 x ${HANTAN_MEMBERS}명)`, planned: hantanMealTotal, actual: 0 },
  ];

  await db.update('event_budgets', second.id, { events: secondEvents });
  console.log('한탄강CC 예산 업데이트 완료:', hantan.budget, '원');

  console.log('\n✅ 완료!');
}

main()
  .then(() => process.exit(0))
  .catch(err => { console.error('오류:', err); process.exit(1); });
