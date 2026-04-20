/**
 * data/n2golf.json의 [통장] 입·출금 건을 MongoDB incomes / expenses에 반영합니다.
 * (로컬 JSON과 동일 id로 upsert)
 *
 * 사용: MONGODB_URI=... node scripts/sync-bank-transactions-to-mongodb.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { MongoClient } = require('mongodb');

const DATA_PATH = path.join(__dirname, '..', 'data', 'n2golf.json');

async function main() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI가 없습니다.');
    process.exit(1);
  }

  const raw = fs.readFileSync(DATA_PATH, 'utf8');
  const data = JSON.parse(raw);

  const bankIncomes = (data.incomes || []).filter(
    (r) => r.description && String(r.description).includes('[통장]')
  );
  const bankExpenses = (data.expenses || []).filter(
    (r) => r.description && String(r.description).includes('[통장]')
  );

  const dbName = process.env.MONGODB_DB_NAME || 'n2golf';
  const client = new MongoClient(uri);

  await client.connect();
  const db = client.db(dbName);

  let inc = 0;
  let exp = 0;

  for (const doc of bankIncomes) {
    await db.collection('incomes').replaceOne({ id: doc.id }, doc, { upsert: true });
    inc += 1;
  }
  for (const doc of bankExpenses) {
    await db.collection('expenses').replaceOne({ id: doc.id }, doc, { upsert: true });
    exp += 1;
  }

  const maxIncomeId = Math.max(...(data.incomes || []).map((r) => r.id || 0));
  const maxExpenseId = Math.max(...(data.expenses || []).map((r) => r.id || 0));

  await db.collection('_meta').updateOne(
    {},
    {
      $set: {
        'lastId.incomes': maxIncomeId,
        'lastId.expenses': maxExpenseId
      }
    },
    { upsert: true }
  );

  await client.close();

  console.log(`완료: incomes upsert ${inc}건, expenses upsert ${exp}건 (lastId incomes=${maxIncomeId}, expenses=${maxExpenseId})`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
