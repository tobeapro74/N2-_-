# Vercel Web Analytics 시작 가이드

이 가이드는 N2 골프 동호회 관리 시스템에서 Vercel Web Analytics를 설정하고 사용하는 방법을 설명합니다.

## 사전 요구 사항

- Vercel 계정 ([무료 가입](https://vercel.com/signup))
- Vercel에 배포된 프로젝트
- Vercel CLI (선택사항): 다음 명령으로 설치 가능
  ```bash
  npm i -D vercel
  # 또는
  pnpm add -D vercel
  ```

## 1단계: Vercel 대시보드에서 Web Analytics 활성화

1. [Vercel 대시보드](/dashboard)로 이동합니다
2. N2 골프 관리 시스템 프로젝트를 선택합니다
3. **Analytics** 탭을 클릭합니다
4. **Enable** 버튼을 클릭하여 Web Analytics를 활성화합니다

> **💡 참고:** Web Analytics를 활성화하면 다음 배포 시 `/_vercel/insights/*` 경로에 새로운 라우트가 추가됩니다.

## 2단계: @vercel/analytics 패키지 설치

프로젝트의 패키지 관리자를 사용하여 `@vercel/analytics` 패키지를 설치합니다:

### npm 사용
```bash
npm install @vercel/analytics
```

### pnpm 사용
```bash
pnpm add @vercel/analytics
```

### yarn 사용
```bash
yarn add @vercel/analytics
```

## 3단계: 애플리케이션에 Analytics 통합

이 프로젝트는 Node.js/Express 기반이므로, 클라이언트 측 추적을 위해 HTML에 추적 스크립트를 추가합니다.

### 방법 1: EJS 템플릿에 직접 추가 (권장)

`views/partials/footer.ejs`를 수정하여 모든 페이지에 추적 스크립트를 추가합니다:

```ejs
<!-- views/partials/footer.ejs -->
<footer class="footer mt-auto py-3 bg-light">
  <div class="container text-center">
    <span class="text-muted">N2 골프 동호회 © 2024</span>
  </div>
</footer>

<!-- Vercel Web Analytics 추적 스크립트 -->
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
```

### 방법 2: 레이아웃 템플릿의 <body> 태그 마지막에 추가

`views/partials/footer.ejs`가 없는 경우, `views/layout.ejs` 또는 메인 레이아웃 파일의 `</body>` 태그 바로 앞에 다음을 추가합니다:

```ejs
<!-- Vercel Web Analytics -->
<script>
  window.va = window.va || function () { (window.vaq = window.vaq || []).push(arguments); };
</script>
<script defer src="/_vercel/insights/script.js"></script>
```

## 4단계: 애플리케이션 배포

Vercel에 애플리케이션을 배포합니다:

```bash
git push origin main
```

Git 리포지토리가 Vercel과 연결되어 있으면 자동으로 배포됩니다. 또는 Vercel CLI를 사용합니다:

```bash
vercel deploy
```

배포 완료 후, 애플리케이션이 방문자를 추적하기 시작합니다.

> **💡 참고:** 모든 설정이 올바르게 되어 있으면, 사이트를 방문할 때 브라우저의 네트워크 탭에서 `/_vercel/insights/view`으로의 Fetch/XHR 요청을 확인할 수 있습니다.

## 5단계: 대시보드에서 데이터 확인

애플리케이션이 배포되고 사용자가 방문한 후:

1. [Vercel 대시보드](/dashboard)로 이동합니다
2. N2 골프 관리 시스템 프로젝트를 선택합니다
3. **Analytics** 탭을 클릭합니다

며칠 후 충분한 방문자 데이터가 수집되면, 대시보드에서 다음을 볼 수 있습니다:

- 페이지뷰 및 방문자 수
- 상위 페이지 및 가장 빠른 페이지
- 지역 및 장치별 분석 데이터
- 성능 메트릭

## 커스텀 이벤트 추가 (Pro/Enterprise 플랜)

Pro 또는 Enterprise 플랜을 사용하는 경우, 사용자 상호작용을 추적하기 위해 커스텀 이벤트를 추가할 수 있습니다.

### 예제: 예약 완료 이벤트 추적

`public/js/analytics.js` 파일을 생성합니다:

```javascript
// 커스텀 이벤트를 전송하는 함수
function trackEvent(eventName, properties = {}) {
  if (typeof window.va === 'function') {
    window.va('event', {
      name: eventName,
      ...properties,
    });
  }
}

// 예약 완료 시 호출
function onReservationSubmitted(reservationId) {
  trackEvent('Reservation Completed', {
    reservation_id: reservationId,
    timestamp: new Date().toISOString(),
  });
}

// 회비 납부 시 호출
function onFeePaymentSubmitted(memberId, amount) {
  trackEvent('Fee Payment', {
    member_id: memberId,
    amount: amount,
    timestamp: new Date().toISOString(),
  });
}
```

이를 HTML에서 사용합니다:

```ejs
<button onclick="onReservationSubmitted('<%= reservation._id %>')">
  예약 확정
</button>
```

## 문제 해결

### 스크립트가 로드되지 않음

- 브라우저 개발자 도구의 콘솔을 확인하여 에러 메시지를 확인합니다
- `/_vercel/insights/script.js` 경로가 올바른지 확인합니다
- Vercel 대시보드에서 Web Analytics가 활성화되어 있는지 확인합니다

### 데이터가 나타나지 않음

- 배포 후 충분한 시간(최소 몇 시간)을 기다립니다
- 사이트를 방문하고 브라우저의 네트워크 탭에서 `/_vercel/insights/view` 요청을 확인합니다
- 프로덕션 환경에서만 데이터가 수집됩니다 (로컬 환경 제외)

### CORS 에러

- CORS 에러는 일반적으로 무시할 수 있습니다
- Vercel의 추적 스크립트는 크로스 도메인 요청을 안전하게 처리합니다

## 다음 단계

Web Analytics를 설정한 후:

- [분석 대시보드](/docs/analytics/filtering)에서 데이터 필터링 방법 학습
- Pro/Enterprise 플랜에서 [커스텀 이벤트](/docs/analytics/custom-events) 추가
- [개인정보 정책 및 규정 준수](/docs/analytics/privacy-policy) 확인
- [가격 및 한계](/docs/analytics/limits-and-pricing) 검토

## 추가 참고사항

### 프라이버시 및 규정 준수

Vercel Web Analytics는 사용자의 개인정보 보호를 우선합니다:

- 쿠키를 사용하지 않습니다
- IP 주소를 추적하지 않습니다
- 개인 식별 정보(PII)를 수집하지 않습니다
- GDPR, CCPA 등 주요 규정을 준수합니다

자세한 정보는 [Vercel 개인정보 정책](https://vercel.com/legal/privacy-policy)을 참조하세요.

### 성능 영향

Vercel Web Analytics의 추적 스크립트는:

- 비동기(async)로 로드됩니다
- 매우 가볍습니다 (< 1KB)
- 애플리케이션 성능에 거의 영향을 주지 않습니다

## 문서 참조

- [Vercel Web Analytics 공식 문서](https://vercel.com/docs/analytics)
- [Analytics 패키지 참조](/docs/analytics/package)
- [커스텀 이벤트](/docs/analytics/custom-events)
- [성능 최적화](/docs/analytics/performance)

---

이 가이드를 따라 N2 골프 동호회 관리 시스템의 사용 패턴과 성능 메트릭을 추적할 수 있습니다.
