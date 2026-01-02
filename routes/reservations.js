const express = require('express');
const router = express.Router();
const db = require('../models/database');
const pushService = require('../utils/pushService');

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

    // 마감 임박 알림 (80% 이상 찼을 때, 한 번만 발송)
    const newCount = currentCount + 1;
    const threshold = Math.floor(maxMembers * 0.8);
    if (newCount === threshold) {
      // 이미 예약한 회원 ID 목록
      const reservedMemberIds = db.getTable('reservations')
        .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
        .map(r => r.member_id);

      pushService.notifyReservationAlmostFull(schedule, golfCourse, newCount, maxMembers, reservedMemberIds)
        .catch(err => console.error('마감 임박 알림 오류:', err));
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

    // 취소 전 정보 저장 (대기자 승격용)
    const scheduleId = reservation.schedule_id;
    const wasConfirmedOrPending = ['confirmed', 'pending'].includes(reservation.status);

    // 예약 취소 (비동기)
    await db.update('reservations', reservationId, { status: 'cancelled' });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    // 대기자 승격 처리 (확정/신청 취소 시에만)
    let promotedMember = null;
    if (wasConfirmedOrPending) {
      const golfCourse = schedule ? db.findById('golf_courses', schedule.golf_course_id) : null;
      const maxMembers = schedule?.max_members || golfCourse?.max_members || 12;

      // 현재 확정/신청 인원 수
      const currentCount = db.getTable('reservations')
        .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
        .length;

      // 자리가 생겼고 대기자가 있으면 첫 번째 대기자 승격
      if (currentCount < maxMembers) {
        const waitlistReservations = db.getTable('reservations')
          .filter(r => r.schedule_id === scheduleId && r.status === 'waitlist')
          .sort((a, b) => (a.applied_at || '').localeCompare(b.applied_at || ''));

        if (waitlistReservations.length > 0) {
          const firstWaitlist = waitlistReservations[0];
          await db.update('reservations', firstWaitlist.id, { status: 'pending' });

          // 캐시 새로고침
          if (db.refreshCache) {
            await db.refreshCache('reservations');
          }

          promotedMember = firstWaitlist.member_id;

          // 대기자 → 확정 전환 알림
          if (schedule && golfCourse) {
            pushService.notifyWaitlistToConfirmed(firstWaitlist.member_id, schedule, golfCourse)
              .catch(err => console.error('대기자 승격 알림 오류:', err));
          }
        }
      }
    }

    const message = promotedMember
      ? '예약이 취소되었습니다. 대기자가 자동으로 승격되었습니다.'
      : '예약이 취소되었습니다.';

    res.json({ success: true, message, promotedMember });
  } catch (error) {
    console.error('예약 취소 오류:', error);
    res.status(500).json({ error: '예약 취소 중 오류가 발생했습니다.' });
  }
});

