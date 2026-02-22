const express = require('express');
const session = require('express-session');
const cookieSession = require('cookie-session');
const compression = require('compression');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const dayjs = require('dayjs');
require('dayjs/locale/ko');
dayjs.locale('ko');
const relativeTime = require('dayjs/plugin/relativeTime');
const utc = require('dayjs/plugin/utc');
const timezone = require('dayjs/plugin/timezone');
dayjs.extend(relativeTime);
dayjs.extend(utc);
dayjs.extend(timezone);

// 환경 변수 및 설정 로드
require('dotenv').config();
const config = require('./config');

// Vercel 환경 감지
const isVercel = process.env.VERCEL === '1';

// 로깅 시스템
const { logger, requestLogger, errorLogger } = require('./utils/logger');

// Rate Limiting
const { generalLimiter, loginLimiter, passwordChangeLimiter, apiLimiter } = require('./middleware/rateLimiter');

const app = express();
const PORT = config.app.port;

// 미들웨어 설정
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', true);  // EJS 템플릿 컴파일 결과 캐시 (성능 최적화)

// 프록시 신뢰 설정 (Rate Limiting을 위해 필요)
app.set('trust proxy', 1);

// 보안 헤더 설정 (helmet)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"],  // 인라인 이벤트 핸들러(onclick 등) 허용
      styleSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      fontSrc: ["'self'", "cdn.jsdelivr.net", "data:"],
      imgSrc: ["'self'", "data:", "https:", "http:"],  // 외부 URL 미리보기 이미지 허용
      connectSrc: ["'self'", "cdn.jsdelivr.net", "https://res.cloudinary.com", "https://*.cloudinary.com"],  // Service Worker fetch 허용
    },
  },
  // HSTS 설정 (프로덕션에서만 활성화)
  hsts: config.isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true
  } : false
}));

// gzip 압축 (응답 크기 60-70% 감소)
app.use(compression({
  level: 6,
  threshold: 1024,  // 1KB 이상만 압축
  filter: (req, res) => {
    if (req.headers['x-no-compression']) return false;
    return compression.filter(req, res);
  }
}));

