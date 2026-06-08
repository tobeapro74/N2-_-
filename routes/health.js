const express = require('express');
const router = express.Router();

// 마지막 DB 조회 결과 캐시 (동일 프로세스 재사용 시 유효)
let cachedResult = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

router.get('/', async (_req, res) => {
  const now = Date.now();

  // 캐시가 살아있으면 즉시 반환
  if (cachedResult && now - cacheTime < CACHE_TTL_MS) {
    return res.json({ ...cachedResult, timestamp: new Date().toISOString(), cached: true });
  }

  const checks = { server: 'ok' };
  let monthlyBookings;
  let lastCronRun;
  let cronOpenedCount;

  try {
    const db = require('../models/database');
    const nowDate = new Date();

    const [reservations, snapshots] = await Promise.all([
      db.getTableAsync('reservations'),
      db.getTableAsync('agent_snapshots'),
    ]);
    checks['db'] = 'ok';

    monthlyBookings = reservations.filter((r) => {
      const d = new Date(r.created_at || r.date || '');
      return d.getFullYear() === nowDate.getFullYear() && d.getMonth() === nowDate.getMonth();
    }).length;

    const cronSnap = snapshots.find((s) => s.key === 'cron_last_run');
    if (cronSnap) {
      lastCronRun = cronSnap.executedAt;
      cronOpenedCount = cronSnap.openedCount;
      const hoursSince = (nowDate - new Date(cronSnap.executedAt)) / (1000 * 60 * 60);
      checks['cron'] = hoursSince > 25 ? `warn: ${Math.floor(hoursSince)}시간 미실행` : 'ok';
    }
  } catch {
    checks['db'] = 'error';
  }

  const overall = Object.values(checks).every((v) => v === 'ok') ? 'ok' : 'degraded';

  cachedResult = {
    status: overall,
    app: 'n2golf',
    version: '1.0.0',
    checks,
    ...(monthlyBookings !== undefined && { monthly_bookings: monthlyBookings }),
    ...(lastCronRun && { last_cron_run: lastCronRun }),
    ...(cronOpenedCount !== undefined && { cron_opened_count: cronOpenedCount }),
  };
  cacheTime = now;

  res.json({ ...cachedResult, timestamp: new Date().toISOString() });
});

module.exports = router;
