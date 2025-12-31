// 입력값 검증 유틸리티

// XSS 방지를 위한 HTML 이스케이프
function escapeHtml(str) {
  if (!str || typeof str !== 'string') return str;
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 문자열 검증
function validateString(value, options = {}) {
  const { minLength = 0, maxLength = 1000, required = false, fieldName = '값' } = options;

  if (required && (!value || !value.trim())) {
    return { valid: false, error: `${fieldName}은(는) 필수 항목입니다.` };
  }

  if (value && value.length < minLength) {
    return { valid: false, error: `${fieldName}은(는) 최소 ${minLength}자 이상이어야 합니다.` };
  }

  if (value && value.length > maxLength) {
    return { valid: false, error: `${fieldName}은(는) 최대 ${maxLength}자까지 입력 가능합니다.` };
  }

  return { valid: true, value: value ? value.trim() : '' };
}

// 이름 검증 (한글, 영문, 숫자만 허용)
function validateName(value, required = true) {
  const result = validateString(value, { minLength: 1, maxLength: 50, required, fieldName: '이름' });
  if (!result.valid) return result;

  if (value && !/^[가-힣a-zA-Z0-9\s]+$/.test(value)) {
    return { valid: false, error: '이름은 한글, 영문, 숫자만 입력 가능합니다.' };
  }

  return result;
}

// 이메일 검증
function validateEmail(value, required = false) {
  if (!required && !value) {
    return { valid: true, value: '' };
  }

  const result = validateString(value, { maxLength: 100, required, fieldName: '이메일' });
  if (!result.valid) return result;

  if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    return { valid: false, error: '올바른 이메일 형식이 아닙니다.' };
  }

  return result;
}

// 전화번호/구내번호 검증
function validatePhone(value, required = false) {
  if (!required && !value) {
    return { valid: true, value: '' };
  }

  const result = validateString(value, { maxLength: 20, required, fieldName: '전화번호' });
  if (!result.valid) return result;

  if (value && !/^[0-9-]+$/.test(value)) {
    return { valid: false, error: '전화번호는 숫자와 하이픈만 입력 가능합니다.' };
  }

  return result;
}

// 숫자 검증
function validateNumber(value, options = {}) {
  const { min = 0, max = Number.MAX_SAFE_INTEGER, required = false, fieldName = '값' } = options;

  if (required && (value === undefined || value === null || value === '')) {
    return { valid: false, error: `${fieldName}은(는) 필수 항목입니다.` };
  }

  if (value === undefined || value === null || value === '') {
    return { valid: true, value: null };
  }

  const num = parseFloat(value);

  if (isNaN(num)) {
    return { valid: false, error: `${fieldName}은(는) 유효한 숫자가 아닙니다.` };
  }

  if (num < min) {
    return { valid: false, error: `${fieldName}은(는) ${min} 이상이어야 합니다.` };
  }

  if (num > max) {
    return { valid: false, error: `${fieldName}은(는) ${max} 이하여야 합니다.` };
  }

  return { valid: true, value: num };
}

// 금액 검증
function validateAmount(value, required = true) {
  return validateNumber(value, { min: 0, max: 100000000, required, fieldName: '금액' });
}

// 날짜 검증
function validateDate(value, options = {}) {
  const { required = false, fieldName = '날짜' } = options;

  if (required && !value) {
    return { valid: false, error: `${fieldName}은(는) 필수 항목입니다.` };
  }

  if (!value) {
    return { valid: true, value: null };
  }

  // YYYY-MM-DD 형식 검증
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { valid: false, error: `${fieldName} 형식이 올바르지 않습니다. (YYYY-MM-DD)` };
  }

  const date = new Date(value);
  if (isNaN(date.getTime())) {
    return { valid: false, error: `${fieldName}이(가) 유효하지 않습니다.` };
  }

  return { valid: true, value };
}

