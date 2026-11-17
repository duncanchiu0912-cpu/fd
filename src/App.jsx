import { useEffect, useMemo, useRef, useState } from 'react';
import { scanReceipt, terminateReceiptOcr } from './lib/receiptOcr.js';

const CATEGORIES = ['餐飲', '交通', '購物', '居家', '娛樂', '醫療', '教育', '其他'];
const KINDS = ['發票', '收據', '網購'];
const money = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
const today = () => new Date().toLocaleDateString('sv-SE');
const emptyForm = () => ({ merchant: '', amount: '', date: today(), category: '其他', kind: '發票', invoiceNumber: '', notes: '' });

async function api(url, options = {}) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  let response;
  try {
    response = await fetch(url, {
      credentials: 'include',
      ...options,
      signal: controller.signal,
      headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    });
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('API 連線逾時。請確認後端已啟動，並檢查 .env 與資料庫設定。');
    throw new Error('無法連線到 API。請確認 npm run dev:api 正在執行。');
  } finally {
    window.clearTimeout(timeout);
  }
  if (!response.ok) {
    const result = await response.json().catch(() => ({}));
    const error = new Error(result.error || `API 回應錯誤（${response.status}）。`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

function validateInvoice(form) {
  const amount = Number(form.amount);
  if (!form.merchant.trim()) return '請輸入店家或項目名稱。';
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100_000_000) return '金額需大於 0 且不可超過 100,000,000。';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date) || Number.isNaN(new Date(`${form.date}T00:00:00`).getTime())) return '請選擇有效日期。';
  if (!CATEGORIES.includes(form.category)) return '請選擇有效消費類別。';
  if (!KINDS.includes(form.kind)) return '請選擇有效消費類型。';
  if (form.invoiceNumber.length > 30 || form.notes.length > 500) return '發票號碼或備註超過字數限制。';
  return '';
}

function Auth({ onAuthenticated, startupError }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const { user } = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) });
      onAuthenticated(user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="ledger-auth"><form className="ledger-card" onSubmit={submit}>
    <div className="ledger-logo">收</div><p className="ledger-kicker">YOUR PERSONAL LEDGER</p><h1>發票存摺 Pro</h1><p className="ledger-subtitle">發票、收據與網購消費，集中管理更清楚。</p>
    {startupError && <p className="ledger-error" role="status">{startupError}</p>}
    <label>Email<input type="email" autoComplete="email" required maxLength="254" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label>
    <label>密碼<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required minLength="8" maxLength="128" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 個字元" /></label>
    {error && <p className="ledger-error" role="alert">{error}</p>}<button className="ledger-primary" disabled={busy}>{busy ? '請稍候…' : mode === 'login' ? '登入' : '建立帳號'}</button>
    <p className="ledger-switch">{mode === 'login' ? '還沒有帳號？' : '已經有帳號？'} <button type="button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? '立即註冊' : '返回登入'}</button></p>
  </form></main>;
}

