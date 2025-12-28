// 환경별 설정 관리
require('dotenv').config();

const env = process.env.NODE_ENV || 'development';

// 기본 설정
const baseConfig = {
  app: {
    name: 'N2골프 자금관리',
    port: parseInt(process.env.PORT, 10) || 3000
  },
  session: {
    secret: process.env.SESSION_SECRET || 'n2golf-development-secret',
    maxAge: 24 * 60 * 60 * 1000 // 24시간
  },
  security: {
    bcryptRounds: 10,
    csrfEnabled: true
  },
  rateLimiting: {
    enabled: true,
    general: {
      windowMs: 60 * 1000,
      maxRequests: 60
    },
    login: {
      windowMs: 15 * 60 * 1000,
      maxRequests: 5
    }
  },
  logging: {
    level: 'INFO'
  },
  password: {
    minLength: 4,
    maxLength: 100,
    requireUppercase: false,
    requireLowercase: false,
    requireNumber: false,
    requireSpecial: false
  },
  members: {
    maxCount: 300
  }
};

// 개발 환경 설정
const developmentConfig = {
  ...baseConfig,
  security: {
    ...baseConfig.security,
    cookieSecure: false
  },
  logging: {
    level: 'DEBUG'
  },
  rateLimiting: {
    ...baseConfig.rateLimiting,
    enabled: false // 개발 환경에서는 비활성화 가능
  }
};

// 프로덕션 환경 설정
const productionConfig = {
  ...baseConfig,
  security: {
    ...baseConfig.security,
    bcryptRounds: 12,
    cookieSecure: true
  },
  password: {
    minLength: 8,
    maxLength: 100,
    requireUppercase: true,
    requireLowercase: true,
    requireNumber: true,
    requireSpecial: false
  },
  logging: {
    level: 'WARN'
  },
  rateLimiting: {
    ...baseConfig.rateLimiting,
    enabled: true
  }
};

// 테스트 환경 설정
const testConfig = {
  ...baseConfig,
  security: {
    ...baseConfig.security,
    cookieSecure: false
  },
  logging: {
    level: 'ERROR'
  },
  rateLimiting: {
    ...baseConfig.rateLimiting,
    enabled: false
  }
};

// 환경별 설정 매핑
const configs = {
  development: developmentConfig,
  production: productionConfig,
  test: testConfig
};

// 현재 환경 설정 내보내기
const config = configs[env] || developmentConfig;

// 환경 변수로 오버라이드 가능한 설정들
if (process.env.LOG_LEVEL) {
  config.logging.level = process.env.LOG_LEVEL.toUpperCase();
}

if (process.env.RATE_LIMIT_ENABLED) {
  config.rateLimiting.enabled = process.env.RATE_LIMIT_ENABLED === 'true';
}

if (process.env.PASSWORD_MIN_LENGTH) {
  config.password.minLength = parseInt(process.env.PASSWORD_MIN_LENGTH, 10);
}

// 현재 환경 정보 추가
config.env = env;
config.isDevelopment = env === 'development';
config.isProduction = env === 'production';
config.isTest = env === 'test';

module.exports = config;
