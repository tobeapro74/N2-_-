// N2골프 관리 시스템 JavaScript

document.addEventListener('DOMContentLoaded', function() {
  // 초기화
  initTooltips();
  initAmountInputs();
  initPhoneInputs();
  initDeleteForms();
  initClickableRows();
  initSearchInputs();
  initFormValidation();
  initKeyboardAccessibility();
  initOfflineDetection();
  initPageTransitionLoading();
});

// =============================================
// 초기화 함수들
// =============================================

// 툴팁 초기화
function initTooltips() {
  const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
  tooltipTriggerList.forEach(el => new bootstrap.Tooltip(el));
}

// 금액 입력 필드 포맷팅
function initAmountInputs() {
  const amountInputs = document.querySelectorAll('input[name="amount"]');
  amountInputs.forEach(input => {
    input.addEventListener('blur', function() {
      const value = parseFloat(this.value);
      if (!isNaN(value)) {
        this.value = value;
      }
    });
  });
}

// 전화번호 자동 포맷팅
function initPhoneInputs() {
  const phoneInputs = document.querySelectorAll('input[name="phone"]');
  phoneInputs.forEach(input => {
    input.addEventListener('input', function() {
      let value = this.value.replace(/\D/g, '');
      if (value.length >= 11) {
        value = value.slice(0, 11);
        this.value = value.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
      } else if (value.length >= 7) {
        this.value = value.replace(/(\d{3})(\d{3,4})(\d{0,4})/, '$1-$2-$3');
      } else if (value.length >= 4) {
        this.value = value.replace(/(\d{3})(\d{0,4})/, '$1-$2');
      }
    });
  });
}

// 삭제 확인
function initDeleteForms() {
  const deleteForms = document.querySelectorAll('form[action*="delete"]');
  deleteForms.forEach(form => {
    form.addEventListener('submit', function(e) {
      if (!confirm('정말 삭제하시겠습니까?')) {
        e.preventDefault();
      }
    });
  });
}

// 테이블 행 클릭 시 상세 페이지 이동
function initClickableRows() {
  const clickableRows = document.querySelectorAll('tr[data-href]');
  clickableRows.forEach(row => {
    row.style.cursor = 'pointer';
    row.setAttribute('tabindex', '0');
    row.setAttribute('role', 'button');

    row.addEventListener('click', function(e) {
      if (!e.target.closest('a, button, input, select')) {
        window.location.href = this.dataset.href;
      }
    });

    // 키보드 접근성
    row.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        window.location.href = this.dataset.href;
      }
    });
  });
}

// 검색 폼 엔터키 처리
function initSearchInputs() {
  const searchInputs = document.querySelectorAll('input[name="search"]');
  searchInputs.forEach(input => {
    input.addEventListener('keypress', function(e) {
      if (e.key === 'Enter') {
        this.closest('form').submit();
      }
    });
  });
}

// 폼 검증 초기화
function initFormValidation() {
  const forms = document.querySelectorAll('form[data-validate]');
  forms.forEach(form => {
    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');

    inputs.forEach(input => {
      input.addEventListener('blur', function() {
        validateField(this);
      });

      input.addEventListener('input', function() {
        // 에러가 있으면 입력 시 재검증
        if (this.classList.contains('is-invalid')) {
          validateField(this);
        }
      });
    });

    form.addEventListener('submit', function(e) {
      let isValid = true;
      inputs.forEach(input => {
        if (!validateField(input)) {
          isValid = false;
        }
      });

      if (!isValid) {
        e.preventDefault();
        // 첫 번째 에러 필드로 포커스
        const firstError = form.querySelector('.is-invalid');
        if (firstError) {
          firstError.focus();
        }
      }
    });
  });
}

// 개별 필드 검증
function validateField(input) {
  const value = input.value.trim();
  const fieldName = input.getAttribute('data-field-name') || input.name || '필드';
  let errorMessage = '';

  // 필수 필드 체크
  if (input.required && !value) {
    errorMessage = `${fieldName}을(를) 입력해주세요.`;
  }

  // 이메일 형식 체크
  if (input.type === 'email' && value) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(value)) {
      errorMessage = '올바른 이메일 형식이 아닙니다.';
    }
  }

  // 최소 길이 체크
  const minLength = input.getAttribute('minlength');
  if (minLength && value.length < parseInt(minLength)) {
    errorMessage = `최소 ${minLength}자 이상 입력해주세요.`;
  }

  // 에러 표시/제거
  const feedbackEl = input.nextElementSibling?.classList?.contains('invalid-feedback')
    ? input.nextElementSibling
    : null;

  if (errorMessage) {
    input.classList.add('is-invalid');
    input.classList.remove('is-valid');
    if (feedbackEl) {
      feedbackEl.textContent = errorMessage;
    }
    return false;
  } else {
    input.classList.remove('is-invalid');
    if (value) {
      input.classList.add('is-valid');
    }
    return true;
  }
}

