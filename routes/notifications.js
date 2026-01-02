const express = require('express');
const router = express.Router();
const db = require('../models/database');

// 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// 알림 내역 페이지
router.get('/', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;

    // 3일 전 날짜 계산
    const threeDaysAgo = new Date();
    threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
    const threeDaysAgoStr = threeDaysAgo.toISOString();

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('notifications');
    }

    // 최근 3일간 알림 조회
    const allNotifications = await db.getTableAsync('notifications');
    const notifications = allNotifications
      .filter(n => n.member_id === memberId && n.created_at >= threeDaysAgoStr)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    // 알림 유형별 아이콘 및 색상
    const typeInfo = {
      schedule: { icon: 'bi-calendar-plus', color: 'success', label: '새 일정' },
      comment: { icon: 'bi-chat-dots', color: 'primary', label: '댓글' },
      reservation: { icon: 'bi-calendar-check', color: 'info', label: '예약' },
      waitlist: { icon: 'bi-arrow-up-circle', color: 'warning', label: '대기자 승격' },
      community_post: { icon: 'bi-chat-square-text', color: 'info', label: '일상톡톡' },
      general: { icon: 'bi-bell', color: 'secondary', label: '알림' }
    };

    // 날짜별 그룹핑
    const groupedNotifications = {};
    notifications.forEach(n => {
      const dateKey = n.created_at ? n.created_at.split('T')[0] : 'unknown';
      if (!groupedNotifications[dateKey]) {
        groupedNotifications[dateKey] = [];
      }
      groupedNotifications[dateKey].push({
        ...n,
        typeInfo: typeInfo[n.type] || typeInfo.general
      });
    });

    res.render('notifications/list', {
      title: '알림 내역',
      groupedNotifications,
      totalCount: notifications.length,
      breadcrumb: [{ label: '알림 내역', url: '/notifications' }]
    });
  } catch (error) {
    console.error('알림 내역 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '알림 내역을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 알림 읽음 처리
router.post('/:id/read', requireAuth, async (req, res) => {
  try {
    const notificationId = parseInt(req.params.id);
    const memberId = req.session.user.id;

    const notification = db.findById('notifications', notificationId);
    if (!notification || notification.member_id !== memberId) {
      return res.status(404).json({ error: '알림을 찾을 수 없습니다.' });
    }

    await db.update('notifications', notificationId, { is_read: true });

    if (db.refreshCache) {
      await db.refreshCache('notifications');
    }

    res.json({ success: true });
  } catch (error) {
    console.error('알림 읽음 처리 오류:', error);
    res.status(500).json({ error: '알림 읽음 처리 중 오류가 발생했습니다.' });
  }
});

// 전체 읽음 처리
router.post('/read-all', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;

    const allNotifications = await db.getTableAsync('notifications');
    const unreadNotifications = allNotifications.filter(
      n => n.member_id === memberId && !n.is_read
    );

    for (const notification of unreadNotifications) {
      await db.update('notifications', notification.id, { is_read: true });
    }

    if (db.refreshCache) {
      await db.refreshCache('notifications');
    }

    res.json({ success: true, count: unreadNotifications.length });
  } catch (error) {
    console.error('전체 읽음 처리 오류:', error);
    res.status(500).json({ error: '전체 읽음 처리 중 오류가 발생했습니다.' });
  }
});

// 읽지 않은 알림 개수 API
router.get('/unread-count', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;

    const allNotifications = await db.getTableAsync('notifications');
    const unreadCount = allNotifications.filter(
      n => n.member_id === memberId && !n.is_read
    ).length;

    res.json({ success: true, count: unreadCount });
  } catch (error) {
    console.error('읽지 않은 알림 개수 조회 오류:', error);
    res.status(500).json({ error: '알림 개수 조회 중 오류가 발생했습니다.' });
  }
});

// 최신 알림 조회 API (토스트용)
router.get('/latest', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;

    const allNotifications = await db.getTableAsync('notifications');
    const myNotifications = allNotifications
      .filter(n => n.member_id === memberId && !n.is_read)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    if (myNotifications.length === 0) {
      return res.json({ success: true, notification: null });
    }

    const latest = myNotifications[0];
    res.json({
      success: true,
      notification: {
        id: latest.id,
        title: latest.title,
        body: latest.body,
        url: latest.url,
        type: latest.type,
        created_at: latest.created_at
      }
    });
  } catch (error) {
    console.error('최신 알림 조회 오류:', error);
    res.status(500).json({ error: '최신 알림 조회 중 오류가 발생했습니다.' });
  }
});

module.exports = router;
