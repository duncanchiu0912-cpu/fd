# 發票存摺 Pro

繁體中文個人電商收據／發票管理系統。以 React + Vite 前端、Node.js + Express API、Prisma + SQLite 建置，支援會員帳號隔離、消費管理、搜尋篩選、趨勢圖表，以及在瀏覽器本機執行的收據 OCR。

## 開發環境

需要 Node.js 20 或更新版本與 npm。

1. 安裝相依套件：
   ```bash
   npm install
   ```
2. 複製 `.env.example` 為根目錄 `.env`，並將 `JWT_SECRET` 換成至少 32 字元的強隨機密鑰。
3. 建立／更新本機 SQLite 資料庫並啟動前後端：
   ```bash
   npm run db:push
   npm run dev
   ```
4. 開啟 Vite 顯示的網址（預設 http://localhost:5173）。API 預設埠號為 3001。

首次建立帳號即可使用。密碼以 bcrypt 雜湊；登入狀態儲存在 HttpOnly Cookie。開發資料庫預設為 `server/prisma/dev.db`，可用 `npm run db:studio` 檢視。

## 功能

- 會員註冊、登入與登出；所有消費資料以使用者帳號隔離。
- 新增、編輯、刪除發票、收據及網購消費。
- 每月支出、累計消費、平均單筆金額與消費筆數。
- 六個月消費趨勢圖、類別支出圓餅圖，並可依月份、類別、類型及關鍵字篩選。
- 手機拍照或上傳圖片，使用 Tesseract.js 在瀏覽器辨識繁體中文及英文；辨識結果可核對、修改後再儲存。

OCR 會嘗試辨識發票號碼、日期和金額，店家名稱需手動填寫或核對。辨識會受照片品質、字體及收據格式影響，無法保證完全正確。圖片不會上傳到伺服器。首次掃描需要下載 Tesseract.js 語言模型；瀏覽器須能存取模型 CDN。相機功能建議使用 HTTPS 或 localhost。

## API

- `POST /api/auth/register`、`POST /api/auth/login`、`POST /api/auth/logout`、`GET /api/auth/me`
- `GET /api/invoices`、`POST /api/invoices`、`PUT /api/invoices/:id`、`DELETE /api/invoices/:id`
- `GET /api/health`

所有發票 API 均要求登入，並限制操作於目前使用者的資料。前端由 Vite 將 `/api` 代理到本機 API。

## 正式部署注意事項

- 使用至少 32 字元的隨機 `JWT_SECRET`，設定 `NODE_ENV=production`，全站啟用 HTTPS；正式環境的登入 Cookie 會要求 Secure。
- SQLite 適合本機與小型示範。多服務或正式環境建議改用 PostgreSQL、配置備份與監控，並依正式部署方式執行前端建置（`npm run build`）。
- OCR 在用戶端執行，語言模型由 Tesseract.js CDN 載入；請確認網路及內容安全政策允許載入相依的 worker／模型。
- 本系統是收據 OCR 輔助記帳工具，不會登入或串接電子發票平台，也不會自動驗證發票真偽或兌獎。

目前提供 React + Node.js 執行版本。API 與 UI 分離；Vue 介面可沿用相同 REST API，無需更動資料庫或登入服務。
