/**
 * 예산 관리(event_budgets) 하반기 문서 수정
 * 1. current_balance 필드 누락 버그 수정 (routes/finance.js의 syncBudgetBalance()와 동일 로직)
 * 2. 과거 날짜인데 status:'planned'로 남아 "(예정)" 배지가 잘못 뜨는 버그 수정 -> 'completed'로 갱신
 * 3. 한탄강CC(10/31~11/1, 1박2일, 40명) 행사 신규 추가
 *    - 군산CC 1박2일(2026-04-18, 24명) 사례의 인당단가를 그대로 적용
 *      식사비 인당 23,379원, 그린피/카트비 인당 72,792원 (군산CC 실제 지출/24명)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

const TODAY = '2026-09-23';
const PAST_PLANNED_DATES = ['2026-07-04', '2026-07-18', '2026-08-01', '2026-08-15', '2026-09-05', '2026-09-19'];

const HANTAN_MEMBERS = 40;
const GUNSAN_MEAL_PER_PERSON = Math.round(561100 / 24);   // 23,379원
const GUNSAN_GREEN_PER_PERSON = Math.round(1747000 / 24); // 72,792원
const hantanMeal = GUNSAN_MEAL_PER_PERSON * HANTAN_MEMBERS;
const hantanGreen = GUNSAN_GREEN_PER_PERSON * HANTAN_MEMBERS;
const hantanBudget = hantanMeal + hantanGreen;

const HANTAN_EVENT = {
  name: '10월 3회 한탄강CC 1박2일',
  date: '2026-10-31',
  type: 'overnight',
  weight: 1.5,
  members: HANTAN_MEMBERS,
  budget: hantanBudget,
  spent: 0,
  status: 'planned',
  items: [
    { name: `그린피/카트비 (군산CC 인당단가 ${GUNSAN_GREEN_PER_PERSON.toLocaleString()}원 x ${HANTAN_MEMBERS}명)`, planned: hantanGreen, actual: 0 },
    { name: `식사 (군산CC 인당단가 ${GUNSAN_MEAL_PER_PERSON.toLocaleString()}원 x ${HANTAN_MEMBERS}명)`, planned: hantanMeal, actual: 0 },
  ],
};

async function main() {
  console.log('=== 1. 한탄강CC 1박2일 예산 계산 ===');
  console.log('인당 식사비:', GUNSAN_MEAL_PER_PERSON, '->', HANTAN_MEMBERS, '명:', hantanMeal);
  console.log('인당 그린피/카트비:', GUNSAN_GREEN_PER_PERSON, '->', HANTAN_MEMBERS, '명:', hantanGreen);
  console.log('총 예산:', hantanBudget);

  const budgets = await db.getTableAsync('event_budgets');
  const secondHalf = budgets.find(b => b.year === 2026 && b.half === 'second');
  if (!secondHalf) throw new Error('하반기 예산 문서를 찾을 수 없습니다.');

  console.log('\n=== 2. 과거 날짜 planned -> completed 상태 수정 ===');
  const events = [...secondHalf.events];
  let changedCount = 0;
  for (const e of events) {
    if (e.status === 'planned' && PAST_PLANNED_DATES.includes(e.date)) {
      console.log(`${e.name} (${e.date}): planned -> completed`);
      e.status = 'completed';
      changedCount++;
    }
  }
  console.log(`총 ${changedCount}건 수정`);

  console.log('\n=== 3. 한탄강CC 행사 추가 ===');
  const alreadyExists = events.find(e => e.name.includes('한탄강'));
  if (alreadyExists) {
    console.log('이미 존재함, 건너뜀:', alreadyExists.name);
  } else {
    events.push(HANTAN_EVENT);
    console.log('추가됨:', HANTAN_EVENT.name, hantanBudget, '원');
  }

  await db.update('event_budgets', secondHalf.id, { events });
  console.log('\n하반기 event_budgets 업데이트 완료 (id=' + secondHalf.id + ')');

  console.log('\n=== 4. current_balance 동기화 (전체 문서, 실제 incomes-expenses) ===');
  const allIncomes = await db.getTableAsync('incomes');
  const allExpenses = await db.getTableAsync('expenses');
  const totalIncome = allIncomes.reduce((s, i) => s + (i.amount || 0), 0);
  const totalExpense = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
  const newBalance = totalIncome - totalExpense;
  console.log('총 수입:', totalIncome, '총 지출:', totalExpense, '잔액:', newBalance);

  const allBudgets = await db.getTableAsync('event_budgets');
  for (const b of allBudgets) {
    await db.update('event_budgets', b.id, { current_balance: newBalance });
    console.log(`event_budgets id=${b.id} current_balance -> ${newBalance}`);
  }

  console.log('\n✅ 완료!');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
