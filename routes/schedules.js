const express = require('express');
const router = express.Router();
const db = require('../models/database');
const multer = require('multer');
const { optimizeCloudinaryUrl } = require('../utils/validator');
const pushService = require('../utils/pushService');
const { cacheManager, TTL } = require('../models/cache');
const crypto = require('crypto');

// ============================================
// Cloudinary 설정 (무료 플랜 우선 사용)
// ============================================
const cloudinary = require('cloudinary').v2;

// Cloudinary 설정 (환경 변수에서 읽음)
if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
  console.log('Cloudinary 설정 완료');
}

// Cloudinary 사용 가능 여부 확인
const isCloudinaryConfigured = () => {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
};

// 이미지를 Base64로 변환하여 MongoDB에 저장하는 헬퍼 함수
const imageToBase64 = (buffer, mimetype) => {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
};

// 이미지 업로드 설정 (메모리 스토리지로 변경)
const storage = multer.memoryStorage();

// 파일 필터 (이미지만 허용)
const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('이미지 파일만 업로드 가능합니다. (jpg, png, gif, webp)'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB 제한
  }
});

// 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// 관리자 권한 미들웨어
const requireAdmin = (req, res, next) => {
  if (!req.session.user || !req.session.user.is_admin) {
    return res.status(403).render('error', {
      title: '접근 거부',
      message: '관리자 권한이 필요합니다.'
    });
  }
  next();
};

// 일정 목록
router.get('/', requireAuth, async (req, res) => {
  try {
    const { year, month, course } = req.query;

    let schedules = await db.getTableAsync('schedules');
    const golfCourses = (await db.getTableAsync('golf_courses')).filter(gc => gc.is_active);
    const reservations = await db.getTableAsync('reservations');
    const comments = await db.getTableAsync('schedule_comments');

    if (year) {
      schedules = schedules.filter(s => s.play_date && s.play_date.startsWith(year));
    }
    if (month) {
      const monthStr = `${year || new Date().getFullYear()}-${String(month).padStart(2, '0')}`;
      schedules = schedules.filter(s => s.play_date && s.play_date.startsWith(monthStr));
    }
    if (course) {
      schedules = schedules.filter(s => s.golf_course_id === parseInt(course));
    }

    schedules = schedules
      .map(s => {
        const gc = golfCourses.find(g => g.id === s.golf_course_id) || {};
        const reserved_count = reservations.filter(
          r => r.schedule_id === s.id && ['pending', 'confirmed'].includes(r.status)
        ).length;
        const comment_count = comments.filter(c => c.schedule_id === s.id).length;
        return {
          ...s,
          course_name: gc.name,
          location: gc.location,
          max_members: s.max_members || 12,
          reserved_count,
          comment_count
        };
      })
      .sort((a, b) => (b.play_date || '').localeCompare(a.play_date || ''));

    res.render('schedules/list', {
      title: '일정 관리',
      currentPage: 'schedules',
      schedules,
      golfCourses,
      filters: { year, month, course },
      years: Array.from({ length: 3 }, (_, i) => new Date().getFullYear() + 1 - i)
    });
  } catch (error) {
    console.error('일정 목록 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 목록을 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 일정 생성 페이지
router.get('/new', requireAuth, requireAdmin, (req, res) => {
  const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);

  res.render('schedules/form', {
    title: '일정 생성',
    schedule: null,
    golfCourses,
    error: null
  });
});

// 일정 생성 처리
router.post('/new', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { golf_course_id, play_date, tee_times, max_members, notes, course } = req.body;

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    // 중복 일정 체크 (골프장 + 날짜 + 코스)
    const existing = db.getTable('schedules').find(
      s => s.golf_course_id === parseInt(golf_course_id)
        && s.play_date === play_date
        && (s.course || '') === (course || '')
    );

    if (existing) {
      const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);
      return res.render('schedules/form', {
        title: '일정 생성',
        schedule: req.body,
        golfCourses,
        error: '해당 날짜에 이미 일정이 있습니다.'
      });
    }

    const scheduleData = {
      golf_course_id: parseInt(golf_course_id),
      play_date,
      tee_times,
      max_members: parseInt(max_members) || 12,
      notes,
      status: 'open'
    };
    if (course) scheduleData.course = course;

    const scheduleId = await db.insert('schedules', scheduleData);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    // 알림 발송 (새 일정 등록)
    const golfCourse = db.getTable('golf_courses').find(gc => gc.id === parseInt(golf_course_id));
    if (golfCourse) {
      pushService.notifyNewSchedule({ id: scheduleId, play_date }, golfCourse)
        .catch(err => console.error('새 일정 알림 발송 오류:', err));
    }

    res.redirect('/schedules');
  } catch (error) {
    console.error('일정 생성 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 생성 중 오류가 발생했습니다.'
    });
  }
});

// 연간 일정 자동 생성 페이지
router.get('/generate', requireAuth, requireAdmin, (req, res) => {
  const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);

  res.render('schedules/generate', {
    title: '연간 일정 생성',
    golfCourses,
    year: new Date().getFullYear() + 1
  });
});

// 연간 일정 자동 생성 처리
router.post('/generate', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { year, courses } = req.body;
    const selectedCourses = Array.isArray(courses) ? courses : [courses];

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('golf_courses');
    }

    const golfCourses = db.getTable('golf_courses').filter(
      gc => selectedCourses.includes(String(gc.id))
    );

    let createdCount = 0;

    for (const course of golfCourses) {
      for (let month = 1; month <= 12; month++) {
        const playDate = getNthWeekday(parseInt(year), month, course.schedule_week, 6);

        if (playDate) {
          const existing = db.getTable('schedules').find(
            s => s.golf_course_id === course.id && s.play_date === playDate
          );

          if (!existing) {
            await db.insert('schedules', {
              golf_course_id: course.id,
              play_date: playDate,
              tee_times: course.tee_time_start,
              max_members: course.max_members || 12,
              status: 'open'
            });
            createdCount++;
          }
        }
      }
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect(`/schedules?year=${year}&message=created_${createdCount}`);
  } catch (error) {
    console.error('연간 일정 생성 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '연간 일정 생성 중 오류가 발생했습니다.'
    });
  }
});

