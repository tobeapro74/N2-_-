/**
 * 향후 일정 3건 등록 스크립트 (2026-09-23 기준 신청 현황 반영)
 * 1. 10/10(토) 양지파인CC
 * 2. 10/24(토) 대영힐스CC
 * 3. 10/31(토)~11/1(일) 한탄강CC (1박2일)
 *
 * 참가 신청은 회사 IG 게시판에서만 가능하다는 안내를 notes에 명시.
 * 신청자는 아직 조편성/확정 전 단계이므로 reservations.status='pending'으로 등록.
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

const IG_NOTICE = '참가 신청은 반드시 회사 IG 게시판에서만 가능합니다.';

const SCHEDULES = [
  {
    golfCourseName: '양지파인CC',
    play_date: '2026-10-10',
    notes: IG_NOTICE,
    applicants: ['송상인', '문수현', '박병철', '조화정', '이채훈', '강슬기', '정주환', '신동민', '조영호'],
  },
  {
    golfCourseName: '대영힐스CC',
    play_date: '2026-10-24',
    notes: IG_NOTICE,
    applicants: ['송상인', '이창구', '백승용', '박병철', '오영필', '김한준', '진현태'],
  },
  {
    golfCourseName: '한탄강CC',
    play_date: '2026-10-31',
    notes: `10/31(토)~11/1(일) 1박2일. ${IG_NOTICE}`,
    applicants: [
      '송상인', '홍종화', '김명진', '박병철', '이주영', '송덕화', '신동민', '정원숙',
      '이혜정', '김정미', '이건영', '장하원', '우홍제', '김혜진', '방미영', '정민주',
      '김성률', '홍지영', '정윤희', '김영화', '신수연', '이경미', '윤소민', '이지혜',
      '정재엽', '김선영', '류미형', '이준수', '김태우', '김종문', '조영호', '고경보',
      '김현정', '정요안', '배성수', '한민주', '김가영', '최영길',
    ],
  },
];

async function ensureGolfCourse(name) {
  const courses = await db.getTableAsync('golf_courses');
  let course = courses.find(c => c.name === name);
  if (course) return course.id;

  const newId = await db.insert('golf_courses', { name, is_active: true });
  console.log(`골프장 신규 추가: ${name} (id=${newId})`);
  return newId;
}

async function main() {
  console.log('=== 향후 일정 3건 등록 (2026-09-23 신청 현황) ===\n');

  const members = await db.getTableAsync('members');

  for (const sched of SCHEDULES) {
    const golfCourseId = await ensureGolfCourse(sched.golfCourseName);

    const schedules = await db.getTableAsync('schedules');
    let schedule = schedules.find(s => s.play_date === sched.play_date && s.golf_course_id === golfCourseId);
    if (!schedule) {
      const newId = await db.insert('schedules', {
        golf_course_id: golfCourseId,
        play_date: sched.play_date,
        tee_times: '',
        max_members: sched.applicants.length,
        status: 'open',
        notes: sched.notes,
      });
      schedule = { id: newId };
      console.log(`\n일정 생성: ${sched.play_date} ${sched.golfCourseName} (id=${newId})`);
    } else {
      await db.update('schedules', schedule.id, { notes: sched.notes });
      console.log(`\n기존 일정 사용: id=${schedule.id} (notes 갱신)`);
    }
    const scheduleId = schedule.id;

    const existingReservations = await db.getTableAsync('reservations');
    let appliedBase = Date.now();

    for (let i = 0; i < sched.applicants.length; i++) {
      const name = sched.applicants[i];
      const member = members.find(m => m.name === name);
      if (!member) {
        console.warn(`  ⚠️  회원 없음: ${name}`);
        continue;
      }
      const already = existingReservations.find(
        r => r.schedule_id === scheduleId && r.member_id === member.id && r.status !== 'cancelled'
      );
      if (already) {
        console.log(`  이미 신청됨: ${name}`);
        continue;
      }
      await db.insert('reservations', {
        schedule_id: scheduleId,
        member_id: member.id,
        priority: 0,
        consecutive_count: 0,
        status: 'pending',
        preferred_tee_time: null,
        applied_at: new Date(appliedBase + i * 1000).toISOString(),
      });
      console.log(`  신청 등록: ${name}`);
    }
  }

  console.log('\n✅ 완료!');
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
