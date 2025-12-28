const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');

const dbPath = path.join(__dirname, '..', 'data', 'n2golf.json');

console.log('N2골프 데이터베이스 초기화 시작...');

// 초기 데이터
const initialData = {
  members: [],
  golf_courses: [],
  income_categories: [],
  expense_categories: [],
  incomes: [],
  expenses: [],
  schedules: [],
  reservations: [],
  membership_fees: [],
  _meta: {
    lastId: {
      members: 0,
      golf_courses: 0,
      income_categories: 0,
      expense_categories: 0,
      incomes: 0,
      expenses: 0,
      schedules: 0,
      reservations: 0,
      membership_fees: 0
    }
  }
};

// 입금 카테고리
const incomeCategories = [
  { name: '회비', description: '월별/연간 회비' },
  { name: 'N2 지원금', description: 'NH투자증권 동호회 지원금' },
  { name: '법인 후원금', description: '법인에서 후원하는 금액' },
  { name: '개인 후원금', description: '개인이 후원하는 금액' },
  { name: '기타 수입', description: '기타 수입' }
];

incomeCategories.forEach((cat, idx) => {
  initialData.income_categories.push({
    id: idx + 1,
    ...cat,
    created_at: new Date().toISOString()
  });
  initialData._meta.lastId.income_categories = idx + 1;
});

// 출금 카테고리
const expenseCategories = [
  { name: '카트비 지원', description: '골프 카트 이용료 지원' },
  { name: '캐디피 지원', description: '캐디 비용 지원' },
  { name: '그린피 지원', description: '그린피 일부 지원' },
  { name: '식사 지원', description: '라운드 후 식사비 지원' },
  { name: '간식 지원', description: '라운드 중 간식비 지원' },
  { name: '스크린골프비', description: '스크린골프 이용료 일부 지원' },
  { name: '시상식 선물', description: '시상식 선물 구매비' },
  { name: '트로피 구매', description: '트로피 및 상패 구매비' },
  { name: '기타 지출', description: '기타 지출' }
];

expenseCategories.forEach((cat, idx) => {
  initialData.expense_categories.push({
    id: idx + 1,
    ...cat,
    created_at: new Date().toISOString()
  });
  initialData._meta.lastId.expense_categories = idx + 1;
});

// 골프장 정보
const golfCourses = [
  {
    name: '양지파인GC',
    location: '경기도 용인시',
    schedule_week: 3,
    schedule_day: '토요일',
    tee_time_start: '06:00',
    min_teams: 3,
    max_members: 12,
    notes: '매월 3째주 토요일, 6시대 티오프',
    is_active: true
  },
  {
    name: '대영힐스GC',
    location: '충북 충주시',
    schedule_week: 1,
    schedule_day: '토요일',
    tee_time_start: '06:00',
    min_teams: 3,
    max_members: 12,
    notes: '매월 1째주 토요일 (홀수월), 6시대 티오프',
    is_active: true
  },
  {
    name: '대영베이스GC',
    location: '충북 충주시',
    schedule_week: 1,
    schedule_day: '토요일',
    tee_time_start: '06:00',
    min_teams: 3,
    max_members: 12,
    notes: '매월 1째주 토요일 (짝수월), 6시대 티오프',
    is_active: true
  }
];

golfCourses.forEach((course, idx) => {
  initialData.golf_courses.push({
    id: idx + 1,
    ...course,
    created_at: new Date().toISOString()
  });
  initialData._meta.lastId.golf_courses = idx + 1;
});

// 관리자 계정 생성
const adminPassword = bcrypt.hashSync('admin123', 10);
initialData.members.push({
  id: 1,
  name: '관리자',
  internal_phone: '0000',
  department: '동호회 운영진',
  email: null,
  join_date: new Date().toISOString().split('T')[0],
  status: 'active',
  is_admin: true,
  password_hash: adminPassword,
  created_at: new Date().toISOString()
});
initialData._meta.lastId.members = 1;