// N번째 주 특정 요일 날짜 계산
function getNthWeekday(year, month, weekNum, dayOfWeek) {
  const firstDay = new Date(year, month - 1, 1);
  const firstDayOfWeek = firstDay.getDay();

  let date = 1 + ((dayOfWeek - firstDayOfWeek + 7) % 7) + (weekNum - 1) * 7;

  const lastDay = new Date(year, month, 0).getDate();
  if (date > lastDay) return null;

  const result = new Date(year, month - 1, date);
  return result.toISOString().split('T')[0];
}

// 일정 상세
router.get('/:id', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // MongoDB에서 직접 최신 데이터 조회 (병렬 처리 + projection으로 성능 향상)
    const [schedules, reservationsData, members] = await Promise.all([
      db.getTableAsync('schedules'),
      db.getTableAsync('reservations'),
      db.getTableAsync('members', { projection: { id: 1, name: 1, employee_id: 1, department: 1 } })
    ]);

    const schedule = schedules.find(s => s.id === scheduleId || s.id === parseInt(scheduleId));

    if (!schedule) {
      return res.status(404).render('error', {
        title: '일정 없음',
        message: '일정을 찾을 수 없습니다.'
      });
    }

    const golfCourse = db.findById('golf_courses', schedule.golf_course_id) || {};
    const allReservations = reservationsData.filter(r => r.schedule_id === scheduleId);

    const reservations = allReservations
      .map(r => {
        const member = members.find(m => m.id === r.member_id) || {};
        return {
          ...r,
          member_name: member.name,
          employee_id: member.employee_id,
          department: member.department
        };
      })
      .sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.applied_at || '').localeCompare(b.applied_at || '');
      });

    const myReservation = req.session.user ?
      reservations.find(r => r.member_id === req.session.user.id) : null;

    res.render('schedules/detail', {
      title: `일정 - ${golfCourse.name}`,
      schedule: {
        ...schedule,
        course_name: golfCourse.name,
        location: golfCourse.location,
        course_max: golfCourse.max_members
      },
      reservations,
      myReservation
    });
  } catch (error) {
    console.error('일정 상세 조회 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 정보를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 일정 수정 페이지
router.get('/:id/edit', requireAuth, requireAdmin, (req, res) => {
  const scheduleId = parseInt(req.params.id);
  const schedule = db.findById('schedules', scheduleId);

  if (!schedule) {
    return res.status(404).render('error', {
      title: '일정 없음',
      message: '일정을 찾을 수 없습니다.'
    });
  }

  const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);

  res.render('schedules/form', {
    title: '일정 수정',
    schedule,
    golfCourses,
    error: null
  });
});

// 일정 수정 처리
router.post('/:id/edit', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const { golf_course_id, play_date, tee_times, max_members, status, notes, course } = req.body;

    const updateData = {
      golf_course_id: parseInt(golf_course_id),
      play_date,
      tee_times,
      max_members: parseInt(max_members),
      status,
      notes
    };
    if (course) {
      updateData.course = course;
    } else {
      updateData.course = null;
    }

    await db.update('schedules', scheduleId, updateData);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect(`/schedules/${scheduleId}`);
  } catch (error) {
    console.error('일정 수정 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '일정 수정 중 오류가 발생했습니다.'
    });
  }
});

// 일정 삭제
router.post('/:id/delete', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    const hasReservations = db.getTable('reservations').some(r => r.schedule_id === scheduleId);

    if (hasReservations) {
      return res.status(400).json({ error: '예약이 있는 일정은 삭제할 수 없습니다.' });
    }

    await db.delete('schedules', scheduleId);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.redirect('/schedules');
  } catch (error) {
    console.error('일정 삭제 오류:', error);
    res.status(500).json({ error: '일정 삭제 중 오류가 발생했습니다.' });
  }
});

