import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend } from 'chart.js';
import { Camera, LogOut, Plus, Search, ReceiptText, Wallet, TrendingUp, ListFilter, X, Pencil, Trash2, LoaderCircle, Sparkles } from 'lucide-react';
import { createWorker } from 'tesseract.js';

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, Tooltip, Legend);
const money = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
const categories = ['餐飲', '交通', '購物', '居家', '娛樂', '醫療', '教育', '其他'];
const blankForm = () => ({ merchant: '', amount: '', date: new Date().toISOString().slice(0, 10), category: '其他', kind: '發票', invoiceNumber: '', notes: '' });

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || '連線失敗，請稍後再試。');
  }
  return response.status === 204 ? null : response.json();
}

function AuthScreen({ onLogin }) {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault(); setError(''); setBusy(true);
    try {
      const result = await api(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ email, password }) });
      onLogin(result.user);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card"><div className="brand-mark"><ReceiptText size={25} /></div><p className="eyebrow">YOUR PERSONAL LEDGER</p><h1>每一筆消費，<br />都好好收藏。</h1><p className="auth-copy">發票、收據與網購消費，集中管理更清楚。</p><form onSubmit={submit} className="auth-form"><label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" /></label><label>密碼<input type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength="8" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="至少 8 個字元" /></label>{error && <p className="error-text">{error}</p>}<button className="primary-button full-button" disabled={busy}>{busy ? '請稍候…' : mode === 'login' ? '登入帳號' : '建立帳號'}</button></form><p className="auth-switch">{mode === 'login' ? '還沒有帳號？' : '已經有帳號？'} <button onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); }}>{mode === 'login' ? '立即註冊' : '返回登入'}</button></p><p className="privacy-note">🔒 密碼經安全雜湊儲存，消費資料僅供本人查看</p></section></main>;
}

function InvoiceModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || blankForm());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrMessage, setOcrMessage] = useState('');
  const fileRef = useRef(null);
  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  async function scan(file) {
    if (!file) return;
    setOcrBusy(true); setOcrMessage('正在辨識收據，首次使用可能需要下載語言模型…');
    let worker;
    try {
      worker = await createWorker('chi_tra+eng');
      const { data: { text } } = await worker.recognize(file);
      const invoiceMatch = text.match(/[A-Z]{2}[- ]?\d{8}/i);
      const dateMatch = text.match(/(20\d{2})[年/.-]\s?(\d{1,2})[月/.-]\s?(\d{1,2})/);
      const amountMatch = text.match(/(?:總計|合計|總額|TOTAL|NT\$?)\s*[:：$]??\s*([\d,]{1,10})/i) || text.match(/\b([1-9]\d{1,6})\s*(?:元|NTD)\b/i);
      const date = dateMatch ? `${dateMatch[1]}-${String(dateMatch[2]).padStart(2, '0')}-${String(dateMatch[3]).padStart(2, '0')}` : '';
      setForm((current) => ({ ...current, ...(invoiceMatch ? { invoiceNumber: invoiceMatch[0].replace(' ', '').toUpperCase() } : {}), ...(date ? { date } : {}), ...(amountMatch ? { amount: amountMatch[1].replaceAll(',', '') } : {}) }));
      setOcrMessage(text.trim() ? '辨識完成，請核對欄位並手動補上店家名稱。' : '沒有辨識到文字，請試試更清晰的照片。');
    } catch { setOcrMessage('辨識失敗，請確認網路連線或手動填寫資料。'); }
    finally { if (worker) await worker.terminate(); setOcrBusy(false); }
  }

  async function submit(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await onSave({ ...form, amount: Number(form.amount), invoiceNumber: form.invoiceNumber || null }); onClose(); }
    catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && !ocrBusy && onClose()}><section className="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-heading"><div><p className="eyebrow">EXPENSE DETAILS</p><h2 id="modal-title">{initial ? '編輯消費' : '新增消費'}</h2></div><button className="icon-button" onClick={onClose} aria-label="關閉"><X size={20} /></button></div>{!initial && <div className="scan-area"><input ref={fileRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => scan(e.target.files?.[0])} /><button type="button" className="scan-button" disabled={ocrBusy} onClick={() => fileRef.current?.click()}><Camera size={17} />{ocrBusy ? '辨識中…' : '拍照／上傳收據進行 OCR'}</button><span className="scan-hint">照片只在本機瀏覽器辨識，不會上傳</span>{ocrMessage && <p className="scan-message">{ocrBusy && <LoaderCircle size={14} className="spin" />}{ocrMessage}</p>}</div>}<form onSubmit={submit} className="invoice-form"><div className="form-grid"><label className="wide-field">店家名稱<input required maxLength="120" value={form.merchant} onChange={(e) => set('merchant', e.target.value)} placeholder="例如：好日子咖啡" /></label><label>消費金額<input required type="number" min="1" step="1" value={form.amount} onChange={(e) => set('amount', e.target.value)} placeholder="0" /></label><label>消費日期<input required type="date" value={form.date} onChange={(e) => set('date', e.target.value)} /></label><label>消費類別<select value={form.category} onChange={(e) => set('category', e.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></label><label>消費類型<select value={form.kind} onChange={(e) => set('kind', e.target.value)}>{['發票', '收據', '網購'].map((kind) => <option key={kind}>{kind}</option>)}</select></label><label className="wide-field">發票號碼 <span className="optional">選填</span><input maxLength="30" value={form.invoiceNumber || ''} onChange={(e) => set('invoiceNumber', e.target.value)} placeholder="例如：AB12345678" /></label><label className="wide-field">備註 <span className="optional">選填</span><textarea rows="2" maxLength="500" value={form.notes || ''} onChange={(e) => set('notes', e.target.value)} placeholder="記下這筆消費的細節…" /></label></div>{error && <p className="error-text">{error}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose}>取消</button><button className="primary-button" disabled={busy || ocrBusy}>{busy ? '儲存中…' : initial ? '儲存變更' : '儲存消費'}</button></div></form></section></div>;
}

function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(true);
  const [invoices, setInvoices] = useState([]);
  const [modal, setModal] = useState(null);
  const [query, setQuery] = useState('');
  const [month, setMonth] = useState('all');
  const [category, setCategory] = useState('all');
  const [kind, setKind] = useState('all');
  const [toast, setToast] = useState('');
  const [loadError, setLoadError] = useState('');
  const showToast = (message) => { setToast(message); window.setTimeout(() => setToast(''), 2800); };
  const loadInvoices = useCallback(async () => {
    const result = await api('/api/invoices'); setInvoices(result.invoices); setLoadError('');
  }, []);
  useEffect(() => { api('/api/auth/me').then(({ user: current }) => setUser(current)).catch(() => {}).finally(() => setChecking(false)); }, []);
  useEffect(() => { if (user) loadInvoices().catch((err) => setLoadError(err.message)); }, [user, loadInvoices]);

  const availableMonths = useMemo(() => [...new Set(invoices.map((item) => new Date(item.date).toISOString().slice(0, 7)))].sort().reverse(), [invoices]);
  const filtered = useMemo(() => invoices.filter((item) => {
    const date = new Date(item.date).toISOString().slice(0, 7);
    const text = `${item.merchant} ${item.invoiceNumber || ''} ${item.notes || ''}`.toLowerCase();
    return (month === 'all' || date === month) && (category === 'all' || item.category === category) && (kind === 'all' || item.kind === kind) && text.includes(query.toLowerCase());
  }), [invoices, month, category, kind, query]);
  const currentMonth = new Date().toISOString().slice(0, 7);
  const monthItems = invoices.filter((item) => new Date(item.date).toISOString().slice(0, 7) === currentMonth);
  const monthTotal = monthItems.reduce((sum, item) => sum + item.amount, 0);
  const total = invoices.reduce((sum, item) => sum + item.amount, 0);
  const average = invoices.length ? Math.round(total / invoices.length) : 0;
  const categoryTotals = useMemo(() => categories.map((name) => invoices.filter((item) => item.category === name).reduce((sum, item) => sum + item.amount, 0)).filter((amount) => amount > 0), [invoices]);
  const categoryNames = useMemo(() => categories.filter((name) => invoices.some((item) => item.category === name)), [invoices]);
  const chartColors = ['#647b68', '#d99964', '#7896a0', '#bd796f', '#9c8cb3', '#d0b562', '#6c9b8c', '#9a9b91'];
  const categoryChart = { labels: categoryNames, datasets: [{ data: categoryTotals, backgroundColor: chartColors, borderWidth: 0, hoverOffset: 5 }] };
  const recentMonths = useMemo(() => Array.from({ length: 6 }, (_, index) => { const date = new Date(); date.setDate(1); date.setMonth(date.getMonth() - (5 - index)); return date.toISOString().slice(0, 7); }), []);
  const monthlyChart = { labels: recentMonths.map((value) => `${Number(value.slice(5))}月`), datasets: [{ label: '消費金額', data: recentMonths.map((value) => invoices.filter((item) => new Date(item.date).toISOString().slice(0, 7) === value).reduce((sum, item) => sum + item.amount, 0)), backgroundColor: '#78947c', borderRadius: 7, maxBarThickness: 30 }] };
  const chartOptions = { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => money.format(context.raw) } } }, scales: { x: { grid: { display: false }, border: { display: false }, ticks: { color: '#888d85', font: { family: 'inherit' } } }, y: { beginAtZero: true, grid: { color: '#edf0eb' }, border: { display: false }, ticks: { color: '#888d85', font: { family: 'inherit' }, callback: (value) => value >= 10000 ? `${value / 1000}k` : value } } } };

  async function saveInvoice(data, existing) {
    if (existing) await api(`/api/invoices/${existing.id}`, { method: 'PUT', body: JSON.stringify(data) });
    else await api('/api/invoices', { method: 'POST', body: JSON.stringify(data) });
    await loadInvoices(); showToast(existing ? '消費資料已更新' : '消費已新增');
  }
  async function removeInvoice(item) {
    if (!window.confirm(`確定刪除「${item.merchant}」這筆消費嗎？`)) return;
    try { await api(`/api/invoices/${item.id}`, { method: 'DELETE' }); await loadInvoices(); showToast('消費已刪除'); }
    catch (error) { showToast(error.message); }
  }
  async function logout() { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); setUser(null); setInvoices([]); }

  if (checking) return <div className="loading-page"><LoaderCircle className="spin" size={26} /></div>;
  if (!user) return <AuthScreen onLogin={setUser} />;
  return <div className="app-shell"><aside className="sidebar"><a href="#home" className="brand"><span className="brand-mark"><ReceiptText size={22} /></span><span>發票存摺<small>PRO · PERSONAL LEDGER</small></span></a><p className="nav-caption">工作空間</p><a className="nav-item active" href="#home"><Wallet size={18} />消費總覽</a><div className="sidebar-bottom"><div className="user-avatar">{user.email[0].toUpperCase()}</div><div className="user-details"><strong>{user.email}</strong><span>個人帳戶</span></div><button className="icon-button logout-button" title="登出" onClick={logout}><LogOut size={18} /></button></div></aside><main className="main-content"><header className="topbar"><div><p className="eyebrow">PERSONAL FINANCE</p><span className="today-label">{new Intl.DateTimeFormat('zh-TW', { dateStyle: 'full' }).format(new Date())}</span></div><button className="primary-button add-button" onClick={() => setModal({ type: 'new' })}><Plus size={18} />新增消費</button></header><section className="welcome-row"><div><p className="eyebrow">消費儀表板</p><h1>早安，今天也記一筆吧 <span>✦</span></h1><p className="muted">每一筆日常，都值得被好好記錄。</p></div><div className="welcome-art"><Sparkles size={23} /><span>記錄你的<br />生活日常</span></div></section>{loadError && <div className="error-banner">{loadError} <button onClick={() => loadInvoices().catch((err) => setLoadError(err.message))}>重新載入</button></div>}<section className="stat-grid"><article className="stat-card"><div className="stat-top"><span>本月支出</span><span className="stat-icon sage"><Wallet size={17} /></span></div><strong>{money.format(monthTotal)}</strong><small>{monthItems.length} 筆消費</small></article><article className="stat-card"><div className="stat-top"><span>累計消費</span><span className="stat-icon peach"><TrendingUp size={17} /></span></div><strong>{money.format(total)}</strong><small>所有已記錄消費</small></article><article className="stat-card"><div className="stat-top"><span>平均單筆</span><span className="stat-icon blue"><ReceiptText size={17} /></span></div><strong>{money.format(average)}</strong><small>共 {invoices.length} 筆消費</small></article></section><section className="chart-grid"><article className="panel trend-panel"><div className="panel-heading"><div><h2>消費趨勢</h2><p>近六個月的支出變化</p></div><span className="period-label">近 6 個月</span></div><div className="trend-chart">{invoices.length ? <Bar data={monthlyChart} options={chartOptions} /> : <div className="empty-chart">新增消費後，這裡會顯示月支出趨勢</div>}</div></article><article className="panel category-panel"><div className="panel-heading"><div><h2>類別分布</h2><p>消費類型一目瞭然</p></div></div><div className="donut-chart">{categoryNames.length ? <Doughnut data={categoryChart} options={{ responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false } } }} /> : <div className="empty-chart">尚無類別資料</div>}</div>{categoryNames.length > 0 && <div className="legend-list">{categoryNames.slice(0, 4).map((name, index) => <span key={name}><i style={{ background: chartColors[index] }} />{name}<b>{money.format(categoryTotals[index])}</b></span>)}</div>}</article></section><section className="panel transactions-panel"><div className="transactions-heading"><div><h2>消費紀錄</h2><p>共 {filtered.length} 筆符合條件</p></div><div className="filters"><label className="search-box"><Search size={16} /><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜尋店家、發票號碼…" /></label><select aria-label="月份篩選" value={month} onChange={(e) => setMonth(e.target.value)}><option value="all">所有月份</option>{availableMonths.map((value) => <option key={value} value={value}>{value.replace('-', ' 年 ')} 月</option>)}</select><select aria-label="類別篩選" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">所有類別</option>{categories.map((value) => <option key={value}>{value}</option>)}</select><select aria-label="類型篩選" value={kind} onChange={(e) => setKind(e.target.value)}><option value="all">所有類型</option>{['發票', '收據', '網購'].map((value) => <option key={value}>{value}</option>)}</select><ListFilter className="filter-icon" size={17} /></div></div><div className="table-wrap"><table><thead><tr><th>店家／項目</th><th>類別</th><th>日期</th><th>類型</th><th className="amount-cell">金額</th><th aria-label="操作" /></tr></thead><tbody>{filtered.map((item) => <tr key={item.id}><td><div className="merchant-cell"><span className="merchant-icon"><ReceiptText size={17} /></span><span><strong>{item.merchant}</strong><small>{item.invoiceNumber || item.notes || '—'}</small></span></div></td><td><span className="category-pill">{item.category}</span></td><td>{new Intl.DateTimeFormat('zh-TW').format(new Date(item.date))}</td><td><span className="kind-label">{item.kind}</span></td><td className="amount-cell">{money.format(item.amount)}</td><td><div className="row-actions"><button className="icon-button" aria-label="編輯" onClick={() => setModal({ type: 'edit', invoice: { ...item, date: new Date(item.date).toISOString().slice(0, 10) } })}><Pencil size={15} /></button><button className="icon-button delete-action" aria-label="刪除" onClick={() => removeInvoice(item)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table>{filtered.length === 0 && <div className="empty-list"><span className="empty-icon"><ReceiptText size={23} /></span><strong>{invoices.length ? '找不到符合條件的消費' : '還沒有消費紀錄'}</strong><p>{invoices.length ? '試試調整搜尋關鍵字或篩選條件。' : '新增第一筆消費，開始整理你的生活帳本。'}</p>{!invoices.length && <button className="primary-button" onClick={() => setModal({ type: 'new' })}><Plus size={16} />新增第一筆</button>}</div>}</div></section><footer>你的消費資料安全儲存，僅供本人查看。<span>發票存摺 Pro · 記錄每一份日常</span></footer></main>{modal && <InvoiceModal key={modal.type === 'edit' ? modal.invoice.id : 'new'} initial={modal.type === 'edit' ? modal.invoice : null} onClose={() => setModal(null)} onSave={(data) => saveInvoice(data, modal.type === 'edit' ? modal.invoice : null)} />}{toast && <div className="toast-message">{toast}</div>}</div>;
}

export default App;