// 관리자: 예약 현황
router.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { schedule_id } = req.query;

    // MongoDB에서 직접 최신 데이터 조회 (병렬 처리 + projection으로 성능 향상)
    const [allReservationsData, members, schedules, golfCourses] = await Promise.all([
      db.getTableAsync('reservations'),
      db.getTableAsync('members', { projection: { id: 1, name: 1, employee_id: 1, department: 1, phone: 1 } }),
      db.getTableAsync('schedules'),
      db.getTableAsync('golf_courses')
    ]);

    if (schedule_id) {
      const scheduleId = parseInt(schedule_id);
      const schedule = schedules.find(s => s.id === scheduleId || s.id === parseInt(scheduleId));
      const golfCourse = golfCourses.find(gc => gc.id === schedule?.golf_course_id) || {};

      const filteredReservations = allReservationsData.filter(r => r.schedule_id === scheduleId);

      const reservations = filteredReservations
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
      const today = new Date().toISOString().split('T')[0];

      const upcomingSchedules = schedules
        .filter(s => s.play_date >= today && s.status === 'open')
        .map(s => {
          const course = golfCourses.find(gc => gc.id === s.golf_course_id) || {};
          const reserved_count = allReservationsData.filter(
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

// 관리자: 예약 상태 변경 (간단 버전 - 상세 버전으로 대체됨)
// NOTE: 아래 /admin/update-status 라우트가 실제로 사용됨

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

    // 대리 예약 시 알림 발송 (바로 확정 상태)
    const schedule = db.findById('schedules', scheduleId);
    const golfCourse = schedule ? db.findById('golf_courses', schedule.golf_course_id) : null;

    if (schedule && golfCourse) {
      pushService.notifyReservationConfirmed(memberId, schedule, golfCourse)
        .catch(err => console.error('대리 예약 알림 오류:', err));
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
    const { reservation_id, team_number, tee_time, auto_tee_time } = req.body;
    const reservationId = parseInt(reservation_id);
    const teamNum = parseInt(team_number);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('schedules');
    }

    const reservation = db.findById('reservations', reservationId);
    if (!reservation) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    // 팀 번호와 티타임 업데이트
    const updateData = {};
    let autoAssignedTeeTime = null;

    if (!isNaN(teamNum) && teamNum > 0) {
      updateData.team_number = teamNum;

      // 팀 변경 시 티타임 자동 연동
      if (auto_tee_time) {
        const schedule = db.findById('schedules', reservation.schedule_id);
        if (schedule && schedule.tee_times) {
          const teeTimes = schedule.tee_times.split(',').map(t => t.trim());
          const teeTimeIndex = teamNum - 1;
          if (teeTimeIndex >= 0 && teeTimeIndex < teeTimes.length) {
            autoAssignedTeeTime = teeTimes[teeTimeIndex];
            updateData.tee_time = autoAssignedTeeTime;
          }
        }
      }
    }

    if (tee_time && !auto_tee_time) {
      updateData.tee_time = tee_time;
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: '변경할 내용이 없습니다.' });
    }

    console.log('팀 변경 시도:', { reservationId, updateData });
    const updateResult = await db.update('reservations', reservationId, updateData);
    console.log('팀 변경 결과:', updateResult);

    // 업데이트 실패 시 에러 반환
    if (!updateResult) {
      return res.status(500).json({
        error: 'MongoDB 업데이트에 실패했습니다.',
        reservationId,
        updateData
      });
    }

    // 캐시 새로고침 (강제)
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    // 변경 확인
    const updated = db.findById('reservations', reservationId);
    console.log('변경 후 데이터:', { id: updated?.id, team_number: updated?.team_number, tee_time: updated?.tee_time });

    // 실제로 변경되었는지 확인
    const requestedTeam = updateData.team_number;
    if (requestedTeam && updated?.team_number !== requestedTeam) {
      return res.status(500).json({
        error: `팀 변경이 반영되지 않았습니다. 요청: ${requestedTeam}, 현재: ${updated?.team_number}`,
        reservationId,
        requested: requestedTeam,
        actual: updated?.team_number
      });
    }

    res.json({
      success: true,
      message: '팀 배정이 변경되었습니다.',
      tee_time: autoAssignedTeeTime,
      updated_team: updated?.team_number
    });
  } catch (error) {
    console.error('팀 변경 오류:', error);
    res.status(500).json({ error: '팀 변경 중 오류가 발생했습니다.' });
  }
});

// 관리자: 팀 균형 정보 조회
router.get('/admin/team-balance/:scheduleId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.scheduleId);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('schedules');
    }

    const schedule = db.findById('schedules', scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    }

    const reservations = db.getTable('reservations')
      .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status));
    const members = db.getTable('members');

    // 팀별 멤버 수 계산
    const teamCounts = {};
    const teamMembers = {};

    reservations.forEach(r => {
      const teamNum = r.team_number || 0;
      if (!teamCounts[teamNum]) {
        teamCounts[teamNum] = 0;
        teamMembers[teamNum] = [];
      }
      teamCounts[teamNum]++;
      const member = members.find(m => m.id === r.member_id) || {};

      // 교환 상대 멤버 정보 조회
      let swapPartnerName = null;
      let swapPartnerTeam = null;
      if (r.swap_partner_id) {
        const partnerRes = reservations.find(pr => pr.id === r.swap_partner_id);
        if (partnerRes) {
          const partnerMember = members.find(m => m.id === partnerRes.member_id) || {};
          swapPartnerName = partnerMember.name;
          swapPartnerTeam = partnerRes.team_number;
        }
      }

      teamMembers[teamNum].push({
        id: r.id,
        member_id: r.member_id,
        member_name: member.name,
        tee_time: r.tee_time,
        swap_partner_id: r.swap_partner_id || null,
        swap_original_team: r.swap_original_team || null,
        swap_partner_name: swapPartnerName,
        swap_partner_team: swapPartnerTeam
      });
    });

    // 티타임 정보
    const teeTimes = schedule.tee_times ? schedule.tee_times.split(',').map(t => t.trim()) : [];

    res.json({
      success: true,
      teamCounts,
      teamMembers,
      teeTimes,
      maxPerTeam: 4
    });
  } catch (error) {
    console.error('팀 균형 조회 오류:', error);
    res.status(500).json({ error: '팀 균형 정보 조회 중 오류가 발생했습니다.' });
  }
});

