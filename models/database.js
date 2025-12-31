/**
 * 데이터베이스 추상화 모듈
 * MongoDB Atlas (Vercel 환경) 또는 JSON 파일 (로컬 환경) 지원
 */

const fs = require('fs');
const path = require('path');

// 환경 감지
const isVercel = process.env.VERCEL === '1';
const useMongoDb = !!process.env.MONGODB_URI;

// JSON 파일 경로 (로컬 폴백용)
const dbPath = path.join(__dirname, '..', 'data', 'n2golf.json');
const backupPath = path.join(__dirname, '..', 'data', 'n2golf.backup.json');

// 초기 데이터베이스 구조
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
  course_holes: [],
  schedule_comments: [],
  comment_reactions: [],
  community_posts: [],
  community_comments: [],
  community_reactions: [],
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
      membership_fees: 0,
      course_holes: 0,
      schedule_comments: 0,
      comment_reactions: 0,
      community_posts: 0,
      community_comments: 0,
      community_reactions: 0
    }
  }
};

// ============================================
// MongoDB 클라이언트 (MONGODB_URI가 있을 때)
// ============================================
let mongoClient = null;
let mongoDb = null;
let mongoConnected = false;

async function connectMongo() {
  if (mongoConnected && mongoClient && mongoDb) {
    return mongoDb;
  }

  const { MongoClient } = require('mongodb');
  const MONGODB_URI = process.env.MONGODB_URI;
  const DB_NAME = process.env.MONGODB_DB_NAME || 'n2golf';

  try {
    mongoClient = new MongoClient(MONGODB_URI, {
      maxPoolSize: 50,  // 연결 풀 증대 (기존 10 -> 50)
      minPoolSize: 5,   // 최소 연결 유지
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      maxIdleTimeMS: 30000,  // 유휴 연결 30초 후 정리
    });

    await mongoClient.connect();
    mongoDb = mongoClient.db(DB_NAME);
    mongoConnected = true;
    console.log('MongoDB Atlas 연결 성공');
    return mongoDb;
  } catch (error) {
    console.error('MongoDB 연결 오류:', error);
    mongoConnected = false;
    throw error;
  }
}

// ============================================
// JSON 파일 기반 데이터베이스 (로컬용)
// ============================================
function loadDB() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(data);
      if (!isVercel) {
        try {
          fs.writeFileSync(backupPath, data);
        } catch (backupError) {
          console.error('백업 생성 오류:', backupError);
        }
      }
      return parsed;
    }
  } catch (error) {
    console.error('DB 로드 오류:', error);
    if (!isVercel) {
      try {
        if (fs.existsSync(backupPath)) {
          console.log('백업 파일에서 복구 시도...');
          const backupData = fs.readFileSync(backupPath, 'utf8');
          const parsed = JSON.parse(backupData);
          fs.writeFileSync(dbPath, backupData);
          console.log('백업에서 복구 완료');
          return parsed;
        }
      } catch (recoveryError) {
        console.error('백업 복구 실패:', recoveryError);
      }
    }
  }
  return { ...initialData };
}

function saveDB(data) {
  if (isVercel) {
    console.log('Vercel 환경: JSON 파일 저장 건너뛰기');
    return;
  }

  try {
    const jsonData = JSON.stringify(data, null, 2);
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, jsonData);
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    console.error('DB 저장 오류:', error);
    throw new Error('데이터베이스 저장에 실패했습니다: ' + error.message);
  }
}

// ============================================
// 통합 데이터베이스 클래스
// ============================================
class Database {
  constructor() {
    this.data = loadDB();
    this.mongoCache = {}; // MongoDB 데이터 캐시
    this.cacheLoaded = false;
  }

  // MongoDB 컬렉션 가져오기
  async getCollection(name) {
    const db = await connectMongo();
    return db.collection(name);
  }

  // MongoDB 캐시 초기화 (앱 시작 시 호출)
  async initMongoCache() {
    if (!useMongoDb || this.cacheLoaded) return;

    try {
      const db = await connectMongo();
      const collections = ['members', 'golf_courses', 'income_categories', 'expense_categories',
        'incomes', 'expenses', 'schedules', 'reservations', 'membership_fees', 'course_holes',
        'schedule_comments', 'comment_reactions', 'community_posts', 'community_comments', 'community_reactions'];

      for (const name of collections) {
        const data = await db.collection(name).find({}).toArray();
        this.mongoCache[name] = data;
      }

      // _meta 로드
      const meta = await db.collection('_meta').findOne({});
      if (meta) {
        this.mongoCache._meta = meta;
      }

      this.cacheLoaded = true;
      console.log('MongoDB 캐시 초기화 완료');
    } catch (error) {
      console.error('MongoDB 캐시 초기화 오류:', error);
    }
  }

