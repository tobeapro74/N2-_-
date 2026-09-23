/**
 * 상반기 event_budgets "4월 2회 군산CC 1박2일" 항목명 정정
 * 옥구농협(100,100)+군산레져산업(145,000) = 245,100원은
 * 그린피/카트비가 아니라 "음료수 제공" 비용이었음 (사용자 확인)
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

async function main() {
  const budgets = await db.getTableAsync('event_budgets');
  const first = budgets.find(b => b.year === 2026 && b.half === 'first');
  const events = [...first.events];
  const gunsan = events.find(e => e.name.includes('군산'));
  if (!gunsan) throw new Error('군산CC 행사를 찾을 수 없습니다.');

  gunsan.items = gunsan.items.map(item => {
    if (item.name === '그린피/카트비(옥구농협)') return { ...item, name: '음료수(옥구농협)' };
    if (item.name === '그린피/카트비(군산레져산업)') return { ...item, name: '음료수(군산레져산업)' };
    return item;
  });

  await db.update('event_budgets', first.id, { events });
  console.log('군산CC 항목명 수정 완료:', gunsan.items.map(i => i.name).join(', '));
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
