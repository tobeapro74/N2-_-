# SQLite 마이그레이션 검토

## 현재 상태

현재 시스템은 JSON 파일 기반 데이터베이스를 사용합니다.

### 현재 구조
- **저장소**: `data/n2golf.json`
- **백업**: `data/n2golf.backup.json`
- **방식**: 메모리에 전체 데이터 로드 후 조작

### 현재 장점
- 설치/설정 불필요
- 파일 하나로 완전한 백업
- 코드가 단순하고 이해하기 쉬움

### 현재 단점
- 동시 접근 시 데이터 손실 위험
- 데이터 증가 시 성능 저하
- 복잡한 쿼리 불가능
- 트랜잭션 지원 없음

---

## SQLite 마이그레이션 장점

### 1. 데이터 무결성
- ACID 트랜잭션 지원
- 동시 접근 안전 (WAL 모드)
- 외래 키 제약 조건

### 2. 성능
- 인덱스 기반 빠른 검색
- 대용량 데이터 처리 가능
- 메모리 효율적 사용

### 3. 기능
- SQL 쿼리 지원
- JOIN, GROUP BY, HAVING 등
- 집계 함수 (SUM, COUNT, AVG)

### 4. 운영
- 단일 파일 데이터베이스
- 백업/복원 용이
- 무료, 서버리스

---

## 마이그레이션 계획

### 1단계: 스키마 설계

```sql
-- 회원 테이블
CREATE TABLE members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  internal_phone TEXT,
  department TEXT,
  email TEXT,
  password_hash TEXT,
  join_date TEXT,
  status TEXT DEFAULT 'active',
  is_admin INTEGER DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT
);

-- 골프장 테이블
CREATE TABLE golf_courses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  location TEXT,
  phone TEXT,
  schedule_week INTEGER,
  schedule_day TEXT,
  tee_time_start TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 일정 테이블
CREATE TABLE schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  golf_course_id INTEGER REFERENCES golf_courses(id),
  play_date TEXT NOT NULL,
  tee_times TEXT,
  max_members INTEGER DEFAULT 12,
  status TEXT DEFAULT 'open',
  notes TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 예약 테이블
CREATE TABLE reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER REFERENCES schedules(id),
  member_id INTEGER REFERENCES members(id),
  tee_time TEXT,
  status TEXT DEFAULT 'pending',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(schedule_id, member_id)
);

-- 수입 카테고리
CREATE TABLE income_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

-- 지출 카테고리
CREATE TABLE expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT
);

-- 수입 내역
CREATE TABLE incomes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES income_categories(id),
  member_id INTEGER REFERENCES members(id),
  amount REAL NOT NULL,
  description TEXT,
  income_date TEXT NOT NULL,
  created_by INTEGER REFERENCES members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 지출 내역
CREATE TABLE expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES expense_categories(id),
  amount REAL NOT NULL,
  description TEXT,
  expense_date TEXT NOT NULL,
  created_by INTEGER REFERENCES members(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 회비 납부
CREATE TABLE membership_fees (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  member_id INTEGER REFERENCES members(id),
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  amount REAL,
  status TEXT DEFAULT 'unpaid',
  paid_date TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(member_id, year, month)
);

-- 인덱스
CREATE INDEX idx_schedules_date ON schedules(play_date);
CREATE INDEX idx_reservations_member ON reservations(member_id);
CREATE INDEX idx_incomes_date ON incomes(income_date);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_fees_member_year ON membership_fees(member_id, year);
```

### 2단계: 마이그레이션 스크립트

```javascript
// scripts/migrate-to-sqlite.js
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const jsonPath = path.join(__dirname, '..', 'data', 'n2golf.json');
const sqlitePath = path.join(__dirname, '..', 'data', 'n2golf.sqlite');

// JSON 데이터 로드
const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

// SQLite 연결
const db = new Database(sqlitePath);

// WAL 모드 활성화 (성능 향상)
db.pragma('journal_mode = WAL');

// 스키마 생성 (위 SQL 실행)
// ...

// 데이터 마이그레이션
const tables = ['members', 'golf_courses', 'schedules', 'reservations',
                'income_categories', 'expense_categories', 'incomes',
                'expenses', 'membership_fees'];

for (const table of tables) {
  const records = jsonData[table] || [];
  // INSERT 처리
}

console.log('마이그레이션 완료');
```

