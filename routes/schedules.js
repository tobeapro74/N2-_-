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

// 일정 목록
router.get('/', requireAuth, async (req, res) => {
  try {
    const { year, month, course } = req.query;

    // MongoDB 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('reservations');
    }

    let schedules = db.getTable('schedules');
    const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);
    const reservations = db.getTable('reservations');

    if (year) {
      schedules = schedules.filter(s => s.play_date && s.play_date.startsWith(year));
    }
    if (month) {
      const monthStr = `${year || new Date().getFullYear()}-${String(month).padStart(2, '0')}`;
      schedules = schedules.filter(s => s.play_date && s.play_date.startsWith(monthStr));
    }
    if (course) {
      schedules = schedules.filter(s => s.golf_course_id === parseInt(course));
    }

    schedules = schedules
      .map(s => {
        const gc = golfCourses.find(g => g.id === s.golf_course_id) || {};
        const reserved_count = reservations.filter(
          r => r.schedule_id === s.id && ['pending', 'confirmed'].includes(r.status)
        ).length;
        return {
          ...s,
          course_name: gc.name,
          location: gc.location,
          max_members: s.max_members || 12,
          reserved_count
        };
      })
      .sort((a, b) => (b.play_date || '').localeCompare(a.play_date || ''));

    res.render('schedules/list', {
      title: '일정 관리',
      schedules,
      golfCourses,
      filters: { year, month, course },
      years: Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + 1 - i)
    });
  } catch (error) {
    console.error('일정 목록 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 목록을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 일정 생성 페이지
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);

  res.render('schedules/form', {
    title: '일정 생성',
    schedule: null,
    golfCourses,
    error: null
  });
});

// 일정 생성 처리
router.post('/new', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { golf_course_id, play_date, tee_times, max_members, notes } = req.body;

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    // 중복 일정 체크
    const existing = db.getTable('schedules').find(
      s => s.golf_course_id === parseInt(golf_course_id) && s.play_date === play_date
    );

    if (existing) {
      const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);
      return res.render('schedules/form', {
        title: '일정 생성',
        schedule: req.body,
        golfCourses,
        error: '해당 날짜에 이미 일정이 있습니다.'
      });
    }

    await db.insert('schedules', {
      golf_course_id: parseInt(golf_course_id),
      play_date,
      tee_times,
      max_members: parseInt(max_members) || 12,
      notes,
      status: 'open'
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect('/schedules');
  } catch (error) {
    console.error('일정 생성 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 생성 중 오류가 발생했습니다.'
    });
  }
});

// 연간 일정 자동 생성 페이지
router.get('/generate', requireAuth, requireAdmin, (req, res) => {
  const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);

  res.render('schedules/generate', {
    title: '연간 일정 생성',
    golfCourses,
    year: new Date().getFullYear() + 1
  });
});

// 연간 일정 자동 생성 처리
router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { year, courses } = req.body;
    const selectedCourses = Array.isArray(courses) ? courses : [courses];

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('golf_courses');
    }

    const golfCourses = db.getTable('golf_courses').filter(
      gc => selectedCourses.includes(String(gc.id))
    );

    let createdCount = 0;

    for (const course of golfCourses) {
      for (let month = 1; month <= 12; month++) {
        const playDate = getNthWeekday(parseInt(year), month, course.schedule_week, 6);

        if (playDate) {
          const existing = db.getTable('schedules').find(
            s => s.golf_course_id === course.id && s.play_date === playDate
          );

          if (!existing) {
            await db.insert('schedules', {
              golf_course_id: course.id,
              play_date: playDate,
              tee_times: course.tee_time_start,
              max_members: course.max_members || 12,
              status: 'open'
            });
            createdCount++;
          }
        }
      }
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect(`/schedules?year=${year}&message=created_${createdCount}`);
  } catch (error) {
    console.error('연간 일정 생성 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '연간 일정 생성 중 오류가 발생했습니다.'
    });
  }
});

