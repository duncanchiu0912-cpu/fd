# 發票存摺 Pro

繁體中文個人消費管理系統。React + Vite 前端、Node.js + Express API、Prisma + SQLite 資料庫，並提供可獨立啟動的 Vue 3 替代介面。使用者帳號、收據 CRUD、搜尋、統計和瀏覽器端 OCR 均已包含。

## 開發環境

需求：Node.js 20+、npm。

```bash
npm install
cp .env.example .env
```

編輯 `.env`，設定唯一的強隨機 `JWT_SECRET`（至少 32 bytes；可用 `openssl rand -base64 48` 產生）。初始化資料庫及啟動 React 前端與 API：

```bash
npm run db:push
npm run dev
```

開啟 Vite 顯示的網址（預設 `http://localhost:5173`）。API 預設埠號 3001。第一次建立帳號即可使用。Prisma SQLite 資料庫路徑以 schema 檔案所在位置為基準，預設是 `server/prisma/dev.db`；執行 `npm run db:studio` 可檢視。

## Vue 介面

Vue 版本與 React 共用 API、資料庫及 Cookie 認證，但有獨立 Vite 設定及入口：

```bash
npm run dev:api       # 終端機一：API
npm run dev:vue       # 終端機二：Vue 開發伺服器
npm run build:vue     # 建置至 dist-vue/
```

React 是預設介面；使用 `npm run dev` 和 `npm run build`。Vue 專案位於 `vue/`，入口為 `vue/index.html`，設定檔為 `vite.vue.config.js`。

## 功能與 OCR

- 註冊、登入與登出；bcrypt 密碼雜湊、JWT HttpOnly Cookie，消費 CRUD 限定於登入者本人。
- 發票、收據、網購支出；按店家／發票號碼／備註搜尋。
- 每月支出、累計消費、平均金額與消費筆數。
- 手機拍照或圖片上傳。React 介面使用 Tesseract.js 在瀏覽器辨識繁體中文與英文，預處理圖片（灰階、對比及適度放大），OCR worker 延遲載入並重用；嘗試擷取統一發票號碼、民國或西元日期及總額，顯示信心度供人工核對。店家名稱需自行輸入或核對。
- 僅接受圖片，大小上限 12 MB；圖片不會傳到 API。瀏覽器首次使用需連網下載 Tesseract.js worker 和語言模型，建議在 HTTPS 或 localhost 使用相機。
- OCR 結果只是填表輔助，收據照片品質、版面及辨識模型都會影響正確度，儲存前務必核對。

Vue 介面目前提供共用 API 的登入和消費管理表單；用戶端 OCR 可沿用 `src/lib/receiptOcr.js`。

## API

- `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/invoices`, `POST /api/invoices`, `PUT /api/invoices/:id`, `DELETE /api/invoices/:id`
- `GET /api/health`

所有發票 API 要求登入並以 userId 隔離資料。後端以 Zod 驗證欄位，回傳欄位錯誤；限制 JSON request body 64 KB、驗證日期實際有效性、註冊登入 rate limit。Vite 將 `/api` 代理到本機 API。

## 正式部署注意事項

- 使用獨立隨機密鑰、HTTPS 及 `NODE_ENV=production`。正式環境 Cookie 會啟用 `Secure`。
- React 建置使用 `npm run build`；Express 在 production 模式提供 `dist/` 靜態檔。Vue 使用 `npm run build:vue`，需將 `dist-vue/` 配置給靜態主機，API 仍由 Express 提供。
- SQLite 適合本機與小型示範。正式多服務部署建議 PostgreSQL，並設置備份、遷移與監控。
- OCR 語言模型從 Tesseract.js CDN 載入，須允許 worker/model 下載並配置符合部署需求的 CSP。
- 這是收據 OCR 輔助記帳工具，不會登入或串接電子發票平台，不會自動驗證發票真偽或兌獎。