// 관리자: 팀 멤버 교환
router.post('/admin/swap-team', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservation_id_1, reservation_id_2, from_team } = req.body;
    const resId1 = parseInt(reservation_id_1);
    const resId2 = parseInt(reservation_id_2);
    const fromTeam = parseInt(from_team);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('schedules');
    }

    const res1 = db.findById('reservations', resId1);
    const res2 = db.findById('reservations', resId2);

    if (!res1 || !res2) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    // 일정 정보로 티타임 가져오기
    const schedule = db.findById('schedules', res1.schedule_id);
    const teeTimes = schedule && schedule.tee_times ? schedule.tee_times.split(',').map(t => t.trim()) : [];

    // 교환 전 팀 정보 저장
    const res2OldTeam = res2.team_number;

    // 팀 교환 - 명시적으로 전달된 팀 번호 사용
    const teeTimeFrom = teeTimes[fromTeam - 1] || res1.tee_time;

    // res1(이동한 멤버)은 이미 toTeam으로 변경됨, res2를 fromTeam으로 변경
    // 교환 이력 저장 (swap_partner_id: 교환 상대방 예약 ID)
    await db.update('reservations', resId1, {
      swap_partner_id: resId2,
      swap_original_team: fromTeam // res1의 원래 팀 (이동 전)
    });
    await db.update('reservations', resId2, {
      team_number: fromTeam,
      tee_time: teeTimeFrom,
      swap_partner_id: resId1,
      swap_original_team: res2OldTeam // res2의 원래 팀
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({
      success: true,
      message: '팀 멤버가 교환되었습니다.'
    });
  } catch (error) {
    console.error('팀 교환 오류:', error);
    res.status(500).json({ error: '팀 교환 중 오류가 발생했습니다.' });
  }
});

// 관리자: 팀 원복 (교환 취소)
router.post('/admin/revert-swap', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservation_id } = req.body;
    const reservationId = parseInt(reservation_id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('schedules');
    }

    const reservation = db.findById('reservations', reservationId);
    if (!reservation) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    // 교환 이력 확인
    if (!reservation.swap_partner_id) {
      return res.status(400).json({ error: '교환 이력이 없습니다.' });
    }

    const partnerReservation = db.findById('reservations', reservation.swap_partner_id);
    if (!partnerReservation) {
      return res.status(404).json({ error: '교환 상대 예약을 찾을 수 없습니다.' });
    }

    // 일정 정보로 티타임 가져오기
    const schedule = db.findById('schedules', reservation.schedule_id);
    const teeTimes = schedule && schedule.tee_times ? schedule.tee_times.split(',').map(t => t.trim()) : [];

    // 원래 팀으로 원복
    const myOriginalTeam = reservation.swap_original_team;
    const partnerOriginalTeam = partnerReservation.swap_original_team;

    const myTeeTime = teeTimes[myOriginalTeam - 1] || reservation.tee_time;
    const partnerTeeTime = teeTimes[partnerOriginalTeam - 1] || partnerReservation.tee_time;

    // 두 멤버 모두 원래 팀으로 복구하고 교환 이력 삭제
    await db.update('reservations', reservationId, {
      team_number: myOriginalTeam,
      tee_time: myTeeTime,
      swap_partner_id: null,
      swap_original_team: null
    });

    await db.update('reservations', reservation.swap_partner_id, {
      team_number: partnerOriginalTeam,
      tee_time: partnerTeeTime,
      swap_partner_id: null,
      swap_original_team: null
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    // 회원 정보 조회
    const members = db.getTable('members');
    const myMember = members.find(m => m.id === reservation.member_id) || {};
    const partnerMember = members.find(m => m.id === partnerReservation.member_id) || {};

    res.json({
      success: true,
      message: '팀이 원복되었습니다.',
      reverted: [
        { name: myMember.name, team: myOriginalTeam },
        { name: partnerMember.name, team: partnerOriginalTeam }
      ]
    });
  } catch (error) {
    console.error('팀 원복 오류:', error);
    res.status(500).json({ error: '팀 원복 중 오류가 발생했습니다.' });
  }
});

