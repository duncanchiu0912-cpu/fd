<script setup>
import { computed, onMounted, ref } from 'vue';

const user = ref(null);
const invoices = ref([]);
const mode = ref('login');
const email = ref('');
const password = ref('');
const query = ref('');
const error = ref('');
const form = ref(null);
const busy = ref(false);
const money = new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD', maximumFractionDigits: 0 });
const visible = computed(() => invoices.value.filter((row) => `${row.merchant} ${row.invoiceNumber || ''} ${row.notes || ''}`.toLowerCase().includes(query.value.toLowerCase())));
const total = computed(() => invoices.value.reduce((sum, row) => sum + row.amount, 0));
const categories = ['餐飲', '交通', '購物', '居家', '娛樂', '醫療', '教育', '其他'];
const kinds = ['發票', '收據', '網購'];
const blankForm = () => ({ merchant: '', amount: '', date: new Date().toLocaleDateString('sv-SE'), category: '其他', kind: '發票', invoiceNumber: '', notes: '' });

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'include', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || '連線失敗，請稍後再試。');
  return data;
}
async function load() { invoices.value = (await api('/api/invoices')).invoices; }
async function authenticate() {
  error.value = '';
  if (!email.value.trim() || password.value.length < 8) { error.value = '請輸入有效 Email 與至少 8 個字元的密碼。'; return; }
  busy.value = true;
  try { user.value = (await api(`/api/auth/${mode.value}`, { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) })).user; await load(); }
  catch (err) { error.value = err.message; } finally { busy.value = false; }
}
function edit(row = null) { form.value = row ? { ...row, date: new Date(row.date).toLocaleDateString('sv-SE') } : blankForm(); error.value = ''; }
async function save() {
  const row = form.value;
  if (!row.merchant.trim() || !Number.isFinite(Number(row.amount)) || Number(row.amount) <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || row.notes.length > 500 || row.invoiceNumber.length > 30) { error.value = '請確認店家、金額、日期及文字欄位。'; return; }
  busy.value = true;
  try {
    const payload = { ...row, amount: Number(row.amount), invoiceNumber: row.invoiceNumber.trim() || null };
    await api(row.id ? `/api/invoices/${row.id}` : '/api/invoices', { method: row.id ? 'PUT' : 'POST', body: JSON.stringify(payload) });
    form.value = null; await load();
  } catch (err) { error.value = err.message; } finally { busy.value = false; }
}
async function remove(row) {
  if (!window.confirm(`確定刪除「${row.merchant}」？`)) return;
  try { await api(`/api/invoices/${row.id}`, { method: 'DELETE' }); await load(); } catch (err) { error.value = err.message; }
}
async function logout() { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); user.value = null; invoices.value = []; }
onMounted(async () => { try { user.value = (await api('/api/auth/me')).user; await load(); } catch { /* not signed in */ } });
</script>

<template>
  <main class="page">
    <section v-if="!user" class="auth card">
      <div class="logo">收</div><p class="eyebrow">YOUR PERSONAL LEDGER</p><h1>發票存摺 Pro</h1><p class="muted">以 Vue 3 實作的替代介面，共用相同 Express API。</p>
      <form @submit.prevent="authenticate"><label>Email<input v-model="email" type="email" required maxlength="254" autocomplete="email"></label><label>密碼<input v-model="password" type="password" required minlength="8" maxlength="128" :autocomplete="mode === 'login' ? 'current-password' : 'new-password'"></label><p v-if="error" class="error">{{ error }}</p><button class="primary" :disabled="busy">{{ busy ? '請稍候…' : mode === 'login' ? '登入' : '建立帳號' }}</button></form>
      <p class="switch">{{ mode === 'login' ? '還沒有帳號？' : '已有帳號？' }} <button @click="mode = mode === 'login' ? 'register' : 'login'; error = ''">{{ mode === 'login' ? '立即註冊' : '返回登入' }}</button></p>
    </section>
    <template v-else>
      <header class="top"><a class="brand" href="#">發票存摺 <small>PRO · VUE</small></a><span>{{ user.email }} <button class="link" @click="logout">登出</button></span></header>
      <section class="intro"><p class="eyebrow">PERSONAL FINANCE</p><h1>每一筆消費，都好好收藏。</h1><p class="muted">集中管理發票、收據與網購消費。</p></section>
      <section class="stats"><article class="card"><span>累計消費</span><strong>{{ money.format(total) }}</strong></article><article class="card"><span>消費筆數</span><strong>{{ invoices.length }}</strong></article><article class="card"><span>平均單筆</span><strong>{{ money.format(invoices.length ? Math.round(total / invoices.length) : 0) }}</strong></article></section>
      <section class="card records"><header class="records-head"><div><h2>消費紀錄</h2><p class="muted">共 {{ visible.length }} 筆</p></div><div class="actions"><input v-model="query" aria-label="搜尋" placeholder="搜尋店家或發票…"><button class="primary" @click="edit()">＋ 新增消費</button></div></header>
        <p v-if="error" class="error">{{ error }}</p><div v-if="visible.length" class="table-scroll"><table><thead><tr><th>店家／項目</th><th>類別</th><th>日期</th><th>類型</th><th>金額</th><th>操作</th></tr></thead><tbody><tr v-for="row in visible" :key="row.id"><td><strong>{{ row.merchant }}</strong><small>{{ row.invoiceNumber || row.notes || '—' }}</small></td><td>{{ row.category }}</td><td>{{ new Intl.DateTimeFormat('zh-TW').format(new Date(row.date)) }}</td><td>{{ row.kind }}</td><td class="amount">{{ money.format(row.amount) }}</td><td><button class="link" @click="edit(row)">編輯</button><button class="link danger" @click="remove(row)">刪除</button></td></tr></tbody></table></div><div v-else class="empty">{{ invoices.length ? '沒有符合搜尋條件的資料。' : '尚無消費紀錄，新增第一筆開始使用。' }}</div>
      </section><footer class="foot">此 Vue 介面沿用 React 版相同的 `/api/auth` 與 `/api/invoices` API。</footer>
    </template>
    <div v-if="form" class="overlay" @click.self="form = null"><form class="dialog card" @submit.prevent="save"><header><h2>{{ form.id ? '編輯消費' : '新增消費' }}</h2><button type="button" class="link" @click="form = null">關閉</button></header><label>店家／項目<input v-model="form.merchant" required maxlength="120"></label><div class="grid"><label>金額<input v-model="form.amount" type="number" min="0.01" max="100000000" step="0.01" required></label><label>日期<input v-model="form.date" type="date" required></label><label>類別<select v-model="form.category"><option v-for="value in categories" :key="value">{{ value }}</option></select></label><label>類型<select v-model="form.kind"><option v-for="value in kinds" :key="value">{{ value }}</option></select></label></div><label>發票號碼（選填）<input v-model="form.invoiceNumber" maxlength="30"></label><label>備註（選填）<textarea v-model="form.notes" maxlength="500" rows="2"></textarea></label><p v-if="error" class="error">{{ error }}</p><button class="primary" :disabled="busy">{{ busy ? '儲存中…' : '儲存消費' }}</button></form></div>
  </main>
</template>
