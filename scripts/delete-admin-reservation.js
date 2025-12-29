/**
 * 관리자 예약 삭제 스크립트
 * MongoDB Atlas에서 member_id가 1인 (관리자) 예약을 삭제합니다.
 *
 * 사용법: MONGODB_URI=<uri> node scripts/delete-admin-reservation.js
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'n2golf';

if (!MONGODB_URI) {
  console.error('오류: MONGODB_URI 환경 변수가 설정되지 않았습니다.');
  console.log('사용법: MONGODB_URI="mongodb+srv://..." node scripts/delete-admin-reservation.js');
  process.exit(1);
}

async function deleteAdminReservations() {
  let client;

  try {
    console.log('MongoDB Atlas에 연결 중...');
    client = new MongoClient(MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    console.log('연결 성공!');

    const db = client.db(DB_NAME);
    const reservations = db.collection('reservations');

    // 관리자 예약 조회 (member_id: 1)
    const adminReservations = await reservations.find({
      $or: [{ member_id: 1 }, { member_id: '1' }]
    }).toArray();

    console.log(`\n관리자 예약 ${adminReservations.length}건 발견:`);
    adminReservations.forEach(r => {
      console.log(`  - ID: ${r.id}, schedule_id: ${r.schedule_id}, status: ${r.status}`);
    });

    if (adminReservations.length === 0) {
      console.log('\n삭제할 관리자 예약이 없습니다.');
      return;
    }

    // 삭제 실행
    const result = await reservations.deleteMany({
      $or: [{ member_id: 1 }, { member_id: '1' }]
    });

    console.log(`\n✅ ${result.deletedCount}건의 관리자 예약이 삭제되었습니다.`);

  } catch (error) {
    console.error('오류 발생:', error.message);
    process.exit(1);
  } finally {
    if (client) {
      await client.close();
      console.log('MongoDB 연결 종료');
    }
  }
}

deleteAdminReservations();