// 관리자: 예약 삭제 (실제 삭제 대신 상태를 'deleted'로 변경)
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

    // 삭제 전 정보 저장 (대기자 승격용)
    const scheduleId = reservation.schedule_id;
    const wasConfirmedOrPending = ['confirmed', 'pending'].includes(reservation.status);

    // 실제 삭제 대신 상태를 'deleted'로 변경
    await db.update('reservations', reservationId, { status: 'deleted' });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    // 대기자 승격 처리 (확정/신청 삭제 시에만)
    let promotedMember = null;
    if (wasConfirmedOrPending) {
      const schedule = db.findById('schedules', scheduleId);
      const golfCourse = schedule ? db.findById('golf_courses', schedule.golf_course_id) : null;
      const maxMembers = schedule?.max_members || golfCourse?.max_members || 12;

      const currentCount = db.getTable('reservations')
        .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
        .length;

      if (currentCount < maxMembers) {
        const waitlistReservations = db.getTable('reservations')
          .filter(r => r.schedule_id === scheduleId && r.status === 'waitlist')
          .sort((a, b) => (a.applied_at || '').localeCompare(b.applied_at || ''));

        if (waitlistReservations.length > 0) {
          const firstWaitlist = waitlistReservations[0];
          await db.update('reservations', firstWaitlist.id, { status: 'pending' });

          if (db.refreshCache) {
            await db.refreshCache('reservations');
          }

          promotedMember = firstWaitlist.member_id;

          // 대기자 → 확정 전환 알림
          if (schedule && golfCourse) {
            pushService.notifyWaitlistToConfirmed(firstWaitlist.member_id, schedule, golfCourse)
              .catch(err => console.error('대기자 승격 알림 오류:', err));
          }
        }
      }
    }

    const message = promotedMember
      ? '예약이 삭제 처리되었습니다. 대기자가 자동으로 승격되었습니다.'
      : '예약이 삭제 처리되었습니다.';

    res.json({ success: true, message, promotedMember });
  } catch (error) {
    console.error('예약 삭제 오류:', error);
    res.status(500).json({ error: '예약 삭제 중 오류가 발생했습니다.' });
  }
});

// 관리자: 예약 상태 변경
router.post('/admin/update-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { reservation_id, status } = req.body;
    const reservationId = parseInt(reservation_id);

    // 유효한 상태값 확인
    const validStatuses = ['confirmed', 'pending', 'waitlist', 'cancelled', 'deleted'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({ error: '유효하지 않은 상태값입니다.' });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const reservation = db.findById('reservations', reservationId);
    if (!reservation) {
      return res.status(404).json({ error: '예약을 찾을 수 없습니다.' });
    }

    await db.update('reservations', reservationId, { status });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    // 예약 확정 시 알림 발송 (인앱 알림은 항상, 푸시는 설정된 경우에만)
    if (status === 'confirmed') {
      const schedule = db.findById('schedules', reservation.schedule_id);
      const golfCourse = schedule ? db.findById('golf_courses', schedule.golf_course_id) : null;

      if (schedule && golfCourse) {
        pushService.notifyReservationConfirmed(reservation.member_id, schedule, golfCourse)
          .catch(err => console.error('예약 확정 알림 오류:', err));
      }
    }

    const statusLabels = {
      confirmed: '확정',
      pending: '신청',
      waitlist: '대기자',
      cancelled: '취소',
      deleted: '삭제'
    };

    res.json({ success: true, message: `상태가 '${statusLabels[status]}'(으)로 변경되었습니다.` });
  } catch (error) {
    console.error('상태 변경 오류:', error);
    res.status(500).json({ error: '상태 변경 중 오류가 발생했습니다.' });
  }
});

// 관리자: 예약 물리적 삭제 (DB에서 완전 삭제)
router.post('/admin/hard-delete', requireAuth, requireAdmin, async (req, res) => {
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

    // 실제 삭제
    await db.delete('reservations', reservationId);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: '예약이 완전히 삭제되었습니다.' });
  } catch (error) {
    console.error('예약 물리적 삭제 오류:', error);
    res.status(500).json({ error: '예약 삭제 중 오류가 발생했습니다.' });
  }
});

// 관리자: 관리자 예약 전체 삭제
router.delete('/admin/clear-admin-reservations', requireAuth, requireAdmin, async (req, res) => {
  try {
    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('members');
    }

    // 관리자 회원 ID 찾기
    const adminMembers = db.getTable('members').filter(m => m.is_admin === true || m.is_admin === 1);
    const adminIds = adminMembers.map(m => m.id);

    if (adminIds.length === 0) {
      return res.json({ success: true, message: '관리자 회원이 없습니다.', deleted: 0 });
    }

    // 관리자 예약 찾기
    const adminReservations = db.getTable('reservations').filter(r => adminIds.includes(r.member_id));

    if (adminReservations.length === 0) {
      return res.json({ success: true, message: '삭제할 관리자 예약이 없습니다.', deleted: 0 });
    }

    // 각 예약 삭제
    let deletedCount = 0;
    for (const r of adminReservations) {
      await db.delete('reservations', r.id);
      deletedCount++;
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({
      success: true,
      message: `관리자 예약 ${deletedCount}건이 삭제되었습니다.`,
      deleted: deletedCount
    });
  } catch (error) {
    console.error('관리자 예약 삭제 오류:', error);
    res.status(500).json({ error: '관리자 예약 삭제 중 오류가 발생했습니다.' });
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
