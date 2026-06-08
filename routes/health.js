const express = require('express');
const router = express.Router();

let cachedResult = null;
let cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5분

router.get('/', async (_req, res) => {
  const now = Date.now();

  if (cachedResult && now - cacheTime < CACHE_TTL_MS) {
    return res.json({ ...cachedResult, timestamp: new Date().toISOString(), cached: true });
  }

  const checks = { server: 'ok' };
  let monthlyBookings;
  let lastCronRun;
  let cronOpenedCount;
  let dau;          // 전일 활성 사용자 수
  let newMembers;   // 전일 신규 가입자 수
  let totalMembers; // 전체 회원 수

  try {
    const db = require('../models/database');
    const nowDate = new Date();

    // KST 전일 범위 계산
    const kstOffset = 9 * 60 * 60 * 1000;
    const kstNow = new Date(nowDate.getTime() + kstOffset);
    const kstYesterdayStart = new Date(kstNow);
    kstYesterdayStart.setDate(kstYesterdayStart.getDate() - 1);
    kstYesterdayStart.setHours(0, 0, 0, 0);
    const kstYesterdayEnd = new Date(kstYesterdayStart);
    kstYesterdayEnd.setHours(23, 59, 59, 999);
    // UTC로 변환
    const yStart = new Date(kstYesterdayStart.getTime() - kstOffset);
    const yEnd = new Date(kstYesterdayEnd.getTime() - kstOffset);

    const [reservations, snapshots, members] = await Promise.all([
      db.getTableAsync('reservations'),
      db.getTableAsync('agent_snapshots'),
      db.getTableAsync('members'),
    ]);
    checks['db'] = 'ok';

    // 이번달 예약 수
    monthlyBookings = reservations.filter((r) => {
      const d = new Date(r.created_at || r.date || '');
      return d.getFullYear() === nowDate.getFullYear() && d.getMonth() === nowDate.getMonth();
    }).length;

    // 전일 DAU (last_login 기준)
    dau = members.filter((m) => {
      if (!m.last_login) return false;
      const d = new Date(m.last_login);
      return d >= yStart && d <= yEnd;
    }).length;

    // 전일 신규 가입자 (created_at 기준)
    newMembers = members.filter((m) => {
      if (!m.created_at) return false;
      const d = new Date(m.created_at);
      return d >= yStart && d <= yEnd;
    }).length;

    // 전체 활성 회원 수
    totalMembers = members.filter((m) => m.status === 'active').length;

    // 자정 크론 마지막 실행 시각
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
    ...(totalMembers !== undefined && { total_members: totalMembers }),
    ...(dau !== undefined && { dau_yesterday: dau }),
    ...(newMembers !== undefined && { new_members_yesterday: newMembers }),
    ...(lastCronRun && { last_cron_run: lastCronRun }),
    ...(cronOpenedCount !== undefined && { cron_opened_count: cronOpenedCount }),
  };
  cacheTime = now;

  res.json({ ...cachedResult, timestamp: new Date().toISOString() });
});

module.exports = router;
