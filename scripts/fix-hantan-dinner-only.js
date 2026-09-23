/**
 * 한탄강CC 1박2일 예산 최종 재계산
 * - 점심 2회는 각자 계산(개인부담)으로 전환 -> 예산 제외
 * - 저녁 1회만 회비 지원, 하제끝집(군산CC 저녁식사) 인당단가 적용
 *   1,299,000원 / 24명 = 인당 54,125원 -> 40명 = 2,165,000원
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

const HAJEKKEUTJIP_TOTAL = 1299000;
const GUNSAN_MEMBERS = 24;
const PER_PERSON = Math.round(HAJEKKEUTJIP_TOTAL / GUNSAN_MEMBERS); // 54,125원

const HANTAN_MEMBERS = 40;
const hantanDinnerTotal = PER_PERSON * HANTAN_MEMBERS;

async function main() {
  console.log('하제끝집 인당 단가:', PER_PERSON);
  console.log('한탄강 저녁식사비(40명):', hantanDinnerTotal);

  const budgets = await db.getTableAsync('event_budgets');
  const second = budgets.find(b => b.year === 2026 && b.half === 'second');
  const events = [...second.events];
  const hantan = events.find(e => e.name.includes('한탄강'));
  if (!hantan) throw new Error('한탄강CC 행사를 찾을 수 없습니다.');

  hantan.budget = hantanDinnerTotal;
  hantan.items = [
    { name: `저녁식사 (그린피/카트비·점심 2회는 개인부담, 군산CC 하제끝집 인당단가 ${PER_PERSON.toLocaleString()}원 x ${HANTAN_MEMBERS}명)`, planned: hantanDinnerTotal, actual: 0 },
  ];

  await db.update('event_budgets', second.id, { events });
  console.log('\n✅ 한탄강CC 예산 업데이트 완료:', hantan.budget, '원');
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
