const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// 관리자 권한 미들웨어
const requireAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).render('error', {
      title: '접근 거부',
      message: '관리자 권한이 필요합니다.'
    });
  }
  next();
};

// 내 예약 목록
router.get('/', requireAuth, (req, res) => {
  const memberId = req.session.user.id;
  const allReservations = db.getTable('reservations').filter(r => r.member_id === memberId);
  const schedules = db.getTable('schedules');
  const golfCourses = db.getTable('golf_courses');

  const reservations = allReservations
    .map(r => {
      const schedule = schedules.find(s => s.id === r.schedule_id) || {};
      const course = golfCourses.find(gc => gc.id === schedule.golf_course_id) || {};
      return {
        ...r,
        play_date: schedule.play_date,
        tee_times: schedule.tee_times,
        schedule_status: schedule.status,
        course_name: course.name,
        location: course.location
      };
    })
    .sort((a, b) => (b.play_date || '').localeCompare(a.play_date || ''));

  res.render('reservations/my-list', {
    title: '내 예약',
    reservations
  });
});

// 예약 신청
router.post('/apply', requireAuth, (req, res) => {
  const { schedule_id } = req.body;
  const memberId = req.session.user.id;
  const scheduleId = parseInt(schedule_id);

  // 관리자 계정은 예약 불가
  if (req.session.user.is_admin) {
    return res.status(403).json({ error: '관리자 계정은 예약 신청이 불가능합니다.' });
  }

  // 일정 확인
  const schedule = db.findById('schedules', scheduleId);
  if (!schedule || schedule.status !== 'open') {
    return res.status(400).json({ error: '신청할 수 없는 일정입니다.' });
  }

  const golfCourse = db.findById('golf_courses', schedule.golf_course_id) || {};

  // 중복 신청 확인
  const existing = db.getTable('reservations').find(
    r => r.schedule_id === scheduleId && r.member_id === memberId
  );

  if (existing) {
    return res.status(400).json({ error: '이미 신청한 일정입니다.' });
  }

  // 연속 참가 여부 확인
  const allSchedules = db.getTable('schedules')
    .filter(s => s.golf_course_id === schedule.golf_course_id && s.play_date < schedule.play_date)
    .sort((a, b) => b.play_date.localeCompare(a.play_date));

  let priority = 0;
  let consecutiveCount = 0;

  if (allSchedules.length > 0) {
    const prevSchedule = allSchedules[0];
    const wasConfirmed = db.getTable('reservations').find(
      r => r.schedule_id === prevSchedule.id && r.member_id === memberId && r.status === 'confirmed'
    );

    if (wasConfirmed) {
      priority = 1;
      consecutiveCount = 1;
    }
  }

  // 예약 생성
  db.insert('reservations', {
    schedule_id: scheduleId,
    member_id: memberId,
    priority,
    consecutive_count: consecutiveCount,
    status: 'pending',
    applied_at: new Date().toISOString()
  });

  // 현재 예약 수 확인
  const currentCount = db.getTable('reservations')
    .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
    .length;

  const maxMembers = golfCourse.max_members || 12;

  res.json({
    success: true,
    message: '예약 신청이 완료되었습니다.',
    position: currentCount,
    isWaitlist: currentCount > maxMembers
  });
});

// 예약 취소
router.post('/cancel', requireAuth, (req, res) => {
  const { reservation_id } = req.body;
  const memberId = req.session.user.id;
  const reservationId = parseInt(reservation_id);

  const reservation = db.findById('reservations', reservationId);
  if (!reservation || reservation.member_id !== memberId) {
    return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
  }

  const schedule = db.findById('schedules', reservation.schedule_id);
  if (schedule && schedule.status === 'completed') {
    return res.status(400).json({ error: '완료된 일정은 취소할 수 없습니다.' });
  }

  db.update('reservations', reservationId, { status: 'cancelled' });

  res.json({ success: true, message: '예약이 취소되었습니다.' });
});

