/**
 * 웹 푸시 알림 서비스
 * Web Push API를 사용한 푸시 알림 발송
 */

const webpush = require('web-push');
const db = require('../models/database');

// VAPID 키 설정
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_EMAIL = process.env.VAPID_EMAIL || 'mailto:admin@n2golf.com';

// VAPID 설정 초기화
if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    VAPID_EMAIL,
    VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY
  );
  console.log('Web Push VAPID 설정 완료');
} else {
  console.warn('VAPID 키가 설정되지 않았습니다. 푸시 알림이 비활성화됩니다.');
}

/**
 * 푸시 알림 발송
 * @param {Object} subscription - 푸시 구독 정보
 * @param {Object} payload - 알림 내용
 * @returns {Promise<boolean>} - 발송 성공 여부
 */
async function sendPush(subscription, payload) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.warn('VAPID 키 미설정으로 푸시 발송 건너뜀');
    return false;
  }

  try {
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: subscription.keys
    };

    await webpush.sendNotification(
      pushSubscription,
      JSON.stringify(payload)
    );

    // 마지막 사용 시간 업데이트
    await db.update('push_subscriptions', subscription.id, {
      last_used_at: new Date().toISOString()
    });

    return true;
  } catch (error) {
    console.error('푸시 발송 오류:', error.message);

    // 구독이 만료되었거나 유효하지 않은 경우 삭제
    if (error.statusCode === 410 || error.statusCode === 404) {
      console.log('만료된 구독 삭제:', subscription.id);
      await db.delete('push_subscriptions', subscription.id);
    }

    return false;
  }
}

/**
 * 알림 내역 저장
 * @param {number|number[]} memberIds - 회원 ID 또는 회원 ID 배열
 * @param {Object} payload - 알림 내용 { title, body, url, icon }
 * @param {string} type - 알림 유형 (schedule, comment, reservation, waitlist)
 */
async function saveNotification(memberIds, payload, type) {
  const ids = Array.isArray(memberIds) ? memberIds : [memberIds];
  const now = new Date().toISOString();

  try {
    for (const memberId of ids) {
      await db.insert('notifications', {
        member_id: memberId,
        type: type,
        title: payload.title,
        body: payload.body,
        url: payload.url,
        is_read: false,
        created_at: now
      });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('notifications');
    }
  } catch (err) {
    console.error('알림 내역 저장 오류:', err);
  }
}

/**
 * 특정 회원에게 푸시 알림 발송
 * @param {number} memberId - 회원 ID
 * @param {Object} payload - 알림 내용 { title, body, url, icon }
 * @param {string} type - 알림 유형 (선택적)
 */
async function sendToMember(memberId, payload, type = 'general') {
  // 알림 내역 저장
  await saveNotification(memberId, payload, type);

  const subscriptions = await db.getTableAsync('push_subscriptions');
  const memberSubs = subscriptions.filter(s => s.member_id === memberId);

  const results = await Promise.all(
    memberSubs.map(sub => sendPush(sub, payload))
  );

  const successCount = results.filter(r => r).length;
  console.log(`회원 ${memberId}에게 푸시 발송: ${successCount}/${memberSubs.length} 성공`);

  return successCount;
}

/**
 * 전체 회원에게 푸시 알림 발송
 * @param {Object} payload - 알림 내용 { title, body, url, icon }
 * @param {number[]} excludeMembers - 제외할 회원 ID 목록
 * @param {string} type - 알림 유형 (선택적)
 */
async function sendToAll(payload, excludeMembers = [], type = 'general') {
  // 모든 활성 회원에게 알림 내역 저장
  const members = await db.getTableAsync('members');
  const activeMembers = members
    .filter(m => m.status === 'active' && !excludeMembers.includes(m.id))
    .map(m => m.id);

  // 알림 내역 저장 (모든 활성 회원)
  if (activeMembers.length > 0) {
    await saveNotification(activeMembers, payload, type);
  }

  // 푸시 알림은 구독한 사람에게만 발송
  const subscriptions = await db.getTableAsync('push_subscriptions');
  const targetSubs = subscriptions.filter(s => !excludeMembers.includes(s.member_id));

  const results = await Promise.all(
    targetSubs.map(sub => sendPush(sub, payload))
  );

  const successCount = results.filter(r => r).length;
  console.log(`전체 알림 저장: ${activeMembers.length}명, 푸시 발송: ${successCount}/${targetSubs.length} 성공`);

  return successCount;
}

/**
 * 새 일정 등록 알림
 * @param {Object} schedule - 일정 정보
 * @param {Object} golfCourse - 골프장 정보
 */
