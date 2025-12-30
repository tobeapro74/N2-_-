const express = require('express');
const router = express.Router();
const db = require('../models/database');
const multer = require('multer');

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
    fileSize: 5 * 1024 * 1024 // 5MB 제한
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

    // MongoDB 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
      await db.refreshCache('reservations');
      await db.refreshCache('schedule_comments');
    }

    let schedules = db.getTable('schedules');
    const golfCourses = db.getTable('golf_courses').filter(gc => gc.is_active);
    const reservations = db.getTable('reservations');
    const comments = db.getTable('schedule_comments');

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
      .sort((a, b) => (a.play_date || '').localeCompare(b.play_date || ''));

    res.render('schedules/list', {
      title: '일정 관리',
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
    const { golf_course_id, play_date, tee_times, max_members, notes } = req.body;

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
    }

    // 중복 일정 체크
    const existing = db.getTable('schedules').find(
      s => s.golf_course_id === parseInt(golf_course_id) && s.play_date === play_date
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

    await db.insert('schedules', {
      golf_course_id: parseInt(golf_course_id),
      play_date,
      tee_times,
      max_members: parseInt(max_members) || 12,
      notes,
      status: 'open'
    });

    // 캐시 새로고침
    if (db.refreshCache) {
      await db.refreshCache('schedules');
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

    // MongoDB에서 직접 최신 데이터 조회 (서버리스 환경 캐시 불일치 방지)
    const schedules = await db.getTableAsync('schedules');
    const reservationsData = await db.getTableAsync('reservations');
    const members = await db.getTableAsync('members');

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
    const { golf_course_id, play_date, tee_times, max_members, status, notes } = req.body;

    await db.update('schedules', scheduleId, {
      golf_course_id: parseInt(golf_course_id),
      play_date,
      tee_times,
      max_members: parseInt(max_members),
      status,
      notes
    });

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
      }
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

    // MongoDB에서 직접 최신 데이터 조회 (서버리스 캐시 불일치 방지)
    const allCommentsData = await db.getTableAsync('schedule_comments');
    const allComments = allCommentsData.filter(c => c.schedule_id === scheduleId);
    const reactions = await db.getTableAsync('comment_reactions');
    const members = await db.getTableAsync('members');

    // 댓글에 추가 정보 붙이기
    const enrichComment = (comment) => {
      const member = members.find(m => m.id === comment.member_id) || {};
      const commentReactions = reactions.filter(r => r.comment_id === comment.id);
      const likes = commentReactions.filter(r => r.reaction_type === 'like').length;
      const dislikes = commentReactions.filter(r => r.reaction_type === 'dislike').length;
      const myReaction = commentReactions.find(r => r.member_id === userId);

      return {
        ...comment,
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
            { quality: 'auto:good' } // 자동 품질 최적화
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

    // 유튜브 URL 특별 처리 (서버에서 봇 차단하므로 썸네일 URL 직접 생성)
    const youtubeMatch = targetUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/);
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

    res.json({
      success: true,
      data: {
        url: targetUrl,
        title: title.substring(0, 100),
        description: description.substring(0, 200),
        image,
        siteName
      }
    });
  } catch (error) {
    console.error('URL 미리보기 오류:', error.message);
    res.json({ success: false, error: '미리보기를 가져올 수 없습니다.' });
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
