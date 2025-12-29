const express = require('express');
const router = express.Router();
const db = require('../models/database');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateId, validateAmount, validateDate, validateString } = require('../utils/validator');
const { logger } = require('../utils/logger');

// 자금 현황 대시보드
router.get('/', requireAuth, (req, res) => {
  const { year, month } = req.query;
  const selectedYear = parseInt(year) || new Date().getFullYear();
  const selectedMonth = month ? parseInt(month) : null;

  const incomes = db.getTable('incomes');
  const expenses = db.getTable('expenses');

  // 전체 잔액
  const totalIncome = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);
  const totalExpense = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
  const balance = totalIncome - totalExpense;

  // 월별 수입/지출 (선택된 연도)
  const monthlyStats = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${selectedYear}-${String(m).padStart(2, '0')}`;
    const monthIncome = incomes
      .filter(i => i.income_date && i.income_date.startsWith(monthStr))
      .reduce((sum, i) => sum + (i.amount || 0), 0);
    const monthExpense = expenses
      .filter(e => e.expense_date && e.expense_date.startsWith(monthStr))
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    monthlyStats.push({ month: m, income: monthIncome, expense: monthExpense });
  }

  // 카테고리별 수입
  const incomeCategories = db.getTable('income_categories');
  const incomeByCategory = incomeCategories.map(cat => {
    let filtered = incomes.filter(i => i.category_id === cat.id);
    if (selectedYear) {
      filtered = filtered.filter(i => i.income_date && i.income_date.startsWith(String(selectedYear)));
    }
    if (selectedMonth) {
      const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      filtered = filtered.filter(i => i.income_date && i.income_date.startsWith(monthStr));
    }
    return {
      name: cat.name,
      total: filtered.reduce((sum, i) => sum + (i.amount || 0), 0)
    };
  }).sort((a, b) => b.total - a.total);

  // 카테고리별 지출
  const expenseCategories = db.getTable('expense_categories');
  const expenseByCategory = expenseCategories.map(cat => {
    let filtered = expenses.filter(e => e.category_id === cat.id);
    if (selectedYear) {
      filtered = filtered.filter(e => e.expense_date && e.expense_date.startsWith(String(selectedYear)));
    }
    if (selectedMonth) {
      const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      filtered = filtered.filter(e => e.expense_date && e.expense_date.startsWith(monthStr));
    }
    return {
      name: cat.name,
      total: filtered.reduce((sum, e) => sum + (e.amount || 0), 0)
    };
  }).sort((a, b) => b.total - a.total);

  res.render('finance/dashboard', {
    title: '자금 관리',
    balance,
    totalIncome,
    totalExpense,
    monthlyStats,
    incomeByCategory,
    expenseByCategory,
    selectedYear,
    selectedMonth,
    years: Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  });
});

// 입금 내역
router.get('/income', requireAuth, (req, res) => {
  const { year, month, category } = req.query;

  let incomes = db.getTable('incomes');
  const categories = db.getTable('income_categories');
  const members = db.getTable('members');

  if (year) {
    incomes = incomes.filter(i => i.income_date && i.income_date.startsWith(year));
  }
  if (month) {
    const monthStr = `${year || new Date().getFullYear()}-${String(month).padStart(2, '0')}`;
    incomes = incomes.filter(i => i.income_date && i.income_date.startsWith(monthStr));
  }
  if (category) {
    incomes = incomes.filter(i => i.category_id === parseInt(category));
  }

  incomes = incomes
    .map(i => ({
      ...i,
      category_name: (categories.find(c => c.id === i.category_id) || {}).name || '-',
      member_name: (members.find(m => m.id === i.member_id) || {}).name || null
    }))
    .sort((a, b) => (b.income_date || '').localeCompare(a.income_date || ''));

  const total = incomes.reduce((sum, i) => sum + (i.amount || 0), 0);

  res.render('finance/income-list', {
    title: '입금 내역',
    incomes,
    categories,
    total,
    filters: { year, month, category },
    years: Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  });
});

// 입금 등록 페이지
router.get('/income/new', requireAuth, requireAdmin, (req, res) => {
  const categories = db.getTable('income_categories');
  const members = db.getTable('members').filter(m => m.status === 'active' && !m.is_admin);

  res.render('finance/income-form', {
    title: '입금 등록',
    income: null,
    categories,
    members,
    error: null
  });
});

// 입금 등록 처리
router.post('/income/new', requireAuth, requireAdmin, async (req, res) => {
  const { category_id, member_id, amount, description, income_date } = req.body;

  // 입력값 검증
  const categoryResult = validateId(category_id, '카테고리');
  const amountResult = validateAmount(amount);
  const dateResult = validateDate(income_date, { required: true, fieldName: '입금일' });
  const descResult = validateString(description, { maxLength: 500, fieldName: '설명' });

  const categories = db.getTable('income_categories');
  const members = db.getTable('members').filter(m => m.status === 'active' && !m.is_admin);

  if (!categoryResult.valid) {
    return res.render('finance/income-form', {
      title: '입금 등록',
      income: req.body,
      categories,
      members,
      error: categoryResult.error
    });
  }

  if (!amountResult.valid) {
    return res.render('finance/income-form', {
      title: '입금 등록',
      income: req.body,
      categories,
      members,
      error: amountResult.error
    });
  }

  if (!dateResult.valid) {
    return res.render('finance/income-form', {
      title: '입금 등록',
      income: req.body,
      categories,
      members,
      error: dateResult.error
    });
  }

  try {
    const newId = await db.insert('incomes', {
      category_id: categoryResult.value,
      member_id: member_id ? parseInt(member_id) : null,
      amount: amountResult.value,
      description: descResult.value,
      income_date: dateResult.value,
      created_by: req.session.user.id
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('incomes');
    }

    logger.audit('입금 등록', req.session.user, { incomeId: newId, amount: amountResult.value });

    res.redirect('/finance/income');
  } catch (error) {
    console.error('입금 등록 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '입금 등록 중 오류가 발생했습니다.'
    });
  }
});

// 입금 수정 페이지
router.get('/income/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const idResult = validateId(req.params.id, '입금 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', { title: '오류', message: idResult.error });
  }

  const income = db.findById('incomes', idResult.value);

  if (!income) {
    return res.status(404).render('error', { title: '오류', message: '입금 내역을 찾을 수 없습니다.' });
  }

  const categories = db.getTable('income_categories');
  const members = db.getTable('members').filter(m => m.status === 'active' && !m.is_admin);

  res.render('finance/income-form', {
    title: '입금 수정',
    income,
    categories,
    members,
    error: null
  });
});

// 입금 수정 처리
router.post('/income/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  const idResult = validateId(req.params.id, '입금 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', { title: '오류', message: idResult.error });
  }

  const { category_id, member_id, amount, description, income_date } = req.body;

  // 입력값 검증
  const categoryResult = validateId(category_id, '카테고리');
  const amountResult = validateAmount(amount);
  const dateResult = validateDate(income_date, { required: true, fieldName: '입금일' });

  const categories = db.getTable('income_categories');
  const members = db.getTable('members').filter(m => m.status === 'active' && !m.is_admin);

  if (!categoryResult.valid || !amountResult.valid || !dateResult.valid) {
    return res.render('finance/income-form', {
      title: '입금 수정',
      income: { ...req.body, id: idResult.value },
      categories,
      members,
      error: categoryResult.error || amountResult.error || dateResult.error
    });
  }

  try {
    await db.update('incomes', idResult.value, {
      category_id: categoryResult.value,
      member_id: member_id ? parseInt(member_id) : null,
      amount: amountResult.value,
      description: description?.trim() || '',
      income_date: dateResult.value
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('incomes');
    }

    logger.audit('입금 수정', req.session.user, { incomeId: idResult.value, amount: amountResult.value });

    res.redirect('/finance/income');
  } catch (error) {
    console.error('입금 수정 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '입금 수정 중 오류가 발생했습니다.'
    });
  }
});

// 입금 삭제
router.post('/income/:id/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const idResult = validateId(req.params.id, '입금 ID');
    if (!idResult.valid) {
      return res.status(400).render('error', { title: '오류', message: idResult.error });
    }

    const income = db.findById('incomes', idResult.value);
    await db.delete('incomes', idResult.value);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('incomes');
    }

    logger.audit('입금 삭제', req.session.user, { incomeId: idResult.value, amount: income?.amount });

    res.redirect('/finance/income');
  } catch (error) {
    console.error('입금 삭제 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '입금 삭제 중 오류가 발생했습니다.'
    });
  }
});

// 출금 내역
router.get('/expense', requireAuth, (req, res) => {
  const { year, month, category } = req.query;

  let expenses = db.getTable('expenses');
  const categories = db.getTable('expense_categories');

  if (year) {
    expenses = expenses.filter(e => e.expense_date && e.expense_date.startsWith(year));
  }
  if (month) {
    const monthStr = `${year || new Date().getFullYear()}-${String(month).padStart(2, '0')}`;
    expenses = expenses.filter(e => e.expense_date && e.expense_date.startsWith(monthStr));
  }
  if (category) {
    expenses = expenses.filter(e => e.category_id === parseInt(category));
  }

  expenses = expenses
    .map(e => ({
      ...e,
      category_name: (categories.find(c => c.id === e.category_id) || {}).name || '-'
    }))
    .sort((a, b) => (b.expense_date || '').localeCompare(a.expense_date || ''));

  const total = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);

  res.render('finance/expense-list', {
    title: '출금 내역',
    expenses,
    categories,
    total,
    filters: { year, month, category },
    years: Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  });
});

// 출금 등록 페이지
router.get('/expense/new', requireAuth, requireAdmin, (req, res) => {
  const categories = db.getTable('expense_categories');

  res.render('finance/expense-form', {
    title: '출금 등록',
    expense: null,
    categories,
    error: null
  });
});

// 출금 등록 처리
router.post('/expense/new', requireAuth, requireAdmin, async (req, res) => {
  const { category_id, amount, description, expense_date } = req.body;

  // 입력값 검증
  const categoryResult = validateId(category_id, '카테고리');
  const amountResult = validateAmount(amount);
  const dateResult = validateDate(expense_date, { required: true, fieldName: '출금일' });

  const categories = db.getTable('expense_categories');

  if (!categoryResult.valid) {
    return res.render('finance/expense-form', {
      title: '출금 등록',
      expense: req.body,
      categories,
      error: categoryResult.error
    });
  }

  if (!amountResult.valid) {
    return res.render('finance/expense-form', {
      title: '출금 등록',
      expense: req.body,
      categories,
      error: amountResult.error
    });
  }

  if (!dateResult.valid) {
    return res.render('finance/expense-form', {
      title: '출금 등록',
      expense: req.body,
      categories,
      error: dateResult.error
    });
  }

  try {
    const newId = await db.insert('expenses', {
      category_id: categoryResult.value,
      amount: amountResult.value,
      description: description?.trim() || '',
      expense_date: dateResult.value,
      created_by: req.session.user.id
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('expenses');
    }

    logger.audit('출금 등록', req.session.user, { expenseId: newId, amount: amountResult.value });

    res.redirect('/finance/expense');
  } catch (error) {
    console.error('출금 등록 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '출금 등록 중 오류가 발생했습니다.'
    });
  }
});

// 출금 수정 페이지
router.get('/expense/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const idResult = validateId(req.params.id, '출금 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', { title: '오류', message: idResult.error });
  }

  const expense = db.findById('expenses', idResult.value);

  if (!expense) {
    return res.status(404).render('error', { title: '오류', message: '출금 내역을 찾을 수 없습니다.' });
  }

  const categories = db.getTable('expense_categories');

  res.render('finance/expense-form', {
    title: '출금 수정',
    expense,
    categories,
    error: null
  });
});

// 출금 수정 처리
router.post('/expense/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  const idResult = validateId(req.params.id, '출금 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', { title: '오류', message: idResult.error });
  }

  const { category_id, amount, description, expense_date } = req.body;

  // 입력값 검증
  const categoryResult = validateId(category_id, '카테고리');
  const amountResult = validateAmount(amount);
  const dateResult = validateDate(expense_date, { required: true, fieldName: '출금일' });

  const categories = db.getTable('expense_categories');

  if (!categoryResult.valid || !amountResult.valid || !dateResult.valid) {
    return res.render('finance/expense-form', {
      title: '출금 수정',
      expense: { ...req.body, id: idResult.value },
      categories,
      error: categoryResult.error || amountResult.error || dateResult.error
    });
  }

  try {
    await db.update('expenses', idResult.value, {
      category_id: categoryResult.value,
      amount: amountResult.value,
      description: description?.trim() || '',
      expense_date: dateResult.value
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('expenses');
    }

    logger.audit('출금 수정', req.session.user, { expenseId: idResult.value, amount: amountResult.value });

    res.redirect('/finance/expense');
  } catch (error) {
    console.error('출금 수정 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '출금 수정 중 오류가 발생했습니다.'
    });
  }
});

// 출금 삭제
router.post('/expense/:id/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const idResult = validateId(req.params.id, '출금 ID');
    if (!idResult.valid) {
      return res.status(400).render('error', { title: '오류', message: idResult.error });
    }

    const expense = db.findById('expenses', idResult.value);
    await db.delete('expenses', idResult.value);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('expenses');
    }

    logger.audit('출금 삭제', req.session.user, { expenseId: idResult.value, amount: expense?.amount });

    res.redirect('/finance/expense');
  } catch (error) {
    console.error('출금 삭제 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '출금 삭제 중 오류가 발생했습니다.'
    });
  }
});

// 회비 관리
router.get('/fees', requireAuth, (req, res) => {
  const year = parseInt(req.query.year) || new Date().getFullYear();

  const members = db.getTable('members').filter(m => m.status === 'active' && !m.is_admin);
  const fees = db.getTable('membership_fees').filter(f => f.year === year);

  const feeMap = {};
  fees.forEach(f => {
    if (!feeMap[f.member_id]) feeMap[f.member_id] = {};
    feeMap[f.member_id][f.month] = f;
  });

  res.render('finance/fees', {
    title: '회비 관리',
    members,
    feeMap,
    year,
    years: Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - i)
  });
});

// 회비 납부 처리
router.post('/fees/pay', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { member_id, year, month, amount } = req.body;

    // 입력값 검증
    const memberIdResult = validateId(member_id, '회원');
    const amountResult = validateAmount(amount);

    if (!memberIdResult.valid) {
      return res.status(400).json({ error: memberIdResult.error });
    }

    if (!amountResult.valid) {
      return res.status(400).json({ error: amountResult.error });
    }

    const yearInt = parseInt(year);
    const monthInt = parseInt(month);

    if (isNaN(yearInt) || yearInt < 2020 || yearInt > 2100) {
      return res.status(400).json({ error: '유효하지 않은 연도입니다.' });
    }

    if (isNaN(monthInt) || monthInt < 1 || monthInt > 12) {
      return res.status(400).json({ error: '유효하지 않은 월입니다.' });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('membership_fees');
    }

    // 기존 기록 확인
    const fees = db.getTable('membership_fees');
    const existing = fees.find(f => f.member_id === memberIdResult.value && f.year === yearInt && f.month === monthInt);

    if (existing) {
      await db.update('membership_fees', existing.id, {
        status: 'paid',
        amount: amountResult.value,
        paid_date: new Date().toISOString().split('T')[0]
      });
    } else {
      await db.insert('membership_fees', {
        member_id: memberIdResult.value,
        year: yearInt,
        month: monthInt,
        amount: amountResult.value,
        status: 'paid',
        paid_date: new Date().toISOString().split('T')[0]
      });
    }

    // 입금 내역에도 추가
    const member = db.findById('members', memberIdResult.value);
    const feeCategory = db.getTable('income_categories').find(c => c.name === '회비');

    if (feeCategory) {
      await db.insert('incomes', {
        category_id: feeCategory.id,
        member_id: memberIdResult.value,
        amount: amountResult.value,
        description: `${member.name} ${yearInt}년 ${monthInt}월 회비`,
        income_date: new Date().toISOString().split('T')[0],
        created_by: req.session.user.id
      });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('membership_fees');
      await db.refreshCache('incomes');
    }

    logger.audit('회비 납부 처리', req.session.user, {
      memberId: memberIdResult.value,
      memberName: member?.name,
      year: yearInt,
      month: monthInt,
      amount: amountResult.value
    });

    res.json({ success: true });
  } catch (error) {
    console.error('회비 납부 오류:', error);
    res.status(500).json({ error: '회비 납부 처리 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
