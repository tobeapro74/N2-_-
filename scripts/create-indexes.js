/**
 * MongoDB 인덱스 생성 스크립트
 *
 * 사용법: node scripts/create-indexes.js
 *
 * 이 스크립트는 성능 최적화를 위해 필요한 인덱스를 생성합니다.
 * 인덱스를 통해 쿼리 성능이 O(n) -> O(log n)으로 개선됩니다.
 */

require('dotenv').config({ path: '.env.local' });
const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'n2golf';

async function createIndexes() {
  if (!MONGODB_URI) {
    console.error('MONGODB_URI 환경변수가 설정되지 않았습니다.');
    process.exit(1);
  }

  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('MongoDB 연결 성공');

    const db = client.db(DB_NAME);

    // 1. reservations 컬렉션 인덱스
    console.log('\n[reservations] 인덱스 생성 중...');
    await db.collection('reservations').createIndex(
      { schedule_id: 1 },
      { name: 'idx_schedule_id' }
    );
    await db.collection('reservations').createIndex(
      { member_id: 1 },
      { name: 'idx_member_id' }
    );
    await db.collection('reservations').createIndex(
      { schedule_id: 1, member_id: 1 },
      { name: 'idx_schedule_member', unique: true }
    );
    console.log('  - idx_schedule_id 생성 완료');
    console.log('  - idx_member_id 생성 완료');
    console.log('  - idx_schedule_member (복합, 유니크) 생성 완료');

    // 2. schedule_comments 컬렉션 인덱스
    console.log('\n[schedule_comments] 인덱스 생성 중...');
    await db.collection('schedule_comments').createIndex(
      { schedule_id: 1 },
      { name: 'idx_schedule_id' }
    );
    await db.collection('schedule_comments').createIndex(
      { schedule_id: 1, parent_id: 1 },
      { name: 'idx_schedule_parent' }
    );
    await db.collection('schedule_comments').createIndex(
      { created_at: -1 },
      { name: 'idx_created_at_desc' }
    );
    console.log('  - idx_schedule_id 생성 완료');
    console.log('  - idx_schedule_parent (복합) 생성 완료');
    console.log('  - idx_created_at_desc 생성 완료');

    // 3. comment_reactions 컬렉션 인덱스
    console.log('\n[comment_reactions] 인덱스 생성 중...');
    await db.collection('comment_reactions').createIndex(
      { comment_id: 1 },
      { name: 'idx_comment_id' }
    );
    await db.collection('comment_reactions').createIndex(
      { comment_id: 1, member_id: 1 },
      { name: 'idx_comment_member', unique: true }
    );
    console.log('  - idx_comment_id 생성 완료');
    console.log('  - idx_comment_member (복합, 유니크) 생성 완료');

    // 4. schedules 컬렉션 인덱스
    console.log('\n[schedules] 인덱스 생성 중...');
    await db.collection('schedules').createIndex(
      { golf_course_id: 1, play_date: 1 },
      { name: 'idx_course_date' }
    );
    await db.collection('schedules').createIndex(
      { play_date: 1 },
      { name: 'idx_play_date' }
    );
    console.log('  - idx_course_date (복합) 생성 완료');
    console.log('  - idx_play_date 생성 완료');

    // 5. finances 컬렉션 인덱스
    console.log('\n[finances] 인덱스 생성 중...');
    await db.collection('finances').createIndex(
      { transaction_date: -1 },
      { name: 'idx_transaction_date_desc' }
    );
    await db.collection('finances').createIndex(
      { type: 1, transaction_date: -1 },
      { name: 'idx_type_date' }
    );
    console.log('  - idx_transaction_date_desc 생성 완료');
    console.log('  - idx_type_date (복합) 생성 완료');

    // 6. members 컬렉션 인덱스
    console.log('\n[members] 인덱스 생성 중...');
    await db.collection('members').createIndex(
      { name: 1 },
      { name: 'idx_name' }
    );
    await db.collection('members').createIndex(
      { department: 1 },
      { name: 'idx_department' }
    );
    console.log('  - idx_name 생성 완료');
    console.log('  - idx_department 생성 완료');

    // 인덱스 목록 확인
    console.log('\n========================================');
    console.log('모든 인덱스 생성 완료!');
    console.log('========================================\n');

    // 각 컬렉션 인덱스 확인
    const collections = ['reservations', 'schedule_comments', 'comment_reactions', 'schedules', 'finances', 'members'];
    for (const collName of collections) {
      const indexes = await db.collection(collName).indexes();
      console.log(`[${collName}] 인덱스 목록:`);
      indexes.forEach(idx => {
        console.log(`  - ${idx.name}: ${JSON.stringify(idx.key)}`);
      });
      console.log('');
    }

  } catch (error) {
    console.error('인덱스 생성 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('MongoDB 연결 종료');
  }
}

createIndexes();
