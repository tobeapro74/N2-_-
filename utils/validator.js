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

// 전화번호 숫자만 추출 후 하이픈 포맷으로 변환
function formatPhone(value) {
  const digits = value.replace(/[^0-9]/g, '');
  if (digits.length === 11 && digits.startsWith('010')) {
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  }
  if (digits.length === 11) {
    return `${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('02')) {
    return `${digits.slice(0,2)}-${digits.slice(2,6)}-${digits.slice(6)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0,3)}-${digits.slice(3,6)}-${digits.slice(6)}`;
  }
  // 포맷 불명확 시 원본 반환
  return value.trim();
}

// 전화번호/구내번호/휴대폰 검증
function validatePhone(value, required = false, fieldName = '전화번호') {
  if (!required && !value) {
    return { valid: true, value: '' };
  }

  const result = validateString(value, { maxLength: 20, required, fieldName });
  if (!result.valid) return result;

  if (value && !/^[0-9\-\s\(\)]+$/.test(value)) {
    return { valid: false, error: `${fieldName}은(는) 숫자와 하이픈만 입력 가능합니다.` };
  }

  // 하이픈 없이 숫자만 입력된 경우 자동 포맷 적용
  const formatted = formatPhone(value);
  return { valid: true, value: formatted };
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
function optimizeCloudinaryUrl(url, resourceType) {
  if (!url || typeof url !== 'string') return url;

  if (!url.includes('res.cloudinary.com')) return url;

  // 동영상은 원본 URL 그대로 사용 (업로드 시 이미 mp4로 저장됨)
  if (resourceType === 'video' || url.includes('/video/upload/')) return url;

  if (url.includes('f_auto') || url.includes('q_auto')) return url;

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
