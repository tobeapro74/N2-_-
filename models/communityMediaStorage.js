/**
 * 일상톡톡 첨부 미디어 저장 (MongoDB GridFS bucket: community_media, DB: n2golf)
 * MONGODB_URI 없을 때는 data/community_media/ 파일 + community_media 레지스트리
 */

const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { GridFSBucket, ObjectId } = require('mongodb');
const db = require('./database');

const useMongoDb = !!process.env.MONGODB_URI;
const BUCKET_NAME = 'community_media';
const LOCAL_DIR = path.join(__dirname, '..', 'data', 'community_media');

const IMAGE_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'
]);
const VIDEO_MIMES = new Set([
  'video/mp4', 'video/webm', 'video/quicktime'
]);

function mimeToKind(mime) {
  if (IMAGE_MIMES.has(mime)) return 'image';
  if (VIDEO_MIMES.has(mime)) return 'video';
  return null;
}

async function ensureLocalDir() {
  await fsp.mkdir(LOCAL_DIR, { recursive: true });
}

function parseFileId(fileId) {
  if (typeof fileId !== 'string' || !fileId.trim()) return null;
  const s = fileId.trim();
  if (/^[a-fA-F0-9]{24}$/.test(s)) {
    try {
      return { type: 'objectId', value: new ObjectId(s) };
    } catch (e) {
      return null;
    }
  }
  const n = parseInt(s, 10);
  if (!Number.isNaN(n) && String(n) === s) {
    return { type: 'numeric', value: n };
  }
  return null;
}

/**
 * 업로드 버퍼 저장 → fileId 문자열, kind
 */
async function saveUploadedBufferWithMime(buffer, { memberId, mimeType, originalName }) {
  const kind = mimeToKind(mimeType);
  if (!kind) {
    throw new Error('지원하지 않는 미디어 형식입니다.');
  }

  const mid = typeof memberId === 'number' ? memberId : parseInt(memberId, 10);
  const meta = {
    memberId: mid,
    kind,
    mimeType,
    originalName: (originalName || 'file').slice(0, 200)
  };

  if (useMongoDb) {
    const mongoDb = await db.connectMongo();
    const bucket = new GridFSBucket(mongoDb, { bucketName: BUCKET_NAME });
    const filename = `${kind}_${Date.now()}_${mid}`;

    const uploadStream = bucket.openUploadStream(filename, { metadata: meta });
    await new Promise((resolve, reject) => {
      uploadStream.on('error', reject);
      uploadStream.on('finish', resolve);
      uploadStream.end(buffer);
    });

    return { fileId: uploadStream.id.toString(), kind };
  }

  await ensureLocalDir();
  const newId = await db.insert('community_media', {
    member_id: mid,
    mime_type: mimeType,
    kind,
    original_name: meta.originalName,
    storage: 'local'
  });

  const ext = kind === 'video'
    ? (mimeType.includes('webm') ? '.webm' : mimeType.includes('quicktime') ? '.mov' : '.mp4')
    : '.img';
  const safeName = `${newId}${ext}`;
  const absPath = path.join(LOCAL_DIR, safeName);
  await fsp.writeFile(absPath, buffer);

  await db.update('community_media', newId, { local_filename: safeName });

  if (db.refreshCache) {
    await db.refreshCache('community_media');
  }

  return { fileId: String(newId), kind };
}

async function verifyFilesForMember(fileIds, memberId) {
  const mid = typeof memberId === 'number' ? memberId : parseInt(memberId, 10);
  const list = Array.isArray(fileIds) ? fileIds : [];

  for (const fid of list) {
    const parsed = parseFileId(fid);
    if (!parsed) return false;

    if (useMongoDb) {
      const mongoDb = await db.connectMongo();
      const doc = await mongoDb.collection(`${BUCKET_NAME}.files`).findOne({ _id: parsed.value });
      if (!doc || !doc.metadata || doc.metadata.memberId !== mid) return false;
    } else {
      const rows = await db.getTableAsync('community_media');
      const row = rows.find(r => r.id === parsed.value);
      if (!row || row.member_id !== mid) return false;
    }
  }
  return true;
}

async function openReadStream(fileId) {
  const parsed = parseFileId(fileId);
  if (!parsed) return null;

  if (useMongoDb) {
    if (parsed.type !== 'objectId') return null;
    const mongoDb = await db.connectMongo();
    const bucket = new GridFSBucket(mongoDb, { bucketName: BUCKET_NAME });
    const doc = await mongoDb.collection(`${BUCKET_NAME}.files`).findOne({ _id: parsed.value });
    if (!doc) return null;
    const mimeType = doc.metadata?.mimeType
      || (doc.metadata?.kind === 'video' ? 'video/mp4' : 'image/jpeg');
    return {
      stream: bucket.openDownloadStream(parsed.value),
      mimeType,
      filename: doc.filename || 'file'
    };
  }

  if (parsed.type !== 'numeric') return null;
  const rows = await db.getTableAsync('community_media');
  const row = rows.find(r => r.id === parsed.value);
  if (!row || !row.local_filename) return null;
  const absPath = path.join(LOCAL_DIR, row.local_filename);
  if (!fs.existsSync(absPath)) return null;
  return {
    stream: fs.createReadStream(absPath),
    mimeType: row.mime_type || 'application/octet-stream',
    filename: row.original_name || row.local_filename
  };
}

async function deleteFiles(fileIds) {
  const list = Array.isArray(fileIds) ? fileIds : [];
  for (const fid of list) {
    const parsed = parseFileId(fid);
    if (!parsed) continue;

    if (useMongoDb) {
      if (parsed.type !== 'objectId') continue;
      try {
        const mongoDb = await db.connectMongo();
        const bucket = new GridFSBucket(mongoDb, { bucketName: BUCKET_NAME });
        await bucket.delete(parsed.value);
      } catch (e) {
        console.warn('GridFS 삭제 실패:', fid, e.message);
      }
    } else {
      if (parsed.type !== 'numeric') continue;
      const rows = await db.getTableAsync('community_media');
      const row = rows.find(r => r.id === parsed.value);
      if (row && row.local_filename) {
        const absPath = path.join(LOCAL_DIR, row.local_filename);
        try {
          await fsp.unlink(absPath);
        } catch (e) {
          /* ignore */
        }
      }
      await db.delete('community_media', parsed.value);
      if (db.refreshCache) {
        await db.refreshCache('community_media');
      }
    }
  }
}

module.exports = {
  mimeToKind,
  saveUploadedBufferWithMime,
  verifyFilesForMember,
  openReadStream,
  deleteFiles,
  IMAGE_MIMES,
  VIDEO_MIMES
};
