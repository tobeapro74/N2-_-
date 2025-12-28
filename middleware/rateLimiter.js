// Rate Limiting 미들웨어 (메모리 기반)

// 요청 기록 저장소
const requestCounts = new Map();

// 정리 주기 (5분마다)
const CLEANUP_INTERVAL = 5 * 60 * 1000;

// 오래된 기록 정리
setInterval(() => {
  const now = Date.now();
  for (const [key, data] of requestCounts.entries()) {
    if (now - data.startTime > data.windowMs) {
      requestCounts.delete(key);
    }
  }
}, CLEANUP_INTERVAL);

// Rate Limiter 생성 함수
function createRateLimiter(options = {}) {
  const {
    windowMs = 60 * 1000,     // 기본 1분
    maxRequests = 100,        // 기본 100회
    message = '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
    keyGenerator = (req) => req.ip || req.connection.remoteAddress,
    skipFailedRequests = false,
    skipSuccessfulRequests = false,
    handler = null
  } = options;

  return (req, res, next) => {
    const key = `${keyGenerator(req)}:${options.name || 'default'}`;
    const now = Date.now();

    // 기존 기록 확인
    let data = requestCounts.get(key);

    // 새 윈도우 시작 또는 윈도우 만료
    if (!data || now - data.startTime > windowMs) {
      data = {
        count: 0,
        startTime: now,
        windowMs
      };
      requestCounts.set(key, data);
    }

    // 카운트 증가
    data.count++;

    // 헤더 설정
    res.setHeader('X-RateLimit-Limit', maxRequests);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, maxRequests - data.count));
    res.setHeader('X-RateLimit-Reset', new Date(data.startTime + windowMs).toISOString());

    // 제한 초과 확인
    if (data.count > maxRequests) {
      const retryAfter = Math.ceil((data.startTime + windowMs - now) / 1000);
      res.setHeader('Retry-After', retryAfter);

      if (handler) {
        return handler(req, res, next);
      }

      // 기본 응답
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(429).json({ error: message });
      }

      return res.status(429).render('error', {
        title: '요청 제한',
        message: `${message} (${retryAfter}초 후 다시 시도해주세요)`
      });
    }

    next();
  };
}

// 사전 정의된 Rate Limiter들

// 일반 페이지 접근 (분당 60회)
const generalLimiter = createRateLimiter({
  name: 'general',
  windowMs: 60 * 1000,
  maxRequests: 60
});

// 로그인 시도 (15분당 5회) - 브루트포스 방지
const loginLimiter = createRateLimiter({
  name: 'login',
  windowMs: 15 * 60 * 1000,
  maxRequests: 5,
  message: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해주세요.'
});

// 비밀번호 변경 (시간당 3회)
const passwordChangeLimiter = createRateLimiter({
  name: 'password',
  windowMs: 60 * 60 * 1000,
  maxRequests: 3,
  message: '비밀번호 변경 시도가 너무 많습니다. 1시간 후 다시 시도해주세요.'
});

// API 요청 (분당 30회)
const apiLimiter = createRateLimiter({
  name: 'api',
  windowMs: 60 * 1000,
  maxRequests: 30
});

// 데이터 수정 요청 (분당 20회) - CUD 작업
const writeLimiter = createRateLimiter({
  name: 'write',
  windowMs: 60 * 1000,
  maxRequests: 20,
  message: '데이터 수정 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.'
});

// 민감한 작업 (분당 10회)
const sensitiveLimiter = createRateLimiter({
  name: 'sensitive',
  windowMs: 60 * 1000,
  maxRequests: 10
});

module.exports = {
  createRateLimiter,
  generalLimiter,
  loginLimiter,
  passwordChangeLimiter,
  apiLimiter,
  writeLimiter,
  sensitiveLimiter
};
