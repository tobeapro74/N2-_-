/**
 * 날씨 API 라우터
 * 골프장별 날씨 정보를 제공합니다.
 * Open-Meteo API를 사용하여 실제 날씨 데이터를 제공합니다.
 */

const express = require('express');
const router = express.Router();
const weather = require('../models/weather');

// 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// API용 인증 미들웨어
const requireAuthApi = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ error: '로그인이 필요합니다.' });
  }
  next();
};

/**
 * 날씨 페이지 렌더링 (순서 중요: 먼저 정의)
 * GET /weather/view/:courseName
 */
router.get('/view/:courseName', requireAuth, async (req, res) => {
  const courseName = decodeURIComponent(req.params.courseName);
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const todayWeather = await weather.getWeatherForDateAsync(courseName, date);
    const weeklyForecast = await weather.getWeeklyForecastAsync(courseName, date);

    if (!todayWeather || !weeklyForecast) {
      return res.status(404).render('error', {
        title: '오류',
        message: '골프장 정보를 찾을 수 없습니다.'
      });
    }

    // 각 날짜별 golfAdvice를 미리 계산
    weeklyForecast.forecast = weeklyForecast.forecast.map(day => ({
      ...day,
      golfAdvice: weather.generateGolfAdvice(day)
    }));

    res.render('weather/detail', {
      title: `${courseName} 날씨`,
      today: todayWeather,
      weekly: weeklyForecast,
      getRatingStars: weather.getRatingStars
    });
  } catch (error) {
    console.error('날씨 페이지 렌더링 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '날씨 정보를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

/**
 * 특정 골프장의 1주일 예보 조회 (순서 중요: weekly가 :courseName보다 먼저)
 * GET /api/weather/:courseName/weekly
 */
router.get('/:courseName/weekly', requireAuthApi, async (req, res) => {
  const courseName = decodeURIComponent(req.params.courseName);
  const startDate = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const forecast = await weather.getWeeklyForecastAsync(courseName, startDate);

    if (!forecast) {
      return res.status(404).json({ error: '골프장 정보를 찾을 수 없습니다.' });
    }

    res.json(forecast);
  } catch (error) {
    console.error('주간 예보 API 오류:', error);
    res.status(500).json({ error: '날씨 정보를 불러오는 중 오류가 발생했습니다.' });
  }
});

/**
 * 특정 골프장의 오늘 날씨 조회
 * GET /api/weather/:courseName
 */
router.get('/:courseName', requireAuthApi, async (req, res) => {
  const courseName = decodeURIComponent(req.params.courseName);
  const date = req.query.date || new Date().toISOString().split('T')[0];

  try {
    const weatherData = await weather.getWeatherForDateAsync(courseName, date);

    if (!weatherData) {
      return res.status(404).json({ error: '골프장 정보를 찾을 수 없습니다.' });
    }

    res.json(weatherData);
  } catch (error) {
    console.error('날씨 API 오류:', error);
    res.status(500).json({ error: '날씨 정보를 불러오는 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
