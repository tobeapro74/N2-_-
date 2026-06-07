const express = require('express');
const router = express.Router();

router.get('/', async (req, res) => {
  const checks = { server: 'ok' };
  let monthlyBookings;

  try {
    const db = require('../models/database');
    const all = await db.getAll('reservations');
    const now = new Date();
    monthlyBookings = all.filter((r) => {
      const d = new Date(r.created_at || r.date || '');
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    checks['db'] = 'ok';
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
  });
});

module.exports = router;