// 키보드 접근성 초기화
function initKeyboardAccessibility() {
  // Escape 키로 모달 닫기
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const openModal = document.querySelector('.modal.show');
      if (openModal) {
        const modal = bootstrap.Modal.getInstance(openModal);
        if (modal) modal.hide();
      }
    }
  });

  // 드롭다운 메뉴 키보드 네비게이션 개선
  const dropdowns = document.querySelectorAll('.dropdown-menu');
  dropdowns.forEach(dropdown => {
    const items = dropdown.querySelectorAll('.dropdown-item');
    items.forEach((item, index) => {
      item.addEventListener('keydown', function(e) {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          const next = items[index + 1] || items[0];
          next.focus();
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          const prev = items[index - 1] || items[items.length - 1];
          prev.focus();
        }
      });
    });
  });
}

// 오프라인 감지
function initOfflineDetection() {
  const showOffline = () => {
    let indicator = document.querySelector('.offline-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'offline-indicator';
      indicator.setAttribute('role', 'alert');
      indicator.innerHTML = '<i class="bi bi-wifi-off"></i> 오프라인 상태입니다';
      document.body.appendChild(indicator);
    }
    indicator.classList.add('show');
  };

  const hideOffline = () => {
    const indicator = document.querySelector('.offline-indicator');
    if (indicator) {
      indicator.classList.remove('show');
    }
  };

  window.addEventListener('offline', showOffline);
  window.addEventListener('online', hideOffline);

  // 초기 상태 확인
  if (!navigator.onLine) {
    showOffline();
  }
}

// 페이지 전환 로딩
function initPageTransitionLoading() {
  // 폼 제출 시 로딩 표시
  document.querySelectorAll('form').forEach(form => {
    form.addEventListener('submit', function() {
      // 이미 로딩 중이거나 취소된 경우 무시
      if (this.classList.contains('submitting')) return;

      const submitBtn = this.querySelector('button[type="submit"], input[type="submit"]');
      if (submitBtn && !submitBtn.disabled) {
        setButtonLoading(submitBtn, true);
        this.classList.add('submitting');
      }
    });
  });

  // 링크 클릭 시 로딩 (새 탭 제외)
  document.querySelectorAll('a[href]:not([target="_blank"]):not([href^="#"]):not([href^="javascript"])').forEach(link => {
    link.addEventListener('click', function(e) {
      if (!e.ctrlKey && !e.metaKey && !e.shiftKey) {
        // 약간의 딜레이 후 로딩 표시 (빠른 네비게이션에서는 표시 안 함)
        setTimeout(() => {
          if (!document.hidden) {
            showLoading(true);
          }
        }, 100);
      }
    });
  });
}

// =============================================
// 유틸리티 함수들
// =============================================

// 숫자 포맷팅 함수
function formatNumber(num) {
  return new Intl.NumberFormat('ko-KR').format(num);
}

// 금액 포맷팅 (원 단위)
function formatAmount(amount) {
  return formatNumber(amount) + '원';
}

// 날짜 포맷팅 함수
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

// 요일 표시
function showDayOfWeek(dateStr) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const date = new Date(dateStr);
  return days[date.getDay()];
}

// API 호출 헬퍼
async function apiCall(url, method = 'GET', data = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    }
  };

  // CSRF 토큰 추가
  const csrfToken = document.querySelector('meta[name="csrf-token"]')?.content;
  if (csrfToken) {
    options.headers['X-CSRF-Token'] = csrfToken;
  }

  if (data) {
    options.body = JSON.stringify(data);
  }

  try {
    const response = await fetch(url, options);
    const result = await response.json();

    if (!response.ok) {
      throw new Error(result.error || '요청 처리 중 오류가 발생했습니다.');
    }

    return result;
  } catch (error) {
    console.error('API Error:', error);
    throw error;
  }
}

// 비동기 액션 래퍼 (로딩 + 토스트)
async function asyncAction(actionFn, options = {}) {
  const {
    loadingMessage = '처리 중...',
    successMessage = '완료되었습니다.',
    errorMessage = '오류가 발생했습니다.',
    showLoadingOverlay = false,
    button = null
  } = options;

  try {
    if (button) {
      setButtonLoading(button, true, loadingMessage);
    }
    if (showLoadingOverlay) {
      showLoading(true);
    }

    const result = await actionFn();

    showToast(successMessage, 'success');
    return result;
  } catch (error) {
    showToast(error.message || errorMessage, 'danger');
    throw error;
  } finally {
    if (button) {
      setButtonLoading(button, false);
    }
    if (showLoadingOverlay) {
      showLoading(false);
    }
  }
}