  // 테이블(컬렉션) 전체 데이터 가져오기 (동기 - 캐시 사용)
  getTable(name) {
    if (useMongoDb && this.mongoCache[name]) {
      return this.mongoCache[name];
    }
    return this.data[name] || [];
  }

  // 테이블(컬렉션) 전체 데이터 가져오기 (비동기 - MongoDB 직접 조회)
  async getTableAsync(name, options = {}) {
    if (useMongoDb) {
      try {
        const collection = await this.getCollection(name);
        const { projection, filter = {} } = options;

        // projection이 있으면 필요한 필드만 조회 (성능 최적화)
        const findOptions = projection ? { projection } : {};
        const data = await collection.find(filter, findOptions).toArray();

        // projection 없을 때만 캐시 업데이트 (전체 데이터일 때만)
        if (!projection && Object.keys(filter).length === 0) {
          this.mongoCache[name] = data;
        }
        return data;
      } catch (error) {
        console.error(`getTableAsync 오류 (${name}):`, error);
        return this.mongoCache[name] || [];
      }
    }
    return this.data[name] || [];
  }

  // ID로 문서 찾기
  findById(table, id) {
    const data = this.getTable(table);
    return data.find(r => r.id === id || r.id === parseInt(id));
  }

  // 데이터 삽입
  async insert(table, record) {
    if (useMongoDb) {
      return await this._mongoInsert(table, record);
    }
    return this._jsonInsert(table, record);
  }

  // 데이터 업데이트
  async update(table, id, updates) {
    if (useMongoDb) {
      return await this._mongoUpdate(table, id, updates);
    }
    return this._jsonUpdate(table, id, updates);
  }

  // 데이터 삭제
  async delete(table, id) {
    if (useMongoDb) {
      return await this._mongoDelete(table, id);
    }
    return this._jsonDelete(table, id);
  }

  // ============================================
  // MongoDB 메서드
  // ============================================
  async _mongoInsert(table, record) {
    try {
      const collection = await this.getCollection(table);

      // 새 ID 생성
      const maxIdDoc = await collection.find({}).sort({ id: -1 }).limit(1).toArray();
      const newId = maxIdDoc.length > 0 ? (parseInt(maxIdDoc[0].id) || 0) + 1 : 1;

      const newRecord = {
        ...record,
        id: newId,
        created_at: new Date().toISOString()
      };

      await collection.insertOne(newRecord);

      // 캐시 업데이트
      if (this.mongoCache[table]) {
        this.mongoCache[table].push(newRecord);
      }

      return newId;
    } catch (error) {
      console.error(`MongoDB insert 오류 (${table}):`, error);
      throw error;
    }
  }

  async _mongoUpdate(table, id, updates) {
    try {
      const collection = await this.getCollection(table);
      const updateData = { ...updates, updated_at: new Date().toISOString() };
      const numericId = parseInt(id);
      const stringId = String(id);

      console.log(`[MongoDB] 업데이트 시도: ${table}, id=${id}`, JSON.stringify(updateData));

      // 먼저 문서가 존재하는지 확인
      const existingDoc = await collection.findOne({
        $or: [{ id: numericId }, { id: stringId }]
      });

      if (!existingDoc) {
        console.log(`[MongoDB] 문서를 찾지 못함: id=${id}`);
        return false;
      }

      console.log(`[MongoDB] 기존 문서:`, JSON.stringify({ _id: existingDoc._id, id: existingDoc.id, team_number: existingDoc.team_number }));

      // MongoDB ObjectId를 사용하여 업데이트
      const result = await collection.updateOne(
        { _id: existingDoc._id },
        { $set: updateData }
      );

      console.log(`[MongoDB] 업데이트 결과: matched=${result.matchedCount}, modified=${result.modifiedCount}`);

      // 업데이트 후 문서 직접 조회 (캐시 아님)
      const updatedDoc = await collection.findOne({ _id: existingDoc._id });
      console.log(`[MongoDB] 업데이트 후 문서:`, JSON.stringify({ id: updatedDoc?.id, team_number: updatedDoc?.team_number }));

      // 실제 업데이트 성공 여부를 문서 비교로 확인
      const updateSuccess = updates.team_number !== undefined
        ? updatedDoc?.team_number === updates.team_number
        : result.matchedCount > 0;

      console.log(`[MongoDB] 실제 업데이트 성공 여부:`, updateSuccess);

      // 캐시 새로고침 (전체 다시 로드)
      this.mongoCache[table] = await collection.find({}).toArray();
      console.log(`[MongoDB] 캐시 새로고침 완료, 총 ${this.mongoCache[table].length}건`);

      return updateSuccess;
    } catch (error) {
      console.error(`MongoDB update 오류 (${table}, ${id}):`, error);
      return false;
    }
  }

