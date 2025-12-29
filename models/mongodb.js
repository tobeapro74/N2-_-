/**
 * MongoDB Atlas 데이터베이스 모듈
 * 기존 JSON 파일 기반 database.js와 동일한 API 제공
 */

const { MongoClient, ObjectId } = require('mongodb');

// MongoDB 연결 설정
const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'n2golf';

// 컬렉션 이름 매핑
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

// MongoDB 클라이언트 싱글톤
let client = null;
let db = null;
let isConnected = false;

// 연결 함수
async function connect() {
  if (isConnected && client && db) {
    return db;
  }

  if (!MONGODB_URI) {
    throw new Error('MONGODB_URI 환경 변수가 설정되지 않았습니다.');
  }

  try {
    client = new MongoClient(MONGODB_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
    });

    await client.connect();
    db = client.db(DB_NAME);
    isConnected = true;
    console.log('MongoDB Atlas 연결 성공');
    return db;
  } catch (error) {
    console.error('MongoDB 연결 오류:', error);
    isConnected = false;
    throw error;
  }
}

// 연결 종료
async function disconnect() {
  if (client) {
    await client.close();
    client = null;
    db = null;
    isConnected = false;
    console.log('MongoDB 연결 종료');
  }
}

// 데이터베이스 래퍼 클래스 (기존 API 호환)
class MongoDatabase {
  constructor() {
    this.cache = {}; // 메모리 캐시
    this.cacheTimeout = 5000; // 5초 캐시
    this.lastCacheTime = {};
  }

  // 연결 확인 및 DB 반환
  async getDb() {
    return await connect();
  }

  // 컬렉션 가져오기
  async getCollection(name) {
    const database = await this.getDb();
    return database.collection(name);
  }

  // 테이블(컬렉션) 전체 데이터 가져오기 (동기식 호환을 위한 캐시 사용)
  getTable(name) {
    // 캐시된 데이터 반환 (동기식 호환)
    if (this.cache[name]) {
      return this.cache[name];
    }
    return [];
  }

  // 테이블 데이터 비동기 로드
  async loadTable(name) {
    try {
      const collection = await this.getCollection(name);
      const data = await collection.find({}).toArray();
      // _id를 id로 변환
      this.cache[name] = data.map(doc => ({
        ...doc,
        id: doc.id || doc._id.toString()
      }));
      this.lastCacheTime[name] = Date.now();
      return this.cache[name];
    } catch (error) {
      console.error(`테이블 로드 오류 (${name}):`, error);
      return [];
    }
  }

  // 모든 테이블 초기 로드
  async loadAllTables() {
    for (const name of COLLECTIONS) {
      await this.loadTable(name);
    }
  }

  // ID로 문서 찾기
  findById(table, id) {
    const data = this.cache[table] || [];
    return data.find(r => r.id === id || r.id === String(id));
  }

  // 비동기 ID로 찾기
  async findByIdAsync(table, id) {
    try {
      const collection = await this.getCollection(table);
      // 숫자 ID와 ObjectId 모두 지원
      let doc = await collection.findOne({ id: parseInt(id) });
      if (!doc) {
        doc = await collection.findOne({ id: String(id) });
      }
      if (!doc && ObjectId.isValid(id)) {
        doc = await collection.findOne({ _id: new ObjectId(id) });
      }
      if (doc) {
        return { ...doc, id: doc.id || doc._id.toString() };
      }
      return null;
    } catch (error) {
      console.error(`findById 오류 (${table}, ${id}):`, error);
      return null;
    }
  }

  // 데이터 삽입
  async insert(table, record) {
    try {
      const collection = await this.getCollection(table);

      // 새 ID 생성 (auto increment 시뮬레이션)
      const maxIdDoc = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
      const newId = maxIdDoc.length > 0 ? (parseInt(maxIdDoc[0].id) || 0) + 1 : 1;

      const newRecord = {
        ...record,
        id: newId,
        created_at: new Date().toISOString()
      };

      await collection.insertOne(newRecord);

      // 캐시 업데이트
      if (this.cache[table]) {
        this.cache[table].push(newRecord);
      }

      return newId;
    } catch (error) {
      console.error(`insert 오류 (${table}):`, error);
      throw error;
    }
  }

  // 데이터 업데이트
  async update(table, id, updates) {
    try {
      const collection = await this.getCollection(table);

      const updateData = {
        ...updates,
        updated_at: new Date().toISOString()
      };

      // id 필드로 찾아서 업데이트
      const result = await collection.updateOne(
        { id: parseInt(id) },
        { $set: updateData }
      );

      if (result.matchedCount === 0) {
        // 문자열 ID로 재시도
        await collection.updateOne(
          { id: String(id) },
          { $set: updateData }
        );
      }

      // 캐시 업데이트
      if (this.cache[table]) {
        const idx = this.cache[table].findIndex(r => r.id === id || r.id === parseInt(id));
        if (idx !== -1) {
          Object.assign(this.cache[table][idx], updateData);
        }
      }

      return true;
    } catch (error) {
      console.error(`update 오류 (${table}, ${id}):`, error);
      return false;
    }
  }

  // 데이터 삭제
  async delete(table, id) {
    try {
      const collection = await this.getCollection(table);

      const result = await collection.deleteOne({ id: parseInt(id) });

      if (result.deletedCount === 0) {
        await collection.deleteOne({ id: String(id) });
      }

      // 캐시 업데이트
      if (this.cache[table]) {
        this.cache[table] = this.cache[table].filter(r => r.id !== id && r.id !== parseInt(id));
      }

      return true;
    } catch (error) {
      console.error(`delete 오류 (${table}, ${id}):`, error);
      return false;
    }
  }

  // 쿼리 (필터 및 옵션)
  async query(table, filter = {}, options = {}) {
    try {
      const collection = await this.getCollection(table);

      let query = collection.find(filter);

      if (options.orderBy) {
        const sortOrder = options.orderDesc ? -1 : 1;
        query = query.sort({ [options.orderBy]: sortOrder });
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      const results = await query.toArray();
      return results.map(doc => ({ ...doc, id: doc.id || doc._id.toString() }));
    } catch (error) {
      console.error(`query 오류 (${table}):`, error);
      return [];
    }
  }

  // SQL prepare 인터페이스 (기존 코드 호환)
  prepare(sql) {
    const self = this;
    return {
      run(...params) {
        return self.execute(sql, params, 'run');
      },
      get(...params) {
        return self.execute(sql, params, 'get');
      },
      all(...params) {
        return self.execute(sql, params, 'all');
      }
    };
  }

  async execute(sql, params, mode) {
    // SQL을 MongoDB 쿼리로 변환하는 것은 복잡하므로
    // 기본적인 CRUD만 지원
    console.warn('SQL 쿼리는 MongoDB에서 제한적으로 지원됩니다:', sql);
    return mode === 'all' ? [] : null;
  }
}

// 싱글톤 인스턴스
const mongoDb = new MongoDatabase();

module.exports = mongoDb;
module.exports.connect = connect;
module.exports.disconnect = disconnect;
module.exports.MongoDatabase = MongoDatabase;
