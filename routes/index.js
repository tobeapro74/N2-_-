const express = require('express');
const router = express.Router();
const db = require('../models/database');
const { getSeoulYearMonth, getSeoulDateString } = require('../utils/koreaDate');

// 코스 홀 정보 (정적 데이터 - JS 모듈로 관리)
const courseHolesData = require('../data/courseHoles');

// 메인 대시보드
router.get('/', async (req, res) => {
  try {
    // 9개 컬렉션 병렬 조회 (순차→병렬로 응답 시간 단축)
    const [
      incomes, expenses, allMembers, schedules, reservations,
      golfCourses, scheduleComments, communityPosts, communityComments, roundResults
    ] = await Promise.all([
      db.getTableAsync('incomes'),
      db.getTableAsync('expenses'),
      db.getTableAsync('members'),
      db.getTableAsync('schedules'),
      db.getTableAsync('reservations'),
      db.getTableAsync('golf_courses'),
      db.getTableAsync('schedule_comments').then(r => r || []),
      db.getTableAsync('community_posts').then(r => r || []),
      db.getTableAsync('community_comments').then(r => r || []),
      db.getTableAsync('round_results').then(r => r || [])
    ]);

    const members = allMembers.filter(m => !m.is_admin);

  const totalIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const balance = totalIncome - totalExpense;

  // 회원 통계
  const memberStats = {
    total: members.length,
    active: members.filter(m => m.status === 'active').length
  };

  // 이번 달 수입/지출 (UTC가 아닌 한국 날짜 기준 — 월초·야간에도 일치)
  const currentMonth = getSeoulYearMonth();
  const monthlyIncome = incomes
    .filter(i => i.income_date && i.income_date.startsWith(currentMonth))
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const monthlyExpense = expenses
    .filter(e => e.expense_date && e.expense_date.startsWith(currentMonth))
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const today = getSeoulDateString();

  const upcomingSchedules = schedules
    .filter(s => s.play_date >= today && ['open', 'pending', 'closed'].includes(s.status))
    .sort((a, b) => a.play_date.localeCompare(b.play_date))
    .slice(0, 5)
    .map(s => {
      const course = golfCourses.find(gc => gc.id === s.golf_course_id) || {};
      const reserved_count = reservations.filter(
        r => r.schedule_id === s.id && ['pending', 'confirmed'].includes(r.status)
      ).length;
      // 오늘 새로 등록된 댓글이 있는지 확인
      const hasNewComments = scheduleComments.some(
        c => c.schedule_id === s.id && c.created_at && c.created_at.startsWith(today)
      );
      return {
        ...s,
        course_name: course.name,
        location: course.location,
        reserved_count,
        max_members: s.max_members || 12,
        has_new_comments: hasNewComments
      };
    });

  // 최근 입출금 내역
  const incomeCategories = db.getTable('income_categories');
  const expenseCategories = db.getTable('expense_categories');

  const recentIncomes = incomes
    .map(i => ({
      type: 'income',
      amount: i.amount,
      category: (incomeCategories.find(c => c.id === i.category_id) || {}).name || '-',
      date: i.income_date,
      description: i.description
    }));

  const recentExpenses = expenses
    .map(e => ({
      type: 'expense',
      amount: e.amount,
      category: (expenseCategories.find(c => c.id === e.category_id) || {}).name || '-',
      date: e.expense_date,
      description: e.description
    }));

  const recentTransactions = [...recentIncomes, ...recentExpenses]
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 10);

  // 코스 가이드 데이터 (홀 정보 포함 - 정적 데이터 사용)
  const courseHoles = courseHolesData;

  // 신규 회원 (가입 10일 이내) - 비로그인 시 환영 배너용
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const tenDaysAgoStr = tenDaysAgo.toISOString().split('T')[0];

  const newMembers = members
    .filter(m => m.join_date && m.join_date >= tenDaysAgoStr)
    .map(m => ({ name: m.name, join_date: m.join_date }));

  // 최근 라운딩 결과 (전체 참가자)
  const completedSchedules = schedules.filter(s => s.has_result && s.play_date <= today);
  const sortedCompleted = completedSchedules.sort((a, b) => b.play_date.localeCompare(a.play_date));
  const latestSchedule = sortedCompleted[0];
  const prevScheduleIds = new Set(sortedCompleted.slice(1).map(s => s.id));

  let recentRoundTop5 = [];
  let recentRoundAll = [];
  if (latestSchedule) {
    const latestCourse = golfCourses.find(gc => gc.id === latestSchedule.golf_course_id);

    // 이전 경기 결과로 member별 평균 및 직전 라운딩 스코어 계산
    const prevResults = roundResults.filter(r => prevScheduleIds.has(Number(r.schedule_id)));
    const prevAvgByMember = {};
    const prevLastByMember = {};  // 직전 라운딩 스코어 (날짜순 가장 최근 1개)
    prevResults.forEach(r => {
      const mid = Number(r.member_id);
      if (!prevAvgByMember[mid]) prevAvgByMember[mid] = [];
      prevAvgByMember[mid].push(r.score);
    });
    // 직전 라운딩: 최신 completed 스케줄 순으로 member별 가장 최근 1개
    const sortedPrevSchedules = sortedCompleted.slice(1); // 최신 제외
    sortedPrevSchedules.forEach(s => {
      const res = roundResults.filter(r => Number(r.schedule_id) === Number(s.id));
      res.forEach(r => {
        const mid = Number(r.member_id);
        if (prevLastByMember[mid] === undefined) prevLastByMember[mid] = r.score;
      });
    });
    Object.keys(prevAvgByMember).forEach(mid => {
      const scores = prevAvgByMember[mid];
      prevAvgByMember[mid] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    const mapped = roundResults
      .filter(r => Number(r.schedule_id) === Number(latestSchedule.id))
      .sort((a, b) => a.rank - b.rank)
      .map(r => {
        const member = allMembers.find(m => Number(m.id) === Number(r.member_id));
        const mid = Number(r.member_id);
        const prevAvg = prevAvgByMember[mid] !== undefined ? prevAvgByMember[mid] : null;
        const prevLast = prevLastByMember[mid] !== undefined ? prevLastByMember[mid] : null;
        return {
          rank: r.rank,
          name: member ? member.name : '알 수 없음',
          score: r.score,
          prevAvg,
          prevLast,
          courseName: latestCourse ? latestCourse.name : '',
          playDate: latestSchedule.play_date
        };
      });
    recentRoundTop5 = mapped.slice(0, 5);
    recentRoundAll = mapped;
  }

  // 일상톡톡 최신 게시글 (최근 5개)
  const recentCommunityPosts = communityPosts
    .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
    .slice(0, 5)
    .map(post => {
      const member = allMembers.find(m => m.id === post.member_id) || {};
      const commentCount = communityComments.filter(c => c.post_id === post.id).length;
      return {
        ...post,
        member_name: member.name || '알 수 없음',
        comment_count: commentCount
      };
    });

  // 로그인한 사용자의 개인 통계 (My스코어와 완전히 동일한 로직)
  let userStats = null;
  if (req.session.user) {
    const userId = req.session.user.id;

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
        return {
          courseName: course.name || '-',
          score: myResult ? myResult.score : null
        };
      });

    const scoredRounds = myRounds.filter(r => r.score !== null);
    const avgScore = scoredRounds.length > 0
      ? Math.round(scoredRounds.reduce((s, r) => s + r.score, 0) / scoredRounds.length)
      : null;
    const recentScore = scoredRounds.length > 0 ? scoredRounds[0].score : null;
    const recentCourse = myRounds.length > 0 ? myRounds[0].courseName.replace('CC', '') : '-';

    userStats = {
      recentScore,
      avgScore,
      recentCourse,
      totalRounds: myRounds.length
    };
  }

    res.render('index', {
      title: 'N2골프 - 대시보드',
      currentPage: 'home',
      balance,
      totalIncome,
      totalExpense,
      memberStats,
      monthlyIncome,
      monthlyExpense,
      upcomingSchedules,
      recentTransactions,
      userStats,
      courseHoles,
      newMembers,
      recentCommunityPosts,
      recentRoundTop5,
      recentRoundAll,
      recentRoundScheduleId: latestSchedule ? latestSchedule.id : null,
      completedSchedulesCount: completedSchedules.length
    });
  } catch (error) {
    console.error('대시보드 로드 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '대시보드를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