// 일정 상태 일괄 변경 (날짜 범위 지정 가능)
router.post('/bulk-update-status', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { fromDate, toDate, status } = req.body;

    if (!fromDate || !status) {
      return res.status(400).json({ error: '시작 날짜와 상태를 입력해주세요.' });
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    // 날짜 범위 필터링 (toDate가 있으면 범위, 없으면 fromDate 이후 전체)
    const schedules = db.getTable('schedules').filter(s => {
      if (!s.play_date) return false;
      if (s.play_date < fromDate) return false;
      if (toDate && s.play_date > toDate) return false;
      return true;
    });
    let updatedCount = 0;

    for (const schedule of schedules) {
      await db.update('schedules', schedule.id, { status });
      updatedCount++;
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    const dateRange = toDate ? `${fromDate} ~ ${toDate}` : `${fromDate} 이후`;
    res.json({
      success: true,
      message: `${dateRange} ${updatedCount}개 일정이 '${status}' 상태로 변경되었습니다.`
    });
  } catch (error) {
    console.error('일정 일괄 변경 오류:', error);
    res.status(500).json({ error: '일정 일괄 변경 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 커뮤니티 기능 (댓글, 좋아요/싫어요)
// ============================================

// 커뮤니티 페이지
router.get('/:id/community', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('schedule_comments');
    }

    const schedule = db.findById('schedules', scheduleId);

    if (!schedule) {
      return res.status(404).render('error', {
        title: '일정 없음',
        message: '일정을 찾을 수 없습니다.'
      });
    }

    const golfCourse = db.findById('golf_courses', schedule.golf_course_id) || {};

    res.render('schedules/community', {
      title: `커뮤니티 - ${golfCourse.name}`,
      schedule: {
        ...schedule,
        course_name: golfCourse.name,
        location: golfCourse.location
      },
      cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME || ''
    });
  } catch (error) {
    console.error('커뮤니티 페이지 오류:', error);
    res.status(500).render('error', {
      title: '오류',
      message: '커뮤니티 페이지를 불러오는 중 오류가 발생했습니다.'
    });
  }
});

// 댓글 목록 조회 API
router.get('/:id/comments', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const userId = req.session.user.id;

    // MongoDB에서 직접 최신 데이터 조회 (병렬 처리 + projection으로 성능 향상)
    const [allCommentsData, reactions, members] = await Promise.all([
      db.getTableAsync('schedule_comments'),
      db.getTableAsync('comment_reactions'),
      db.getTableAsync('members', { projection: { id: 1, name: 1 } }) // 필요한 필드만 조회
    ]);
    const allComments = allCommentsData.filter(c => c.schedule_id === scheduleId);

    // 댓글에 추가 정보 붙이기
    const enrichComment = (comment) => {
      const member = members.find(m => m.id === comment.member_id) || {};
      const commentReactions = reactions.filter(r => r.comment_id === comment.id);
      const likes = commentReactions.filter(r => r.reaction_type === 'like').length;
      const dislikes = commentReactions.filter(r => r.reaction_type === 'dislike').length;
      const myReaction = commentReactions.find(r => r.member_id === userId);

      return {
        ...comment,
        image_url: optimizeCloudinaryUrl(comment.image_url), // Cloudinary URL 최적화
        member_name: member.name || '알 수 없음',
        likes,
        dislikes,
        my_reaction: myReaction ? myReaction.reaction_type : null,
        is_mine: comment.member_id === userId,
        is_admin: req.session.user.is_admin
      };
    };

    // 부모 댓글 (parent_id가 null인 것)
    const parentComments = allComments
      .filter(c => !c.parent_id)
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

    // 각 부모 댓글에 대댓글 추가
    const commentsWithReplies = parentComments.map(parent => {
      const replies = allComments
        .filter(c => c.parent_id === parent.id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map(enrichComment);

      return {
        ...enrichComment(parent),
        replies
      };
    });

    res.json({ comments: commentsWithReplies });
  } catch (error) {
    console.error('댓글 목록 조회 오류:', error);
    res.status(500).json({ error: '댓글을 불러오는 중 오류가 발생했습니다.' });
  }
});

// 댓글 작성 API
router.post('/:id/comments', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const { content, parent_id, image_url } = req.body;
    const userId = req.session.user.id;

    // 텍스트나 이미지 중 하나라도 있어야 함
    if ((!content || !content.trim()) && !image_url) {
      return res.status(400).json({ error: '댓글 내용을 입력하거나 이미지를 첨부해주세요.' });
    }

    // 일정 존재 확인
    const schedule = db.findById('schedules', scheduleId);
    if (!schedule) {
      return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    }

    // 대댓글인 경우 부모 댓글 확인
    if (parent_id) {
      const parentComment = db.findById('schedule_comments', parseInt(parent_id));
      if (!parentComment || parentComment.schedule_id !== scheduleId) {
        return res.status(400).json({ error: '부모 댓글을 찾을 수 없습니다.' });
      }
      // 대댓글에 대댓글은 불가 (1단계만)
      if (parentComment.parent_id) {
        return res.status(400).json({ error: '대댓글에는 답글을 달 수 없습니다.' });
      }
    }

    const commentData = {
      schedule_id: scheduleId,
      member_id: userId,
      parent_id: parent_id ? parseInt(parent_id) : null,
      content: content ? content.trim() : ''
    };

    // 이미지 URL이 있으면 추가
    if (image_url) {
      commentData.image_url = image_url;
      console.log('댓글에 이미지 첨부:', image_url.substring(0, 100) + '...');
    }

    console.log('댓글 데이터 저장:', { ...commentData, image_url: commentData.image_url ? '있음' : '없음' });
    const newId = await db.insert('schedule_comments', commentData);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedule_comments');
    }

    // 알림 발송 (댓글 알림)
    const commenterName = req.session.user.name;
    const url = `/schedules/${scheduleId}/community#comment-${newId}`;

    if (parent_id) {
      // 대댓글인 경우: 부모 댓글 작성자에게 알림
      const parentComment = db.findById('schedule_comments', parseInt(parent_id));
      if (parentComment && parentComment.member_id !== userId) {
        pushService.notifyComment(parentComment.member_id, commenterName, 'comment', url)
          .catch(err => console.error('댓글 알림 오류:', err));
      }
    }
    // 참고: 게시글(일정)에 댓글이 달렸을 때는 일정 작성자(관리자)에게 알림 가능
    // 현재는 일정은 관리자가 만들므로 생략

    res.json({ success: true, id: newId, message: '댓글이 등록되었습니다.' });
  } catch (error) {
    console.error('댓글 작성 오류:', error);
    res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' });
  }
});

// 댓글 수정 API
router.put('/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const { content } = req.body;
    const userId = req.session.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }

    // MongoDB에서 직접 조회 (서버리스 캐시 불일치 방지)
    const comments = await db.getTableAsync('schedule_comments');
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    // 작성자 또는 관리자만 수정 가능
    if (comment.member_id !== userId && !req.session.user.is_admin) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    await db.update('schedule_comments', commentId, {
      content: content.trim()
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedule_comments');
    }

    res.json({ success: true, message: '댓글이 수정되었습니다.' });
  } catch (error) {
    console.error('댓글 수정 오류:', error);
    res.status(500).json({ error: '댓글 수정 중 오류가 발생했습니다.' });
  }
});

// 댓글 삭제 API
router.delete('/comments/:commentId', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const userId = req.session.user.id;

    // MongoDB에서 직접 조회 (서버리스 캐시 불일치 방지)
    const allComments = await db.getTableAsync('schedule_comments');
    const comment = allComments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    // 작성자 또는 관리자만 삭제 가능
    if (comment.member_id !== userId && !req.session.user.is_admin) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    // 리액션 데이터도 직접 조회
    const allReactions = await db.getTableAsync('comment_reactions');

    // 대댓글도 함께 삭제
    const replies = allComments.filter(c => c.parent_id === commentId);
    for (const reply of replies) {
      // 대댓글의 리액션 삭제
      const replyReactions = allReactions.filter(r => r.comment_id === reply.id);
      for (const reaction of replyReactions) {
        await db.delete('comment_reactions', reaction.id);
      }
      await db.delete('schedule_comments', reply.id);
    }

    // 댓글의 리액션 삭제
    const commentReactions = allReactions.filter(r => r.comment_id === commentId);
    for (const reaction of commentReactions) {
      await db.delete('comment_reactions', reaction.id);
    }

    // 댓글 삭제
    await db.delete('schedule_comments', commentId);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedule_comments');
      await db.refreshCache('comment_reactions');
    }

    res.json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error);
    res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' });
  }
});