  async _mongoDelete(table, id) {
    try {
      const collection = await this.getCollection(table);
      const result = await collection.deleteOne({
        $or: [{ id: parseInt(id) }, { id: String(id) }]
      });

      // 캐시 업데이트
      if (this.mongoCache[table]) {
        this.mongoCache[table] = this.mongoCache[table].filter(
          r => r.id !== id && r.id !== parseInt(id)
        );
      }

      return result.deletedCount > 0;
    } catch (error) {
      console.error(`MongoDB delete 오류 (${table}, ${id}):`, error);
      return false;
    }
  }

  // 캐시 새로고침
  async refreshCache(table) {
    if (!useMongoDb) return;

    try {
      const collection = await this.getCollection(table);
      this.mongoCache[table] = await collection.find({}).toArray();
    } catch (error) {
      console.error(`캐시 새로고침 오류 (${table}):`, error);
    }
  }

  // ============================================
  // JSON 파일 메서드 (기존 코드 호환)
  // ============================================
  _jsonInsert(table, record) {
    if (!this.data[table]) this.data[table] = [];
    if (!this.data._meta) this.data._meta = { lastId: {} };
    if (!this.data._meta.lastId[table]) this.data._meta.lastId[table] = 0;

    const newId = ++this.data._meta.lastId[table];
    record.id = newId;
    record.created_at = new Date().toISOString();
    this.data[table].push(record);
    saveDB(this.data);
    return newId;
  }

  _jsonUpdate(table, id, updates) {
    const record = this.findById(table, id);
    if (record) {
      Object.assign(record, updates, { updated_at: new Date().toISOString() });
      saveDB(this.data);
      return true;
    }
    return false;
  }

  _jsonDelete(table, id) {
    if (!this.data[table]) return false;
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(r => r.id !== id && r.id !== parseInt(id));
    saveDB(this.data);
    return before > this.data[table].length;
  }

  // ============================================
  // SQL 호환 인터페이스 (기존 코드 호환)
  // ============================================
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

  execute(sql, params, mode) {
    const sqlLower = sql.toLowerCase().trim();

    if (sqlLower.startsWith('insert')) {
      return this.handleInsert(sql, params);
    }
    if (sqlLower.startsWith('select')) {
      const results = this.handleSelect(sql, params);
      if (mode === 'get') return results[0] || null;
      return results;
    }
    if (sqlLower.startsWith('update')) {
      return this.handleUpdate(sql, params);
    }
    if (sqlLower.startsWith('delete')) {
      return this.handleDelete(sql, params);
    }

    return null;
  }

  handleInsert(sql, params) {
    const tableMatch = sql.match(/insert\s+(?:or\s+\w+\s+)?into\s+(\w+)/i);
    if (!tableMatch) return { changes: 0 };

    const table = tableMatch[1];
    if (!this.data[table]) this.data[table] = [];

    const columnsMatch = sql.match(/\(([^)]+)\)\s*values/i);
    if (!columnsMatch) return { changes: 0 };

    const columns = columnsMatch[1].split(',').map(c => c.trim());
    if (!this.data._meta) this.data._meta = { lastId: {} };
    if (!this.data._meta.lastId[table]) this.data._meta.lastId[table] = 0;
    const newId = ++this.data._meta.lastId[table];

    const record = { id: newId };
    columns.forEach((col, idx) => {
      record[col] = params[idx];
    });

    if (!record.created_at) {
      record.created_at = new Date().toISOString();
    }

    this.data[table].push(record);
    saveDB(this.data);

