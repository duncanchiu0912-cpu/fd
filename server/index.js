import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { Prisma, PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const cookieName = 'receipt_session';

if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be a valid port number.');
if (!jwtSecret || Buffer.byteLength(jwtSecret) < 32) {
  throw new Error('JWT_SECRET must be set to a random secret of at least 32 bytes.');
}

app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
app.use(express.json({ limit: '64kb', strict: true }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(8).max(128) }).strict();
const invoiceSchema = z.object({
  merchant: z.string().trim().min(1, '請輸入店家名稱。').max(120),
  amount: z.coerce.number().finite().positive('金額需大於 0。').max(100_000_000),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, '請輸入有效日期。').refine((value) => {
    const [year, month, day] = value.split('-').map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  }, '請輸入有效日期。'),
  category: z.string().trim().min(1).max(40),
  kind: z.enum(['發票', '收據', '網購']),
  invoiceNumber: z.string().trim().max(30).optional().nullable().transform((value) => value || null),
  notes: z.string().trim().max(500).optional().default(''),
}).strict();

function issueToken(user) {
  return jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '7d', issuer: 'receipt-ledger', audience: 'receipt-ledger-web' });
}
function cookieOptions() {
  return { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/', maxAge: 7 * 24 * 60 * 60 * 1000 };
}
function setSessionCookie(res, user) { res.cookie(cookieName, issueToken(user), cookieOptions()); }
function requireAuth(req, res, next) {
  const token = req.cookies[cookieName];
  if (!token) return res.status(401).json({ error: '請先登入。' });
  try {
    req.user = jwt.verify(token, jwtSecret, { issuer: 'receipt-ledger', audience: 'receipt-ledger-web' });
    return next();
  } catch {
    res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined });
    return res.status(401).json({ error: '登入已過期，請重新登入。' });
  }
}
function validate(schema, body, res) {
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    const issues = parsed.error.issues.map(({ path: field, message }) => ({ field: field.join('.'), message }));
    res.status(400).json({ error: issues[0]?.message || '請確認輸入資料。', issues });
    return null;
  }
  return parsed.data;
}
function isUniqueConstraint(error) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  const data = validate(credentialsSchema, req.body, res);
  if (!data) return;
  try {
    const user = await prisma.user.create({ data: { email: data.email, passwordHash: await bcrypt.hash(data.password, 12) } });
    setSessionCookie(res, user);
    return res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) {
    if (isUniqueConstraint(error)) return res.status(409).json({ error: '此 Email 已註冊。' });
    return next(error);
  }
});
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  const data = validate(credentialsSchema, req.body, res);
  if (!data) return;
  try {
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user || !(await bcrypt.compare(data.password, user.passwordHash))) return res.status(401).json({ error: 'Email 或密碼錯誤。' });
    setSessionCookie(res, user);
    return res.json({ user: { id: user.id, email: user.email } });
  } catch (error) { return next(error); }
});
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(cookieName, { ...cookieOptions(), maxAge: undefined });
  res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.sub }, select: { id: true, email: true } });
    if (!user) return res.status(401).json({ error: '帳號不存在，請重新登入。' });
    return res.json({ user });
  } catch (error) { return next(error); }
});

app.get('/api/invoices', requireAuth, async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({ where: { userId: req.user.sub }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000 });
    return res.json({ invoices });
  } catch (error) { return next(error); }
});
app.post('/api/invoices', requireAuth, async (req, res, next) => {
  const data = validate(invoiceSchema, req.body, res);
  if (!data) return;
  try {
    const invoice = await prisma.invoice.create({ data: { ...data, date: new Date(`${data.date}T00:00:00.000Z`), userId: req.user.sub } });
    return res.status(201).json({ invoice });
  } catch (error) { return next(error); }
});
app.put('/api/invoices/:id', requireAuth, async (req, res, next) => {
  const data = validate(invoiceSchema, req.body, res);
  if (!data) return;
  try {
    const result = await prisma.invoice.updateMany({
      where: { id: req.params.id, userId: req.user.sub },
      data: { ...data, date: new Date(`${data.date}T00:00:00.000Z`) },
    });
    if (!result.count) return res.status(404).json({ error: '找不到這筆消費。' });
    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
    return res.json({ invoice });
  } catch (error) { return next(error); }
});
app.delete('/api/invoices/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.invoice.deleteMany({ where: { id: req.params.id, userId: req.user.sub } });
    if (!result.count) return res.status(404).json({ error: '找不到這筆消費。' });
    return res.status(204).end();
  } catch (error) { return next(error); }
});

if (isProduction) {
  const root = path.dirname(fileURLToPath(import.meta.url));
  const webDist = path.resolve(root, '../dist');
  app.use(express.static(webDist, { index: false, maxAge: '1y', immutable: true }));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    return res.sendFile(path.join(webDist, 'index.html'));
  });
}

app.use((error, _req, res, _next) => {
  if (res.headersSent) return;
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ error: 'JSON 格式不正確。' });
  console.error(error);
  return res.status(500).json({ error: '伺服器發生錯誤，請稍後再試。' });
});

const server = app.listen(port, () => console.log(`API server listening on http://localhost:${port}`));
async function shutdown() {
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
