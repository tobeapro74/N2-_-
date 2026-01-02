/**
 * 푸시 알림 API 라우터
 * 푸시 구독 관리 및 테스트 발송
 */

const express = require('express');
const router = express.Router();
const db = require('../models/database');
const pushService = require('../utils/pushService');

// 로그인 필요 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.status(401).json({ success: false, error: '로그인이 필요합니다.' });
  }
  next();
};

// VAPID 공개키 조회
router.get('/vapid-public-key', (req, res) => {
  const publicKey = pushService.getVapidPublicKey();

  if (!publicKey) {
    return res.status(503).json({
      success: false,
      error: '푸시 알림 서비스가 비활성화되어 있습니다.'
    });
  }

  res.json({ success: true, publicKey });
});

// 푸시 구독 등록
router.post('/subscribe', requireAuth, async (req, res) => {
  try {
    const { subscription } = req.body;
    const memberId = req.session.user.id;

    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({
        success: false,
        error: '유효하지 않은 구독 정보입니다.'
      });
    }

    // 이미 등록된 구독인지 확인 (endpoint 기준)
    const existingSubscriptions = await db.getTableAsync('push_subscriptions');
    const existing = existingSubscriptions.find(
      s => s.endpoint === subscription.endpoint
    );

    if (existing) {
      // 기존 구독 업데이트 (회원 ID가 다를 수 있음)
      await db.update('push_subscriptions', existing.id, {
        member_id: memberId,
        keys: subscription.keys,
        last_used_at: new Date().toISOString()
      });

      return res.json({
        success: true,
        message: '구독 정보가 업데이트되었습니다.',
        subscriptionId: existing.id
      });
    }

    // 새 구독 등록
    const subscriptionId = await db.insert('push_subscriptions', {
      member_id: memberId,
      endpoint: subscription.endpoint,
      keys: subscription.keys,
      last_used_at: new Date().toISOString()
    });

    res.json({
      success: true,
      message: '푸시 알림 구독이 등록되었습니다.',
      subscriptionId
    });
  } catch (error) {
    console.error('푸시 구독 등록 오류:', error);
    res.status(500).json({
      success: false,
      error: '구독 등록 중 오류가 발생했습니다.'
    });
  }
});

// 푸시 구독 해제
router.delete('/unsubscribe', requireAuth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    const memberId = req.session.user.id;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        error: 'endpoint가 필요합니다.'
      });
    }

    // 해당 endpoint 구독 찾기
    const subscriptions = await db.getTableAsync('push_subscriptions');
    const subscription = subscriptions.find(
      s => s.endpoint === endpoint && s.member_id === memberId
    );

    if (!subscription) {
      return res.status(404).json({
        success: false,
        error: '구독 정보를 찾을 수 없습니다.'
      });
    }

    await db.delete('push_subscriptions', subscription.id);

    res.json({
      success: true,
      message: '푸시 알림 구독이 해제되었습니다.'
    });
  } catch (error) {
    console.error('푸시 구독 해제 오류:', error);
    res.status(500).json({
      success: false,
      error: '구독 해제 중 오류가 발생했습니다.'
    });
  }
});

// 구독 상태 확인
router.get('/status', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;
    const subscriptions = await db.getTableAsync('push_subscriptions');
    const memberSubs = subscriptions.filter(s => s.member_id === memberId);

    res.json({
      success: true,
      enabled: pushService.isEnabled(),
      subscribed: memberSubs.length > 0,
      subscriptionCount: memberSubs.length
    });
  } catch (error) {
    console.error('구독 상태 확인 오류:', error);
    res.status(500).json({
      success: false,
      error: '상태 확인 중 오류가 발생했습니다.'
    });
  }
});

// 테스트 알림 발송 (개발용)
router.post('/test', requireAuth, async (req, res) => {
  try {
    const memberId = req.session.user.id;

    if (!pushService.isEnabled()) {
      return res.status(503).json({
        success: false,
        error: '푸시 알림 서비스가 비활성화되어 있습니다.'
      });
    }

    const payload = {
      title: '테스트 알림',
      body: '푸시 알림이 정상적으로 작동합니다!',
      url: '/',
      icon: '/icons/icon-192x192.svg'
    };

    const successCount = await pushService.sendToMember(memberId, payload);

    if (successCount > 0) {
      res.json({
        success: true,
        message: `테스트 알림이 발송되었습니다. (${successCount}개 기기)`
      });
    } else {
      res.json({
        success: false,
        error: '등록된 구독이 없거나 발송에 실패했습니다.'
      });
    }
  } catch (error) {
    console.error('테스트 알림 발송 오류:', error);
    res.status(500).json({
      success: false,
      error: '테스트 알림 발송 중 오류가 발생했습니다.'
    });
  }
});

module.exports = router;
