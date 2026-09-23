/**
 * 한탄강CC(10/31~11/1) 최종 신청 명단으로 전체 교체
 * 기존 38명 → 최종 40명 (이주영 제외, 이우진/김수욱/이은경 추가)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

const SCHEDULE_ID = 23;

const FINAL_LIST = [
  '박병철', '김성률', '우홍제', '신동민', '김종문', '배성수', '최영길', '김태우', '이건영', '송상인',
  '홍종화', '이우진', '송덕화', '김수욱', '조영호', '이준수', '윤소민', '홍지영', '정재엽', '정요안',
  '류미형', '방미영', '이혜정', '김정미', '고경보', '김현정', '신수연', '김영화', '정민주', '정원숙',
  '김명진', '김혜진', '이지혜', '이경미', '김가영', '한민주', '장하원', '김선영', '이은경', '정윤희',
];

async function main() {
  console.log('=== 한탄강CC 최종 명단 업데이트 (schedule_id=23) ===\n');

  const members = await db.getTableAsync('members');

  // 기존 예약 전체 취소 처리 (삭제 대신 cancelled로, 이력 보존)
  const existingReservations = await db.getTableAsync('reservations');
  const toCancel = existingReservations.filter(r => r.schedule_id === SCHEDULE_ID && r.status !== 'cancelled');
  for (const r of toCancel) {
    await db.update('reservations', r.id, { status: 'cancelled' });
    console.log(`기존 예약 취소: id=${r.id}`);
  }

  // 최종 명단 재등록 (취소된 레코드가 있으면 재활용 - 유니크 인덱스 중복 방지)
  const afterCancel = await db.getTableAsync('reservations');
  let appliedBase = Date.now();
  for (let i = 0; i < FINAL_LIST.length; i++) {
    const name = FINAL_LIST[i];
    const member = members.find(m => m.name === name);
    if (!member) {
      console.warn(`⚠️  회원 없음: ${name}`);
      continue;
    }
    const cancelled = afterCancel.find(
      r => r.schedule_id === SCHEDULE_ID && r.member_id === member.id && r.status === 'cancelled'
    );
    const payload = {
      priority: 0,
      consecutive_count: 0,
      status: 'pending',
      preferred_tee_time: null,
      applied_at: new Date(appliedBase + i * 1000).toISOString(),
    };
    if (cancelled) {
      await db.update('reservations', cancelled.id, payload);
    } else {
      await db.insert('reservations', { schedule_id: SCHEDULE_ID, member_id: member.id, ...payload });
    }
    console.log(`신청 등록: ${name}`);
  }

  await db.update('schedules', SCHEDULE_ID, { max_members: FINAL_LIST.length });

  console.log(`\n✅ 완료! 최종 명단 ${FINAL_LIST.length}명`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