### 3단계: 데이터베이스 래퍼 교체

```javascript
// models/database-sqlite.js
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'data', 'n2golf.sqlite');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

module.exports = {
  prepare: (sql) => db.prepare(sql),

  getTable: (name) => {
    return db.prepare(`SELECT * FROM ${name}`).all();
  },

  findById: (table, id) => {
    return db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(id);
  },

  insert: (table, record) => {
    const keys = Object.keys(record);
    const values = Object.values(record);
    const placeholders = keys.map(() => '?').join(', ');
    const sql = `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders})`;
    const result = db.prepare(sql).run(...values);
    return result.lastInsertRowid;
  },

  update: (table, id, updates) => {
    const keys = Object.keys(updates);
    const values = Object.values(updates);
    const setClause = keys.map(k => `${k} = ?`).join(', ');
    const sql = `UPDATE ${table} SET ${setClause}, updated_at = datetime('now') WHERE id = ?`;
    return db.prepare(sql).run(...values, id);
  },

  delete: (table, id) => {
    return db.prepare(`DELETE FROM ${table} WHERE id = ?`).run(id);
  },

  query: (table, filter = {}, options = {}) => {
    let sql = `SELECT * FROM ${table}`;
    const params = [];

    const conditions = Object.entries(filter)
      .filter(([_, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => {
        params.push(v);
        return `${k} = ?`;
      });

    if (conditions.length > 0) {
      sql += ` WHERE ${conditions.join(' AND ')}`;
    }

    if (options.orderBy) {
      sql += ` ORDER BY ${options.orderBy}`;
      if (options.orderDesc) sql += ' DESC';
    }

    if (options.limit) {
      sql += ` LIMIT ${options.limit}`;
    }

    return db.prepare(sql).all(...params);
  },

  // 트랜잭션 지원
  transaction: (fn) => {
    return db.transaction(fn)();
  }
};
```

---

## 필요 패키지

```bash
npm install better-sqlite3
```

> **참고**: `better-sqlite3`는 네이티브 모듈이므로 빌드 도구 필요
> - Windows: `npm install --global windows-build-tools`
> - macOS: `xcode-select --install`
> - Linux: `sudo apt-get install build-essential`

---

## 마이그레이션 일정 (권장)

| 단계 | 작업 | 예상 시간 |
|------|------|----------|
| 1 | 스키마 설계 및 검증 | 2시간 |
| 2 | 마이그레이션 스크립트 작성 | 3시간 |
| 3 | 데이터베이스 래퍼 작성 | 4시간 |
| 4 | 라우터 수정 (필요시) | 2시간 |
| 5 | 테스트 및 검증 | 3시간 |
| 6 | 프로덕션 마이그레이션 | 1시간 |

**총 예상 시간**: 약 15시간

---

## 권장 사항

### 즉시 마이그레이션이 필요한 경우
- 동시 접속자 10명 이상
- 데이터 1만 건 이상
- 복잡한 통계/분석 필요

### 현재 유지 권장 경우
- 동시 접속자 소수
- 데이터 1천 건 미만
- 단순한 CRUD 위주

### 현재 시스템 분석
N2골프 동호회 규모 고려 시:
- 회원 수: 최대 300명
- 월간 라운드: 약 12회
- 예상 데이터: 연간 수천 건 수준

**결론**: 현재 JSON 기반 시스템으로 충분하나, 향후 확장성을 위해 **중기적으로 SQLite 마이그레이션 권장**

---

## 롤백 계획

마이그레이션 실패 시:
1. SQLite 파일 삭제
2. `models/database.js` 원복
3. JSON 백업 파일 복원

```bash
# 롤백 스크립트
cp data/n2golf.backup.json data/n2golf.json
rm data/n2golf.sqlite
git checkout models/database.js
```
