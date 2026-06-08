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

    // reservations, agent_snapshots 병렬 조회
    const [reservations, snapshots] = await Promise.all([
      db.getTableAsync('reservations'),
      db.getTableAsync('agent_snapshots'),
    ]);
    checks['db'] = 'ok';

    // 이번달 예약 수
    monthlyBookings = reservations.filter((r) => {
      const d = new Date(r.created_at || r.date || '');
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;

    // 자정 크론 마지막 실행 시각
    const cronSnap = snapshots.find((s) => s.key === 'cron_last_run');
    if (cronSnap) {
      lastCronRun = cronSnap.executedAt;
      cronOpenedCount = cronSnap.openedCount;

      const hoursSince = (now - new Date(cronSnap.executedAt)) / (1000 * 60 * 60);
      checks['cron'] = hoursSince > 25 ? `warn: ${Math.floor(hoursSince)}시간 미실행` : 'ok';
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