async function notifyNewSchedule(schedule, golfCourse) {
  const payload = {
    title: '새 골프 일정 등록',
    body: `${schedule.play_date} ${golfCourse.name} 일정이 등록되었습니다. 예약하세요!`,
    url: `/schedules/${schedule.id}`,
    icon: '/icons/icon-192x192.svg'
  };

  return await sendToAll(payload, [], 'schedule');
}

/**
 * 댓글 알림 (내 글/댓글에 댓글이 달렸을 때)
 * @param {number} targetMemberId - 알림 받을 회원 ID
 * @param {string} commenterName - 댓글 작성자 이름
 * @param {string} type - 'post' | 'comment' (게시글 or 댓글)
 * @param {string} url - 이동할 URL
 */
async function notifyComment(targetMemberId, commenterName, type, url) {
  const typeText = type === 'post' ? '글' : '댓글';
  const payload = {
    title: '새 댓글 알림',
    body: `${commenterName}님이 회원님의 ${typeText}에 댓글을 달았습니다.`,
    url: url,
    icon: '/icons/icon-192x192.svg'
  };

  return await sendToMember(targetMemberId, payload, 'comment');
}

/**
 * 예약 확정 알림
 * @param {number} memberId - 예약자 회원 ID
 * @param {Object} schedule - 일정 정보
 * @param {Object} golfCourse - 골프장 정보
 */
async function notifyReservationConfirmed(memberId, schedule, golfCourse) {
  const payload = {
    title: '예약 확정',
    body: `${schedule.play_date} ${golfCourse.name} 예약이 확정되었습니다.`,
    url: `/schedules/${schedule.id}`,
    icon: '/icons/icon-192x192.svg'
  };

  return await sendToMember(memberId, payload, 'reservation');
}

/**
 * 예약 마감 임박 알림
 * @param {Object} schedule - 일정 정보
 * @param {Object} golfCourse - 골프장 정보
 * @param {number} currentCount - 현재 예약 인원
 * @param {number} maxCount - 최대 인원
 * @param {number[]} excludeMembers - 이미 예약한 회원 ID 목록
 */
async function notifyReservationAlmostFull(schedule, golfCourse, currentCount, maxCount, excludeMembers = []) {
  const payload = {
    title: '예약 마감 임박',
    body: `${schedule.play_date} ${golfCourse.name} 예약이 곧 마감됩니다. (${currentCount}/${maxCount}명)`,
    url: `/schedules/${schedule.id}`,
    icon: '/icons/icon-192x192.svg'
  };

  return await sendToAll(payload, excludeMembers, 'reservation');
}

/**
 * 대기자에서 확정으로 전환 알림
 * @param {number} memberId - 예약자 회원 ID
 * @param {Object} schedule - 일정 정보
 * @param {Object} golfCourse - 골프장 정보
 */
async function notifyWaitlistToConfirmed(memberId, schedule, golfCourse) {
  const payload = {
    title: '대기자 → 예약 확정',
    body: `${schedule.play_date} ${golfCourse.name} 예약이 확정되었습니다! (취소 발생으로 순번 상승)`,
    url: `/schedules/${schedule.id}`,
    icon: '/icons/icon-192x192.svg'
  };

  return await sendToMember(memberId, payload, 'waitlist');
}

/**
 * 새 일상톡톡 게시글 알림
 * @param {number} authorId - 게시글 작성자 ID
 * @param {string} authorName - 게시글 작성자 이름
 * @param {number} postId - 게시글 ID
 */
async function notifyNewCommunityPost(authorId, authorName, postId) {
  const payload = {
    title: '새 일상톡톡 글',
    body: `${authorName}님이 새 글을 등록했습니다.`,
    url: `/community?post=${postId}`,
    icon: '/icons/icon-192x192.svg'
  };

  // 작성자 본인 제외하고 전체 알림 발송
  return await sendToAll(payload, [authorId], 'community_post');
}

/**
 * VAPID 공개키 반환
 */
function getVapidPublicKey() {
  return VAPID_PUBLIC_KEY || null;
}

/**
 * 푸시 서비스 활성화 여부
 */
function isEnabled() {
  return !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);
}

module.exports = {
  sendPush,
  sendToMember,
  sendToAll,
  notifyNewSchedule,
  notifyComment,
  notifyReservationConfirmed,
  notifyReservationAlmostFull,
  notifyWaitlistToConfirmed,
  notifyNewCommunityPost,
  getVapidPublicKey,
  isEnabled
};
