/**
 * 2026-07-25 대영베이스CC 예약현황 업데이트 스크립트
 * 이미지에서 추출한 명단을 DB에 반영
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/n2golf.json');

// DB 읽기
const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

// ─── 1. 미등록 회원 추가 ───────────────────────────────────────────
const newMembers = [
  { name: '김은명', gender: 'female', phone: '7580-1566', is_active: true },
  { name: '장하원', gender: 'female', phone: '3133-4959', is_active: true },
  { name: '김현정', gender: 'female', phone: '9375-1874', is_active: true },
  { name: '류미형', gender: 'female', phone: '9266-7572', is_active: true },
  { name: '김동건', gender: 'male',   phone: '3903-4524', is_active: true },
  { name: '이은경', gender: 'female', phone: '9021-7006', is_active: true },
  { name: '우홍제', gender: 'male',   phone: '4622-7962', is_active: true },
];

let lastMemberId = db._meta.lastId.members;
const memberNameToId = {};
db.members.forEach(m => { memberNameToId[m.name] = m.id; });

newMembers.forEach(nm => {
  if (!memberNameToId[nm.name]) {
    lastMemberId++;
    const member = {
      id: lastMemberId,
      name: nm.name,
      employee_id: null,
      department: null,
      position: null,
      gender: nm.gender,
      phone: nm.phone,
      email: null,
      join_date: '2026-07-25',
      is_active: nm.is_active,
      role: 'member',
      created_at: new Date().toISOString(),
    };
    db.members.push(member);
    memberNameToId[nm.name] = lastMemberId;
    console.log(`회원 추가: ${nm.name} (id=${lastMemberId})`);
  }
});
db._meta.lastId.members = lastMemberId;

// ─── 2. 2026-07-25 대영베이스CC 스케줄 추가 ──────────────────────
// golf_course_id=3 (대영베이스CC)
// 티오프: 6조 → IN 05:51/05:58/06:05, OUT 05:51/05:58/06:05
// 6조 편성이므로 tee_times 6개

let lastScheduleId = db._meta.lastId.schedules;
lastScheduleId++;
const newSchedule = {
  id: lastScheduleId,
  golf_course_id: 3,
  play_date: '2026-07-25',
  tee_times: '05:51,05:58,06:05,05:51,06:05,06:05',
  max_members: 24,
  status: 'confirmed',
  notes: 'IN코스(1~3조) / OUT코스(4~6조) 동시 진행. 6팀 24명.',
  created_at: new Date().toISOString(),
};
db.schedules.push(newSchedule);
db._meta.lastId.schedules = lastScheduleId;
console.log(`스케줄 추가: 2026-07-25 대영베이스CC (id=${lastScheduleId})`);

// ─── 3. 예약 데이터 생성 ──────────────────────────────────────────
// 이미지 명단 (팀번호, 코스, 티타임, 성명)
const teamData = [
  { team: 1, course: 'IN',  teeTime: '05:51', members: ['박병철', '김은명', '정윤희', '박혜진'] },
  { team: 2, course: 'IN',  teeTime: '05:58', members: ['이건영', '김명진', '장하원', '송덕화'] },
  { team: 3, course: 'IN',  teeTime: '06:05', members: ['정혁진', '신지혜', '김지현', '백승용'] },
  { team: 4, course: 'OUT', teeTime: '05:51', members: ['김오근', '김현정', '류미형', '김동건'] },
  { team: 5, course: 'OUT', teeTime: '05:58', members: ['송성희', '정원숙', '이은경', '강진동'] },
  { team: 6, course: 'OUT', teeTime: '06:05', members: ['송상인', '박성민', '우홍제', '박동국'] },
];

let lastReservationId = db._meta.lastId.reservations;
const appliedAt = new Date().toISOString();

teamData.forEach((team, teamIdx) => {
  team.members.forEach((name, memberIdx) => {
    const memberId = memberNameToId[name];
    if (!memberId) {
      console.warn(`⚠️  회원 없음: ${name}`);
      return;
    }
    lastReservationId++;
    const reservation = {
      id: lastReservationId,
      schedule_id: lastScheduleId,
      member_id: memberId,
      priority: memberIdx + 1,
      consecutive_count: 0,
      status: 'confirmed',
      preferred_tee_time: team.teeTime,
      applied_at: appliedAt,
      team_number: team.team,
      tee_time: team.teeTime,
      course: team.course,
    };
    db.reservations.push(reservation);
    console.log(`  예약 추가: ${team.team}조(${team.course} ${team.teeTime}) - ${name} (id=${lastReservationId})`);
  });
});
db._meta.lastId.reservations = lastReservationId;

// ─── 4. DB 저장 ───────────────────────────────────────────────────
fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
console.log('\n✅ DB 업데이트 완료!');
console.log(`  - 추가된 회원: ${lastMemberId - 84}명`);
console.log(`  - 추가된 스케줄: 1건 (id=${lastScheduleId})`);
console.log(`  - 추가된 예약: 24건`);
