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
router.get('/', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;

    // MongoDB 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

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
  } catch (error) {
    console.error('예약 목록 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '예약 목록을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 예약 신청
router.post('/apply', requireAuth, async (req, res) => {
  try {
    const { schedule_id, preferred_tee_time } = req.body;
    const memberId = req.session.user.id;
    const scheduleId = parseInt(schedule_id);

    // 관리자 계정은 예약 불가
    if (req.session.user.is_admin) {
      return res.status(403).json({ error: '관리자 계정은 예약 신청이 불가능합니다.' });
    }

    // 캐시 새로고침 (중복 체크 전에 최신 데이터 확보)
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('schedules');
    }

    // 일정 확인
    const schedule = db.findById('schedules', scheduleId);
    if (!schedule || schedule.status !== 'open') {
      return res.status(400).json({ error: '신청할 수 없는 일정입니다.' });
    }

    const golfCourse = db.findById('golf_courses', schedule.golf_course_id) || {};

    // 중복 신청 확인 (취소된 예약은 제외)
    const existing = db.getTable('reservations').find(
      r => r.schedule_id === scheduleId && r.member_id === memberId && r.status !== 'cancelled'
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

    // 현재 예약 수 확인 (신청 전)
    const currentCount = db.getTable('reservations')
      .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
      .length;

    const maxMembers = schedule.max_members || golfCourse.max_members || 12;

    // 모집인원 초과 시 대기자로 등록
    const reservationStatus = currentCount >= maxMembers ? 'waitlist' : 'pending';

    // 예약 생성 (비동기)
    await db.insert('reservations', {
      schedule_id: scheduleId,
      member_id: memberId,
      priority,
      consecutive_count: consecutiveCount,
      status: reservationStatus,
      preferred_tee_time: preferred_tee_time || null,
      applied_at: new Date().toISOString()
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const statusMessage = reservationStatus === 'waitlist'
      ? '대기자로 등록되었습니다.'
      : '예약 신청이 완료되었습니다.';

    res.json({
      success: true,
      message: statusMessage,
      position: currentCount + 1,
      isWaitlist: reservationStatus === 'waitlist',
      status: reservationStatus
    });
  } catch (error) {
    console.error('예약 신청 오류:', error);
    res.status(500).json({ error: '예약 신청 중 오류가 발생했습니다.' });
  }
});

// 예약 취소
router.post('/cancel', requireAuth, async (req, res) => {
  try {
    const { reservation_id } = req.body;
    const memberId = req.session.user.id;
    const reservationId = parseInt(reservation_id);

    // 캐시 새로고침 후 예약 찾기
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const reservation = db.findById('reservations', reservationId);
    if (!reservation || reservation.member_id !== memberId) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    const schedule = db.findById('schedules', reservation.schedule_id);
    if (schedule && schedule.status === 'completed') {
      return res.status(400).json({ error: '완료된 일정은 취소할 수 없습니다.' });
    }

    // 예약 취소 (비동기)
    await db.update('reservations', reservationId, { status: 'cancelled' });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: '예약이 취소되었습니다.' });
  } catch (error) {
    console.error('예약 취소 오류:', error);
    res.status(500).json({ error: '예약 취소 중 오류가 발생했습니다.' });
  }
});

// 관리자: 예약 현황
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { schedule_id } = req.query;

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

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
  } catch (error) {
    console.error('관리자 예약 현황 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '예약 현황을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 관리자: 예약 상태 변경
router.post('/admin/update-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservation_id, status } = req.body;
    await db.update('reservations', parseInt(reservation_id), { status });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('예약 상태 변경 오류:', error);
    res.status(500).json({ error: '상태 변경 중 오류가 발생했습니다.' });
  }
});

// 관리자: 대리 예약
router.post('/admin/book-for', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { schedule_id, member_id } = req.body;
    const scheduleId = parseInt(schedule_id);
    const memberId = parseInt(member_id);

    const existing = db.getTable('reservations').find(
      r => r.schedule_id === scheduleId && r.member_id === memberId
    );

    if (existing) {
      return res.status(400).json({ error: '이미 예약된 회원입니다.' });
    }

    await db.insert('reservations', {
      schedule_id: scheduleId,
      member_id: memberId,
      status: 'confirmed',
      applied_at: new Date().toISOString()
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: '예약이 등록되었습니다.' });
  } catch (error) {
    console.error('대리 예약 오류:', error);
    res.status(500).json({ error: '예약 등록 중 오류가 발생했습니다.' });
  }
});

// 관리자: 팀 변경
router.post('/admin/update-team', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservation_id, team_number, tee_time } = req.body;
    const reservationId = parseInt(reservation_id);
    const teamNum = parseInt(team_number);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const reservation = db.findById('reservations', reservationId);
    if (!reservation) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    // 팀 번호와 티타임 업데이트
    const updateData = {};
    if (!isNaN(teamNum) && teamNum > 0) {
      updateData.team_number = teamNum;
    }
    if (tee_time) {
      updateData.tee_time = tee_time;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '변경할 내용이 없습니다.' });
    }

    await db.update('reservations', reservationId, updateData);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: '팀 배정이 변경되었습니다.' });
  } catch (error) {
    console.error('팀 변경 오류:', error);
    res.status(500).json({ error: '팀 변경 중 오류가 발생했습니다.' });
  }
});

// 관리자: 예약 삭제
router.post('/admin/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservation_id } = req.body;
    const reservationId = parseInt(reservation_id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const reservation = db.findById('reservations', reservationId);
    if (!reservation) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    await db.delete('reservations', reservationId);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: '예약이 삭제되었습니다.' });
  } catch (error) {
    console.error('예약 삭제 오류:', error);
    res.status(500).json({ error: '예약 삭제 중 오류가 발생했습니다.' });
  }
});

// 예약 가능한 일정 목록
router.get('/available', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;
    const today = new Date().toISOString().split('T')[0];

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

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
  } catch (error) {
    console.error('예약 가능 일정 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
