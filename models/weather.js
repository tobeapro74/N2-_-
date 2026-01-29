/**
 * 날씨 서비스 모듈
 * 골프장별 위치 정보와 날씨 데이터를 제공합니다.
 * Open-Meteo API 사용 (무료, API키 불필요)
 * 캐싱: 30분 TTL로 API 호출 최소화
 */

const { cacheManager, TTL } = require('./cache');

// 골프장별 위치 정보 (위도/경도)
const golfCourseLocations = {
  '양지파인CC': {
    name: '양지파인CC',
    region: '경기도 용인시',
    city: '용인',
    lat: 37.2336,
    lon: 127.2923
  },
  '대영힐스CC': {
    name: '대영힐스CC',
    region: '충북 충주시',
    city: '충주',
    lat: 36.9910,
    lon: 127.9259
  },
  '대영베이스CC': {
    name: '대영베이스CC',
    region: '충북 충주시',
    city: '충주',
    lat: 36.9910,
    lon: 127.9259
  }
};

// 날씨 코드 매핑 (WMO Weather interpretation codes)
const weatherCodeMap = {
  0: { weather: '맑음', icon: 'bi-sun', color: 'warning' },
  1: { weather: '대체로 맑음', icon: 'bi-sun', color: 'warning' },
  2: { weather: '구름조금', icon: 'bi-cloud-sun', color: 'info' },
  3: { weather: '흐림', icon: 'bi-cloud', color: 'secondary' },
  45: { weather: '안개', icon: 'bi-cloud-fog', color: 'secondary' },
  48: { weather: '짙은 안개', icon: 'bi-cloud-fog', color: 'secondary' },
  51: { weather: '이슬비', icon: 'bi-cloud-drizzle', color: 'info' },
  53: { weather: '이슬비', icon: 'bi-cloud-drizzle', color: 'info' },
  55: { weather: '이슬비', icon: 'bi-cloud-drizzle', color: 'info' },
  56: { weather: '진눈깨비', icon: 'bi-cloud-sleet', color: 'info' },
  57: { weather: '진눈깨비', icon: 'bi-cloud-sleet', color: 'info' },
  61: { weather: '약한 비', icon: 'bi-cloud-rain', color: 'primary' },
  63: { weather: '비', icon: 'bi-cloud-rain', color: 'primary' },
  65: { weather: '강한 비', icon: 'bi-cloud-rain-heavy', color: 'primary' },
  66: { weather: '어는 비', icon: 'bi-cloud-sleet', color: 'info' },
  67: { weather: '어는 비', icon: 'bi-cloud-sleet', color: 'info' },
  71: { weather: '약한 눈', icon: 'bi-cloud-snow', color: 'primary' },
  73: { weather: '눈', icon: 'bi-cloud-snow', color: 'primary' },
  75: { weather: '강한 눈', icon: 'bi-cloud-snow', color: 'primary' },
  77: { weather: '싸락눈', icon: 'bi-cloud-snow', color: 'primary' },
  80: { weather: '소나기', icon: 'bi-cloud-rain-heavy', color: 'primary' },
  81: { weather: '소나기', icon: 'bi-cloud-rain-heavy', color: 'primary' },
  82: { weather: '강한 소나기', icon: 'bi-cloud-rain-heavy', color: 'primary' },
  85: { weather: '눈보라', icon: 'bi-cloud-snow', color: 'primary' },
  86: { weather: '강한 눈보라', icon: 'bi-cloud-snow', color: 'primary' },
  95: { weather: '뇌우', icon: 'bi-cloud-lightning', color: 'danger' },
  96: { weather: '우박 뇌우', icon: 'bi-cloud-lightning-rain', color: 'danger' },
  99: { weather: '강한 우박 뇌우', icon: 'bi-cloud-lightning-rain', color: 'danger' }
};

