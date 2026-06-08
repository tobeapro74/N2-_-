const express = require('express');
const router = express.Router();

router.get('/', async (_req, res) => {
  const checks = { server: 'ok' };
  let monthlyBookings;
  let lastCronRun;
  let cronOpenedCount;

  try {
    const db = require('../models/database');
    const now = new Date();

    // 이번달 예약 수
    const all = await db.getTableAsync('reservations');
    monthlyBookings = all.filter((r) => {
      const d = new Date(r.created_at || r.date || '');
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    checks['db'] = 'ok';

    // 자정 크론 마지막 실행 시각
    const snapshots = await db.getTableAsync('agent_snapshots');
    const cronSnap = snapshots.find((s) => s.key === 'cron_last_run');
    if (cronSnap) {
      lastCronRun = cronSnap.executedAt;
      cronOpenedCount = cronSnap.openedCount;

      // 24시간 이상 미실행 시 경고
      const hoursSince = (now - new Date(cronSnap.executedAt)) / (1000 * 60 * 60);
      if (hoursSince > 25) {
        checks['cron'] = `warn: ${Math.floor(hoursSince)}시간 미실행`;
      } else {
        checks['cron'] = 'ok';
      }
    }
  } catch {
    checks['db'] = 'error';
  }

  const overall = Object.values(checks).every((v) => v === 'ok') ? 'ok' : 'degraded';

  res.json({
    status: overall,
    app: 'n2golf',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
    ...(monthlyBookings !== undefined && { monthly_bookings: monthlyBookings }),
    ...(lastCronRun && { last_cron_run: lastCronRun }),
    ...(cronOpenedCount !== undefined && { cron_opened_count: cronOpenedCount }),
  });
});

module.exports = router;
