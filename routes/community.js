const express = require('express');
const router = express.Router();
const db = require('../models/database');
const multer = require('multer');
const { optimizeCloudinaryUrl } = require('../utils/validator');
const pushService = require('../utils/pushService');

// ============================================
// Cloudinary 설정
// ============================================
const cloudinary = require('cloudinary').v2;

if (process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME) {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
  });
}

const isCloudinaryConfigured = () => {
  return !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
};

const imageToBase64 = (buffer, mimetype) => {
  return `data:${mimetype};base64,${buffer.toString('base64')}`;
};

// 이미지 업로드 설정
const storage = multer.memoryStorage();
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
  limits: { fileSize: 5 * 1024 * 1024 }
});

// 인증 미들웨어
const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

// ============================================
// 커뮤니티 메인 페이지
// ============================================
router.get('/', requireAuth, async (req, res) => {
  try {
    res.render('community/list', {
      title: '일상톡톡',
      user: req.session.user,
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

// ============================================
// 게시글 API
// ============================================

// 게시글 목록 조회
router.get('/posts', requireAuth, async (req, res) => {
  try {
    const userId = req.session.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;

    const [posts, members, comments, reactions] = await Promise.all([
      db.getTableAsync('community_posts'),
      db.getTableAsync('members', { projection: { id: 1, name: 1 } }),
      db.getTableAsync('community_comments'),
      db.getTableAsync('community_reactions')
    ]);

    // 최신순 정렬
    const sortedPosts = posts.sort((a, b) =>
      (b.created_at || '').localeCompare(a.created_at || '')
    );

    // 페이징
    const startIndex = (page - 1) * limit;
    const pagedPosts = sortedPosts.slice(startIndex, startIndex + limit);

    // 게시글에 추가 정보 붙이기
    const enrichedPosts = pagedPosts.map(post => {
      const member = members.find(m => m.id === post.member_id) || {};
      const postComments = comments.filter(c => c.post_id === post.id);
      const postReactions = reactions.filter(r => r.target_type === 'post' && r.target_id === post.id);
      const likes = postReactions.filter(r => r.reaction_type === 'like').length;
      const dislikes = postReactions.filter(r => r.reaction_type === 'dislike').length;
      const myReaction = postReactions.find(r => r.member_id === userId);

      return {
        ...post,
        image_url: optimizeCloudinaryUrl(post.image_url),
        member_name: member.name || '알 수 없음',
        comment_count: postComments.length,
        likes,
        dislikes,
        my_reaction: myReaction ? myReaction.reaction_type : null,
        is_mine: post.member_id === userId,
        is_admin: req.session.user.is_admin
      };
    });

    res.json({
      posts: enrichedPosts,
      total: posts.length,
      page,
      totalPages: Math.ceil(posts.length / limit),
      hasMore: startIndex + limit < posts.length
    });
  } catch (error) {
    console.error('게시글 목록 조회 오류:', error);
    res.status(500).json({ error: '게시글을 불러오는 중 오류가 발생했습니다.' });
  }
});

// 게시글 작성
router.post('/posts', requireAuth, async (req, res) => {
  try {
    const { content, image_url } = req.body;
    const userId = req.session.user.id;

    if ((!content || !content.trim()) && !image_url) {
      return res.status(400).json({ error: '내용을 입력하거나 이미지를 첨부해주세요.' });
    }

    if (content && content.length > 1000) {
      return res.status(400).json({ error: '글 내용은 1000자를 초과할 수 없습니다.' });
    }

    const postData = {
      member_id: userId,
      content: content ? content.trim() : ''
    };

    if (image_url) {
      postData.image_url = image_url;
    }

    const newId = await db.insert('community_posts', postData);

    if (db.refreshCache) {
      await db.refreshCache('community_posts');
    }

    // 새 게시글 알림 발송 (작성자 본인 제외 전체)
    pushService.notifyNewCommunityPost(userId, req.session.user.name, newId)
      .catch(err => console.error('새 게시글 알림 오류:', err));

    res.json({ success: true, id: newId, message: '게시글이 등록되었습니다.' });
  } catch (error) {
    console.error('게시글 작성 오류:', error);
    res.status(500).json({ error: '게시글 작성 중 오류가 발생했습니다.' });
  }
});

// 게시글 수정
router.put('/posts/:id', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { content } = req.body;
    const userId = req.session.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '내용을 입력해주세요.' });
    }

    const posts = await db.getTableAsync('community_posts');
    const post = posts.find(p => p.id === postId);

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    if (post.member_id !== userId && !req.session.user.is_admin) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    await db.update('community_posts', postId, { content: content.trim() });

    if (db.refreshCache) {
      await db.refreshCache('community_posts');
    }

    res.json({ success: true, message: '게시글이 수정되었습니다.' });
  } catch (error) {
    console.error('게시글 수정 오류:', error);
    res.status(500).json({ error: '게시글 수정 중 오류가 발생했습니다.' });
  }
});

