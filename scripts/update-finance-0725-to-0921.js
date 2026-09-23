/**
 * 카카오뱅크 거래내역(2026-07-25 ~ 2026-09-21) 기반 자금현황 업데이트
 * 1. 기존 category_id 누락 버그 수정 (incomes id 37-43, expenses id 27-31)
 * 2. 누락된 7/25, 8월~9월 거래 신규 등록
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

// income_categories: 1=회비, 2=N2 지원금, 3=법인 후원금, 4=개인 후원금, 5=기타 수입
// expense_categories: 1=카트비 지원, 2=캐디피 지원, 3=라운딩 지원, 4=식사 지원, 5=간식 지원,
//                      6=스크린골프비, 7=시상식 선물, 8=트로피 구매, 9=기타 지출

const CATEGORY_FIX = {
  incomes: {
    37: 5, // 캐시백 -> 기타 수입
    38: 5, // 캐시백
    39: 1, // 회비
    40: 5, // 이자 -> 기타 수입
    41: 5, // 캐시백
    42: 5, // 캐시백
    43: 1, // 회비
  },
  expenses: {
    27: 9, // 기타 (간편이체 밥값) -> 기타 지출
    28: 3, // 미래개발 그린피/카트비 -> 라운딩 지원
    29: 4, // 옥된장 식사 -> 식사 지원
    30: 3, // 대영베이스 그린피/카트비 -> 라운딩 지원
    31: 4, // 본가중앙탐막국수 식사 -> 식사 지원
  },
};

const NEW_INCOMES = [
  { income_date: '2026-07-25', amount: 31, category_id: 5, description: '입출금통장 이자' },
  { income_date: '2026-07-25', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-07-25', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-08-21', amount: 1290000, category_id: 1, description: 'NH투자증권 회비' },
  { income_date: '2026-08-22', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-08-22', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-08-29', amount: 39, category_id: 5, description: '입출금통장 이자' },
  { income_date: '2026-09-09', amount: 882000, category_id: 1, description: '엔에이치투자증권 회비' },
  { income_date: '2026-09-12', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-09-12', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-09-17', amount: 382900, category_id: 1, description: '엔에이치투자증권 회비' },
  { income_date: '2026-09-19', amount: 3000, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-09-19', amount: 300, category_id: 5, description: '모임 체크카드 캐시백' },
  { income_date: '2026-09-21', amount: 1320000, category_id: 1, description: 'NH투자증권 회비' },
];

const NEW_EXPENSES = [
  { expense_date: '2026-07-25', amount: 800000, category_id: 3, description: '(주)대영베이스 그린피/카트비', schedule_id: 18 },
  { expense_date: '2026-07-25', amount: 340000, category_id: 4, description: '본가중앙탑막국수 (식사지원)', schedule_id: 18 },
  { expense_date: '2026-08-22', amount: 841000, category_id: 3, description: '(주)대영베이스 그린피/카트비', schedule_id: 19 },
  { expense_date: '2026-08-22', amount: 419000, category_id: 4, description: '본가중앙탑막국수 (식사지원)', schedule_id: 19 },
  { expense_date: '2026-09-12', amount: 332000, category_id: 3, description: '미래개발 주식회사 그린피/카트비', schedule_id: '__SCHEDULE_912__' },
  { expense_date: '2026-09-12', amount: 215000, category_id: 4, description: '옥된장 용인양지점 (식사지원)', schedule_id: '__SCHEDULE_912__' },
  { expense_date: '2026-09-19', amount: 420000, category_id: 3, description: '(주)대영베이스 그린피/카트비', schedule_id: 20 },
  { expense_date: '2026-09-19', amount: 198000, category_id: 4, description: '성마루국밥 (식사지원)', schedule_id: 20 },
];

async function main() {
  console.log('=== 0. 9/12 양지파인CC 일정 등록 (누락된 정기 라운딩) ===');
  const schedules = await db.getTableAsync('schedules');
  let schedule912 = schedules.find(s => s.play_date === '2026-09-12' && s.golf_course_id === 1);
  if (!schedule912) {
    const newId = await db.insert('schedules', {
      golf_course_id: 1,
      play_date: '2026-09-12',
      tee_times: '',
      max_members: 12,
      status: 'completed',
      has_result: false,
      notes: '카카오뱅크 거래내역 기반 소급 등록',
    });
    schedule912 = { id: newId };
    console.log(`일정 생성: 2026-09-12 양지파인CC (id=${newId})`);
  } else {
    console.log(`기존 일정 사용: id=${schedule912.id}`);
  }
  const schedule912Id = schedule912.id;

  console.log('\n=== 1. 기존 레코드 category_id 버그 수정 ===');
  for (const [id, categoryId] of Object.entries(CATEGORY_FIX.incomes)) {
    await db.update('incomes', parseInt(id), { category_id: categoryId });
    console.log(`incomes id=${id} -> category_id=${categoryId}`);
  }
  for (const [id, categoryId] of Object.entries(CATEGORY_FIX.expenses)) {
    await db.update('expenses', parseInt(id), { category_id: categoryId });
    console.log(`expenses id=${id} -> category_id=${categoryId}`);
  }

  console.log('\n=== 2. 신규 수입 등록 ===');
  for (const inc of NEW_INCOMES) {
    const id = await db.insert('incomes', { ...inc, member_id: null });
    console.log(`수입 등록: id=${id} ${inc.income_date} ${inc.amount}원 ${inc.description}`);
  }

  console.log('\n=== 3. 신규 지출 등록 ===');
  for (const exp of NEW_EXPENSES) {
    const payload = { ...exp, schedule_id: exp.schedule_id === '__SCHEDULE_912__' ? schedule912Id : exp.schedule_id };
    const id = await db.insert('expenses', payload);
    console.log(`지출 등록: id=${id} ${payload.expense_date} ${payload.amount}원 ${payload.description}`);
  }

  console.log('\n✅ 완료!');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
