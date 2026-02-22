const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/database');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateName, validateEmail, validatePhone, validateId, validateEnum } = require('../utils/validator');
const { logger } = require('../utils/logger');

// 회원 목록
router.get('/', requireAuth, (req, res) => {
  const { status, search } = req.query;

  let members = db.getTable('members').filter(m => !m.is_admin);

  if (status) {
    members = members.filter(m => m.status === status);
  }

  if (search) {
    const searchLower = search.toLowerCase();
    members = members.filter(m =>
      (m.name && m.name.toLowerCase().includes(searchLower)) ||
      (m.internal_phone && m.internal_phone.includes(search)) ||
      (m.department && m.department.toLowerCase().includes(searchLower))
    );
  }

  members.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  // 라운드 수 계산
  const reservations = db.getTable('reservations');
  const schedules = db.getTable('schedules');

  members = members.map(m => {
    const totalRounds = reservations.filter(r => {
      if (r.member_id !== m.id || r.status !== 'confirmed') return false;
      const schedule = schedules.find(s => s.id === r.schedule_id);
      return schedule && schedule.status === 'completed';
    }).length;
    return { ...m, total_rounds: totalRounds };
  });

  // 회비 납부 현황
  const currentYear = new Date().getFullYear();
  const fees = db.getTable('membership_fees').filter(f => f.year === currentYear);

  const feeStatusMap = {};
  members.forEach(m => {
    const memberFees = fees.filter(f => f.member_id === m.id && f.status === 'paid');
    feeStatusMap[m.id] = memberFees.length;
  });

  res.render('members/list', {
    title: '회원 관리',
    members,
    feeStatusMap,
    currentYear,
    filters: { status, search }
  });
});

// 회원 등록 페이지
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  res.render('members/form', {
    title: '회원 등록',
    member: null,
    error: null
  });
});

// API: 활성 회원 목록 (JSON) - /:id 라우트보다 먼저 정의해야 함
router.get('/api/active', requireAuth, requireAdmin, (req, res) => {
  const members = db.getTable('members')
    .filter(m => !m.is_admin && m.status === 'active')
    .map(m => ({
      id: m.id,
      name: m.name,
      employee_id: m.employee_id,
      department: m.department
    }))
    .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  res.json(members);
});

// 회원 등록 처리
router.post('/new', requireAuth, requireAdmin, async (req, res) => {
  const { name, internal_phone, department, position, role, email, join_date } = req.body;

  // 입력값 검증
  const nameResult = validateName(name);
  if (!nameResult.valid) {
    return res.render('members/form', {
      title: '회원 등록',
      member: req.body,
      error: nameResult.error
    });
  }

  const emailResult = validateEmail(email, false);
  if (!emailResult.valid) {
    return res.render('members/form', {
      title: '회원 등록',
      member: req.body,
      error: emailResult.error
    });
  }

  const phoneResult = validatePhone(internal_phone, false);
  if (!phoneResult.valid) {
    return res.render('members/form', {
      title: '회원 등록',
      member: req.body,
      error: phoneResult.error
    });
  }

  // 최대 회원 수 체크
  const currentMembers = db.getTable('members').filter(m => !m.is_admin);
  if (currentMembers.length >= config.members.maxCount) {
    return res.render('members/form', {
      title: '회원 등록',
      member: req.body,
      error: `최대 회원 수(${config.members.maxCount}명)를 초과했습니다.`
    });
  }

  // 이름 중복 체크
  const existing = db.getTable('members').find(m => m.name === name);
  if (existing) {
    return res.render('members/form', {
      title: '회원 등록',
      member: req.body,
      error: '이미 등록된 이름입니다.'
    });
  }

  // 기본 비밀번호 설정 (1234)
  const passwordHash = bcrypt.hashSync('1234', config.security.bcryptRounds);

  try {
    const newId = await db.insert('members', {
      name: nameResult.value,
      internal_phone: phoneResult.value,
      department: department?.trim() || '',
      position: position?.trim() || '',
      role: role?.trim() || null,
      email: emailResult.value,
      join_date: join_date || new Date().toISOString().split('T')[0],
      password_hash: passwordHash,
      status: 'active',
      is_admin: false
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('members');
    }

    logger.audit('회원 등록', req.session.user, { newMemberId: newId, name });

    res.redirect('/members');
  } catch (error) {
    console.error('회원 등록 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '회원 등록 중 오류가 발생했습니다.'
    });
  }
});

