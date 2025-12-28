// 인증 미들웨어 (중앙화)

// 로그인 필수 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    // AJAX 요청인 경우 JSON 응답
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    // 원래 요청 URL 저장 (로그인 후 리다이렉트용)
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }
  next();
};

// 관리자 권한 필수 미들웨어
const requireAdmin = (req, res, next) => {
  if (!req.session.user) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }
    req.session.returnTo = req.originalUrl;
    return res.redirect('/auth/login');
  }

  if (!req.session.user.is_admin) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
    }
    return res.status(403).render('error', {
      title: '접근 거부',
      message: '관리자 권한이 필요합니다.'
    });
  }

  next();
};

// 비로그인 사용자만 접근 가능 (로그인 페이지 등)
const requireGuest = (req, res, next) => {
  if (req.session.user) {
    return res.redirect('/');
  }
  next();
};

// 본인 또는 관리자만 접근 가능
const requireSelfOrAdmin = (idParam = 'id') => {
  return (req, res, next) => {
    if (!req.session.user) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(401).json({ error: '로그인이 필요합니다.' });
      }
      return res.redirect('/auth/login');
    }

    const targetId = parseInt(req.params[idParam], 10);
    const isOwner = req.session.user.id === targetId;
    const isAdmin = req.session.user.is_admin;

    if (!isOwner && !isAdmin) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(403).json({ error: '접근 권한이 없습니다.' });
      }
      return res.status(403).render('error', {
        title: '접근 거부',
        message: '접근 권한이 없습니다.'
      });
    }

    next();
  };
};

// 세션에서 사용자 정보 갱신 (DB에서 최신 정보 가져오기)
const refreshUserSession = (db) => {
  return (req, res, next) => {
    if (req.session.user) {
      const member = db.findById('members', req.session.user.id);
      if (member && member.status === 'active') {
        req.session.user = {
          id: member.id,
          name: member.name,
          internal_phone: member.internal_phone,
          is_admin: member.is_admin
        };
      } else {
        // 비활성 계정은 로그아웃 처리
        req.session.destroy();
        return res.redirect('/auth/login');
      }
    }
    next();
  };
};

module.exports = {
  requireAuth,
  requireAdmin,
  requireGuest,
  requireSelfOrAdmin,
  refreshUserSession
};
