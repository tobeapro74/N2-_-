const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { getSeoulDateString } = require('../utils/koreaDate');

const requireAuth = (req, res, next) => {
  if (!req.session.user) return res.redirect('/auth/login');
  next();
};

router.get('/', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const today = getSeoulDateString();

    const [allMembers, schedules, reservations, roundResults, golfCourses] = await Promise.all([
      db.getTableAsync('members'),
      db.getTableAsync('schedules'),
      db.getTableAsync('reservations'),
      db.getTableAsync('round_results').then(r => r || []),
      db.getTableAsync('golf_courses')
    ]);

    const userMember = allMembers.find(m => m.id === userId) || {};

    // 내가 참가한 완료된 일정
    const myReservations = reservations.filter(
      r => r.member_id === userId && r.status === 'confirmed'
    );
    const myScheduleIds = new Set(myReservations.map(r => r.schedule_id));

    const myRounds = schedules
      .filter(s => s.has_result && s.play_date < today && myScheduleIds.has(s.id))
      .sort((a, b) => b.play_date.localeCompare(a.play_date))
      .map(s => {
        const course = golfCourses.find(gc => gc.id === s.golf_course_id) || {};
        const myResult = roundResults.find(r => r.schedule_id === s.id && r.member_id === userId);
        const allResults = roundResults
          .filter(r => r.schedule_id === s.id)
          .sort((a, b) => a.rank - b.rank);
        return {
          scheduleId: s.id,
          playDate: s.play_date,
          courseName: course.name || '-',
          score: myResult ? myResult.score : null,
          rank: myResult ? myResult.rank : null,
          totalPlayers: allResults.length,
          bestScore: allResults.length > 0 ? allResults[0].score : null
        };
      });

    // 스코어 통계
    const scoredRounds = myRounds.filter(r => r.score !== null);
    const avgScore = scoredRounds.length > 0
      ? Math.round(scoredRounds.reduce((s, r) => s + r.score, 0) / scoredRounds.length)
      : null;
    const bestScore = scoredRounds.length > 0
      ? Math.min(...scoredRounds.map(r => r.score))
      : null;
    const recentScore = scoredRounds.length > 0 ? scoredRounds[0].score : null;

    // 전체 회원 중 내 평균 순위 (스코어 있는 라운드)
    const top1Count = myRounds.filter(r => r.rank === 1).length;

    res.render('my-score', {
      title: 'My스코어 - N2골프',
      currentPage: 'myScore',
      userMember,
      myRounds,
      stats: {
        totalRounds: myRounds.length,
        scoredRounds: scoredRounds.length,
        avgScore,
        bestScore,
        recentScore,
        top1Count
      }
    });
  } catch (err) {
    console.error('My스코어 오류:', err);
    res.status(500).render('error', { title: '오류', message: 'My스코어를 불러오는 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
