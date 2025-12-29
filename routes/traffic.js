/**
 * 교통 API 라우터
 * 카카오 모빌리티 API를 사용하여 실시간 교통 정보를 제공합니다.
 */

const express = require('express');
const router = express.Router();

// API용 인증 미들웨어
const requireAuthApi = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
};

// 골프장 좌표 정보
const golfCourseCoords = {
  yangji: {
    name: '양지파인CC',
    lat: 37.2364,
    lng: 127.3047
  },
  daeyoungHills: {
    name: '대영힐스CC',
    lat: 37.0089,
    lng: 127.8894
  },
  daeyoungBase: {
    name: '대영베이스CC',
    lat: 37.0056,
    lng: 127.8912
  }
};

// 출발지 좌표 정보
const departureCoords = {
  yeouido: {
    name: '여의도역',
    lat: 37.5216,
    lng: 126.9243
  },
  jamsil: {
    name: '잠실역',
    lat: 37.5133,
    lng: 127.1001
  }
};

/**
 * 실시간 교통 소요시간 조회
 * GET /api/traffic/duration
 */
router.get('/duration', requireAuthApi, async (req, res) => {
  try {
    const KAKAO_REST_API_KEY = process.env.KAKAO_REST_API_KEY;

    if (!KAKAO_REST_API_KEY) {
      // API 키가 없으면 기본값 반환 (baseTime 사용)
      return res.json({
        success: false,
        message: 'KAKAO_REST_API_KEY가 설정되지 않았습니다. 기본값을 사용합니다.',
        data: getDefaultDurations(),
        updatedAt: new Date().toISOString()
      });
    }

    const results = {};
    const routes = [
      { from: 'yeouido', to: 'yangji' },
      { from: 'jamsil', to: 'yangji' },
      { from: 'yeouido', to: 'daeyoungHills' },
      { from: 'jamsil', to: 'daeyoungHills' },
      { from: 'yeouido', to: 'daeyoungBase' },
      { from: 'jamsil', to: 'daeyoungBase' }
    ];

    // 카카오 모빌리티 API 호출
    for (const route of routes) {
      const origin = departureCoords[route.from];
      const destination = golfCourseCoords[route.to];

      try {
        const response = await fetch(
          `https://apis-navi.kakaomobility.com/v1/directions?origin=${origin.lng},${origin.lat}&destination=${destination.lng},${destination.lat}&priority=RECOMMEND`,
          {
            headers: {
              'Authorization': `KakaoAK ${KAKAO_REST_API_KEY}`,
              'Content-Type': 'application/json'
            }
          }
        );

        if (response.ok) {
          const data = await response.json();
          console.log(`[Traffic API] ${route.from} -> ${route.to}:`, JSON.stringify(data.routes?.[0]?.summary || data));
          if (data.routes && data.routes.length > 0) {
            const duration = Math.round(data.routes[0].summary.duration / 60); // 초 -> 분
            const distance = Math.round(data.routes[0].summary.distance / 1000); // m -> km
            console.log(`[Traffic API] ${origin.name} -> ${destination.name}: ${duration}분, ${distance}km`);

            if (!results[route.to]) {
              results[route.to] = {};
            }
            results[route.to][route.from] = {
              duration,
              distance,
              trafficState: getTrafficState(duration, route.to, route.from)
            };
          }
        } else {
          const errorText = await response.text();
          console.error(`[Traffic API Error] ${route.from} -> ${route.to}: ${response.status}`, errorText);
        }
      } catch (err) {
        console.error(`교통 정보 조회 실패: ${route.from} -> ${route.to}`, err.message);
      }
    }

    // 결과가 비어있으면 기본값 반환
    if (Object.keys(results).length === 0) {
      return res.json({
        success: false,
        message: 'API 호출 실패. 기본값을 사용합니다.',
        data: getDefaultDurations(),
        updatedAt: new Date().toISOString()
      });
    }

    res.json({
      success: true,
      data: results,
      updatedAt: new Date().toISOString()
    });

  } catch (error) {
    console.error('교통 정보 조회 오류:', error);
    res.json({
      success: false,
      message: error.message,
      data: getDefaultDurations(),
      updatedAt: new Date().toISOString()
    });
  }
});

// 기본 소요시간 (API 실패 시 사용) - 실제 평균 소요시간 기준
function getDefaultDurations() {
  return {
    yangji: {
      yeouido: { duration: 70, distance: 45, trafficState: '보통' },
      jamsil: { duration: 60, distance: 38, trafficState: '보통' }
    },
    daeyoungHills: {
      yeouido: { duration: 120, distance: 110, trafficState: '보통' },
      jamsil: { duration: 110, distance: 100, trafficState: '보통' }
    },
    daeyoungBase: {
      yeouido: { duration: 120, distance: 108, trafficState: '보통' },
      jamsil: { duration: 110, distance: 98, trafficState: '보통' }
    }
  };
}

// 교통 상태 판단 (기본 소요시간 대비) - 실제 평균 소요시간 기준
function getTrafficState(duration, courseId, fromId) {
  const baseTimes = {
    yangji: { yeouido: 70, jamsil: 60 },
    daeyoungHills: { yeouido: 120, jamsil: 110 },
    daeyoungBase: { yeouido: 120, jamsil: 110 }
  };

  const baseTime = baseTimes[courseId]?.[fromId] || 60;
  const ratio = duration / baseTime;

  if (ratio <= 1.0) return '원활';
  if (ratio <= 1.2) return '보통';
  return '정체';
}

module.exports = router;