// 타수 입력/수정 API - /:id 라우트보다 먼저 정의
router.post('/reservation/:reservationId/score', requireAuth, requireAdmin, async (req, res) => {
  try {
    const idResult = validateId(req.params.reservationId, '예약 ID');
    if (!idResult.valid) {
      return res.status(400).json({ error: idResult.error });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const reservation = db.findById('reservations', idResult.value);
    if (!reservation) {
      return res.status(404).json({ error: '예약 정보를 찾을 수 없습니다.' });
    }

    const { score } = req.body;

    // 타수 유효성 검사 (null 허용)
    if (score !== null && (isNaN(score) || score < 50 || score > 200)) {
      return res.status(400).json({ error: '타수는 50~200 사이의 숫자를 입력해주세요.' });
    }

    await db.update('reservations', idResult.value, { score: score });

    // 회원 평균 타수 업데이트
    const memberReservations = db.getTable('reservations')
      .filter(r => r.member_id === reservation.member_id && r.score);

    if (memberReservations.length > 0) {
      const totalScore = memberReservations.reduce((sum, r) => sum + r.score, 0);
      const avgScore = Math.round(totalScore / memberReservations.length);
      await db.update('members', reservation.member_id, { avg_score: avgScore, recent_score: score });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
      await db.refreshCache('members');
    }

    const member = db.findById('members', reservation.member_id);
    logger.audit('타수 입력', req.session.user, {
      reservationId: idResult.value,
      memberId: reservation.member_id,
      memberName: member?.name,
      score
    });

    res.json({ success: true });
  } catch (error) {
    console.error('타수 입력 오류:', error);
    res.status(500).json({ error: '타수 입력 중 오류가 발생했습니다.' });
  }
});

// 회원 상세
router.get('/:id', requireAuth, async (req, res) => {
  const idResult = validateId(req.params.id, '회원 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', {
      title: '잘못된 요청',
      message: idResult.error
    });
  }

  // 최신 데이터 보장을 위해 캐시 새로고침
  if (db.refreshCache) {
    await db.refreshCache('members');
  }

  const member = db.findById('members', idResult.value);

  if (!member || member.is_admin) {
    return res.status(404).render('error', {
      title: '회원 없음',
      message: '회원 정보를 찾을 수 없습니다.'
    });
  }

  // 참가 이력
  const reservations = db.getTable('reservations').filter(r => r.member_id === idResult.value);
  const schedules = db.getTable('schedules');
  const golfCourses = db.getTable('golf_courses');

  const participations = reservations
    .map(r => {
      const schedule = schedules.find(s => s.id === r.schedule_id) || {};
      const course = golfCourses.find(gc => gc.id === schedule.golf_course_id) || {};
      return {
        ...r,
        play_date: schedule.play_date,
        course_name: course.name
      };
    })
    .sort((a, b) => (b.play_date || '').localeCompare(a.play_date || ''))
    .slice(0, 20);

  // 평균 타수 계산
  const scoresWithValue = participations.filter(p => p.score && p.status === 'confirmed');
  let avgScore = null;
  if (scoresWithValue.length > 0) {
    const totalScore = scoresWithValue.reduce((sum, p) => sum + p.score, 0);
    avgScore = Math.round(totalScore / scoresWithValue.length);
  }

  res.render('members/detail', {
    title: `회원 정보 - ${member.name}`,
    member,
    participations,
    avgScore
  });
});