// 게시글 삭제
router.delete('/posts/:id', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.session.user.id;

    const posts = await db.getTableAsync('community_posts');
    const post = posts.find(p => p.id === postId);

    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    if (post.member_id !== userId && !req.session.user.is_admin) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    // 관련 댓글 및 반응 삭제
    const [allComments, allReactions] = await Promise.all([
      db.getTableAsync('community_comments'),
      db.getTableAsync('community_reactions')
    ]);

    // 게시글의 댓글들 삭제
    const postComments = allComments.filter(c => c.post_id === postId);
    for (const comment of postComments) {
      // 댓글의 반응 삭제
      const commentReactions = allReactions.filter(r => r.target_type === 'comment' && r.target_id === comment.id);
      for (const reaction of commentReactions) {
        await db.delete('community_reactions', reaction.id);
      }
      await db.delete('community_comments', comment.id);
    }

    // 게시글의 반응 삭제
    const postReactions = allReactions.filter(r => r.target_type === 'post' && r.target_id === postId);
    for (const reaction of postReactions) {
      await db.delete('community_reactions', reaction.id);
    }

    // 게시글 삭제
    await db.delete('community_posts', postId);

    if (db.refreshCache) {
      await db.refreshCache('community_posts');
      await db.refreshCache('community_comments');
      await db.refreshCache('community_reactions');
    }

    res.json({ success: true, message: '게시글이 삭제되었습니다.' });
  } catch (error) {
    console.error('게시글 삭제 오류:', error);
    res.status(500).json({ error: '게시글 삭제 중 오류가 발생했습니다.' });
  }
});

// 게시글 좋아요/싫어요
router.post('/posts/:id/reaction', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { reaction_type } = req.body;
    const userId = req.session.user.id;

    if (!['like', 'dislike'].includes(reaction_type)) {
      return res.status(400).json({ error: '올바르지 않은 반응 타입입니다.' });
    }

    const posts = await db.getTableAsync('community_posts');
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    const allReactions = await db.getTableAsync('community_reactions');
    const existingReaction = allReactions.find(
      r => r.target_type === 'post' && r.target_id === postId && r.member_id === userId
    );

    if (existingReaction) {
      if (existingReaction.reaction_type === reaction_type) {
        await db.delete('community_reactions', existingReaction.id);
      } else {
        await db.update('community_reactions', existingReaction.id, { reaction_type });
      }
    } else {
      await db.insert('community_reactions', {
        target_type: 'post',
        target_id: postId,
        member_id: userId,
        reaction_type
      });
    }

    const updatedReactions = await db.getTableAsync('community_reactions');
    const postReactions = updatedReactions.filter(r => r.target_type === 'post' && r.target_id === postId);
    const likes = postReactions.filter(r => r.reaction_type === 'like').length;
    const dislikes = postReactions.filter(r => r.reaction_type === 'dislike').length;
    const myReaction = postReactions.find(r => r.member_id === userId);

    res.json({
      success: true,
      likes,
      dislikes,
      my_reaction: myReaction ? myReaction.reaction_type : null
    });
  } catch (error) {
    console.error('게시글 반응 처리 오류:', error);
    res.status(500).json({ error: '반응 처리 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 댓글 API
// ============================================

// 댓글 목록 조회
router.get('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const userId = req.session.user.id;

    const [allComments, reactions, members] = await Promise.all([
      db.getTableAsync('community_comments'),
      db.getTableAsync('community_reactions'),
      db.getTableAsync('members', { projection: { id: 1, name: 1 } })
    ]);

    const postComments = allComments.filter(c => c.post_id === postId);

    const enrichComment = (comment) => {
      const member = members.find(m => m.id === comment.member_id) || {};
      const commentReactions = reactions.filter(r => r.target_type === 'comment' && r.target_id === comment.id);
      const likes = commentReactions.filter(r => r.reaction_type === 'like').length;
      const dislikes = commentReactions.filter(r => r.reaction_type === 'dislike').length;
      const myReaction = commentReactions.find(r => r.member_id === userId);

      return {
        ...comment,
        image_url: optimizeCloudinaryUrl(comment.image_url),
        member_name: member.name || '알 수 없음',
        likes,
        dislikes,
        my_reaction: myReaction ? myReaction.reaction_type : null,
        is_mine: comment.member_id === userId,
        is_admin: req.session.user.is_admin
      };
    };

    // 부모 댓글
    const parentComments = postComments
      .filter(c => !c.parent_id)
      .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

    // 대댓글 추가
    const commentsWithReplies = parentComments.map(parent => {
      const replies = postComments
        .filter(c => c.parent_id === parent.id)
        .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))
        .map(enrichComment);

      return { ...enrichComment(parent), replies };
    });

    res.json({ comments: commentsWithReplies });
  } catch (error) {
    console.error('댓글 목록 조회 오류:', error);
    res.status(500).json({ error: '댓글을 불러오는 중 오류가 발생했습니다.' });
  }
});

