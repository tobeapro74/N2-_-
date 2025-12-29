const fs = require('fs');
const path = require('path');

// Vercel 환경 감지
const isVercel = process.env.VERCEL === '1';

const dbPath = path.join(__dirname, '..', 'data', 'n2golf.json');

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

// 백업 파일 경로
const backupPath = path.join(__dirname, '..', 'data', 'n2golf.backup.json');

// 데이터베이스 로드
function loadDB() {
  try {
    if (fs.existsSync(dbPath)) {
      const data = fs.readFileSync(dbPath, 'utf8');
      const parsed = JSON.parse(data);
      // Vercel 환경이 아닐 때만 백업 생성 (Vercel은 읽기 전용 파일 시스템)
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
    // Vercel 환경이 아닐 때만 백업에서 복구 시도
    if (!isVercel) {
      try {
        if (fs.existsSync(backupPath)) {
          console.log('백업 파일에서 복구 시도...');
          const backupData = fs.readFileSync(backupPath, 'utf8');
          const parsed = JSON.parse(backupData);
          // 복구된 데이터를 메인 파일에 저장
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

// 데이터베이스 저장
function saveDB(data) {
  // Vercel 환경에서는 파일 시스템이 읽기 전용이므로 저장 건너뛰기
  if (isVercel) {
    console.log('Vercel 환경: 파일 저장 건너뛰기 (읽기 전용 파일 시스템)');
    return;
  }

  try {
    const jsonData = JSON.stringify(data, null, 2);
    // 임시 파일에 먼저 저장 (원자적 쓰기)
    const tempPath = dbPath + '.tmp';
    fs.writeFileSync(tempPath, jsonData);
    // 임시 파일을 실제 파일로 이동 (rename은 원자적 연산)
    fs.renameSync(tempPath, dbPath);
  } catch (error) {
    console.error('DB 저장 오류:', error);
    // 저장 실패 시 에러를 throw하여 호출자에게 알림
    throw new Error('데이터베이스 저장에 실패했습니다: ' + error.message);
  }
}

// 데이터베이스 래퍼 클래스
class Database {
  constructor() {
    this.data = loadDB();
  }

  // SQL 유사 prepare 인터페이스 제공
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

    // INSERT
    if (sqlLower.startsWith('insert')) {
      return this.handleInsert(sql, params);
    }

    // SELECT
    if (sqlLower.startsWith('select')) {
      const results = this.handleSelect(sql, params);
      if (mode === 'get') return results[0] || null;
      return results;
    }

    // UPDATE
    if (sqlLower.startsWith('update')) {
      return this.handleUpdate(sql, params);
    }

    // DELETE
    if (sqlLower.startsWith('delete')) {
      return this.handleDelete(sql, params);
    }

    return null;
  }

  handleInsert(sql, params) {
    // 간단한 INSERT 파싱
    const tableMatch = sql.match(/insert\s+(?:or\s+\w+\s+)?into\s+(\w+)/i);
    if (!tableMatch) return { changes: 0 };

    const table = tableMatch[1];
    if (!this.data[table]) this.data[table] = [];

    const columnsMatch = sql.match(/\(([^)]+)\)\s*values/i);
    if (!columnsMatch) return { changes: 0 };

    const columns = columnsMatch[1].split(',').map(c => c.trim());
    const newId = ++this.data._meta.lastId[table];

    const record = { id: newId };
    columns.forEach((col, idx) => {
      record[col] = params[idx];
    });

    // created_at 자동 추가
    if (!record.created_at) {
      record.created_at = new Date().toISOString();
    }

    this.data[table].push(record);
    saveDB(this.data);

    return { changes: 1, lastInsertRowid: newId };
  }

  handleSelect(sql, params) {
    // 테이블 추출
    const fromMatch = sql.match(/from\s+(\w+)/i);
    if (!fromMatch) return [];

    const table = fromMatch[1];
    let results = [...(this.data[table] || [])];

    // WHERE 조건 처리 (간단한 버전)
    const whereMatch = sql.match(/where\s+(.+?)(?:order|group|limit|$)/i);
    if (whereMatch) {
      let paramIndex = 0;
      const conditions = whereMatch[1];

      results = results.filter(row => {
        return this.evaluateWhere(row, conditions, params, () => paramIndex++);
      });
    }

    // ORDER BY
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

    // LIMIT
    const limitMatch = sql.match(/limit\s+(\d+)/i);
    if (limitMatch) {
      results = results.slice(0, parseInt(limitMatch[1]));
    }

    // COUNT(*) 처리
    if (sql.toLowerCase().includes('count(*)')) {
      return [{ count: results.length }];
    }

    // SUM 처리
    const sumMatch = sql.match(/sum\((\w+)\)/i);
    if (sumMatch) {
      const field = sumMatch[1];
      const total = results.reduce((sum, r) => sum + (r[field] || 0), 0);
      return [{ total }];
    }

    return results;
  }

  evaluateWhere(row, conditions, params, getParamIndex) {
    // 간단한 AND 조건만 처리
    const parts = conditions.split(/\s+and\s+/i);

    for (const part of parts) {
      // field = ?
      const eqMatch = part.match(/(\w+)\s*=\s*\?/);
      if (eqMatch) {
        const field = eqMatch[1];
        const value = params[getParamIndex()];
        if (row[field] != value) return false;
        continue;
      }

      // field != ?
      const neqMatch = part.match(/(\w+)\s*!=\s*\?/);
      if (neqMatch) {
        const field = neqMatch[1];
        const value = params[getParamIndex()];
        if (row[field] == value) return false;
        continue;
      }

      // field LIKE ?
      const likeMatch = part.match(/(\w+)\s+like\s+\?/i);
      if (likeMatch) {
        const field = likeMatch[1];
        const value = params[getParamIndex()];
        const pattern = value.replace(/%/g, '.*');
        if (!new RegExp(pattern, 'i').test(row[field] || '')) return false;
        continue;
      }

      // field >= ?
      const gteMatch = part.match(/(\w+)\s*>=\s*\?/);
      if (gteMatch) {
        const field = gteMatch[1];
        const value = params[getParamIndex()];
        if (row[field] < value) return false;
        continue;
      }

      // field > ?
      const gtMatch = part.match(/(\w+)\s*>\s*\?/);
      if (gtMatch) {
        const field = gtMatch[1];
        const value = params[getParamIndex()];
        if (row[field] <= value) return false;
        continue;
      }

      // field IN (?)
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
    if (!this.data[table]) return { changes: 0 };

    // SET 절 파싱
    const setMatch = sql.match(/set\s+(.+?)\s+where/i);
    if (!setMatch) return { changes: 0 };

    const setFields = setMatch[1].split(',').map(s => s.trim().split('=')[0].trim());

    // WHERE 조건
    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch) return { changes: 0 };

    const whereField = whereMatch[1];
    const whereValue = params[setFields.length];

    let changes = 0;
    this.data[table].forEach(row => {
      if (row[whereField] == whereValue) {
        setFields.forEach((field, idx) => {
          row[field] = params[idx];
        });
        row.updated_at = new Date().toISOString();
        changes++;
      }
    });

    saveDB(this.data);
    return { changes };
  }

  handleDelete(sql, params) {
    const tableMatch = sql.match(/delete\s+from\s+(\w+)/i);
    if (!tableMatch) return { changes: 0 };

    const table = tableMatch[1];
    if (!this.data[table]) return { changes: 0 };

    // WHERE 조건
    const whereMatch = sql.match(/where\s+(\w+)\s*=\s*\?/i);
    if (!whereMatch) return { changes: 0 };

    const field = whereMatch[1];
    const value = params[0];

    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(row => row[field] != value);
    const changes = before - this.data[table].length;

    saveDB(this.data);
    return { changes };
  }

  // 직접 데이터 접근
  getTable(name) {
    return this.data[name] || [];
  }

  findById(table, id) {
    return (this.data[table] || []).find(r => r.id === id);
  }

  insert(table, record) {
    if (!this.data[table]) this.data[table] = [];
    const newId = ++this.data._meta.lastId[table];
    record.id = newId;
    record.created_at = new Date().toISOString();
    this.data[table].push(record);
    saveDB(this.data);
    return newId;
  }

  update(table, id, updates) {
    const record = this.findById(table, id);
    if (record) {
      Object.assign(record, updates, { updated_at: new Date().toISOString() });
      saveDB(this.data);
      return true;
    }
    return false;
  }

  delete(table, id) {
    if (!this.data[table]) return false;
    const before = this.data[table].length;
    this.data[table] = this.data[table].filter(r => r.id !== id);
    saveDB(this.data);
    return before > this.data[table].length;
  }

  // 복잡한 쿼리용 메서드
  query(table, filter = {}, options = {}) {
    let results = [...(this.data[table] || [])];

    // 필터 적용
    if (Object.keys(filter).length > 0) {
      results = results.filter(row => {
        return Object.entries(filter).every(([key, value]) => {
          if (value === undefined || value === null || value === '') return true;
          return row[key] == value;
        });
      });
    }

    // 정렬
    if (options.orderBy) {
      const desc = options.orderDesc;
      results.sort((a, b) => {
        if (a[options.orderBy] < b[options.orderBy]) return desc ? 1 : -1;
        if (a[options.orderBy] > b[options.orderBy]) return desc ? -1 : 1;
        return 0;
      });
    }

    // 제한
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  // 조인 헬퍼
  join(table1, table2, key1, key2) {
    const data1 = this.data[table1] || [];
    const data2 = this.data[table2] || [];

    return data1.map(row1 => {
      const match = data2.find(row2 => row1[key1] === row2[key2]);
      return { ...row1, [table2]: match };
    });
  }
}

module.exports = new Database();
