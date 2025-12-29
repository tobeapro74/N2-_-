const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../models/database');
const config = require('../config');
const { requireAuth, requireGuest } = require('../middleware/auth');
const { validateName, validatePassword } = require('../utils/validator');
const { logger } = require('../utils/logger');

// 로그인 페이지
router.get('/login', requireGuest, (req, res) => {
  res.render('auth/login', { title: '로그인', error: null });
});

// 로그인 처리
router.post('/login', requireGuest, async (req, res) => {
  const { name, password } = req.body;

  // 입력값 검증
  const nameResult = validateName(name);
  if (!nameResult.valid) {
    return res.render('auth/login', {
      title: '로그인',
      error: nameResult.error
    });
  }

  // 캐시 새로고침 (MongoDB 환경에서 최신 비밀번호 반영)
  if (db.refreshCache) {
    await db.refreshCache('members');
  }

  const members = db.getTable('members');
  const member = members.find(m => m.name === name && m.status === 'active');

  if (!member) {
    logger.security('로그인 실패 - 존재하지 않는 사용자', { name, ip: req.ip });
    return res.render('auth/login', {
      title: '로그인',
      error: '이름 또는 비밀번호가 일치하지 않습니다.'
    });
  }

  const isValid = bcrypt.compareSync(password, member.password_hash || '');
  if (!isValid) {
    logger.security('로그인 실패 - 비밀번호 불일치', { name, ip: req.ip });
    return res.render('auth/login', {
      title: '로그인',
      error: '이름 또는 비밀번호가 일치하지 않습니다.'
    });
  }

  req.session.user = {
    id: member.id,
    name: member.name,
    internal_phone: member.internal_phone,
    is_admin: member.is_admin
  };

  logger.audit('로그인 성공', req.session.user, { ip: req.ip });

  // 원래 요청 URL로 리다이렉트
  const returnTo = req.session.returnTo || '/';
  delete req.session.returnTo;
  res.redirect(returnTo);
});

// 로그아웃
router.get('/logout', (req, res) => {
  if (req.session && req.session.user) {
    logger.audit('로그아웃', req.session.user, { ip: req.ip });
  }
  // cookie-session 호환: destroy() 대신 null 할당
  if (req.session) {
    req.session = null;
  }
  res.redirect('/auth/login');
});

// 비밀번호 변경 페이지
router.get('/change-password', requireAuth, (req, res) => {
  res.render('auth/change-password', {
    title: '비밀번호 변경',
    error: null,
    success: null,
    passwordPolicy: config.password
  });
});

// 비밀번호 변경 처리
router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { current_password, new_password, confirm_password } = req.body;

    // 새 비밀번호 확인
    if (new_password !== confirm_password) {
      return res.render('auth/change-password', {
        title: '비밀번호 변경',
        error: '새 비밀번호가 일치하지 않습니다.',
        success: null,
        passwordPolicy: config.password
      });
    }

    // 비밀번호 정책 검증
    const passwordResult = validatePassword(new_password, config.password);
    if (!passwordResult.valid) {
      return res.render('auth/change-password', {
        title: '비밀번호 변경',
        error: passwordResult.error,
        success: null,
        passwordPolicy: config.password
      });
    }

    // 캐시 새로고침 (MongoDB 환경)
    if (db.refreshCache) {
      await db.refreshCache('members');
    }

    const member = db.findById('members', req.session.user.id);
    const isValid = bcrypt.compareSync(current_password, member.password_hash || '');

    if (!isValid) {
      logger.security('비밀번호 변경 실패 - 현재 비밀번호 불일치', {
        userId: req.session.user.id,
        ip: req.ip
      });
      return res.render('auth/change-password', {
        title: '비밀번호 변경',
        error: '현재 비밀번호가 일치하지 않습니다.',
        success: null,
        passwordPolicy: config.password
      });
    }

    const newHash = bcrypt.hashSync(new_password, config.security.bcryptRounds);
    await db.update('members', req.session.user.id, { password_hash: newHash });

    // 캐시 새로고침 (MongoDB 환경)
    if (db.refreshCache) {
      await db.refreshCache('members');
    }

    logger.audit('비밀번호 변경 성공', req.session.user, { ip: req.ip });

    res.render('auth/change-password', {
      title: '비밀번호 변경',
      error: null,
      success: '비밀번호가 성공적으로 변경되었습니다.',
      passwordPolicy: config.password
    });
  } catch (error) {
    console.error('비밀번호 변경 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '비밀번호 변경 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
