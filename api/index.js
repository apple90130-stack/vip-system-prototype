const fs = require('fs');
const path = require('path');
const { normalizeText, toInt, newId, isValidUrl } = require('../lib/validators');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');
const ADMIN_ACCOUNT = process.env.ADMIN_ACCOUNT || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'vip2026';
let memoryDb;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function readDb() {
  if (process.env.VERCEL) {
    if (!memoryDb) memoryDb = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    return memoryDb;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function writeDb(db) {
  if (process.env.VERCEL) { memoryDb = db; return; }
  const tmpPath = `${DB_PATH}.tmp`;
  fs.writeFileSync(tmpPath, JSON.stringify(db, null, 2), 'utf8');
  fs.renameSync(tmpPath, DB_PATH);
}
function json(res, status, body) { res.status(status).json(body); }
function publicMember(member) {
  return { id: member.id, name: member.name, phone: member.phone, level: member.level, spend: member.spend, orders: member.orders, shares: member.shares, points: member.points, tags: member.tags, purchases: member.purchases };
}
function getDashboard(db, memberId) {
  const member = db.members.find((item) => item.id === memberId);
  if (!member) return null;
  return {
    member: publicMember(member),
    rules: db.rules,
    activities: db.activities.filter((item) => member.tags.includes(item.tag)),
    courses: db.courses.filter((item) => member.tags.includes(item.tag)),
    calendar: db.calendar,
    checkins: db.activities.filter((item) => member.purchases.includes(item.tag)),
    tasks: db.tasks.filter((item) => item.memberId === member.id),
    announcements: db.announcements
  };
}

module.exports = async function handler(req, res) {
  const route = req.url.replace(/^\/api/, '').split('?')[0] || '/';
  try {
    const db = readDb();
    if (req.method === 'GET' && route === '/health') return json(res, 200, { ok: true, now: new Date().toISOString() });
    if (req.method === 'POST' && route === '/member/login') {
      const name = normalizeText(req.body?.name, 50);
      const phone = normalizeText(req.body?.phone, 20);
      const member = db.members.find((item) => item.name === name && item.phone === phone);
      if (!member) return json(res, 401, { error: '姓名或手機號碼不正確' });
      return json(res, 200, { ok: true, member: publicMember(member) });
    }
    if (req.method === 'GET' && route === '/member/dashboard') {
      const memberId = toInt(req.query?.memberId);
      const dashboard = getDashboard(db, memberId);
      if (!dashboard) return json(res, 404, { error: '找不到會員資料' });
      return json(res, 200, dashboard);
    }
    if (req.method === 'POST' && route === '/member/enroll') {
      const memberId = toInt(req.body?.memberId);
      const courseId = toInt(req.body?.courseId);
      const member = db.members.find((item) => item.id === memberId);
      const course = db.courses.find((item) => item.id === courseId);
      if (!member || !course) return json(res, 404, { error: '找不到會員或課程' });
      course.registeredMemberIds = course.registeredMemberIds || [];
      if (!course.registeredMemberIds.includes(member.id)) { course.registeredMemberIds.push(member.id); course.signups += 1; }
      writeDb(db);
      return json(res, 200, { ok: true, course });
    }
    if (req.method === 'POST' && route === '/member/tasks') {
      const memberId = toInt(req.body?.memberId);
      const member = db.members.find((item) => item.id === memberId);
      const title = normalizeText(req.body?.title, 80);
      const url = normalizeText(req.body?.url, 500);
      if (!member) return json(res, 404, { error: '找不到會員資料' });
      if (!title || !url) return json(res, 400, { error: '請填寫任務名稱與照片連結' });
      if (!isValidUrl(url)) return json(res, 422, { error: '照片連結需為 http 或 https 網址' });
      const task = { id: newId(), memberId: member.id, memberName: member.name, title, url, time: new Date().toLocaleString('zh-TW', { hour12: false }), points: 100, status: 'pending' };
      db.tasks.unshift(task);
      writeDb(db);
      return json(res, 201, task);
    }
    if (req.method === 'POST' && route === '/admin/login') {
      const account = normalizeText(req.body?.account, 50);
      const password = normalizeText(req.body?.password, 50);
      if (account !== ADMIN_ACCOUNT || password !== ADMIN_PASSWORD) return json(res, 401, { error: '管理員帳號或密碼不正確' });
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && route === '/admin/overview') {
      return json(res, 200, { rules: db.rules, members: db.members.map(publicMember), courses: clone(db.courses), tasks: clone(db.tasks), announcements: clone(db.announcements), calendar: clone(db.calendar), activities: clone(db.activities) });
    }
    if (req.method === 'POST' && route === '/admin/tags') {
      const memberId = toInt(req.body?.memberId);
      const tag = normalizeText(req.body?.tag, 30);
      const member = db.members.find((item) => item.id === memberId);
      if (!member || !tag) return json(res, 400, { error: '會員或標籤不正確' });
      if (!member.tags.includes(tag)) member.tags.push(tag);
      writeDb(db);
      return json(res, 200, { ok: true, member: publicMember(member) });
    }
    if (req.method === 'POST' && route === '/admin/courses') {
      const title = normalizeText(req.body?.title, 80);
      const time = normalizeText(req.body?.time, 40);
      const tag = normalizeText(req.body?.tag, 30);
      const outline = normalizeText(req.body?.outline, 160);
      if (!title || !time || !tag) return json(res, 400, { error: '請填寫課程名稱、時間與標籤' });
      const course = { id: newId(), title, time, tag, outline, signups: 0, registeredMemberIds: [] };
      db.courses.unshift(course);
      writeDb(db);
      return json(res, 201, course);
    }
    if (req.method === 'PATCH' && route === '/admin/tasks') {
      const taskId = toInt(req.body?.id);
      const status = normalizeText(req.body?.status, 20);
      const task = db.tasks.find((item) => item.id === taskId);
      if (!task) return json(res, 404, { error: '找不到任務' });
      if (!['approved', 'rejected'].includes(status)) return json(res, 400, { error: '審核狀態不正確' });
      task.status = status;
      if (status === 'approved') {
        const member = db.members.find((item) => item.id === task.memberId);
        if (member) member.points += task.points || 0;
      }
      writeDb(db);
      return json(res, 200, { ok: true, task });
    }
    if (req.method === 'POST' && route === '/admin/announcements') {
      const text = normalizeText(req.body?.text, 240);
      if (!text) return json(res, 400, { error: '請填寫公告內容' });
      const announcement = { id: newId(), text, createdAt: new Date().toISOString().slice(0, 10) };
      db.announcements.unshift(announcement);
      writeDb(db);
      return json(res, 201, announcement);
    }
    return json(res, 404, { error: 'API route not found' });
  } catch (error) {
    return json(res, 500, { error: error.message });
  }
};