    return { changes: 1, lastInsertRowid: newId };
  }

  handleSelect(sql, params) {
    const fromMatch = sql.match(/from\s+(\w+)/i);
    if (!fromMatch) return [];

    const table = fromMatch[1];
    let results = [...this.getTable(table)];

    const whereMatch = sql.match(/where\s+(.+?)(?:order|group|limit|$)/i);
    if (whereMatch) {
      let paramIndex = 0;
      const conditions = whereMatch[1];
      results = results.filter(row => {
        return this.evaluateWhere(row, conditions, params, () => paramIndex++);
      });
    }

    const orderMatch = sql.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
    if (orderMatch) {
      const field = orderMatch[1];
      const desc = orderMatch[2]?.toLowerCase() === 'desc';
      results.sort((a, b) => {
        if (a[field] < b[field]) return desc ? 1 : -1;
        if (a[field] > b[field]) return desc ? -1 : 1;
        return 0;
      });
    }

    const limitMatch = sql.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }

    if (sql.toLowerCase().includes('count(*)')) {
      return [{ count: results.length }];
    }

    const sumMatch = sql.match(/sum\((\w+)\)/i);
    if (sumMatch) {
      const field = sumMatch[1];
      const total = results.reduce((sum, r) => sum + (r[field] || 0), 0);
      return [{ total }];
    }

    return results;
  }

  evaluateWhere(row, conditions, params, getParamIndex) {
    const parts = conditions.split(/\s+and\s+/i);

    for (const part of parts) {
      const eqMatch = part.match(/(\w+)\s*=\s*\?/);
      if (eqMatch) {
        const field = eqMatch[1];
        const value = params[getParamIndex()];
        if (row[field] != value) return false;
        continue;
      }

      const neqMatch = part.match(/(\w+)\s*!=\s*\?/);
      if (neqMatch) {
        const field = neqMatch[1];
        const value = params[getParamIndex()];
        if (row[field] == value) return false;
        continue;
      }

      const likeMatch = part.match(/(\w+)\s+like\s+\?/i);
      if (likeMatch) {
        const field = likeMatch[1];
        const value = params[getParamIndex()];
        const pattern = value.replace(/%/g, '.*');
        if (!new RegExp(pattern, 'i').test(row[field] || '')) return false;
        continue;
      }

      const gteMatch = part.match(/(\w+)\s*>=\s*\?/);
      if (gteMatch) {
        const field = gteMatch[1];
        const value = params[getParamIndex()];
        if (row[field] < value) return false;
        continue;
      }

      const gtMatch = part.match(/(\w+)\s*>\s*\?/);
      if (gtMatch) {
        const field = gtMatch[1];
        const value = params[getParamIndex()];
        if (row[field] <= value) return false;
        continue;
      }

      const inMatch = part.match(/(\w+)\s+in\s*\(/i);
      if (inMatch) {
        const field = inMatch[1];
        const values = [];
        while (part.includes('?')) {
          values.push(params[getParamIndex()]);
        }
        if (!values.includes(row[field])) return false;
        continue;
      }
    }

    return true;
  }

  handleUpdate(sql, params) {
    const tableMatch = sql.match(/update\s+(\w+)/i);
    if (!tableMatch) return { changes: 0 };

    const table = tableMatch[1];
    const data = this.getTable(table);
    if (!data.length) return { changes: 0 };

    const setMatch = sql.match(/set\s+(.+?)\s+where/i);
    if (!setMatch) return { changes: 0 };

    const setFields = setMatch[1].split(',').map(s => s.trim().split('=')[0].trim());

    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch) return { changes: 0 };

    const whereField = whereMatch[1];
    const whereValue = params[setFields.length];

    let changes = 0;
    data.forEach(row => {
      if (row[whereField] == whereValue) {
        setFields.forEach((field, idx) => {
          row[field] = params[idx];
        });
        row.updated_at = new Date().toISOString();
        changes++;
      }
    });

    if (!useMongoDb) {
      saveDB(this.data);
    }
    return { changes };
  }

  handleDelete(sql, params) {
    const tableMatch = sql.match(/delete\s+from\s+(\w+)/i);
    if (!tableMatch) return { changes: 0 };

    const table = tableMatch[1];
    if (!this.data[table]) return { changes: 0 };

    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch) return { changes: 0 };

    const field = whereMatch[1];
    const value = params[0];

    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(row => row[field] != value);
    const changes = before - this.data[table].length;

    if (!useMongoDb) {
      saveDB(this.data);
    }
    return { changes };
  }

  // 쿼리 메서드
  query(table, filter = {}, options = {}) {
    let results = [...this.getTable(table)];

    if (Object.keys(filter).length > 0) {
      results = results.filter(row => {
        return Object.entries(filter).every(([key, value]) => {
          if (value === undefined || value === null || value === '') return true;
          return row[key] == value;
        });
      });
    }

    if (options.orderBy) {
      const desc = options.orderDesc;
      results.sort((a, b) => {
        if (a[options.orderBy] < b[options.orderBy]) return desc ? 1 : -1;
        if (a[options.orderBy] > b[options.orderBy]) return desc ? -1 : 1;
        return 0;
      });
    }

    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  join(table1, table2, key1, key2) {
    const data1 = this.getTable(table1);
    const data2 = this.getTable(table2);

    return data1.map(row1 => {
      const match = data2.find(row2 => row1[key1] === row2[key2]);
      return { ...row1, [table2]: match };
    });
  }
}

// 싱글톤 인스턴스
const db = new Database();

// MongoDB 사용 시 앱 시작 시 캐시 초기화
if (useMongoDb) {
  console.log('MongoDB 모드 활성화 (MONGODB_URI 감지됨)');
  db.initMongoCache().catch(err => {
    console.error('MongoDB 초기화 실패:', err);
  });
} else {
  console.log('JSON 파일 모드 (로컬 개발 환경)');
}

module.exports = db;