// 좋아요/싫어요 토글 API
router.post('/comments/:commentId/reaction', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.commentId);
    const { reaction_type } = req.body;
    const userId = req.session.user.id;

    if (!['like', 'dislike'].includes(reaction_type)) {
      return res.status(400).json({ error: '올바르지 않은 반응 타입입니다.' });
    }

    // MongoDB에서 직접 조회 (서버리스 캐시 불일치 방지)
    const comments = await db.getTableAsync('schedule_comments');
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    // 리액션 데이터 직접 조회
    const allReactions = await db.getTableAsync('comment_reactions');

    // 기존 반응 확인
    const existingReaction = allReactions.find(
      r => r.comment_id === commentId && r.member_id === userId
    );

    if (existingReaction) {
      if (existingReaction.reaction_type === reaction_type) {
        // 같은 반응 클릭 시 제거 (토글)
        await db.delete('comment_reactions', existingReaction.id);
      } else {
        // 다른 반응 클릭 시 변경
        await db.update('comment_reactions', existingReaction.id, {
          reaction_type
        });
      }
    } else {
      // 새 반응 추가
      await db.insert('comment_reactions', {
        comment_id: commentId,
        member_id: userId,
        reaction_type
      });
    }

    // 업데이트된 카운트 반환 (직접 조회)
    const updatedReactions = await db.getTableAsync('comment_reactions');
    const reactions = updatedReactions.filter(r => r.comment_id === commentId);
    const likes = reactions.filter(r => r.reaction_type === 'like').length;
    const dislikes = reactions.filter(r => r.reaction_type === 'dislike').length;
    const myReaction = reactions.find(r => r.member_id === userId);

    res.json({
      success: true,
      likes,
      dislikes,
      my_reaction: myReaction ? myReaction.reaction_type : null
    });
  } catch (error) {
    console.error('반응 처리 오류:', error);
    res.status(500).json({ error: '반응 처리 중 오류가 발생했습니다.' });
  }
});

// 팀 배정
router.post('/:id/assign-teams', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('reservations');
    }

    const schedule = db.findById('schedules', scheduleId);

    if (!schedule) {
      return res.status(404).json({ error: '일정을 찾을 수 없습니다.' });
    }

    // 활성 상태(pending, confirmed)인 예약만 필터링
    const reservations = db.getTable('reservations')
      .filter(r => r.schedule_id === scheduleId && ['pending', 'confirmed'].includes(r.status))
      .sort((a, b) => {
        // 우선순위 정렬: priority 낮은 순 → 신청시간 빠른 순
        if (a.priority !== b.priority) return a.priority - b.priority;
        return (a.applied_at || '').localeCompare(b.applied_at || '');
      });

    const teeTimes = schedule.tee_times ? schedule.tee_times.split(',').map(t => t.trim()) : ['06:00', '06:08', '06:16'];
    const maxMembers = schedule.max_members || 12;
    const maxPerTeam = 4;

    // 각 티타임(팀)별 현재 배정 인원 추적
    const teamSlots = {};
    teeTimes.forEach((time, idx) => {
      teamSlots[idx + 1] = { teeTime: time, count: 0, members: [] };
    });

    // 희망 티타임별로 예약자 그룹화
    const preferredGroups = {};
    teeTimes.forEach(time => {
      preferredGroups[time] = [];
    });
    preferredGroups['none'] = []; // 희망 티타임 없는 경우

    reservations.forEach(r => {
      const preferred = r.preferred_tee_time;
      if (preferred && preferredGroups[preferred]) {
        preferredGroups[preferred].push(r);
      } else {
        preferredGroups['none'].push(r);
      }
    });

    // 배정 결과 저장
    const assignments = [];

    // 1단계: 희망 티타임에 맞춰 배정 (각 티타임 4명까지)
    teeTimes.forEach((time, teamIdx) => {
      const teamNumber = teamIdx + 1;
      const preferred = preferredGroups[time] || [];

      preferred.forEach(r => {
        // 해당 티타임에 자리가 있으면 배정
        if (teamSlots[teamNumber].count < maxPerTeam) {
          assignments.push({
            reservation: r,
            teamNumber,
            teeTime: time,
            assigned: true
          });
          teamSlots[teamNumber].count++;
        } else {
          // 자리가 없으면 나중에 다음 티타임으로 밀기 위해 표시
          assignments.push({
            reservation: r,
            preferredTeam: teamNumber,
            teeTime: null,
            assigned: false
          });
        }
      });
    });

    // 희망 티타임 없는 예약자도 미배정으로 추가
    preferredGroups['none'].forEach(r => {
      assignments.push({
        reservation: r,
        preferredTeam: null,
        teeTime: null,
        assigned: false
      });
    });

    // 2단계: 미배정된 예약자를 다음 빈 팀으로 밀기
    // 희망 티타임 기준으로 정렬 (늦게 신청한 사람이 먼저 밀림)
    const unassigned = assignments
      .filter(a => !a.assigned)
      .sort((a, b) => {
        // 희망 티타임이 있는 경우 해당 티타임 순서대로
        const aTeam = a.preferredTeam || 1;
        const bTeam = b.preferredTeam || 1;
        if (aTeam !== bTeam) return aTeam - bTeam;
        // 같은 희망 티타임이면 늦게 신청한 사람이 뒤로
        return (a.reservation.applied_at || '').localeCompare(b.reservation.applied_at || '');
      });

    unassigned.forEach(item => {
      // 희망 티타임부터 시작하여 빈 자리 찾기
      const startTeam = item.preferredTeam || 1;

      // 희망 티타임 이후의 팀부터 검색
      for (let teamNum = startTeam; teamNum <= teeTimes.length; teamNum++) {
        if (teamSlots[teamNum].count < maxPerTeam) {
          item.teamNumber = teamNum;
          item.teeTime = teeTimes[teamNum - 1];
          item.assigned = true;
          teamSlots[teamNum].count++;
          break;
        }
      }

      // 희망 티타임 이후에 자리가 없으면 처음부터 검색
      if (!item.assigned) {
        for (let teamNum = 1; teamNum < startTeam; teamNum++) {
          if (teamSlots[teamNum].count < maxPerTeam) {
            item.teamNumber = teamNum;
            item.teeTime = teeTimes[teamNum - 1];
            item.assigned = true;
            teamSlots[teamNum].count++;
            break;
          }
        }
      }
    });

    // 3단계: DB 업데이트
    let confirmedCount = 0;
    for (const item of assignments) {
      if (item.assigned) {
        const status = confirmedCount < maxMembers ? 'confirmed' : 'waitlist';
        await db.update('reservations', item.reservation.id, {
          team_number: item.teamNumber,
          tee_time: item.teeTime,
          status
        });
        confirmedCount++;
      }
    }

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: `${reservations.length}명의 팀이 배정되었습니다. (희망 티타임 우선 적용)` });
  } catch (error) {
    console.error('팀 배정 오류:', error);
    res.status(500).json({ error: '팀 배정 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 이미지 업로드 API (Cloudinary 우선, MongoDB 폴백)
// ============================================

// 댓글 이미지 업로드
router.post('/comments/upload-image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    }

    let imageUrl = null;
    let storageType = null;

    // 1. Cloudinary 시도 (환경 변수가 설정된 경우)
    console.log('Cloudinary 환경변수 확인:', {
      CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME ? '설정됨' : '없음',
      API_KEY: process.env.CLOUDINARY_API_KEY ? '설정됨' : '없음',
      API_SECRET: process.env.CLOUDINARY_API_SECRET ? '설정됨' : '없음',
      isConfigured: isCloudinaryConfigured()
    });

    if (isCloudinaryConfigured()) {
      try {
        // Buffer를 base64 data URI로 변환하여 업로드
        const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        const result = await cloudinary.uploader.upload(base64Data, {
          folder: 'n2golf/comments',
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' }, // 최대 크기 제한
            { quality: 'auto:good', fetch_format: 'auto' } // 자동 품질 및 포맷(WebP/AVIF) 최적화
          ]
        });

        imageUrl = result.secure_url;
        storageType = 'cloudinary';
        console.log('Cloudinary 업로드 성공:', result.public_id);
      } catch (cloudinaryError) {
        // Cloudinary 용량 초과 또는 에러 시 MongoDB 폴백
        console.warn('Cloudinary 업로드 실패, MongoDB로 폴백:', cloudinaryError.message);
      }
    }

    // 2. Cloudinary 실패 시 MongoDB에 Base64로 저장
    if (!imageUrl) {
      // 이미지 크기가 너무 크면 거부 (MongoDB 문서 크기 제한 고려)
      if (req.file.size > 2 * 1024 * 1024) {
        return res.status(400).json({
          error: '이미지 저장소가 가득 찼습니다. 2MB 이하의 이미지만 업로드 가능합니다.'
        });
      }

      // Base64 Data URI로 변환
      imageUrl = imageToBase64(req.file.buffer, req.file.mimetype);
      storageType = 'mongodb';
      console.log('MongoDB Base64 저장 (크기:', Math.round(req.file.size / 1024), 'KB)');
    }

    res.json({
      success: true,
      imageUrl: imageUrl,
      storageType: storageType
    });
  } catch (error) {
    console.error('이미지 업로드 오류:', error);
    res.status(500).json({ error: '이미지 업로드 중 오류가 발생했습니다.' });
  }
});

