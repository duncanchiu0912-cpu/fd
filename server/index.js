import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
const port = Number(process.env.PORT || 3001);
const jwtSecret = process.env.JWT_SECRET;
const isProduction = process.env.NODE_ENV === 'production';
const cookieName = 'receipt_session';

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set to a random secret of at least 32 characters.');
}

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 30, standardHeaders: true, legacyHeaders: false });
const emailSchema = z.string().trim().email().max(254).transform((value) => value.toLowerCase());
const credentialsSchema = z.object({ email: emailSchema, password: z.string().min(8).max(128) });
const invoiceSchema = z.object({
  merchant: z.string().trim().min(1).max(120),
  amount: z.coerce.number().finite().positive().max(100_000_000),
  date: z.string().min(1).refine((value) => !Number.isNaN(Date.parse(value)), '日期格式不正確'),
  category: z.string().trim().min(1).max(40),
  kind: z.enum(['發票', '收據', '網購']),
  invoiceNumber: z.string().trim().max(30).optional().nullable(),
  notes: z.string().trim().max(500).optional().default(''),
});

function issueToken(user) {
  return jwt.sign({ sub: user.id, email: user.email }, jwtSecret, { expiresIn: '7d' });
}
function setSessionCookie(res, user) {
  res.cookie(cookieName, issueToken(user), {
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
function requireAuth(req, res, next) {
  const token = req.cookies[cookieName];
  if (!token) return res.status(401).json({ error: '請先登入。' });
  try {
    req.user = jwt.verify(token, jwtSecret);
    next();
  } catch {
    res.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
    return res.status(401).json({ error: '登入已過期，請重新登入。' });
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
app.post('/api/auth/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '請輸入有效 Email，密碼至少 8 個字元。' });
    const { email, password } = parsed.data;
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: '此 Email 已註冊。' });
    const user = await prisma.user.create({ data: { email, passwordHash: await bcrypt.hash(password, 12) } });
    setSessionCookie(res, user);
    res.status(201).json({ user: { id: user.id, email: user.email } });
  } catch (error) { next(error); }
});
app.post('/api/auth/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = credentialsSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: '請輸入有效 Email 和密碼。' });
    const { email, password } = parsed.data;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: 'Email 或密碼錯誤。' });
    setSessionCookie(res, user);
    res.json({ user: { id: user.id, email: user.email } });
  } catch (error) { next(error); }
});
app.post('/api/auth/logout', (_req, res) => {
  res.clearCookie(cookieName, { httpOnly: true, secure: isProduction, sameSite: 'lax', path: '/' });
  res.json({ ok: true });
});
app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: { id: req.user.sub, email: req.user.email } }));

app.get('/api/invoices', requireAuth, async (req, res, next) => {
  try {
    const invoices = await prisma.invoice.findMany({ where: { userId: req.user.sub }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }] });
    res.json({ invoices });
  } catch (error) { next(error); }
});
app.post('/api/invoices', requireAuth, async (req, res, next) => {
  try {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '請確認消費資料。' });
    const invoice = await prisma.invoice.create({ data: { ...parsed.data, date: new Date(parsed.data.date), invoiceNumber: parsed.data.invoiceNumber || null, userId: req.user.sub } });
    res.status(201).json({ invoice });
  } catch (error) { next(error); }
});
app.put('/api/invoices/:id', requireAuth, async (req, res, next) => {
  try {
    const parsed = invoiceSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues[0]?.message || '請確認消費資料。' });
    const result = await prisma.invoice.updateMany({
      where: { id: req.params.id, userId: req.user.sub },
      data: { ...parsed.data, date: new Date(parsed.data.date), invoiceNumber: parsed.data.invoiceNumber || null },
    });
    if (!result.count) return res.status(404).json({ error: '找不到這筆消費。' });
    const invoice = await prisma.invoice.findFirst({ where: { id: req.params.id, userId: req.user.sub } });
    res.json({ invoice });
  } catch (error) { next(error); }
});
app.delete('/api/invoices/:id', requireAuth, async (req, res, next) => {
  try {
    const result = await prisma.invoice.deleteMany({ where: { id: req.params.id, userId: req.user.sub } });
    if (!result.count) return res.status(404).json({ error: '找不到這筆消費。' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: '伺服器發生錯誤，請稍後再試。' });
});

const server = app.listen(port, () => console.log(`API server listening on http://localhost:${port}`));
async function shutdown() {
  server.close(async () => { await prisma.$disconnect(); process.exit(0); });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