// 댓글 작성
router.post('/posts/:id/comments', requireAuth, async (req, res) => {
  try {
    const postId = parseInt(req.params.id);
    const { content, parent_id, image_url } = req.body;
    const userId = req.session.user.id;

    if ((!content || !content.trim()) && !image_url) {
      return res.status(400).json({ error: '댓글 내용을 입력하거나 이미지를 첨부해주세요.' });
    }

    const posts = await db.getTableAsync('community_posts');
    const post = posts.find(p => p.id === postId);
    if (!post) {
      return res.status(404).json({ error: '게시글을 찾을 수 없습니다.' });
    }

    if (parent_id) {
      const comments = await db.getTableAsync('community_comments');
      const parentComment = comments.find(c => c.id === parseInt(parent_id) && c.post_id === postId);
      if (!parentComment) {
        return res.status(400).json({ error: '부모 댓글을 찾을 수 없습니다.' });
      }
      if (parentComment.parent_id) {
        return res.status(400).json({ error: '대댓글에는 답글을 달 수 없습니다.' });
      }
    }

    const commentData = {
      post_id: postId,
      member_id: userId,
      parent_id: parent_id ? parseInt(parent_id) : null,
      content: content ? content.trim() : ''
    };

    if (image_url) {
      commentData.image_url = image_url;
    }

    const newId = await db.insert('community_comments', commentData);

    if (db.refreshCache) {
      await db.refreshCache('community_comments');
    }

    // 알림 발송
    const commenterName = req.session.user.name;
    const url = `/community?post=${postId}#comment-${newId}`;

    if (parent_id) {
      // 대댓글: 부모 댓글 작성자에게 알림
      const comments = await db.getTableAsync('community_comments');
      const parentComment = comments.find(c => c.id === parseInt(parent_id));
      if (parentComment && parentComment.member_id !== userId) {
        pushService.notifyComment(parentComment.member_id, commenterName, 'comment', url)
          .catch(err => console.error('일상톡톡 댓글 알림 오류:', err));
      }
    } else {
      // 일반 댓글: 게시글 작성자에게 알림
      if (post.member_id !== userId) {
        pushService.notifyComment(post.member_id, commenterName, 'post', url)
          .catch(err => console.error('일상톡톡 댓글 알림 오류:', err));
      }
    }

    res.json({ success: true, id: newId, message: '댓글이 등록되었습니다.' });
  } catch (error) {
    console.error('댓글 작성 오류:', error);
    res.status(500).json({ error: '댓글 작성 중 오류가 발생했습니다.' });
  }
});

// 댓글 수정
router.put('/comments/:id', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { content } = req.body;
    const userId = req.session.user.id;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: '댓글 내용을 입력해주세요.' });
    }

    const comments = await db.getTableAsync('community_comments');
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.member_id !== userId && !req.session.user.is_admin) {
      return res.status(403).json({ error: '수정 권한이 없습니다.' });
    }

    await db.update('community_comments', commentId, { content: content.trim() });

    if (db.refreshCache) {
      await db.refreshCache('community_comments');
    }

    res.json({ success: true, message: '댓글이 수정되었습니다.' });
  } catch (error) {
    console.error('댓글 수정 오류:', error);
    res.status(500).json({ error: '댓글 수정 중 오류가 발생했습니다.' });
  }
});

// 댓글 삭제
router.delete('/comments/:id', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const userId = req.session.user.id;

    const [allComments, allReactions] = await Promise.all([
      db.getTableAsync('community_comments'),
      db.getTableAsync('community_reactions')
    ]);

    const comment = allComments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    if (comment.member_id !== userId && !req.session.user.is_admin) {
      return res.status(403).json({ error: '삭제 권한이 없습니다.' });
    }

    // 대댓글도 함께 삭제
    const replies = allComments.filter(c => c.parent_id === commentId);
    for (const reply of replies) {
      const replyReactions = allReactions.filter(r => r.target_type === 'comment' && r.target_id === reply.id);
      for (const reaction of replyReactions) {
        await db.delete('community_reactions', reaction.id);
      }
      await db.delete('community_comments', reply.id);
    }

    // 댓글의 반응 삭제
    const commentReactions = allReactions.filter(r => r.target_type === 'comment' && r.target_id === commentId);
    for (const reaction of commentReactions) {
      await db.delete('community_reactions', reaction.id);
    }

    await db.delete('community_comments', commentId);

    if (db.refreshCache) {
      await db.refreshCache('community_comments');
      await db.refreshCache('community_reactions');
    }

    res.json({ success: true, message: '댓글이 삭제되었습니다.' });
  } catch (error) {
    console.error('댓글 삭제 오류:', error);
    res.status(500).json({ error: '댓글 삭제 중 오류가 발생했습니다.' });
  }
});