// 바람 방향 계산
function getWindDirection(degrees) {
  const directions = ['북풍', '북동풍', '동풍', '남동풍', '남풍', '남서풍', '서풍', '북서풍'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

/**
 * 골프장 위치 정보 조회
 */
function getGolfCourseLocation(courseName) {
  return golfCourseLocations[courseName] || null;
}

/**
 * Open-Meteo API에서 날씨 데이터 가져오기
 */
async function fetchWeatherFromAPI(lat, lon) {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,wind_speed_10m_max,wind_direction_10m_dominant&timezone=Asia/Seoul&forecast_days=7`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error('날씨 API 호출 실패');
  }
  return response.json();
}

/**
 * 날씨 코드를 한글 정보로 변환
 */
function parseWeatherCode(code) {
  return weatherCodeMap[code] || { weather: '알 수 없음', icon: 'bi-question-circle', color: 'secondary' };
}

/**
 * 요일 반환
 */
function getDayOfWeek(date) {
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return days[new Date(date).getDay()];
}

/**
 * 특정 날짜의 날씨 정보 조회 (비동기)
 * 캐싱: 30분 TTL
 */
async function getWeatherForDateAsync(courseName, date) {
  const location = getGolfCourseLocation(courseName);
  if (!location) return null;

  // 캐시 키 생성 (골프장명 + 날짜)
  const targetDate = date || new Date().toISOString().split('T')[0];
  const cacheKey = `weather_${courseName}_${targetDate}`;

  // 캐시 확인
  const cached = cacheManager.get(cacheKey);
  if (cached) {
    console.log(`[Weather API] 캐시 히트: ${courseName} (${targetDate})`);
    return cached;
  }

  try {
    console.log(`[Weather API] API 호출: ${courseName}`);
    const apiData = await fetchWeatherFromAPI(location.lat, location.lon);
    const current = apiData.current;
    const daily = apiData.daily;

    // 오늘 날짜 인덱스 찾기
    const dateIndex = daily.time.indexOf(targetDate);
    const idx = dateIndex >= 0 ? dateIndex : 0;

    const weatherInfo = parseWeatherCode(daily.weather_code[idx]);

    const weather = {
      date: daily.time[idx],
      weather: weatherInfo.weather,
      icon: weatherInfo.icon,
      color: weatherInfo.color,
      temperature: {
        current: Math.round(current.temperature_2m),
        low: Math.round(daily.temperature_2m_min[idx]),
        high: Math.round(daily.temperature_2m_max[idx]),
        feelsLike: Math.round(current.apparent_temperature)
      },
      precipitation: daily.precipitation_probability_max[idx] || 0,
      wind: {
        direction: getWindDirection(current.wind_direction_10m),
        speed: Math.round(current.wind_speed_10m / 3.6) // km/h -> m/s
      },
      humidity: current.relative_humidity_2m
    };

    const result = {
      course: location.name,
      region: location.region,
      city: location.city,
      ...weather,
      golfAdvice: generateGolfAdvice(weather)
    };

    // 캐시 저장 (30분)
    cacheManager.set(cacheKey, result, TTL.THIRTY_MINUTES);
    console.log(`[Weather API] 캐시 저장: ${courseName} (TTL: 30분)`);

    return result;
  } catch (error) {
    console.error('날씨 API 오류:', error);
    return null;
  }
}

/**
 * 1주일 날씨 예보 조회 (비동기)
 * 캐싱: 30분 TTL
 */
async function getWeeklyForecastAsync(courseName, startDate) {
  const location = getGolfCourseLocation(courseName);
  if (!location) return null;

  // 캐시 키 생성 (골프장명 + weekly)
  const cacheKey = `weather_weekly_${courseName}`;

  // 캐시 확인
  const cached = cacheManager.get(cacheKey);
  if (cached) {
    console.log(`[Weather API] 캐시 히트: ${courseName} (주간예보)`);
    return cached;
  }

  try {
    console.log(`[Weather API] API 호출: ${courseName} (주간예보)`);
    const apiData = await fetchWeatherFromAPI(location.lat, location.lon);
    const current = apiData.current;
    const daily = apiData.daily;

    const forecast = [];

    for (let i = 0; i < daily.time.length; i++) {
      const weatherInfo = parseWeatherCode(daily.weather_code[i]);

      forecast.push({
        date: daily.time[i],
        dayOfWeek: getDayOfWeek(daily.time[i]),
        weather: weatherInfo.weather,
        icon: weatherInfo.icon,
        color: weatherInfo.color,
        temperature: {
          current: i === 0 ? Math.round(current.temperature_2m) : Math.round((daily.temperature_2m_min[i] + daily.temperature_2m_max[i]) / 2),
          low: Math.round(daily.temperature_2m_min[i]),
          high: Math.round(daily.temperature_2m_max[i]),
          feelsLike: i === 0 ? Math.round(current.apparent_temperature) : Math.round((daily.temperature_2m_min[i] + daily.temperature_2m_max[i]) / 2)
        },
        precipitation: daily.precipitation_probability_max[i] || 0,
        wind: {
          direction: getWindDirection(daily.wind_direction_10m_dominant[i]),
          speed: Math.round(daily.wind_speed_10m_max[i] / 3.6) // km/h -> m/s
        },
        humidity: i === 0 ? current.relative_humidity_2m : 50
      });
    }

    const result = {
      course: location.name,
      region: location.region,
      city: location.city,
      forecast: forecast
    };

    // 캐시 저장 (30분)
    cacheManager.set(cacheKey, result, TTL.THIRTY_MINUTES);
    console.log(`[Weather API] 캐시 저장: ${courseName} 주간예보 (TTL: 30분)`);

    return result;
  } catch (error) {
    console.error('날씨 API 오류:', error);
    return null;
  }
}

/**
 * 동기식 래퍼 (기존 코드 호환용)
 */
function getWeatherForDate(courseName, date) {
  // 동기식 호출이 필요한 경우 샘플 데이터 반환
  const location = getGolfCourseLocation(courseName);
  if (!location) return null;

  const weather = generateSampleWeather(date, location.region);
  return {
    course: location.name,
    region: location.region,
    city: location.city,
    ...weather,
    golfAdvice: generateGolfAdvice(weather)
  };
}

function getWeeklyForecast(courseName, startDate) {
  const location = getGolfCourseLocation(courseName);
  if (!location) return null;

  const forecast = [];
  const start = new Date(startDate);

  for (let i = 0; i < 7; i++) {
    const date = new Date(start);
    date.setDate(start.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const weather = generateSampleWeather(dateStr, location.region);
    forecast.push({
      date: dateStr,
      dayOfWeek: getDayOfWeek(date),
      ...weather
    });
  }

  return {
    course: location.name,
    region: location.region,
    city: location.city,
    forecast: forecast
  };
}

/**
 * 샘플 날씨 데이터 생성 (API 실패 시 폴백)
 */
function generateSampleWeather(date, region) {
  const d = new Date(date);
  const month = d.getMonth() + 1;

  let minTemp, maxTemp;
  if (month >= 3 && month <= 5) {
    minTemp = 5; maxTemp = 18;
  } else if (month >= 6 && month <= 8) {
    minTemp = 20; maxTemp = 33;
  } else if (month >= 9 && month <= 11) {
    minTemp = 8; maxTemp = 22;
  } else {
    minTemp = -5; maxTemp = 8;
  }

  const seed = d.getDate() + d.getMonth() * 31;
  const weatherTypes = ['맑음', '구름조금', '구름많음', '흐림'];
  const weatherIndex = seed % weatherTypes.length;
  const tempVariation = (seed % 10) - 5;

  const lowTemp = minTemp + tempVariation;
  const highTemp = maxTemp + tempVariation;
  const currentTemp = Math.round((lowTemp + highTemp) / 2);

  let precipitation = 0;
  if (weatherTypes[weatherIndex] === '흐림') precipitation = 30;
  if (weatherTypes[weatherIndex] === '구름많음') precipitation = 20;

  const windDirections = ['북풍', '북동풍', '동풍', '남동풍', '남풍', '남서풍', '서풍', '북서풍'];
  const windSpeed = 1 + (seed % 5);
  const windDir = windDirections[seed % windDirections.length];

  const weatherIcons = {
    '맑음': 'bi-sun',
    '구름조금': 'bi-cloud-sun',
    '구름많음': 'bi-clouds',
    '흐림': 'bi-cloud'
  };

  const weatherColors = {
    '맑음': 'warning',
    '구름조금': 'info',
    '구름많음': 'secondary',
    '흐림': 'secondary'
  };

  return {
    date: date,
    weather: weatherTypes[weatherIndex],
    icon: weatherIcons[weatherTypes[weatherIndex]],
    color: weatherColors[weatherTypes[weatherIndex]],
    temperature: {
      current: currentTemp,
      low: lowTemp,
      high: highTemp,
      feelsLike: currentTemp - Math.floor(windSpeed / 2)
    },
    precipitation: precipitation,
    wind: {
      direction: windDir,
      speed: windSpeed
    },
    humidity: 40 + (seed % 30)
  };
}

/**
 * 골프 플레이 조언 생성
 */
function generateGolfAdvice(weather) {
  const advice = {
    clothing: [],
    club: [],
    preparation: [],
    rating: 5,
    ratingText: '최적'
  };

  const temp = weather.temperature.current;
  const wind = weather.wind.speed;
  const precip = weather.precipitation;

  // 기온별 복장 조언
  if (temp <= 5) {
    advice.clothing.push('보온 이너웨어 + 방풍 점퍼 필수');
    advice.clothing.push('핫팩, 방한 장갑 준비');
    advice.rating -= 1;
  } else if (temp <= 15) {
    advice.clothing.push('긴팔 + 조끼 또는 가벼운 점퍼');
    advice.clothing.push('장갑 권장');
  } else if (temp >= 30) {
    advice.clothing.push('통기성 좋은 반팔, 모자 필수');
    advice.clothing.push('자외선 차단제, 수분 보충');
    advice.rating -= 0.5;
  }

  // 기온별 클럽 조언
  if (temp <= 10) {
    advice.club.push('추위로 비거리 감소 → 1클럽 길게 선택');
  }

  // 바람별 조언
  if (wind >= 5) {
    advice.club.push(`${weather.wind.direction} ${wind}m/s → 바람 고려한 클럽 선택`);
    advice.preparation.push('낮은 탄도 샷 연습');
    advice.rating -= 0.5;
  } else if (wind >= 3) {
    advice.club.push('약한 바람, 플레이에 큰 영향 없음');
  }

  // 강수 확률별 조언
  if (precip >= 60) {
    advice.preparation.push('우산, 우비 필수');
    advice.preparation.push('여분의 장갑, 타월 준비');
    advice.rating -= 1.5;
  } else if (precip >= 30) {
    advice.preparation.push('우산, 우비 준비 권장');
    advice.rating -= 0.5;
  }

  // 준비운동 조언
  if (temp <= 15) {
    advice.preparation.push('티오프 전 충분한 스트레칭 (최소 15분)');
  }

  // 최종 평점
  advice.rating = Math.max(1, Math.min(5, advice.rating));
  if (advice.rating >= 4.5) advice.ratingText = '최적';
  else if (advice.rating >= 4) advice.ratingText = '양호';
  else if (advice.rating >= 3) advice.ratingText = '보통';
  else if (advice.rating >= 2) advice.ratingText = '주의';
  else advice.ratingText = '비추천';

  return advice;
}

/**
 * 플레이 적합도 별 표시
 */
function getRatingStars(rating) {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  let stars = '';

  for (let i = 0; i < fullStars; i++) stars += '⭐';
  if (halfStar) stars += '⭐';
  for (let i = stars.length; i < 5; i++) stars += '☆';

  return stars;
}

module.exports = {
  getGolfCourseLocation,
  getWeatherForDate,
  getWeeklyForecast,
  getWeatherForDateAsync,
  getWeeklyForecastAsync,
  getRatingStars,
  generateGolfAdvice,
  weatherCodeMap
};
