const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 메인 대시보드
router.get('/', async (req, res) => {
  try {
    // MongoDB에서 직접 최신 데이터 조회 (서버리스 환경 캐시 불일치 방지)
    const incomes = await db.getTableAsync('incomes');
    const expenses = await db.getTableAsync('expenses');
    const allMembers = await db.getTableAsync('members');
    const schedules = await db.getTableAsync('schedules');
    const reservations = await db.getTableAsync('reservations');
    const golfCourses = await db.getTableAsync('golf_courses');
    const scheduleComments = await db.getTableAsync('schedule_comments') || [];

    const members = allMembers.filter(m => !m.is_admin);

  const totalIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const balance = totalIncome - totalExpense;

  // 회원 통계
  const memberStats = {
    total: members.length,
    active: members.filter(m => m.status === 'active').length
  };

  // 이번 달 수입/지출
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthlyIncome = incomes
    .filter(i => i.income_date && i.income_date.startsWith(currentMonth))
    .reduce((sum, i) => sum + (i.amount || 0), 0);

  const monthlyExpense = expenses
    .filter(e => e.expense_date && e.expense_date.startsWith(currentMonth))
    .reduce((sum, e) => sum + (e.amount || 0), 0);
  const today = new Date().toISOString().split('T')[0];

  const upcomingSchedules = schedules
    .filter(s => s.play_date >= today && s.status === 'open')
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

  // 코스 가이드 데이터 (홀 정보 포함)
  const courseHoles = db.getTable('course_holes') || {};

  // 신규 회원 (가입 10일 이내) - 비로그인 시 환영 배너용
  const tenDaysAgo = new Date();
  tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);
  const tenDaysAgoStr = tenDaysAgo.toISOString().split('T')[0];

  const newMembers = members
    .filter(m => m.join_date && m.join_date >= tenDaysAgoStr)
    .map(m => ({ name: m.name, join_date: m.join_date }));

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

    userStats = {
      recentScore: userMember?.recent_score || null,
      avgScore: userMember?.avg_score || null,
      recentCourse: recentCourse,
      totalRounds: userReservations.length
    };
  }

    res.render('index', {
      title: 'N2골프 - 대시보드',
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
      newMembers
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