// =============================================
// Toast 알림 시스템
// =============================================

// Toast 컨테이너 생성
function getToastContainer() {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    container.setAttribute('aria-atomic', 'true');
    document.body.appendChild(container);
  }
  return container;
}

// Toast 알림 표시
function showToast(message, type = 'success', duration = 5000) {
  const container = getToastContainer();

  const iconMap = {
    success: 'bi-check-circle-fill',
    danger: 'bi-exclamation-circle-fill',
    warning: 'bi-exclamation-triangle-fill',
    info: 'bi-info-circle-fill'
  };

  const toast = document.createElement('div');
  toast.className = `toast custom-toast show`;
  toast.setAttribute('role', 'alert');
  toast.setAttribute('aria-live', 'assertive');
  toast.setAttribute('aria-atomic', 'true');
  toast.innerHTML = `
    <div class="toast-header bg-${type} text-white">
      <i class="bi ${iconMap[type] || iconMap.info} me-2"></i>
      <strong class="me-auto">${type === 'success' ? '성공' : type === 'danger' ? '오류' : type === 'warning' ? '경고' : '알림'}</strong>
      <button type="button" class="btn-close btn-close-white" data-bs-dismiss="toast" aria-label="닫기"></button>
    </div>
    <div class="toast-body">
      ${message}
    </div>
  `;

  container.appendChild(toast);

  // 닫기 버튼
  toast.querySelector('.btn-close').addEventListener('click', () => {
    removeToast(toast);
  });

  // 자동 제거
  if (duration > 0) {
    setTimeout(() => {
      removeToast(toast);
    }, duration);
  }

  return toast;
}

// Toast 제거 애니메이션
function removeToast(toast) {
  toast.style.animation = 'slideOut 0.3s ease forwards';
  setTimeout(() => {
    toast.remove();
  }, 300);
}

// 기존 showAlert 함수를 showToast로 대체 (하위 호환성)
function showAlert(message, type = 'success') {
  showToast(message, type);
}

// =============================================
// 로딩 표시
// =============================================

// 전역 로딩 오버레이
function showLoading(show = true) {
  let overlay = document.querySelector('.loading-overlay');

  if (show) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.className = 'loading-overlay';
      overlay.setAttribute('role', 'progressbar');
      overlay.setAttribute('aria-label', '로딩 중');
      overlay.innerHTML = `
        <div class="text-center">
          <div class="spinner-border text-success" role="status" style="width: 3rem; height: 3rem;">
            <span class="visually-hidden">로딩 중...</span>
          </div>
          <p class="mt-3 text-muted">잠시만 기다려주세요...</p>
        </div>
      `;
      document.body.appendChild(overlay);
    }
    overlay.classList.add('show');
  } else if (overlay) {
    overlay.classList.remove('show');
  }
}

// 버튼 로딩 상태
function setButtonLoading(button, loading = true, text = '처리 중...') {
  if (loading) {
    button.dataset.originalText = button.innerHTML;
    button.disabled = true;
    button.classList.add('btn-loading');
    button.innerHTML = `
      <span class="spinner-border spinner-border-sm me-1" role="status" aria-hidden="true"></span>
      ${text}
    `;
  } else {
    button.disabled = false;
    button.classList.remove('btn-loading');
    button.innerHTML = button.dataset.originalText || button.innerHTML;
  }
}

// =============================================
// 스켈레톤 로더
// =============================================

// 스켈레톤 요소 생성
function createSkeleton(type = 'text', count = 1) {
  const skeletons = [];

  for (let i = 0; i < count; i++) {
    const skeleton = document.createElement('div');
    skeleton.className = `skeleton skeleton-${type}`;

    if (type === 'text') {
      skeleton.style.width = `${Math.random() * 40 + 60}%`;
    }

    skeletons.push(skeleton);
  }

  return skeletons;
}

// 테이블 스켈레톤
function createTableSkeleton(rows = 5, cols = 5) {
  const tbody = document.createElement('tbody');

  for (let i = 0; i < rows; i++) {
    const tr = document.createElement('tr');
    for (let j = 0; j < cols; j++) {
      const td = document.createElement('td');
      const skeleton = document.createElement('div');
      skeleton.className = 'skeleton skeleton-text';
      skeleton.style.width = `${Math.random() * 40 + 40}%`;
      td.appendChild(skeleton);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
  }

  return tbody;
}

// =============================================
// 네비게이션 헬퍼
// =============================================

// 안전한 뒤로가기 (이전 페이지가 같은 도메인인 경우에만)
function safeGoBack(fallbackUrl = '/') {
  if (document.referrer && document.referrer.includes(window.location.host)) {
    history.back();
  } else {
    window.location.href = fallbackUrl;
  }
}
