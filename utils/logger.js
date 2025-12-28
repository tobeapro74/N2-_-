// 로깅 시스템
const fs = require('fs');
const path = require('path');

// 로그 레벨 정의
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

// 현재 로그 레벨 (환경 변수로 설정 가능)
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// 로그 디렉토리 생성
const logDir = path.join(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// 날짜 포맷
function formatDate(date = new Date()) {
  return date.toISOString();
}

// 로그 파일명 (일별)
function getLogFileName(type = 'app') {
  const date = new Date().toISOString().split('T')[0];
  return path.join(logDir, `${type}-${date}.log`);
}

// 로그 파일에 쓰기
function writeToFile(type, message) {
  const fileName = getLogFileName(type);
  const line = `${message}\n`;

  fs.appendFile(fileName, line, (err) => {
    if (err) {
      console.error('로그 파일 쓰기 오류:', err);
    }
  });
}

// 로그 포맷팅
function formatLog(level, message, meta = {}) {
  const timestamp = formatDate();
  const metaStr = Object.keys(meta).length > 0 ? ` ${JSON.stringify(meta)}` : '';
  return `[${timestamp}] [${level}] ${message}${metaStr}`;
}

// 메인 로거 객체
const logger = {
  error(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.ERROR) {
      const log = formatLog('ERROR', message, meta);
      console.error(log);
      writeToFile('error', log);
      writeToFile('app', log);
    }
  },

  warn(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.WARN) {
      const log = formatLog('WARN', message, meta);
      console.warn(log);
      writeToFile('app', log);
    }
  },

  info(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.INFO) {
      const log = formatLog('INFO', message, meta);
      console.log(log);
      writeToFile('app', log);
    }
  },

  debug(message, meta = {}) {
    if (currentLevel >= LOG_LEVELS.DEBUG) {
      const log = formatLog('DEBUG', message, meta);
      console.log(log);
      writeToFile('debug', log);
    }
  },

  // HTTP 요청 로깅
  request(req, res, duration) {
    const meta = {
      method: req.method,
      url: req.originalUrl,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent')?.substring(0, 100),
      userId: req.session?.user?.id
    };

    const message = `${req.method} ${req.originalUrl} ${res.statusCode}`;

    if (res.statusCode >= 500) {
      this.error(message, meta);
    } else if (res.statusCode >= 400) {
      this.warn(message, meta);
    } else {
      this.info(message, meta);
    }
  },

  // 보안 관련 로깅
  security(event, details = {}) {
    const log = formatLog('SECURITY', event, details);
    console.warn(log);
    writeToFile('security', log);
    writeToFile('app', log);
  },

  // 감사 로깅 (중요 작업 추적)
  audit(action, user, details = {}) {
    const meta = {
      userId: user?.id,
      userName: user?.name,
      ...details
    };
    const log = formatLog('AUDIT', action, meta);
    console.log(log);
    writeToFile('audit', log);
  }
};

// HTTP 요청 로깅 미들웨어
function requestLogger(req, res, next) {
  const startTime = Date.now();

  // 응답 완료 시 로깅
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    logger.request(req, res, duration);
  });

  next();
}

// 에러 로깅 미들웨어
function errorLogger(err, req, res, next) {
  logger.error(err.message, {
    stack: err.stack,
    method: req.method,
    url: req.originalUrl,
    userId: req.session?.user?.id
  });
  next(err);
}

module.exports = {
  logger,
  requestLogger,
  errorLogger,
  LOG_LEVELS
};
