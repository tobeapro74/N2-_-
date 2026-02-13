/**
 * Vercel Cron Job - 예약 스케줄 자동 오픈
 * 매일 UTC 00:00 (KST 09:00)에 실행
 * open_at 시간이 도래한 pending 스케줄을 open으로 변경
 */

const { MongoClient } = require('mongodb');

const MONGODB_URI = process.env.MONGODB_URI;
const DB_NAME = process.env.MONGODB_DB_NAME || 'n2golf';

module.exports = async function handler(req, res) {
  // 환경 변수 검증
  if (!process.env.CRON_SECRET) {
    console.error('CRON_SECRET 환경 변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: 'CRON_SECRET 미설정' });
  }

  if (!MONGODB_URI) {
    console.error('MONGODB_URI 환경 변수가 설정되지 않았습니다.');
    return res.status(500).json({ error: 'MONGODB_URI 미설정' });
  }

  // Vercel Cron 인증 확인
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: '인증 실패' });
  }

  let client;
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    const now = new Date();

    // open_at이 현재 시간 이전이고 status가 pending인 스케줄 찾기
    const result = await db.collection('schedules').updateMany(
      {
        status: 'pending',
        open_at: { $lte: now.toISOString() }
      },
      {
        $set: {
          status: 'open',
          updated_at: now.toISOString()
        }
      }
    );

    const openedCount = result.modifiedCount;

    // 오픈된 스케줄이 있으면 푸시 알림 발송
    if (openedCount > 0) {
      const openedSchedules = await db.collection('schedules').find({
        status: 'open',
        open_at: { $lte: now.toISOString() }
      }).toArray();

      const golfCourses = await db.collection('golf_courses').find({}).toArray();

      // 오픈된 스케줄 정보 조합
      const scheduleInfos = openedSchedules.map(s => {
        const course = golfCourses.find(gc => gc.id === s.golf_course_id);
        return `${s.play_date} ${course?.name || ''}`;
      }).join(', ');

      // 푸시 알림 발송
      try {
        const webpush = require('web-push');
        const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
        const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;

        if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
          webpush.setVapidDetails(
            process.env.VAPID_EMAIL || 'mailto:admin@n2golf.com',
            VAPID_PUBLIC_KEY,
            VAPID_PRIVATE_KEY
          );

          const payload = JSON.stringify({
            title: '예약이 오픈되었습니다!',
            body: `${scheduleInfos} 예약이 시작되었습니다. 지금 신청하세요!`,
            url: '/reservations/available',
            icon: '/icons/icon-192x192.svg'
          });

          // 모든 구독자에게 푸시 발송
          const subscriptions = await db.collection('push_subscriptions').find({}).toArray();
          const pushResults = await Promise.allSettled(
            subscriptions.map(sub =>
              webpush.sendNotification({
                endpoint: sub.endpoint,
                keys: sub.keys
              }, payload).catch(() => null)
            )
          );

          const pushSuccess = pushResults.filter(r => r.status === 'fulfilled' && r.value !== null).length;
          console.log(`푸시 발송: ${pushSuccess}/${subscriptions.length} 성공`);
        }
      } catch (pushError) {
        console.error('푸시 알림 발송 오류:', pushError.message);
      }

      // 인앱 알림 저장 (전체 활성 회원)
      try {
        const members = await db.collection('members').find({ status: 'active' }).toArray();
        const notifNow = new Date().toISOString();

        const notifications = members.map(m => ({
          member_id: m.id,
          title: '예약이 오픈되었습니다!',
          body: `${scheduleInfos} 예약이 시작되었습니다. 지금 신청하세요!`,
          url: '/reservations/available',
          icon: '/icons/icon-192x192.svg',
          type: 'schedule_open',
          is_read: false,
          created_at: notifNow
        }));

        if (notifications.length > 0) {
          await db.collection('notifications').insertMany(notifications);
          console.log(`인앱 알림 저장: ${notifications.length}명`);
        }
      } catch (notifError) {
        console.error('인앱 알림 저장 오류:', notifError.message);
      }

      console.log(`스케줄 오픈 완료: ${openedSchedules.map(s => s.play_date).join(', ')}`);
    }

    return res.status(200).json({
      success: true,
      message: `${openedCount}개 스케줄 오픈 처리 완료`,
      executedAt: now.toISOString()
    });
  } catch (error) {
    console.error('Cron open-schedules 오류:', error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (client) {
      await client.close();
    }
  }
};