// 관리자: 예약 현황
router.get('/admin', requireAuth, requireAdmin, (req, res) => {
  const { schedule_id } = req.query;

  if (schedule_id) {
    const scheduleId = parseInt(schedule_id);
    const schedule = db.findById('schedules', scheduleId);
    const golfCourse = db.findById('golf_courses', schedule?.golf_course_id) || {};

    const allReservations = db.getTable('reservations').filter(r => r.schedule_id === scheduleId);
    const members = db.getTable('members');

    const reservations = allReservations
      .map(r => {
        const member = members.find(m => m.id === r.member_id) || {};
        return {
          ...r,
          member_name: member.name,
          employee_id: member.employee_id,
          department: member.department,
          phone: member.phone
        };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.applied_at || '').localeCompare(b.applied_at || '');
      });

    res.render('reservations/admin-detail', {
      title: '예약 관리',
      schedule: {
        ...schedule,
        course_name: golfCourse.name,
        location: golfCourse.location,
        max_members: golfCourse.max_members || 12
      },
      reservations
    });
  } else {
    const schedules = db.getTable('schedules');
    const golfCourses = db.getTable('golf_courses');
    const reservations = db.getTable('reservations');
    const today = new Date().toISOString().split('T')[0];

    const upcomingSchedules = schedules
      .filter(s => s.play_date >= today && s.status === 'open')
      .map(s => {
        const course = golfCourses.find(gc => gc.id === s.golf_course_id) || {};
        const reserved_count = reservations.filter(
          r => r.schedule_id === s.id && ['pending', 'confirmed'].includes(r.status)
        ).length;
        return {
          ...s,
          course_name: course.name,
          max_members: course.max_members || 12,
          reserved_count
        };
      })
      .sort((a, b) => a.play_date.localeCompare(b.play_date));

    res.render('reservations/admin-list', {
      title: '예약 관리',
      upcomingSchedules
    });
  }
});

// 관리자: 예약 상태 변경
router.post('/admin/update-status', requireAuth, requireAdmin, (req, res) => {
  const { reservation_id, status } = req.body;
  db.update('reservations', parseInt(reservation_id), { status });
  res.json({ success: true });
});

// 관리자: 대리 예약
router.post('/admin/book-for', requireAuth, requireAdmin, (req, res) => {
  const { schedule_id, member_id } = req.body;
  const scheduleId = parseInt(schedule_id);
  const memberId = parseInt(member_id);

  const existing = db.getTable('reservations').find(
    r => r.schedule_id === scheduleId && r.member_id === memberId
  );

  if (existing) {
    return res.status(400).json({ error: '이미 예약된 회원입니다.' });
  }

  db.insert('reservations', {
    schedule_id: scheduleId,
    member_id: memberId,
    status: 'confirmed',
    applied_at: new Date().toISOString()
  });

  res.json({ success: true, message: '예약이 등록되었습니다.' });
});

// 예약 가능한 일정 목록
router.get('/available', requireAuth, (req, res) => {
  const memberId = req.session.user.id;
  const today = new Date().toISOString().split('T')[0];

  const allSchedules = db.getTable('schedules').filter(s => s.play_date >= today && s.status === 'open');
  const golfCourses = db.getTable('golf_courses');
  const reservations = db.getTable('reservations');

  const schedules = allSchedules
    .map(s => {
      const course = golfCourses.find(gc => gc.id === s.golf_course_id) || {};
      const reserved_count = reservations.filter(
        r => r.schedule_id === s.id && ['pending', 'confirmed'].includes(r.status)
      ).length;
      const myReservation = reservations.find(
        r => r.schedule_id === s.id && r.member_id === memberId
      );
      return {
        ...s,
        course_name: course.name,
        location: course.location,
        max_members: course.max_members || 12,
        reserved_count,
        my_reservation_id: myReservation ? myReservation.id : null,
        is_screen: course.is_screen || false
      };
    })
    .sort((a, b) => a.play_date.localeCompare(b.play_date));

  res.render('reservations/available', {
    title: '예약 신청',
    schedules
  });
});

module.exports = router;