// ============================================
// URL 메타데이터 조회 API (Open Graph)
// 캐싱: 1시간 TTL로 동일 URL 재요청 방지
// ============================================
router.post('/url-preview', requireAuth, async (req, res) => {
  try {
    const { url } = req.body;

    if (!url) {
      return res.status(400).json({ error: 'URL이 필요합니다.' });
    }

    // URL 유효성 검사
    let targetUrl = url;
    if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
      targetUrl = 'https://' + targetUrl;
    }

    // 캐시 키 생성 (URL 해시)
    const urlHash = crypto.createHash('md5').update(targetUrl).digest('hex').substring(0, 16);
    const cacheKey = `url_preview_${urlHash}`;

    // 캐시 확인
    const cached = cacheManager.get(cacheKey);
    if (cached) {
      console.log(`[URL Preview] 캐시 히트: ${targetUrl.substring(0, 50)}...`);
      return res.json({ ...cached, cached: true });
    }

    // 유튜브 URL 특별 처리 (서버에서 봇 차단하므로 썸네일 URL 직접 생성)
    // 일반 영상, 쇼츠, 공유 링크, 임베드 모두 지원
    const youtubeMatch = targetUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/);
    if (youtubeMatch) {
      const videoId = youtubeMatch[1];
      return res.json({
        success: true,
        data: {
          url: `https://www.youtube.com/watch?v=${videoId}`,
          title: 'YouTube 동영상',
          description: '',
          image: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
          siteName: 'YouTube'
        }
      });
    }

    // 틱톡 URL 특별 처리 (oEmbed API 사용)
    // 지원 형식: tiktok.com/@user/video/123, tiktok.com/t/ABC, vm.tiktok.com/ABC
    const tiktokMatch = targetUrl.match(/(?:tiktok\.com|vm\.tiktok\.com)/);
    if (tiktokMatch) {
      try {
        // oEmbed API로 실제 썸네일 가져오기
        const oembedUrl = `https://www.tiktok.com/oembed?url=${encodeURIComponent(targetUrl)}`;
        const oembedResponse = await fetch(oembedUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0' }
        });
        if (oembedResponse.ok) {
          const oembedData = await oembedResponse.json();
          return res.json({
            success: true,
            data: {
              url: targetUrl,
              title: oembedData.title || 'TikTok 동영상',
              description: `@${oembedData.author_unique_id || oembedData.author_name || ''}의 TikTok`,
              image: oembedData.thumbnail_url || 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/TikTok_logo.svg/200px-TikTok_logo.svg.png',
              siteName: 'TikTok'
            }
          });
        }
      } catch (e) {
        // oEmbed 실패 시 기본 로고 사용
      }
      return res.json({
        success: true,
        data: {
          url: targetUrl,
          title: 'TikTok 동영상',
          description: 'TikTok에서 공유된 동영상',
          image: 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a9/TikTok_logo.svg/200px-TikTok_logo.svg.png',
          siteName: 'TikTok'
        }
      });
    }

    // 인스타그램 URL 특별 처리 (서버에서 봇 차단)
    const instagramMatch = targetUrl.match(/instagram\.com\/(p|reel|reels)\/([A-Za-z0-9_-]+)/);
    if (instagramMatch) {
      return res.json({
        success: true,
        data: {
          url: targetUrl,
          title: 'Instagram 게시물',
          description: instagramMatch[1] === 'reel' || instagramMatch[1] === 'reels' ? 'Instagram 릴스' : 'Instagram 게시물',
          image: 'https://static.cdninstagram.com/rsrc.php/v3/yR/r/lam-fZmwmvn.png',
          siteName: 'Instagram'
        }
      });
    }

    // 페이스북 URL 특별 처리 (서버에서 봇 차단)
    const facebookMatch = targetUrl.match(/facebook\.com|fb\.watch/);
    if (facebookMatch) {
      return res.json({
        success: true,
        data: {
          url: targetUrl,
          title: 'Facebook 게시물',
          description: 'Facebook에서 공유된 콘텐츠',
          image: 'https://static.xx.fbcdn.net/rsrc.php/y1/r/4lCu2zih0ca.svg',
          siteName: 'Facebook'
        }
      });
    }

    // 쓰레드(Threads) URL 특별 처리 (서버에서 봇 차단)
    // 지원 형식: threads.net/@user/post/ID, threads.net/@user
    const threadsMatch = targetUrl.match(/threads\.net\/@([^\/]+)/);
    if (threadsMatch) {
      return res.json({
        success: true,
        data: {
          url: targetUrl,
          title: 'Threads 게시물',
          description: `@${threadsMatch[1]}의 Threads`,
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9d/Threads_%28app%29_logo.svg/200px-Threads_%28app%29_logo.svg.png',
          siteName: 'Threads'
        }
      });
    }

    // X(트위터) URL 특별 처리 (서버에서 봇 차단)
    const twitterMatch = targetUrl.match(/(?:twitter\.com|x\.com)\/([^\/]+)\/status\/(\d+)/);
    if (twitterMatch) {
      return res.json({
        success: true,
        data: {
          url: targetUrl,
          title: 'X 게시물',
          description: `@${twitterMatch[1]}의 게시물`,
          image: 'https://abs.twimg.com/responsive-web/client-web/icon-ios.77d25eba.png',
          siteName: 'X'
        }
      });
    }

    // fetch로 HTML 가져오기 (리다이렉트 따라가기)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000); // 8초 타임아웃 (리다이렉트 고려)

    const fetchOptions = {
      signal: controller.signal,
      redirect: 'follow',  // 리다이렉트 자동 따라가기
      headers: {
        // 브라우저 User-Agent 사용 (일부 사이트가 봇 차단)
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    };

    let response = await fetch(targetUrl, fetchOptions);

    // 리다이렉트된 경우 최종 URL 사용
    if (response.url && response.url !== targetUrl) {
      targetUrl = response.url;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({ success: false, error: '페이지를 가져올 수 없습니다.' });
    }

    const html = await response.text();

    // Open Graph 및 기본 메타태그 파싱 (다양한 형식 지원)
    const getMetaContent = (html, property) => {
      // 정규식 패턴들 (다양한 HTML 형식 대응)
      const patterns = [
        // og:property 형식 (property가 앞)
        new RegExp(`<meta[^>]*property\\s*=\\s*["']?og:${property}["']?[^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
        // og:property 형식 (content가 앞)
        new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*property\\s*=\\s*["']?og:${property}["']?`, 'i'),
        // twitter:property 형식
        new RegExp(`<meta[^>]*name\\s*=\\s*["']?twitter:${property}["']?[^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*name\\s*=\\s*["']?twitter:${property}["']?`, 'i'),
        // itemprop 형식 (일부 사이트)
        new RegExp(`<meta[^>]*itemprop\\s*=\\s*["']?${property}["']?[^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }

      return null;
    };

    // title 태그
    const getTitleTag = (html) => {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return match ? match[1].trim() : null;
    };

    // description 메타태그
    const getDescription = (html) => {
      let match = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
      if (match) return match[1];
      match = html.match(/<meta[^>]*content=["']([^"']+)["'][^>]*name=["']description["']/i);
      return match ? match[1] : null;
    };

    const title = getMetaContent(html, 'title') || getTitleTag(html) || '';
    const description = getMetaContent(html, 'description') || getDescription(html) || '';
    let image = getMetaContent(html, 'image') || '';
    const siteName = getMetaContent(html, 'site_name') || new URL(targetUrl).hostname;

    // 상대 경로 이미지를 절대 경로로 변환
    if (image && !image.startsWith('http')) {
      const urlObj = new URL(targetUrl);
      image = image.startsWith('/')
        ? `${urlObj.protocol}//${urlObj.host}${image}`
        : `${urlObj.protocol}//${urlObj.host}/${image}`;
    }

    const result = {
      success: true,
      data: {
        url: targetUrl,
        title: title.substring(0, 100),
        description: description.substring(0, 200),
        image,
        siteName
      }
    };

    // 캐시 저장 (1시간)
    cacheManager.set(cacheKey, result, TTL.ONE_HOUR);
    console.log(`[URL Preview] 캐시 저장: ${targetUrl.substring(0, 50)}... (TTL: 1시간)`);

    res.json(result);
  } catch (error) {
    console.error('URL 미리보기 오류:', error.message);
    res.json({ success: false, error: '미리보기를 가져올 수 없습니다.' });
  }
});

