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

    // 이전 경기 결과로 member별 평균 점수 계산
    const prevResults = roundResults.filter(r => prevScheduleIds.has(r.schedule_id));
    const prevAvgByMember = {};
    prevResults.forEach(r => {
      if (!prevAvgByMember[r.member_id]) prevAvgByMember[r.member_id] = [];
      prevAvgByMember[r.member_id].push(r.score);
    });
    Object.keys(prevAvgByMember).forEach(mid => {
      const scores = prevAvgByMember[mid];
      prevAvgByMember[mid] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    });

    const mapped = roundResults
      .filter(r => r.schedule_id === latestSchedule.id)
      .sort((a, b) => a.rank - b.rank)
      .map(r => {
        const member = allMembers.find(m => m.id === r.member_id);
        const prevAvg = prevAvgByMember[r.member_id] || null;
        return {
          rank: r.rank,
          name: member ? member.name : '알 수 없음',
          score: r.score,
          prevAvg,
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

  // 로그인한 사용자의 개인 통계
  let userStats = null;
  if (req.session.user) {
    const userId = req.session.user.id;
    const userMember = members.find(m => m.id === userId);

    // 사용자의 예약 기록
    const userReservations = reservations
      .filter(r => r.member_id === userId && r.status === 'confirmed')
      .sort((a, b) => {
        const scheduleA = schedules.find(s => s.id === a.schedule_id);
        const scheduleB = schedules.find(s => s.id === b.schedule_id);
        const dateA = scheduleA ? scheduleA.play_date : '';
        const dateB = scheduleB ? scheduleB.play_date : '';
        return dateB.localeCompare(dateA);
      });

    // 가장 최근 방문한 골프장
    let recentCourse = '-';
    if (userReservations.length > 0) {
      const recentReservation = userReservations[0];
      const recentSchedule = schedules.find(s => s.id === recentReservation.schedule_id);
      if (recentSchedule) {
        const course = golfCourses.find(gc => gc.id === recentSchedule.golf_course_id);
        if (course) {
          recentCourse = course.name.replace('CC', '');
        }
      }
    }

    // 이미 지난 일정만 참가 횟수로 카운트
    const pastRounds = userReservations.filter(r => {
      const schedule = schedules.find(s => s.id === r.schedule_id);
      return schedule && schedule.play_date < today;
    }).length;

    userStats = {
      recentScore: userMember?.recent_score || null,
      avgScore: userMember?.avg_score || null,
      recentCourse: recentCourse,
      totalRounds: pastRounds
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
