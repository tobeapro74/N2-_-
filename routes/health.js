const express = require('express');
const router = express.Router();

const useMongoDb = !!process.env.MONGODB_URI;

router.get('/', async (req, res) => {
  const checks = { server: 'ok' };
  let monthlyBookings;
  let lastCronRun;

  try {
    if (useMongoDb) {
      const { getCollection } = require('../models/mongodb');
      const reservations = await getCollection('reservations');
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      monthlyBookings = await reservations.countDocuments({
        createdAt: { $gte: startOfMonth },
      });
      checks['db'] = 'ok';
    } else {
      const db = require('../models/database');
      const all = await db.getAll('reservations');
      const now = new Date();
      monthlyBookings = all.filter((r) => {
        const d = new Date(r.created_at || r.date || '');
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      }).length;
      checks['db'] = 'ok (json)';
    }
  } catch {
    checks['db'] = 'error';
  }

  // 마지막 크론 실행 기록 (vercel.json cron 로그는 직접 접근 불가 — 스케줄 정보만 반환)
  lastCronRun = process.env.LAST_CRON_RUN || null;

  const overall = Object.values(checks).every((v) => v.startsWith('ok')) ? 'ok' : 'degraded';

  res.json({
    status: overall,
    app: 'n2golf',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
    ...(monthlyBookings !== undefined && { monthly_bookings: monthlyBookings }),
    ...(lastCronRun && { last_cron_run: lastCronRun }),
  });
});

module.exports = router;
