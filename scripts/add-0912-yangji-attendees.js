/**
 * 2026-09-12 양지파인CC 참석자 등록 (schedule_id=24)
 * 자금 스크립트(update-finance-0725-to-0921.js)에서 이미 일정만 생성해둔 상태.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

const SCHEDULE_ID = 24;
const ATTENDEES = ['송상인', '최영길', '차재근', '홍종화', '정민주', '박대호', '김예슬', '김명진', '조영민', '정주환', '신동민', '배성수'];

async function main() {
  console.log('=== 9/12 양지파인CC 참석자 등록 ===\n');

  const members = await db.getTableAsync('members');
  const existingReservations = await db.getTableAsync('reservations');

  for (const name of ATTENDEES) {
    const member = members.find(m => m.name === name);
    if (!member) {
      console.warn(`⚠️  회원 없음: ${name}`);
      continue;
    }
    const already = existingReservations.find(
      r => r.schedule_id === SCHEDULE_ID && r.member_id === member.id && r.status !== 'cancelled'
    );
    if (already) {
      console.log(`이미 등록됨: ${name}`);
      continue;
    }
    await db.insert('reservations', {
      schedule_id: SCHEDULE_ID,
      member_id: member.id,
      priority: 0,
      consecutive_count: 0,
      status: 'confirmed',
      preferred_tee_time: null,
      applied_at: new Date().toISOString(),
    });
    console.log(`등록 완료: ${name}`);
  }

  console.log('\n✅ 완료!');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