// ============================================
// 라운딩 결과 기능
// ============================================

// 라운딩 결과 페이지
router.get('/:id/results', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);

    const [schedules, members] = await Promise.all([
      db.getTableAsync('schedules'),
      db.getTableAsync('members', { projection: { id: 1, name: 1, department: 1, gender: 1 } })
    ]);

    const schedule = schedules.find(s => s.id === scheduleId);
    if (!schedule) {
      return res.status(404).render('error', { title: '일정 없음', message: '일정을 찾을 수 없습니다.' });
    }

    const golfCourse = db.findById('golf_courses', schedule.golf_course_id) || {};

    // 라운딩 결과 조회
    const allResults = await db.getTableAsync('round_results');
    const results = allResults
      .filter(r => r.schedule_id === scheduleId)
      .map(r => {
        const member = members.find(m => m.id === r.member_id) || {};
        return { ...r, member_name: member.name || r.name, gender: r.gender || member.gender || '', department: member.department };
      })
      .sort((a, b) => a.rank - b.rank);

    res.render('schedules/results', {
      title: `라운딩 결과 - ${golfCourse.name}`,
      schedule: {
        ...schedule,
        course_name: golfCourse.name,
        location: golfCourse.location
      },
      results
    });
  } catch (error) {
    console.error('라운딩 결과 조회 오류:', error);
    res.status(500).render('error', { title: '오류', message: '라운딩 결과를 불러오는 중 오류가 발생했습니다.' });
  }
});