// 회원 수정 페이지
router.get('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  const idResult = validateId(req.params.id, '회원 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', {
      title: '잘못된 요청',
      message: idResult.error
    });
  }

  // 최신 데이터 보장을 위해 캐시 새로고침
  if (db.refreshCache) {
    await db.refreshCache('members');
  }

  const member = db.findById('members', idResult.value);

  if (!member || member.is_admin) {
    return res.status(404).render('error', {
      title: '회원 없음',
      message: '회원 정보를 찾을 수 없습니다.'
    });
  }

  res.render('members/form', {
    title: '회원 정보 수정',
    member,
    error: null
  });
});

// 회원 수정 처리
router.post('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  const idResult = validateId(req.params.id, '회원 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', {
      title: '잘못된 요청',
      message: idResult.error
    });
  }

  const memberId = idResult.value;
  const { name, internal_phone, department, position, role, email, status } = req.body;

  // 입력값 검증
  const nameResult = validateName(name);
  if (!nameResult.valid) {
    return res.render('members/form', {
      title: '회원 정보 수정',
      member: { ...req.body, id: memberId },
      error: nameResult.error
    });
  }

  const emailResult = validateEmail(email, false);
  if (!emailResult.valid) {
    return res.render('members/form', {
      title: '회원 정보 수정',
      member: { ...req.body, id: memberId },
      error: emailResult.error
    });
  }

  const statusResult = validateEnum(status, ['active', 'inactive', 'pending'], { fieldName: '상태' });
  if (!statusResult.valid) {
    return res.render('members/form', {
      title: '회원 정보 수정',
      member: { ...req.body, id: memberId },
      error: statusResult.error
    });
  }

  // 이름 중복 체크 (자기 자신 제외)
  const existing = db.getTable('members').find(m => m.name === name && m.id !== memberId);
  if (existing) {
    return res.render('members/form', {
      title: '회원 정보 수정',
      member: { ...req.body, id: memberId },
      error: '이미 등록된 이름입니다.'
    });
  }

  try {
    await db.update('members', memberId, {
      name: nameResult.value,
      internal_phone: internal_phone?.trim() || '',
      department: department?.trim() || '',
      position: position?.trim() || '',
      role: role?.trim() || null,
      email: emailResult.value,
      status: statusResult.value
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('members');
    }

    logger.audit('회원 정보 수정', req.session.user, { memberId, name });

    res.redirect(`/members/${memberId}`);
  } catch (error) {
    console.error('회원 수정 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '회원 정보 수정 중 오류가 발생했습니다.'
    });
  }
});

// 비밀번호 초기화
router.post('/:id/reset-password', requireAuth, requireAdmin, async (req, res) => {
  try {
    const idResult = validateId(req.params.id, '회원 ID');
    if (!idResult.valid) {
      return res.status(400).json({ error: idResult.error });
    }

    const member = db.findById('members', idResult.value);

    if (!member) {
      return res.status(404).json({ error: '회원을 찾을 수 없습니다.' });
    }

    const passwordHash = bcrypt.hashSync('1234', config.security.bcryptRounds);
    await db.update('members', idResult.value, { password_hash: passwordHash });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('members');
    }

    logger.audit('비밀번호 초기화', req.session.user, { memberId: idResult.value, memberName: member.name });

    res.json({ success: true, message: '비밀번호가 1234로 초기화되었습니다.' });
  } catch (error) {
    console.error('비밀번호 초기화 오류:', error);
    res.status(500).json({ error: '비밀번호 초기화 중 오류가 발생했습니다.' });
  }
});

// 회원 삭제 (비활성화)
router.post('/:id/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const idResult = validateId(req.params.id, '회원 ID');
    if (!idResult.valid) {
      return res.status(400).render('error', {
        title: '잘못된 요청',
        message: idResult.error
      });
    }

    const member = db.findById('members', idResult.value);
    await db.update('members', idResult.value, { status: 'inactive' });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('members');
    }

    logger.audit('회원 비활성화', req.session.user, { memberId: idResult.value, memberName: member?.name });

    res.redirect('/members');
  } catch (error) {
    console.error('회원 비활성화 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '회원 비활성화 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