// 정적 파일 제공 (캐싱 헤더 포함)
app.use(express.static(path.join(__dirname, 'public'), {
  maxAge: '7d',  // 7일 캐싱 (SW가 캐시 갱신 관리)
  etag: true,
  lastModified: true,
  setHeaders: (res, filePath) => {
    // Service Worker 자체는 캐시하지 않음 (항상 최신 유지)
    if (filePath.endsWith('sw.js')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// HTTP 요청 로깅
app.use(requestLogger);

// 세션 설정 (Vercel 환경에서는 cookie-session 사용)
if (isVercel) {
  // Vercel 서버리스 환경: 쿠키 기반 세션 (서버 메모리 불필요)
  app.use(cookieSession({
    name: 'session',
    keys: [config.session.secret],
    maxAge: config.session.maxAge,
    httpOnly: true,
    secure: true,
    sameSite: 'lax'
  }));
} else {
  // 로컬 환경: 메모리 기반 세션
  app.use(session({
    secret: config.session.secret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: config.session.maxAge,
      httpOnly: true,
      secure: config.security.cookieSecure,
      sameSite: 'lax'
    }
  }));
}

// Rate Limiting 적용 (설정에 따라)
if (config.rateLimiting.enabled) {
  // 일반 요청 제한
  app.use(generalLimiter);

  // 로그인 시도 제한
  app.use('/auth/login', loginLimiter);

  // 비밀번호 변경 제한
  app.use('/auth/change-password', passwordChangeLimiter);

  // API 요청 제한
  app.use('/api/', apiLimiter);

  logger.info('Rate Limiting 활성화됨');
}

// CSRF 토큰 생성 및 검증 미들웨어
const generateCsrfToken = () => crypto.randomBytes(32).toString('hex');

app.use((req, res, next) => {
  // cookie-session 호환: 세션 객체 확인
  if (!req.session) {
    req.session = {};
  }
  // 세션에 CSRF 토큰이 없으면 생성
  if (!req.session.csrfToken) {
    req.session.csrfToken = generateCsrfToken();
  }
  // 템플릿에서 사용할 수 있도록 설정
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

// CSRF 검증 미들웨어 (POST, PUT, DELETE 요청에 적용)
const verifyCsrf = (req, res, next) => {
  if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
    const token = req.body._csrf || req.headers['x-csrf-token'];
    const sessionToken = req.session?.csrfToken;
    if (!token || !sessionToken || token !== sessionToken) {
      logger.security('CSRF 토큰 검증 실패', {
        ip: req.ip,
        url: req.originalUrl,
        method: req.method
      });
      // AJAX 요청인 경우 JSON으로 응답
      if (req.xhr || req.headers.accept?.includes('application/json') || req.headers['content-type']?.includes('application/json')) {
        return res.status(403).json({
          error: 'CSRF 토큰이 유효하지 않습니다. 페이지를 새로고침 후 다시 시도해주세요.'
        });
      }
      return res.status(403).render('error', {
        title: '접근 거부',
        message: 'CSRF 토큰이 유효하지 않습니다. 페이지를 새로고침 후 다시 시도해주세요.',
        user: req.session.user || null
      });
    }
  }
  next();
};

// CSRF 검증 적용 (API 제외)
app.use((req, res, next) => {
  // API 엔드포인트와 날씨 API는 CSRF 검증 제외
  if (req.path.startsWith('/api/')) {
    return next();
  }
  verifyCsrf(req, res, next);
});

// Vercel CDN 캐싱 미들웨어 (페이지별 캐시 전략)
app.use((req, res, next) => {
  if (req.method !== 'GET') return next();
  const p = req.path;
  // 인증/알림 페이지는 캐시하지 않음
  if (p.startsWith('/auth') || p.startsWith('/notifications')) return next();
  // 정적 파일은 express.static이 처리
  if (p.match(/\.(css|js|png|jpg|svg|ico|woff2?)$/)) return next();

  // Vercel CDN에만 적용 (브라우저에는 영향 없음)
  if (p === '/') {
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=600, stale-while-revalidate=60');
  } else if (p.startsWith('/schedules/community')) {
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=120, stale-while-revalidate=30');
  } else if (p.startsWith('/schedules') || p.startsWith('/members')) {
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  } else if (p.startsWith('/reservations')) {
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  } else if (p.startsWith('/finance')) {
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=60, stale-while-revalidate=30');
  } else if (p.startsWith('/api/weather') || p.startsWith('/api/traffic')) {
    res.setHeader('Vercel-CDN-Cache-Control', 's-maxage=300, stale-while-revalidate=60');
  } else if (p.startsWith('/api/push')) {
    return next();
  }
  // 브라우저는 항상 서버에 확인 (최신 데이터 보장)
  res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
  next();
});

// 전역 변수 설정
app.use((req, res, next) => {
  res.locals.user = req.session?.user || null;
  res.locals.moment = dayjs;
  res.locals.config = {
    appName: config.app.name,
    env: config.env
  };
  next();
});

// 라우터 연결
const indexRouter = require('./routes/index');
const authRouter = require('./routes/auth');
const membersRouter = require('./routes/members');
const financeRouter = require('./routes/finance');
const reservationsRouter = require('./routes/reservations');
const schedulesRouter = require('./routes/schedules');
const weatherRouter = require('./routes/weather');
const trafficRouter = require('./routes/traffic');
const communityRouter = require('./routes/community');
const pushRouter = require('./routes/push');
const notificationsRouter = require('./routes/notifications');

app.use('/', indexRouter);
app.use('/auth', authRouter);
app.use('/members', membersRouter);
app.use('/finance', financeRouter);
app.use('/reservations', reservationsRouter);
app.use('/schedules', schedulesRouter);
app.use('/api/weather', weatherRouter);
app.use('/weather', weatherRouter);
app.use('/api/traffic', trafficRouter);
app.use('/community', communityRouter);
app.use('/api/push', pushRouter);
app.use('/notifications', notificationsRouter);

// 404 에러 처리
app.use((req, res) => {
  logger.warn('404 Not Found', { url: req.originalUrl, method: req.method });
  res.status(404).render('error', {
    title: '페이지를 찾을 수 없습니다',
    message: '요청하신 페이지가 존재하지 않습니다.',
    user: req.session?.user || null
  });
});

// 에러 로깅 미들웨어
app.use(errorLogger);

// 에러 처리
app.use((err, req, res, _next) => {
  res.status(500).render('error', {
    title: '서버 오류',
    message: config.isDevelopment ? err.message : '서버에서 오류가 발생했습니다.',
    user: req.session?.user || null
  });
});

// Vercel 서버리스 환경이 아닌 경우에만 listen
if (process.env.VERCEL !== '1') {
  app.listen(PORT, () => {
    logger.info(`${config.app.name} 시스템 시작`, {
      port: PORT,
      env: config.env,
      rateLimiting: config.rateLimiting.enabled
    });
    console.log(`N2골프 관리 시스템이 http://localhost:${PORT} 에서 실행중입니다.`);
  });
}

// Vercel 서버리스 함수로 내보내기
module.exports = app;