// ID 검증 (양의 정수)
function validateId(value, fieldName = 'ID') {
  if (!value) {
    return { valid: false, error: `${fieldName}이(가) 필요합니다.` };
  }

  const id = parseInt(value, 10);

  if (isNaN(id) || id <= 0) {
    return { valid: false, error: `${fieldName}이(가) 유효하지 않습니다.` };
  }

  return { valid: true, value: id };
}

// 비밀번호 정책 검증
function validatePassword(value, options = {}) {
  const {
    minLength = 4,
    maxLength = 100,
    requireUppercase = false,
    requireLowercase = false,
    requireNumber = false,
    requireSpecial = false
  } = options;

  if (!value) {
    return { valid: false, error: '비밀번호를 입력해주세요.' };
  }

  if (value.length < minLength) {
    return { valid: false, error: `비밀번호는 최소 ${minLength}자 이상이어야 합니다.` };
  }

  if (value.length > maxLength) {
    return { valid: false, error: `비밀번호는 최대 ${maxLength}자까지 입력 가능합니다.` };
  }

  if (requireUppercase && !/[A-Z]/.test(value)) {
    return { valid: false, error: '비밀번호에 대문자가 포함되어야 합니다.' };
  }

  if (requireLowercase && !/[a-z]/.test(value)) {
    return { valid: false, error: '비밀번호에 소문자가 포함되어야 합니다.' };
  }

  if (requireNumber && !/[0-9]/.test(value)) {
    return { valid: false, error: '비밀번호에 숫자가 포함되어야 합니다.' };
  }

  if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(value)) {
    return { valid: false, error: '비밀번호에 특수문자가 포함되어야 합니다.' };
  }

  return { valid: true };
}

// 선택값 검증 (허용된 값 목록 중 하나인지)
function validateEnum(value, allowedValues, options = {}) {
  const { required = false, fieldName = '값' } = options;

  if (required && !value) {
    return { valid: false, error: `${fieldName}을(를) 선택해주세요.` };
  }

  if (value && !allowedValues.includes(value)) {
    return { valid: false, error: `${fieldName}이(가) 유효하지 않습니다.` };
  }

  return { valid: true, value };
}

// 티타임 형식 검증 (HH:MM 또는 HH:MM,HH:MM,...)
function validateTeeTimes(value, required = false) {
  if (!required && !value) {
    return { valid: true, value: '' };
  }

  if (required && !value) {
    return { valid: false, error: '티타임을 입력해주세요.' };
  }

  const timePattern = /^\d{2}:\d{2}$/;
  const times = value.split(',').map(t => t.trim());

  for (const time of times) {
    if (!timePattern.test(time)) {
      return { valid: false, error: '티타임 형식이 올바르지 않습니다. (예: 06:00,06:08)' };
    }

    const [hours, minutes] = time.split(':').map(Number);
    if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
      return { valid: false, error: '유효하지 않은 시간입니다.' };
    }
  }

  return { valid: true, value };
}

// Cloudinary URL 최적화 (f_auto, q_auto 적용)
function optimizeCloudinaryUrl(url) {
  if (!url || typeof url !== 'string') return url;

  // Cloudinary URL인지 확인
  if (!url.includes('res.cloudinary.com')) return url;

  // 이미 최적화 파라미터가 있으면 그대로 반환
  if (url.includes('f_auto') || url.includes('q_auto')) return url;

  // /upload/ 다음에 최적화 파라미터 삽입
  // 예: .../upload/v123/... → .../upload/f_auto,q_auto/v123/...
  return url.replace('/upload/', '/upload/f_auto,q_auto/');
}

// 여러 필드 한번에 검증
function validateAll(validations) {
  const errors = [];
  const values = {};

  for (const [field, result] of Object.entries(validations)) {
    if (!result.valid) {
      errors.push(result.error);
    } else {
      values[field] = result.value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    values
  };
}

module.exports = {
  escapeHtml,
  validateString,
  validateName,
  validateEmail,
  validatePhone,
  validateNumber,
  validateAmount,
  validateDate,
  validateId,
  validatePassword,
  validateEnum,
  validateTeeTimes,
  validateAll,
  optimizeCloudinaryUrl
};
