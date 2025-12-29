/**
 * JSON 데이터를 MongoDB Atlas로 마이그레이션하는 스크립트
 *
 * 사용법:
 * MONGODB_URI="mongodb+srv://..." node scripts/migrate-to-mongodb.js
 */

const { MongoClient } = require('mongodb');
const fs = require('fs');
const path = require('path');

// MongoDB 연결 URI (환경변수에서 가져오기)
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'n2golf';

// JSON 데이터 파일 경로
const JSON_PATH = path.join(__dirname, '..', 'data', 'n2golf.json');

// 마이그레이션할 컬렉션 목록
const COLLECTIONS = [
  'members',
  'golf_courses',
  'income_categories',
  'expense_categories',
  'incomes',
  'expenses',
  'schedules',
  'reservations',
  'membership_fees',
  'course_holes'
];

async function migrate() {
  if (!MONGODB_URI) {
    console.error('오류: MONGODB_URI 환경변수가 설정되지 않았습니다.');
    console.log('사용법: MONGODB_URI="mongodb+srv://..." node scripts/migrate-to-mongodb.js');
    process.exit(1);
  }

  console.log('=== N2골프 데이터 MongoDB 마이그레이션 ===\n');

  // JSON 데이터 로드
  console.log('1. JSON 데이터 로드 중...');
  if (!fs.existsSync(JSON_PATH)) {
    console.error(`오류: JSON 파일을 찾을 수 없습니다: ${JSON_PATH}`);
    process.exit(1);
  }

  const jsonData = JSON.parse(fs.readFileSync(JSON_PATH, 'utf8'));
  console.log('   JSON 데이터 로드 완료\n');

  // MongoDB 연결
  console.log('2. MongoDB Atlas 연결 중...');
  const client = new MongoClient(MONGODB_URI);

  try {
    await client.connect();
    console.log('   MongoDB 연결 성공\n');

    const db = client.db(DB_NAME);

    // 각 컬렉션 마이그레이션
    console.log('3. 데이터 마이그레이션 시작...\n');

    for (const collectionName of COLLECTIONS) {
      const data = jsonData[collectionName];

      if (!data || !Array.isArray(data)) {
        console.log(`   - ${collectionName}: 데이터 없음 (건너뜀)`);
        continue;
      }

      const collection = db.collection(collectionName);

      // 기존 데이터 삭제 (선택적)
      const existingCount = await collection.countDocuments();
      if (existingCount > 0) {
        console.log(`   - ${collectionName}: 기존 ${existingCount}개 문서 삭제 중...`);
        await collection.deleteMany({});
      }

      // 새 데이터 삽입
      if (data.length > 0) {
        await collection.insertMany(data);
        console.log(`   - ${collectionName}: ${data.length}개 문서 삽입 완료`);
      } else {
        console.log(`   - ${collectionName}: 빈 배열 (건너뜀)`);
      }
    }

    // _meta 정보 저장 (ID 카운터 등)
    if (jsonData._meta) {
      const metaCollection = db.collection('_meta');
      await metaCollection.deleteMany({});
      await metaCollection.insertOne(jsonData._meta);
      console.log('   - _meta: 메타 정보 저장 완료');
    }

    console.log('\n4. 마이그레이션 완료!\n');

    // 검증
    console.log('5. 데이터 검증...');
    for (const collectionName of COLLECTIONS) {
      const count = await db.collection(collectionName).countDocuments();
      const originalCount = (jsonData[collectionName] || []).length;
      const status = count === originalCount ? '✓' : '✗';
      console.log(`   ${status} ${collectionName}: ${count}개 (원본: ${originalCount}개)`);
    }

    console.log('\n=== 마이그레이션 완료 ===\n');
    console.log('다음 단계:');
    console.log('1. Vercel 환경변수에 MONGODB_URI 설정');
    console.log('2. 앱을 재배포하여 MongoDB 연결 확인');

  } catch (error) {
    console.error('\n마이그레이션 오류:', error);
    process.exit(1);
  } finally {
    await client.close();
    console.log('\nMongoDB 연결 종료');
  }
}

migrate();
