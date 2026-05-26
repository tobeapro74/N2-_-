const express = require('express');
const router = express.Router();
const db = require('../models/database');
const config = require('../config');
const { requireAuth, requireAdmin } = require('../middleware/auth');
const { validateId, validateAmount, validateDate, validateString } = require('../utils/validator');
const { logger } = require('../utils/logger');

// 입금/출금 변경 후 event_budgets.current_balance 자동 재계산
async function syncBudgetBalance() {
  try {
    const allIncomes  = db.getTable('incomes');
    const allExpenses = db.getTable('expenses');
    const totalIncome  = allIncomes.reduce((s, i) => s + (i.amount || 0), 0);
    const totalExpense = allExpenses.reduce((s, e) => s + (e.amount || 0), 0);
    const newBalance   = totalIncome - totalExpense;

    const budgets = db.getTable('event_budgets');
    for (const b of budgets) {
      await db.update('event_budgets', b.id, { current_balance: newBalance });
    }
    if (db.refreshCache) await db.refreshCache('event_budgets');
  } catch (err) {
    console.error('예산 잔액 동기화 오류:', err);
  }
}

// 자금 현황 대시보드
router.get('/', requireAuth, async (req, res) => {
  const { year, month } = req.query;
  const selectedYear = parseInt(year) || new Date().getFullYear();
  const selectedMonth = month ? parseInt(month) : null;

  const incomes = await db.getTableAsync('incomes');
  const expenses = await db.getTableAsync('expenses');

  const sumIncome = (rows) => rows.reduce((sum, i) => sum + (i.amount || 0), 0);
  const sumExpense = (rows) => rows.reduce((sum, e) => sum + (e.amount || 0), 0);

  // 선택 연·월과 동일 조건으로 거래만 추출 (상단 요약·카테고리·차트가 같은 숫자를 쓰도록)
  const filterIncomesBySelection = (rows) => {
    let f = rows;
    if (selectedYear) {
      f = f.filter((i) => i.income_date && String(i.income_date).startsWith(String(selectedYear)));
    }
    if (selectedMonth) {
      const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      f = f.filter((i) => i.income_date && i.income_date.startsWith(monthStr));
    }
    return f;
  };
  const filterExpensesBySelection = (rows) => {
    let f = rows;
    if (selectedYear) {
      f = f.filter((e) => e.expense_date && String(e.expense_date).startsWith(String(selectedYear)));
    }
    if (selectedMonth) {
      const monthStr = `${selectedYear}-${String(selectedMonth).padStart(2, '0')}`;
      f = f.filter((e) => e.expense_date && e.expense_date.startsWith(monthStr));
    }
    return f;
  };

  const incomesInPeriod = filterIncomesBySelection(incomes);
  const expensesInPeriod = filterExpensesBySelection(expenses);

  // 상단 '총 수입·총 지출' = 선택 기간 합계 (카테고리 합과 일치)
  const totalIncome = sumIncome(incomesInPeriod);
  const totalExpense = sumExpense(expensesInPeriod);
  // '누적 잔액': 등록된 전체 입금 − 전체 출금 (통장 잔액에 가깝게 보는 값)
  const balanceAllTime = sumIncome(incomes) - sumExpense(expenses);
  const periodNet = totalIncome - totalExpense;

  // 월별 수입/지출 (선택된 연도)
  const monthlyStats = [];
  for (let m = 1; m <= 12; m++) {
    const monthStr = `${selectedYear}-${String(m).padStart(2, '0')}`;
    const monthIncome = incomes
      .filter((i) => i.income_date && i.income_date.startsWith(monthStr))
      .reduce((sum, i) => sum + (i.amount || 0), 0);
    const monthExpense = expenses
      .filter((e) => e.expense_date && e.expense_date.startsWith(monthStr))
      .reduce((sum, e) => sum + (e.amount || 0), 0);
    monthlyStats.push({ month: m, income: monthIncome, expense: monthExpense });
  }

  // 카테고리별 수입
  const incomeCategories = await db.getTableAsync('income_categories');
  const incomeByCategory = incomeCategories.map((cat) => {
    let filtered = incomesInPeriod.filter((i) => i.category_id === cat.id);
    return {
      name: cat.name,
      total: filtered.reduce((sum, i) => sum + (i.amount || 0), 0)
    };
  }).sort((a, b) => b.total - a.total);

  // 카테고리별 지출
  const expenseCategories = await db.getTableAsync('expense_categories');
  const expenseByCategory = expenseCategories.map((cat) => {
    let filtered = expensesInPeriod.filter((e) => e.category_id === cat.id);
    return {
      name: cat.name,
      total: filtered.reduce((sum, e) => sum + (e.amount || 0), 0)
    };
  }).sort((a, b) => b.total - a.total);

  res.render('finance/dashboard', {
    title: '자금 관리',
    balanceAllTime,
    periodNet,
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
router.get('/income', requireAuth, async (req, res) => {
  const { year, month, category } = req.query;

  let incomes = await db.getTableAsync('incomes');
  const categories = await db.getTableAsync('income_categories');
  const members = await db.getTableAsync('members');

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

  const total = incomes.reduce((sum, i) => sum + (Number(i.amount) || 0), 0);

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
router.get('/income/new', requireAuth, requireAdmin, async (req, res) => {
  const categories = await db.getTableAsync('income_categories');
  const members = (await db.getTableAsync('members')).filter(m => m.status === 'active' && !m.is_admin);

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

  const categories = await db.getTableAsync('income_categories');
  const members = (await db.getTableAsync('members')).filter(m => m.status === 'active' && !m.is_admin);

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

    // 캐시 새로고침 + 예산 잔액 동기화
    if (db.refreshCache) await db.refreshCache('incomes');
    await syncBudgetBalance();

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
router.get('/income/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  const idResult = validateId(req.params.id, '입금 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', { title: '오류', message: idResult.error });
  }

  const income = db.findById('incomes', idResult.value);

  if (!income) {
    return res.status(404).render('error', { title: '오류', message: '입금 내역을 찾을 수 없습니다.' });
  }

  const categories = await db.getTableAsync('income_categories');
  const members = (await db.getTableAsync('members')).filter(m => m.status === 'active' && !m.is_admin);

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

  const categories = await db.getTableAsync('income_categories');
  const members = (await db.getTableAsync('members')).filter(m => m.status === 'active' && !m.is_admin);

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

    // 캐시 새로고침 + 예산 잔액 동기화
    if (db.refreshCache) await db.refreshCache('incomes');
    await syncBudgetBalance();

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

    // 캐시 새로고침 + 예산 잔액 동기화
    if (db.refreshCache) await db.refreshCache('incomes');
    await syncBudgetBalance();

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
router.get('/expense', requireAuth, async (req, res) => {
  const { year, month, category } = req.query;

  let expenses = await db.getTableAsync('expenses');
  const categories = await db.getTableAsync('expense_categories');

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

  const total = expenses.reduce((sum, e) => sum + (Number(e.amount) || 0), 0);

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
router.get('/expense/new', requireAuth, requireAdmin, async (req, res) => {
  const categories = await db.getTableAsync('expense_categories');

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

  const categories = await db.getTableAsync('expense_categories');

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

    // 캐시 새로고침 + 예산 잔액 동기화
    if (db.refreshCache) await db.refreshCache('expenses');
    await syncBudgetBalance();

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
router.get('/expense/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  const idResult = validateId(req.params.id, '출금 ID');
  if (!idResult.valid) {
    return res.status(400).render('error', { title: '오류', message: idResult.error });
  }

  const expense = db.findById('expenses', idResult.value);

  if (!expense) {
    return res.status(404).render('error', { title: '오류', message: '출금 내역을 찾을 수 없습니다.' });
  }

  const categories = await db.getTableAsync('expense_categories');

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

  const categories = await db.getTableAsync('expense_categories');

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

    // 캐시 새로고침 + 예산 잔액 동기화
    if (db.refreshCache) await db.refreshCache('expenses');
    await syncBudgetBalance();

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

    // 캐시 새로고침 + 예산 잔액 동기화
    if (db.refreshCache) await db.refreshCache('expenses');
    await syncBudgetBalance();

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

// ============================================
// 행사별 예산 관리
// ============================================

// 예산관리 대시보드
router.get('/budget', requireAuth, requireAdmin, async (req, res) => {
  try {
    if (db.refreshCache) {
      await db.refreshCache('event_budgets');
      await db.refreshCache('incomes');
      await db.refreshCache('expenses');
    }

    const budgets = db.getTable('event_budgets');
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const half = req.query.half || 'first';
    const budget = budgets.find(b => b.year === year && b.half === half) || null;

    // 재원 흐름: 실제 DB 수입/지출 기반으로 동적 계산
    let cashFlow = [];
    if (budget) {
      const allIncomes  = db.getTable('incomes');
      const allExpenses = db.getTable('expenses');
      const halfStart = half === 'first' ? `${year}-01-01` : `${year}-07-01`;
      const halfEnd   = half === 'first' ? `${year}-06-30` : `${year}-12-31`;

      // 날짜별 집계
      const byDate = {};
      allIncomes
        .filter(i => i.income_date >= halfStart && i.income_date <= halfEnd)
        .forEach(i => {
          if (!byDate[i.income_date]) byDate[i.income_date] = { income: 0, expense: 0 };
          byDate[i.income_date].income += i.amount;
        });
      allExpenses
        .filter(e => e.expense_date >= halfStart && e.expense_date <= halfEnd)
        .forEach(e => {
          if (!byDate[e.expense_date]) byDate[e.expense_date] = { income: 0, expense: 0 };
          byDate[e.expense_date].expense += e.amount;
        });

      // 현재 잔액에서 역산하여 각 날짜의 이전 잔액 계산
      const currentBalance = budget.current_balance || 0;
      const sortedDates = Object.keys(byDate).sort();
      let running = currentBalance;
      const dateRows = [];
      for (let i = sortedDates.length - 1; i >= 0; i--) {
        const d = sortedDates[i];
        const { income, expense } = byDate[d];
        running = running - income + expense; // 역산
        dateRows.unshift({ date: d, income, expense, balanceBefore: running });
      }

      // 현재 잔액 행
      cashFlow.push({ date: '현재', label: '통장 잔액', income: null, expense: null, balance: currentBalance, current: true });

      // 실제 거래 행 (날짜 오름차순 → 역순으로 표시: 현재가 맨 위이므로 오름차순)
      let bal = currentBalance;
      for (const row of dateRows) {
        const mm = row.date.slice(5, 7).replace(/^0/, '');
        const dd = row.date.slice(8, 10).replace(/^0/, '');
        const label = row.income > 0 && row.expense > 0
          ? `${mm}/${dd} 입출금`
          : row.income > 0 ? '입금' : '지출';
        bal = row.balanceBefore + row.income - row.expense;
        cashFlow.push({
          date: `${mm}/${dd}`,
          label,
          income:  row.income  > 0 ? row.income  : null,
          expense: row.expense > 0 ? row.expense : null,
          balance: bal
        });
      }

      // 예정 행사 추가 (planned 상태, 날짜순)
      const realDates = new Set(sortedDates);
      const plannedEvents = (budget.events || [])
        .filter(e => e.status === 'planned' && e.date >= halfStart && e.date <= halfEnd)
        .sort((a, b) => a.date.localeCompare(b.date));

      let lastBal = cashFlow.length > 0 ? cashFlow[cashFlow.length - 1].balance : currentBalance;
      // 회비 예정 입금 (남은 달)
      const today = new Date().toISOString().slice(0, 10);
      const feeRows = [];
      for (let m = 1; m <= (half === 'first' ? 6 : 12); m++) {
        const feeDate = `${year}-${String(m).padStart(2,'0')}-20`;
        if (feeDate > today && feeDate <= halfEnd && !realDates.has(feeDate)) {
          feeRows.push({ date: feeDate, income: budget.monthly_fee, expense: null });
        }
      }

      // 예정 행사 + 회비 합쳐서 날짜순
      const futureRows = [
        ...feeRows.map(r => ({ date: r.date, label: `${r.date.slice(5,7).replace(/^0/,'')}월 회비 입금 (예정)`, income: r.income, expense: null })),
        ...plannedEvents.map(e => ({
          date: e.date,
          label: e.name + ' 지출 (예정)',
          income: null,
          expense: e.budget || 0
        }))
      ].sort((a, b) => a.date.localeCompare(b.date));

      for (const fr of futureRows) {
        const mm = fr.date.slice(5, 7).replace(/^0/, '');
        const dd = fr.date.slice(8, 10).replace(/^0/, '');
        lastBal = lastBal + (fr.income || 0) - (fr.expense || 0);
        cashFlow.push({ date: `${mm}/${dd}`, label: fr.label, income: fr.income || null, expense: fr.expense || null, balance: lastBal, planned: true });
      }
    }

    // 총 예산/지출/잔액: 실제 DB 기준으로 계산
    let budgetSummary = null;
    if (budget) {
      const allIncomes  = db.getTable('incomes');
      const allExpenses = db.getTable('expenses');
      const halfStart = half === 'first' ? `${year}-01-01` : `${year}-07-01`;
      const halfEnd   = half === 'first' ? `${year}-06-30` : `${year}-12-31`;
      const totalIncome  = allIncomes.filter(i => i.income_date  >= halfStart && i.income_date  <= halfEnd).reduce((s, i) => s + i.amount, 0);
      const totalExpense = allExpenses.filter(e => e.expense_date >= halfStart && e.expense_date <= halfEnd).reduce((s, e) => s + e.amount, 0);
      budgetSummary = {
        totalIncome,
        totalExpense,
        currentBalance: budget.current_balance || 0
      };
    }

    res.render('finance/budget', {
      title: '예산 관리',
      budget,
      cashFlow,
      budgetSummary,
      year,
      half,
      years: Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + 1 - i)
    });
  } catch (error) {
    console.error('예산관리 조회 오류:', error);
    res.status(500).render('error', { title: '오류', message: '예산 관리 페이지를 불러오는 중 오류가 발생했습니다.' });
  }
});

// 예산 설정 저장
router.post('/budget/save', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { year, half, company_support, used_support, monthly_fee, fee_months, carryover, events } = req.body;

    if (db.refreshCache) {
      await db.refreshCache('event_budgets');
    }

    const existing = db.getTable('event_budgets').find(
      b => b.year === parseInt(year) && b.half === half
    );

    const budgetData = {
      year: parseInt(year),
      half,
      company_support: parseInt(company_support) || 0,
      used_support: parseInt(used_support) || 0,
      monthly_fee: parseInt(monthly_fee) || 0,
      fee_months: parseInt(fee_months) || 0,
      carryover: parseInt(carryover) || 0,
      events: JSON.parse(events || '[]')
    };

    if (existing) {
      await db.update('event_budgets', existing.id, budgetData);
    } else {
      await db.insert('event_budgets', budgetData);
    }

    if (db.refreshCache) {
      await db.refreshCache('event_budgets');
    }

    res.json({ success: true, message: '예산이 저장되었습니다.' });
  } catch (error) {
    console.error('예산 저장 오류:', error);
    res.status(500).json({ error: '예산 저장 중 오류가 발생했습니다.' });
  }
});

// 개별 행사 지출 업데이트
router.post('/budget/event/update', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { budget_id, event_index, items } = req.body;

    if (db.refreshCache) {
      await db.refreshCache('event_budgets');
    }

    const budget = db.findById('event_budgets', parseInt(budget_id));
    if (!budget) {
      return res.status(404).json({ error: '예산 데이터를 찾을 수 없습니다.' });
    }

    const idx = parseInt(event_index);
    if (idx < 0 || idx >= budget.events.length) {
      return res.status(400).json({ error: '잘못된 행사 인덱스입니다.' });
    }

    const parsedItems = JSON.parse(items || '[]');
    budget.events[idx].items = parsedItems;
    budget.events[idx].spent = parsedItems.reduce((sum, item) => sum + (parseInt(item.actual) || 0), 0);

    await db.update('event_budgets', budget.id, { events: budget.events });

    if (db.refreshCache) {
      await db.refreshCache('event_budgets');
    }

    res.json({ success: true, message: '지출이 업데이트되었습니다.' });
  } catch (error) {
    console.error('행사 지출 업데이트 오류:', error);
    res.status(500).json({ error: '지출 업데이트 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