// 라운딩 결과 데이터 API (JSON)
router.get('/:id/results/data', requireAuth, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const allResults = await db.getTableAsync('round_results');
    const members = await db.getTableAsync('members', { projection: { id: 1, name: 1, gender: 1 } });

    const results = allResults
      .filter(r => r.schedule_id === scheduleId)
      .map(r => {
        const member = members.find(m => m.id === r.member_id) || {};
        return { ...r, member_name: member.name, gender: member.gender };
      })
      .sort((a, b) => a.rank - b.rank);

    res.json({ success: true, results });
  } catch (error) {
    console.error('라운딩 결과 데이터 조회 오류:', error);
    res.status(500).json({ error: '결과 데이터를 불러올 수 없습니다.' });
  }
});

// 라운딩 결과 수동 등록 API (관리자)
router.post('/:id/results', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const { results } = req.body; // [{member_name, score, peoria_hd, peoria_score, birdies, pars, bogeys, doubles, rank, gender}]

    if (!results || !Array.isArray(results) || results.length === 0) {
      return res.status(400).json({ error: '결과 데이터가 필요합니다.' });
    }

    const members = await db.getTableAsync('members');

    // 기존 결과 삭제
    const existingResults = await db.getTableAsync('round_results');
    const toDelete = existingResults.filter(r => r.schedule_id === scheduleId);
    for (const r of toDelete) {
      await db.delete('round_results', r.id);
    }

    // 결과 등록
    let savedCount = 0;
    for (const r of results) {
      const member = members.find(m => m.name === r.member_name);
      if (!member) continue;

      await db.insert('round_results', {
        schedule_id: scheduleId,
        member_id: member.id,
        rank: parseInt(r.rank) || 0,
        score: parseInt(r.score) || 0,
        gender: r.gender || member.gender || '',
        peoria_name: r.peoria_name || '',
        peoria_hd: parseFloat(r.peoria_hd) || 0,
        peoria_score: parseFloat(r.peoria_score) || 0,
        birdies: parseInt(r.birdies) || 0,
        pars: parseInt(r.pars) || 0,
        bogeys: parseInt(r.bogeys) || 0,
        doubles: parseInt(r.doubles) || 0
      });
      savedCount++;
    }

    // 일정 상태 및 결과 플래그 설정
    await db.update('schedules', scheduleId, { has_result: true, status: 'completed' });

    // 참가자 예약 자동 동기화 (예약 없는 참가자도 confirmed로 생성)
    const existingReservations = await db.getTableAsync('reservations');
    for (const r of results) {
      const member = members.find(m => m.name === r.member_name);
      if (!member) continue;
      const alreadyReserved = existingReservations.find(
        rv => Number(rv.schedule_id) === scheduleId && Number(rv.member_id) === member.id
      );
      if (!alreadyReserved) {
        await db.insert('reservations', {
          schedule_id: scheduleId,
          member_id: member.id,
          status: 'confirmed'
        });
      }
    }

    if (db.refreshCache) {
      await db.refreshCache('round_results');
      await db.refreshCache('schedules');
      await db.refreshCache('reservations');
    }

    res.json({ success: true, message: `${savedCount}명의 라운딩 결과가 등록되었습니다.` });
  } catch (error) {
    console.error('라운딩 결과 등록 오류:', error);
    res.status(500).json({ error: '라운딩 결과 등록 중 오류가 발생했습니다.' });
  }
});