// N번째 주 특정 요일 날짜 계산
function getNthWeekday(year, month, weekNum, dayOfWeek) {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();

  let date = 1 + ((dayOfWeek - firstDayOfWeek + 7) % 7) + (weekNum - 1) * 7;

  const lastDay = new Date(year, month, 0).getDate();
  if (date > lastDay) return null;

  const result = new Date(year, month - 1, date);
  return result.toISOString().split('T')[0];
}

// 일정 상세
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('reservations');
    }

    const schedule = db.findById('schedules', scheduleId);

    if (!schedule) {
      return res.status(404).render('error', {
        title: '일정 없음',
        message: '일정을 찾을 수 없습니다.'
      });
    }

    const golfCourse = db.findById('golf_courses', schedule.golf_course_id) || {};
    const allReservations = db.getTable('reservations').filter(r => r.schedule_id === scheduleId);
    const members = db.getTable('members');

    const reservations = allReservations
      .map(r => {
        const member = members.find(m => m.id === r.member_id) || {};
        return {
          ...r,
          member_name: member.name,
          employee_id: member.employee_id,
          department: member.department
        };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.applied_at || '').localeCompare(b.applied_at || '');
      });

    const myReservation = req.session.user ?
      reservations.find(r => r.member_id === req.session.user.id) : null;

    res.render('schedules/detail', {
      title: `일정 - ${golfCourse.name}`,
      schedule: {
        ...schedule,
        course_name: golfCourse.name,
        location: golfCourse.location,
        course_max: golfCourse.max_members
      },
      reservations,
      myReservation
    });
  } catch (error) {
    console.error('일정 상세 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 정보를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 일정 수정 페이지
router.get('/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const scheduleId = parseInt(req.params.id);
  const schedule = db.findById('schedules', scheduleId);

  if (!schedule) {
    return res.status(404).render('error', {
      title: '일정 없음',
      message: '일정을 찾을 수 없습니다.'
    });
  }

  const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);

  res.render('schedules/form', {
    title: '일정 수정',
    schedule,
    golfCourses,
    error: null
  });
});

// 일정 수정 처리
router.post('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const { golf_course_id, play_date, tee_times, max_members, status, notes } = req.body;

    await db.update('schedules', scheduleId, {
      golf_course_id: parseInt(golf_course_id),
      play_date,
      tee_times,
      max_members: parseInt(max_members),
      status,
      notes
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect(`/schedules/${scheduleId}`);
  } catch (error) {
    console.error('일정 수정 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 수정 중 오류가 발생했습니다.'
    });
  }
});

// 일정 삭제
router.post('/:id/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const hasReservations = db.getTable('reservations').some(r => r.schedule_id === scheduleId);

    if (hasReservations) {
      return res.status(400).json({ error: '예약이 있는 일정은 삭제할 수 없습니다.' });
    }

    await db.delete('schedules', scheduleId);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect('/schedules');
  } catch (error) {
    console.error('일정 삭제 오류:', error);
    res.status(500).json({ error: '일정 삭제 중 오류가 발생했습니다.' });
  }
});

// 팀 배정
router.post('/:id/assign-teams', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('reservations');
    }

    const schedule = db.findById('schedules', scheduleId);

    if (!schedule) {
      return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    }

    const reservations = db.getTable('reservations')
      .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.applied_at || '').localeCompare(b.applied_at || '');
      });

    const teeTimes = schedule.tee_times ? schedule.tee_times.split(',') : ['06:00', '06:08', '06:16'];
    const maxMembers = schedule.max_members || 12;

    for (let index = 0; index < reservations.length; index++) {
      const r = reservations[index];
      const teamNumber = Math.floor(index / 4) + 1;
      const teeTime = teeTimes[Math.floor(index / 4)] || teeTimes[teeTimes.length - 1];
      const status = index < maxMembers ? 'confirmed' : 'waitlist';

      await db.update('reservations', r.id, {
        team_number: teamNumber,
        tee_time: teeTime,
        status
      });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: `${reservations.length}명의 팀이 배정되었습니다.` });
  } catch (error) {
    console.error('팀 배정 오류:', error);
    res.status(500).json({ error: '팀 배정 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