// 댓글 좋아요/싫어요
router.post('/comments/:id/reaction', requireAuth, async (req, res) => {
  try {
    const commentId = parseInt(req.params.id);
    const { reaction_type } = req.body;
    const userId = req.session.user.id;

    if (!['like', 'dislike'].includes(reaction_type)) {
      return res.status(400).json({ error: '올바르지 않은 반응 타입입니다.' });
    }

    const comments = await db.getTableAsync('community_comments');
    const comment = comments.find(c => c.id === commentId);
    if (!comment) {
      return res.status(404).json({ error: '댓글을 찾을 수 없습니다.' });
    }

    const allReactions = await db.getTableAsync('community_reactions');
    const existingReaction = allReactions.find(
      r => r.target_type === 'comment' && r.target_id === commentId && r.member_id === userId
    );

    if (existingReaction) {
      if (existingReaction.reaction_type === reaction_type) {
        await db.delete('community_reactions', existingReaction.id);
      } else {
        await db.update('community_reactions', existingReaction.id, { reaction_type });
      }
    } else {
      await db.insert('community_reactions', {
        target_type: 'comment',
        target_id: commentId,
        member_id: userId,
        reaction_type
      });
    }

    const updatedReactions = await db.getTableAsync('community_reactions');
    const commentReactions = updatedReactions.filter(r => r.target_type === 'comment' && r.target_id === commentId);
    const likes = commentReactions.filter(r => r.reaction_type === 'like').length;
    const dislikes = commentReactions.filter(r => r.reaction_type === 'dislike').length;
    const myReaction = commentReactions.find(r => r.member_id === userId);

    res.json({
      success: true,
      likes,
      dislikes,
      my_reaction: myReaction ? myReaction.reaction_type : null
    });
  } catch (error) {
    console.error('댓글 반응 처리 오류:', error);
    res.status(500).json({ error: '반응 처리 중 오류가 발생했습니다.' });
  }
});

// ============================================
// 이미지 업로드
// ============================================
router.post('/upload-image', requireAuth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '이미지 파일이 없습니다.' });
    }

    let imageUrl = null;
    let storageType = null;

    if (isCloudinaryConfigured()) {
      try {
        const base64Data = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        const result = await cloudinary.uploader.upload(base64Data, {
          folder: 'n2golf/community',
          resource_type: 'image',
          transformation: [
            { width: 1200, height: 1200, crop: 'limit' },
            { quality: 'auto:good', fetch_format: 'auto' }
          ]
        });
        imageUrl = result.secure_url;
        storageType = 'cloudinary';
      } catch (cloudinaryError) {
        console.warn('Cloudinary 업로드 실패:', cloudinaryError.message);
      }
    }

    if (!imageUrl) {
      if (req.file.size > 2 * 1024 * 1024) {
        return res.status(400).json({
          error: '이미지 저장소가 가득 찼습니다. 2MB 이하의 이미지만 업로드 가능합니다.'
        });
      }
      imageUrl = imageToBase64(req.file.buffer, req.file.mimetype);
      storageType = 'mongodb';
    }

    res.json({ success: true, imageUrl, storageType });
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

    // 유튜브 URL 특별 처리
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

    // 틱톡 URL 특별 처리
    const tiktokMatch = targetUrl.match(/(?:tiktok\.com|vm\.tiktok\.com)/);
    if (tiktokMatch) {
      try {
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

    // 인스타그램 URL 특별 처리
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

    // fetch로 HTML 가져오기
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);

    const fetchOptions = {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    };

    let response = await fetch(targetUrl, fetchOptions);

    if (response.url && response.url !== targetUrl) {
      targetUrl = response.url;
    }
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json({ success: false, error: '페이지를 가져올 수 없습니다.' });
    }

    const html = await response.text();

    // Open Graph 메타태그 파싱
    const getMetaContent = (html, property) => {
      const patterns = [
        new RegExp(`<meta[^>]*property\\s*=\\s*["']?og:${property}["']?[^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]*content\\s*=\\s*["']([^"']+)["'][^>]*property\\s*=\\s*["']?og:${property}["']?`, 'i'),
        new RegExp(`<meta[^>]*name\\s*=\\s*["']?twitter:${property}["']?[^>]*content\\s*=\\s*["']([^"']+)["']`, 'i'),
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match && match[1]) {
          return match[1].trim();
        }
      }
      return null;
    };

    const getTitleTag = (html) => {
      const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      return match ? match[1].trim() : null;
    };

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

module.exports = router;