function ExpenseForm({ initial, onSave, onClose }) {
  const [form, setForm] = useState(initial || emptyForm());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanState, setScanState] = useState('');
  const [progress, setProgress] = useState(0);
  const fileInput = useRef(null);
  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); }
  async function scan(file) {
    if (!file) return;
    setScanState('正在載入 OCR 辨識模型…'); setProgress(0); setError('');
    try {
      const result = await scanReceipt(file, (event) => {
        if (event.status === 'recognizing text') { setScanState('正在辨識收據…'); setProgress(Math.round((event.progress || 0) * 100)); }
        else if (event.status === 'loading language traineddata') { setScanState('正在下載繁體中文模型…'); setProgress(Math.round((event.progress || 0) * 100)); }
      });
      setForm((current) => ({ ...current, ...(result.invoiceNumber ? { invoiceNumber: result.invoiceNumber } : {}), ...(result.date ? { date: result.date } : {}), ...(result.amount ? { amount: result.amount } : {}) }));
      setScanState(result.text.trim() ? `辨識完成（信心度 ${result.confidence}%）；請核對欄位並自行輸入店家名稱。` : '沒有辨識到文字，請試試更清晰的照片。');
    } catch (err) { setScanState(err.message || '辨識失敗，請改用手動輸入。'); }
  }
  async function submit(event) {
    event.preventDefault();
    const message = validateInvoice(form);
    if (message) { setError(message); return; }
    setBusy(true); setError('');
    try { await onSave({ ...form, amount: Number(form.amount), invoiceNumber: form.invoiceNumber.trim() || null }); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="ledger-overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="ledger-dialog" onSubmit={submit}>
    <header><div><p className="ledger-kicker">EXPENSE DETAILS</p><h2>{initial ? '編輯消費' : '新增消費'}</h2></div><button type="button" className="ledger-close" onClick={onClose} aria-label="關閉">×</button></header>
    {!initial && <div className="ledger-scan"><input ref={fileInput} hidden type="file" accept="image/jpeg,image/png,image/webp,image/heic" capture="environment" onChange={(event) => { scan(event.target.files?.[0]); event.target.value = ''; }} /><button type="button" onClick={() => fileInput.current?.click()} disabled={scanState.startsWith('正在')}><span>📷</span> 拍照／上傳收據進行 OCR</button><small>圖片只在本機瀏覽器處理，不會上傳；建議選用清晰、未反光的照片。</small>{scanState && <p role="status">{scanState}{progress > 0 && progress < 100 ? ` ${progress}%` : ''}</p>}</div>}
    <div className="ledger-fields"><label className="wide">店家／項目<input required maxLength="120" value={form.merchant} onChange={(event) => update('merchant', event.target.value)} placeholder="例如：好日子咖啡" /></label><label>金額<input required type="number" min="0.01" max="100000000" step="0.01" value={form.amount} onChange={(event) => update('amount', event.target.value)} placeholder="0" /></label><label>日期<input required type="date" value={form.date} onChange={(event) => update('date', event.target.value)} /></label><label>類別<select value={form.category} onChange={(event) => update('category', event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label>類型<select value={form.kind} onChange={(event) => update('kind', event.target.value)}>{KINDS.map((item) => <option key={item}>{item}</option>)}</select></label><label className="wide">發票號碼（選填）<input maxLength="30" value={form.invoiceNumber || ''} onChange={(event) => update('invoiceNumber', event.target.value)} placeholder="例如：AB12345678" /></label><label className="wide">備註（選填）<textarea rows="2" maxLength="500" value={form.notes || ''} onChange={(event) => update('notes', event.target.value)} /></label></div>
    {error && <p className="ledger-error">{error}</p>}<footer><button type="button" className="ledger-secondary" onClick={onClose}>取消</button><button className="ledger-primary" disabled={busy}>{busy ? '儲存中…' : '儲存消費'}</button></footer>
  </form></div>;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [startupError, setStartupError] = useState('');
  const [invoices, setInvoices] = useState([]);
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState('');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api('/api/auth/me')
      .then(({ user: current }) => { if (active) setUser(current); })
      .catch((err) => {
        if (active && err.status !== 401) setStartupError(err.message);
      })
      .finally(() => { if (active) setChecking(false); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    api('/api/invoices').then(({ invoices: rows }) => { if (active) { setInvoices(rows); setError(''); } }).catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [user]);
  useEffect(() => () => { terminateReceiptOcr(); }, []);
  const filtered = useMemo(() => invoices.filter((item) => `${item.merchant} ${item.invoiceNumber || ''} ${item.notes || ''}`.toLowerCase().includes(query.toLowerCase())), [invoices, query]);
  const total = invoices.reduce((sum, item) => sum + item.amount, 0);
  const thisMonth = invoices.filter((item) => new Date(item.date).toLocaleDateString('sv-SE').slice(0, 7) === today().slice(0, 7));
  async function refresh() { const { invoices: rows } = await api('/api/invoices'); setInvoices(rows); }
  async function save(form) {
    if (modal?.invoice) await api(`/api/invoices/${modal.invoice.id}`, { method: 'PUT', body: JSON.stringify(form) });
    else await api('/api/invoices', { method: 'POST', body: JSON.stringify(form) });
    await refresh(); setNotice(modal?.invoice ? '消費資料已更新' : '消費已新增'); window.setTimeout(() => setNotice(''), 2500);
  }
  async function remove(item) {
    if (!window.confirm(`確定刪除「${item.merchant}」這筆消費嗎？`)) return;
    try { await api(`/api/invoices/${item.id}`, { method: 'DELETE' }); await refresh(); } catch (err) { setError(err.message); }
  }
  async function logout() { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); setInvoices([]); }

  if (checking) return <main className="ledger-loading" role="status"><span className="ledger-spinner" />正在確認登入狀態…</main>;
  if (!user) return <Auth onAuthenticated={setUser} startupError={startupError} />;
  return <main className="ledger-page"><header className="ledger-top"><a className="ledger-brand" href="#home"><span className="ledger-logo">收</span><span>發票存摺<small>PRO · PERSONAL LEDGER</small></span></a><div className="ledger-account">{user.email}<button onClick={logout}>登出</button></div></header>
    <section className="ledger-welcome"><p className="ledger-kicker">PERSONAL FINANCE</p><h1>每一筆消費，都好好收藏。</h1><p>集中管理發票、收據與網購消費。</p></section>
    <section className="ledger-summary"><article><span>本月支出</span><strong>{money.format(thisMonth.reduce((sum, item) => sum + item.amount, 0))}</strong><small>{thisMonth.length} 筆消費</small></article><article><span>累計消費</span><strong>{money.format(total)}</strong><small>所有已記錄消費</small></article><article><span>消費筆數</span><strong>{invoices.length}</strong><small>平均 {money.format(invoices.length ? Math.round(total / invoices.length) : 0)}</small></article></section>
    <section className="ledger-list"><header><div><h2>消費紀錄</h2><p>共 {filtered.length} 筆</p></div><div className="ledger-tools"><input aria-label="搜尋" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜尋店家、發票號碼…" /><button className="ledger-primary" onClick={() => setModal({})}>＋ 新增消費</button></div></header>
      {(error || notice) && <p className={error ? 'ledger-error' : 'ledger-notice'} role={error ? 'alert' : 'status'}>{error || notice}</p>}
      {filtered.length ? <div className="ledger-table-wrap"><table><thead><tr><th>店家／項目</th><th>類別</th><th>日期</th><th>類型</th><th>金額</th><th>操作</th></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><strong>{item.merchant}</strong><small>{item.invoiceNumber || item.notes || '—'}</small></td><td>{item.category}</td><td>{new Intl.DateTimeFormat('zh-TW').format(new Date(item.date))}</td><td>{item.kind}</td><td className="ledger-amount">{money.format(item.amount)}</td><td><button className="ledger-text-button" onClick={() => setModal({ invoice: { ...item, date: new Date(item.date).toLocaleDateString('sv-SE') } })}>編輯</button><button className="ledger-text-button danger" onClick={() => remove(item)}>刪除</button></td></tr>)}</tbody></table></div> : <div className="ledger-empty"><strong>{invoices.length ? '找不到符合條件的消費' : '還沒有消費紀錄'}</strong><p>{invoices.length ? '試試其他搜尋關鍵字。' : '新增第一筆消費，開始整理生活帳本。'}</p></div>}
    </section><footer className="ledger-footer">消費資料依帳號隔離儲存 · OCR 圖片只在本機瀏覽器辨識</footer>{modal && <ExpenseForm initial={modal.invoice} onClose={() => setModal(null)} onSave={save} />}
  </main>;
}