// 결과표 사진 OCR (Claude Vision API)
router.post('/:id/results/ocr', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    }

    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
    if (!ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'ANTHROPIC_API_KEY가 설정되지 않았습니다.' });
    }

    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    // 회원 이름 목록을 가져와서 OCR 정확도 향상
    const members = await db.getTableAsync('members');
    const memberNames = members
      .filter(m => m.status === 'active' && !m.is_admin)
      .map(m => m.name)
      .join(', ');

    // 이미지를 base64로 변환
    const base64Image = req.file.buffer.toString('base64');
    const mediaType = req.file.mimetype;

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      messages: [{
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: mediaType, data: base64Image }
          },
          {
            type: 'text',
            text: `이 골프 라운딩 결과표 사진을 분석해서 JSON 형식으로 반환해주세요.

중요: 이름은 반드시 아래 회원 목록에서 가장 유사한 이름으로 매칭해주세요.
회원 목록: ${memberNames}

각 테이블 섹션별로 데이터를 추출해주세요:

1. "ranking" - 순위표 (순위, 성별, 이름, 스코어)
2. "peoria" - 신(더블)페리오 (이름, HD, 점수)
3. "birdies" - 버디 (이름, 개수)
4. "pars" - 파 (이름, 개수)
5. "bogeys" - 보기 (이름, 개수)
6. "doubles" - 더블 (이름, 개수)

JSON 형식 (다른 텍스트 없이 JSON만 반환):
{
  "ranking": [{"rank": 1, "gender": "남", "name": "홍길동", "score": 86}, ...],
  "peoria": [{"name": "홍길동", "hd": 14.4, "score": 72.6}, ...],
  "birdies": [{"name": "홍길동", "count": 1}, ...],
  "pars": [{"name": "홍길동", "count": 7}, ...],
  "bogeys": [{"name": "홍길동", "count": 11}, ...],
  "doubles": [{"name": "홍길동", "count": 9}, ...]
}`
          }
        ]
      }]
    });

    // Claude 응답에서 JSON 추출
    let responseText = message.content[0].text;

    // JSON 블록 추출 (```json ... ``` 형식 대응)
    const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      responseText = jsonMatch[1].trim();
    }

    let ocrData;
    try {
      ocrData = JSON.parse(responseText);
    } catch (parseError) {
      console.error('OCR JSON 파싱 오류:', responseText);
      return res.status(400).json({
        error: 'OCR 결과를 파싱할 수 없습니다. 다시 시도해주세요.',
        raw: responseText
      });
    }

    // 이름 유사도 매칭 (레벤슈타인 거리 기반)
    const memberNameList = members.filter(m => m.status === 'active' && !m.is_admin).map(m => m.name);

    function levenshtein(a, b) {
      const m = a.length, n = b.length;
      const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
      for (let i = 0; i <= m; i++) dp[i][0] = i;
      for (let j = 0; j <= n; j++) dp[0][j] = j;
      for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
          dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
        }
      }
      return dp[m][n];
    }

    function matchName(ocrName) {
      if (!ocrName) return ocrName;
      // 정확히 일치하면 바로 반환
      if (memberNameList.includes(ocrName)) return ocrName;
      // 유사도 매칭
      let bestMatch = ocrName;
      let bestDist = Infinity;
      for (const name of memberNameList) {
        const dist = levenshtein(ocrName, name);
        if (dist < bestDist) {
          bestDist = dist;
          bestMatch = name;
        }
      }
      // 거리가 2 이하면 매칭 (3글자 이름에서 1~2글자 오차 허용)
      return bestDist <= 2 ? bestMatch : ocrName;
    }

    // OCR 결과의 모든 이름을 DB 회원 이름으로 매칭
    if (ocrData.ranking) ocrData.ranking.forEach(r => { r.name = matchName(r.name); });
    if (ocrData.peoria) ocrData.peoria.forEach(r => { r.name = matchName(r.name); });
    if (ocrData.birdies) ocrData.birdies.forEach(r => { r.name = matchName(r.name); });
    if (ocrData.pars) ocrData.pars.forEach(r => { r.name = matchName(r.name); });
    if (ocrData.bogeys) ocrData.bogeys.forEach(r => { r.name = matchName(r.name); });
    if (ocrData.doubles) ocrData.doubles.forEach(r => { r.name = matchName(r.name); });

    // OCR 데이터를 통합 결과로 변환
    const mergedResults = [];
    if (ocrData.ranking) {
      for (const r of ocrData.ranking) {
        const entry = {
          rank: r.rank,
          gender: r.gender || '',
          member_name: r.name,
          score: r.score,
          peoria_name: '',
          peoria_hd: 0,
          peoria_score: 0,
          birdies: 0,
          pars: 0,
          bogeys: 0,
          doubles: 0
        };

        // 페리오 매칭
        const peoria = (ocrData.peoria || []).find(p => p.name === r.name);
        if (peoria) {
          entry.peoria_name = peoria.name;
          entry.peoria_hd = peoria.hd;
          entry.peoria_score = peoria.score;
        }

        // 버디 매칭
        const birdie = (ocrData.birdies || []).find(b => b.name === r.name);
        if (birdie) entry.birdies = birdie.count;

        // 파 매칭
        const par = (ocrData.pars || []).find(p => p.name === r.name);
        if (par) entry.pars = par.count;

        // 보기 매칭
        const bogey = (ocrData.bogeys || []).find(b => b.name === r.name);
        if (bogey) entry.bogeys = bogey.count;

        // 더블 매칭
        const double = (ocrData.doubles || []).find(d => d.name === r.name);
        if (double) entry.doubles = double.count;

        mergedResults.push(entry);
      }
    }

    res.json({
      success: true,
      ocrData,
      mergedResults,
      message: `${mergedResults.length}명의 결과가 인식되었습니다.`
    });
  } catch (error) {
    console.error('OCR 처리 오류:', error);
    res.status(500).json({ error: 'OCR 처리 중 오류가 발생했습니다: ' + error.message });
  }
});

// 스코어카드 이미지 업로드 (관리자)
router.post('/:id/results/scorecard', requireAuth, requireAdmin, upload.single('image'), async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    }

    let imageUrl = null;

    // Cloudinary 업로드 시도
    if (isCloudinaryConfigured()) {
      try {
        const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const result = await cloudinary.uploader.upload(base64Data, {
          folder: 'n2golf/scorecards',
          resource_type: 'image',
          transformation: [
            { width: 1600, height: 1600, crop: 'limit' },
            { quality: 'auto:good', fetch_format: 'auto' }
          ]
        });
        imageUrl = result.secure_url;
      } catch (cloudinaryError) {
        console.warn('Cloudinary 업로드 실패, MongoDB 폴백:', cloudinaryError.message);
      }
    }

    // Cloudinary 실패 시 Base64로 저장
    if (!imageUrl) {
      if (req.file.size > 3 * 1024 * 1024) {
        return res.status(400).json({ error: '3MB 이하의 이미지만 업로드 가능합니다.' });
      }
      imageUrl = imageToBase64(req.file.buffer, req.file.mimetype);
    }

    // 기존 스코어카드 이미지 목록에 추가
    const schedule = db.findById('schedules', scheduleId);
    const scorecardImages = schedule.scorecard_images || [];
    scorecardImages.push({
      url: imageUrl,
      uploaded_at: new Date().toISOString()
    });

    await db.update('schedules', scheduleId, { scorecard_images: scorecardImages });

    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.json({ success: true, imageUrl, message: '스코어카드가 등록되었습니다.' });
  } catch (error) {
    console.error('스코어카드 업로드 오류:', error);
    res.status(500).json({ error: '스코어카드 업로드 중 오류가 발생했습니다.' });
  }
});

// 스코어카드 이미지 삭제 (관리자)
router.delete('/:id/results/scorecard/:index', requireAuth, requireAdmin, async (req, res) => {
  try {
    const scheduleId = parseInt(req.params.id);
    const index = parseInt(req.params.index);

    const schedule = db.findById('schedules', scheduleId);
    const scorecardImages = schedule.scorecard_images || [];

    if (index < 0 || index >= scorecardImages.length) {
      return res.status(400).json({ error: '유효하지 않은 인덱스입니다.' });
    }

    scorecardImages.splice(index, 1);
    await db.update('schedules', scheduleId, { scorecard_images: scorecardImages });

    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    res.json({ success: true, message: '스코어카드가 삭제되었습니다.' });
  } catch (error) {
    console.error('스코어카드 삭제 오류:', error);
    res.status(500).json({ error: '스코어카드 삭제 중 오류가 발생했습니다.' });
  }
});

// multer 에러 핸들링 미들웨어
router.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: '파일 크기는 5MB를 초과할 수 없습니다.' });
    }
    return res.status(400).json({ error: '파일 업로드 오류: ' + error.message });
  }
  if (error.message) {
    return res.status(400).json({ error: error.message });
  }
  next(error);
});

module.exports = router;