// 실제 회원 데이터
const realMembers = [
  { name: '강애련', internal_phone: '3986' },
  { name: '강진동', internal_phone: '6563' },
  { name: '강희령', internal_phone: '6426' },
  { name: '김경래', internal_phone: '6259' },
  { name: '김명진', internal_phone: '6278' },
  { name: '김미정', internal_phone: '6051' },
  { name: '김범준', internal_phone: '8667' },
  { name: '김병우', internal_phone: '6650' },
  { name: '김선영', internal_phone: '6040' },
  { name: '김승우', internal_phone: '6782' },
  { name: '김연성', internal_phone: '6101' },
  { name: '김영훈', internal_phone: '6080' },
  { name: '김용석', internal_phone: '6112' },
  { name: '김재민', internal_phone: '5739' },
  { name: '김재범', internal_phone: '7546' },
  { name: '김지현', internal_phone: '6558' },
  { name: '김혜진', internal_phone: '7937' },
  { name: '문연상', internal_phone: '7858' },
  { name: '박병철', internal_phone: '7277' },
  { name: '박근범', internal_phone: '6876' },
  { name: '박선식', internal_phone: '6633' },
  { name: '박성민', internal_phone: '6930' },
  { name: '박영민', internal_phone: '6199' },
  { name: '박준원', internal_phone: '4205' },
  { name: '박혜진', internal_phone: '5518' },
  { name: '방미영', internal_phone: '0666' },
  { name: '백승용', internal_phone: '6733' },
  { name: '서보라', internal_phone: '7049' },
  { name: '성주희', internal_phone: '7761' },
  { name: '송덕화', internal_phone: '7038' },
  { name: '송상인', internal_phone: '6067' },
  { name: '송성희', internal_phone: '7576' },
  { name: '송은주', internal_phone: '6183' },
  { name: '신동민', internal_phone: '6097' },
  { name: '신지혜', internal_phone: '6525' },
  { name: '신현식', internal_phone: '6813' },
  { name: '안치헌', internal_phone: '6128' },
  { name: '안효진', internal_phone: '6246' },
  { name: '양덕영', internal_phone: '7181' },
  { name: '용대곤', internal_phone: '7293' },
  { name: '원정연', internal_phone: '6468' },
  { name: '윤광현', internal_phone: '8683' },
  { name: '윤소민', internal_phone: '6493' },
  { name: '윤영준', internal_phone: '6173' },
  { name: '이건영', internal_phone: '6788' },
  { name: '이도경', internal_phone: '6491' },
  { name: '이상옥', internal_phone: '6039' },
  { name: '이선규', internal_phone: '6179' },
  { name: '이선화', internal_phone: '4050' },
  { name: '이성범', internal_phone: '6132' },
  { name: '이영록', internal_phone: '6860' },
  { name: '이우진', internal_phone: '6458' },
  { name: '이준수', internal_phone: '6698' },
  { name: '이지혜', internal_phone: '7561' },
  { name: '이창구', internal_phone: '6066' },
  { name: '이채훈', internal_phone: '7179' },
  { name: '이형문', internal_phone: '5774' },
  { name: '장유락', internal_phone: '6826' },
  { name: '장정임', internal_phone: '6047' },
  { name: '전희정', internal_phone: '6257' },
  { name: '정연미', internal_phone: '6351' },
  { name: '정요한', internal_phone: '6891' },
  { name: '정원숙', internal_phone: '6264' },
  { name: '정윤혜', internal_phone: '6524' },
  { name: '정윤희', internal_phone: '7989' },
  { name: '정재엽', internal_phone: '6068' },
  { name: '정혁진', internal_phone: '6830' },
  { name: '조재욱', internal_phone: '6451' },
  { name: '지명관', internal_phone: '6916' },
  { name: '최기현', internal_phone: '7044' },
  { name: '한민주', internal_phone: '0478' },
  { name: '한위', internal_phone: '7452' },
  { name: '홍지영', internal_phone: '6254' },
  { name: '황명상', internal_phone: '6376' },
  { name: '황선애', internal_phone: '0416' }
];

realMembers.forEach((member, idx) => {
  const memberId = idx + 2;
  initialData.members.push({
    id: memberId,
    ...member,
    department: null,
    email: null,
    join_date: new Date().toISOString().split('T')[0],
    status: 'active',
    is_admin: false,
    password_hash: bcrypt.hashSync('1234', 10),  // 기본 비밀번호: 1234
    created_at: new Date().toISOString()
  });
  initialData._meta.lastId.members = memberId;
});

// 2026년 일정 자동 생성
function getNthWeekday(year, month, weekNum, dayOfWeek) {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();
  let date = 1 + ((dayOfWeek - firstDayOfWeek + 7) % 7) + (weekNum - 1) * 7;
  const lastDay = new Date(year, month, 0).getDate();
  if (date > lastDay) return null;
  // YYYY-MM-DD 형식으로 직접 반환 (타임존 문제 방지)
  const mm = String(month).padStart(2, '0');
  const dd = String(date).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

let scheduleId = 0;

// 양지파인GC: 매월 3째주 토요일 (3월~11월)
const yangjipineIdx = 0; // 양지파인GC의 인덱스
for (let month = 3; month <= 11; month++) {
  const playDate = getNthWeekday(2026, month, 3, 6); // 3째주 토요일
  if (playDate) {
    scheduleId++;
    initialData.schedules.push({
      id: scheduleId,
      golf_course_id: yangjipineIdx + 1,
      play_date: playDate,
      tee_times: '06:00,06:08,06:16',
      max_members: 12,
      status: 'open',
      notes: null,
      created_at: new Date().toISOString()
    });
  }
}

// 대영힐스GC / 대영베이스GC: 매월 1째주 토요일 (3월~11월, 번갈아가며)
// 3월=힐스(id:2), 4월=베이스(id:3), 5월=힐스, 6월=베이스...
const daeyoungHillsIdx = 1;  // 대영힐스GC의 인덱스
const daeyoungBaseIdx = 2;   // 대영베이스GC의 인덱스

for (let month = 3; month <= 11; month++) {
  const playDate = getNthWeekday(2026, month, 1, 6); // 1째주 토요일
  if (playDate) {
    scheduleId++;
    // 3월(홀수)=힐스, 4월(짝수)=베이스, 5월(홀수)=힐스...
    const courseId = (month % 2 === 1) ? daeyoungHillsIdx + 1 : daeyoungBaseIdx + 1;
    initialData.schedules.push({
      id: scheduleId,
      golf_course_id: courseId,
      play_date: playDate,
      tee_times: '06:00,06:08,06:16',
      max_members: 12,
      status: 'open',
      notes: null,
      created_at: new Date().toISOString()
    });
  }
}

initialData._meta.lastId.schedules = scheduleId;

// 데이터 저장
fs.writeFileSync(dbPath, JSON.stringify(initialData, null, 2));

console.log('데이터베이스 초기화 완료!');
console.log('');
console.log('=== 기본 계정 정보 ===');
console.log('관리자: 관리자 / admin123');
console.log('회원 기본 비밀번호: 1234');
console.log('');
console.log(`총 ${initialData.golf_courses.length}개 골프장 등록`);
console.log(`총 ${initialData.schedules.length}개 2026년 일정 생성`);
console.log(`총 ${initialData.members.length}개 회원 등록`);
