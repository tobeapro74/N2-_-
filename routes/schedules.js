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
      .sort((a, b) => (a.play_date || '').localeCompare(b.play_date || ''));

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

    // 활성 상태(pending, confirmed)인 예약만 필터링
    const reservations = db.getTable('reservations')
      .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
      .sort((a, b) => {
        // 우선순위 정렬: priority 낮은 순 → 신청시간 빠른 순
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.applied_at || '').localeCompare(b.applied_at || '');
      });

    const teeTimes = schedule.tee_times ? schedule.tee_times.split(',').map(t => t.trim()) : ['06:00', '06:08', '06:16'];
    const maxMembers = schedule.max_members || 12;
    const maxPerTeam = 4;

    // 각 티타임(팀)별 현재 배정 인원 추적
    const teamSlots = {};
    teeTimes.forEach((time, idx) => {
      teamSlots[idx + 1] = { teeTime: time, count: 0, members: [] };
    });

    // 희망 티타임별로 예약자 그룹화
    const preferredGroups = {};
    teeTimes.forEach(time => {
      preferredGroups[time] = [];
    });
    preferredGroups['none'] = []; // 희망 티타임 없는 경우

    reservations.forEach(r => {
      const preferred = r.preferred_tee_time;
      if (preferred && preferredGroups[preferred]) {
        preferredGroups[preferred].push(r);
      } else {
        preferredGroups['none'].push(r);
      }
    });

    // 배정 결과 저장
    const assignments = [];

    // 1단계: 희망 티타임에 맞춰 배정 (각 티타임 4명까지)
    teeTimes.forEach((time, teamIdx) => {
      const teamNumber = teamIdx + 1;
      const preferred = preferredGroups[time] || [];

      preferred.forEach(r => {
        // 해당 티타임에 자리가 있으면 배정
        if (teamSlots[teamNumber].count < maxPerTeam) {
          assignments.push({
            reservation: r,
            teamNumber,
            teeTime: time,
            assigned: true
          });
          teamSlots[teamNumber].count++;
        } else {
          // 자리가 없으면 나중에 다음 티타임으로 밀기 위해 표시
          assignments.push({
            reservation: r,
            preferredTeam: teamNumber,
            teeTime: null,
            assigned: false
          });
        }
      });
    });

    // 희망 티타임 없는 예약자도 미배정으로 추가
    preferredGroups['none'].forEach(r => {
      assignments.push({
        reservation: r,
        preferredTeam: null,
        teeTime: null,
        assigned: false
      });
    });

    // 2단계: 미배정된 예약자를 다음 빈 팀으로 밀기
    // 희망 티타임 기준으로 정렬 (늦게 신청한 사람이 먼저 밀림)
    const unassigned = assignments
      .filter(a => !a.assigned)
      .sort((a, b) => {
        // 희망 티타임이 있는 경우 해당 티타임 순서대로
        const aTeam = a.preferredTeam || 1;
        const bTeam = b.preferredTeam || 1;
        if (aTeam !== bTeam) return aTeam - bTeam;
        // 같은 희망 티타임이면 늦게 신청한 사람이 뒤로
        return (a.reservation.applied_at || '').localeCompare(b.reservation.applied_at || '');
      });

    unassigned.forEach(item => {
      // 희망 티타임부터 시작하여 빈 자리 찾기
      const startTeam = item.preferredTeam || 1;

      // 희망 티타임 이후의 팀부터 검색
      for (let teamNum = startTeam; teamNum <= teeTimes.length; teamNum++) {
        if (teamSlots[teamNum].count < maxPerTeam) {
          item.teamNumber = teamNum;
          item.teeTime = teeTimes[teamNum - 1];
          item.assigned = true;
          teamSlots[teamNum].count++;
          break;
        }
      }

      // 희망 티타임 이후에 자리가 없으면 처음부터 검색
      if (!item.assigned) {
        for (let teamNum = 1; teamNum < startTeam; teamNum++) {
          if (teamSlots[teamNum].count < maxPerTeam) {
            item.teamNumber = teamNum;
            item.teeTime = teeTimes[teamNum - 1];
            item.assigned = true;
            teamSlots[teamNum].count++;
            break;
          }
        }
      }
    });

    // 3단계: DB 업데이트
    let confirmedCount = 0;
    for (const item of assignments) {
      if (item.assigned) {
        const status = confirmedCount < maxMembers ? 'confirmed' : 'waitlist';
        await db.update('reservations', item.reservation.id, {
          team_number: item.teamNumber,
          tee_time: item.teeTime,
          status
        });
        confirmedCount++;
      }
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: `${reservations.length}명의 팀이 배정되었습니다. (희망 티타임 우선 적용)` });
  } catch (error) {
    console.error('팀 배정 오류:', error);
    res.status(500).json({ error: '팀 배정 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
