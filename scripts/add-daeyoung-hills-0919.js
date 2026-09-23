/**
 * 2026-09-19 대영힐스CC 라운딩 결과 등록 스크립트
 * 이미지(엔투골프_대영_260919.jpeg)에서 추출한 스코어/신페리오 데이터를 MongoDB에 반영
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env.production') });
const db = require('../models/database');

// ─── 스코어 순위표 (왼쪽 표: 순위/성별/이름/점수) ───────────────
const scoreRank = [
  { rank: 1, gender: '남', name: '오영필', score: 81 },
  { rank: 2, gender: '여', name: '김은명', score: 82 },
  { rank: 3, gender: '남', name: '정혁진', score: 83 },
  { rank: 4, gender: '여', name: '이은경', score: 83 },
  { rank: 5, gender: '남', name: '박병철', score: 83 },
  { rank: 6, gender: '남', name: '백승용', score: 87 },
  { rank: 7, gender: '여', name: '김은',   score: 87 },
  { rank: 8, gender: '여', name: '이혜정', score: 88 },
  { rank: 9, gender: '여', name: '정민주', score: 92 },
  { rank: 10, gender: '남', name: '박성민', score: 92 },
  { rank: 11, gender: '남', name: '박준원', score: 99 },
  { rank: 12, gender: '남', name: '강진동', score: 99 },
];

// ─── 신(더블)페리오 순위표 (오른쪽 표: 이름/HD/점수, 파 컬럼=신페리오 순위) ───
const peoriaRank = [
  { peoriaRank: 1,  name: '박성민', hd: 19.2, score: 72.8 },
  { peoriaRank: 2,  name: '이혜정', hd: 14.4, score: 73.6 },
  { peoriaRank: 3,  name: '오영필', hd: 7.2,  score: 73.8 },
  { peoriaRank: 4,  name: '이은경', hd: 8.4,  score: 74.6 },
  { peoriaRank: 5,  name: '박병철', hd: 8.4,  score: 74.6 },
  { peoriaRank: 6,  name: '김은명', hd: 7.2,  score: 74.8 },
  { peoriaRank: 7,  name: '백승용', hd: 12,   score: 75 },
  { peoriaRank: 8,  name: '김은',   hd: 12,   score: 75 },
  { peoriaRank: 9,  name: '정혁진', hd: 7.2,  score: 75.8 },
  { peoriaRank: 10, name: '강진동', hd: 22.8, score: 76.2 },
  { peoriaRank: 11, name: '박준원', hd: 21.6, score: 77.4 },
  { peoriaRank: 12, name: '정민주', hd: 14.4, score: 77.6 },
];

const peoriaByName = {};
peoriaRank.forEach(p => { peoriaByName[p.name] = p; });

async function main() {
  console.log('=== 2026-09-19 대영힐스CC 라운딩 결과 등록 ===\n');

  const members = await db.getTableAsync('members');
  const schedules = await db.getTableAsync('schedules');

  // ─── 1. 9/19 대영힐스CC 일정 확인/생성 (golf_course_id=2) ───
  let schedule = schedules.find(s => s.play_date === '2026-09-19' && s.golf_course_id === 2);
  if (!schedule) {
    const newId = await db.insert('schedules', {
      golf_course_id: 2,
      play_date: '2026-09-19',
      tee_times: '',
      max_members: 12,
      status: 'confirmed',
      notes: '관리자 등록 (결과 사진 기반)',
    });
    schedule = { id: newId };
    console.log(`일정 생성: 2026-09-19 대영힐스CC (id=${newId})`);
  } else {
    console.log(`기존 일정 사용: id=${schedule.id}`);
  }
  const scheduleId = schedule.id;

  // ─── 2. 기존 결과 삭제 (재실행 대비) ───
  const existingResults = await db.getTableAsync('round_results');
  const toDelete = existingResults.filter(r => r.schedule_id === scheduleId);
  for (const r of toDelete) {
    await db.delete('round_results', r.id);
    console.log(`기존 결과 삭제: id=${r.id}`);
  }

  // ─── 3. 결과 등록 ───
  let savedCount = 0;
  for (const s of scoreRank) {
    const member = members.find(m => m.name === s.name);
    if (!member) {
      console.warn(`⚠️  회원 없음: ${s.name}`);
      continue;
    }
    const peoria = peoriaByName[s.name] || {};
    await db.insert('round_results', {
      schedule_id: scheduleId,
      member_id: member.id,
      rank: s.rank,
      score: s.score,
      gender: s.gender,
      peoria_name: s.name,
      peoria_hd: peoria.hd || 0,
      peoria_score: peoria.score || 0,
      peoria_rank: peoria.peoriaRank || 0,
      birdies: 0,
      pars: 0,
      bogeys: 0,
      doubles: 0,
    });
    savedCount++;
    console.log(`결과 등록: ${s.rank}위 ${s.name} (${s.score}타, 신페리오 ${peoria.peoriaRank}위 ${peoria.score})`);
  }

  // ─── 4. 일정 상태 갱신 ───
  await db.update('schedules', scheduleId, { has_result: true, status: 'completed' });

  // ─── 5. 참가자 예약 자동 동기화 ───
  const existingReservations = await db.getTableAsync('reservations');
  for (const s of scoreRank) {
    const member = members.find(m => m.name === s.name);
    if (!member) continue;
    const alreadyReserved = existingReservations.find(
      rv => Number(rv.schedule_id) === scheduleId && Number(rv.member_id) === member.id
    );
    if (!alreadyReserved) {
      await db.insert('reservations', {
        schedule_id: scheduleId,
        member_id: member.id,
        status: 'confirmed',
      });
      console.log(`예약 자동 생성: ${s.name}`);
    }
  }

  console.log(`\n✅ 완료! schedule_id=${scheduleId}, 등록된 결과 ${savedCount}건`);
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('오류:', err);
    process.exit(1);
  });
