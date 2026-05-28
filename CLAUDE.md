# 實踐大學國際生面試系統 — Claude Code 開發指南

## 專案概覽
實踐大學國際生入學面試管理系統。React + Vite 前端，後端全走 Supabase（PostgreSQL），
部署在 Vercel（前端 + Edge Functions）。

- **前端 repo**: https://github.com/kkpantax/interview-system
- **線上網址**: https://interview-system-fawn.vercel.app
- **Supabase 專案**: https://lveekehjxkfvigwfwgvn.supabase.co

## 指令

```bash
npm run dev      # 本地開發（http://localhost:5173）
npm run build    # 建置（Vercel 自動執行，不須手動）
```

## 架構概覽

```
interview-system/
├── api/
│   └── submit.js          # Vercel Edge Function，代理所有 Supabase 請求（避免 CORS）
├── src/
│   ├── App.jsx             # Hash router：#/admin #/stage1 #/stage2
│   ├── main.jsx
│   ├── api.js              # 所有 Supabase 操作（透過 /api/submit proxy）
│   ├── constants.js        # SCORE_ITEMS, QUESTIONS, DECISIONS, STATUS, XLS_FIELD_MAP
│   ├── pages/
│   │   ├── Landing.jsx     # 首頁，三入口選擇
│   │   ├── AdminApp.jsx    # 行政人員：匯入名單、指派日期、查看狀態
│   │   ├── Stage1App.jsx   # 第一階段老師：簽到、填中心
│   │   └── Stage2App.jsx   # 第二階段老師：評分
│   └── components/
│       ├── UI.jsx          # 共用元件：Btn, Card, CardHead, BackBtn, PageShell, s(styles)
│       ├── ScoreForm.jsx   # 評分表（SCORE_ITEMS + QUESTIONS）
│       ├── Stage2List.jsx  # 待評分名單
│       └── PageShell.jsx   # 頁面框架（title/subtitle/toast/right slot）
├── index.html
├── vite.config.js
└── package.json
```

## Supabase 資料表（現有）

### applications
| 欄位 | 類型 | 說明 |
|------|------|------|
| id | uuid PK | 自動產生 |
| account | text | 學生帳號（同一人3志願共用同帳號） |
| department | text | 科系名稱 |
| preference_order | int | 志願序（1/2/3） |
| name | text | 中文姓名 |
| name_english | text | 英文姓名 |
| passport_number | text | 護照號碼 |
| nationality | text | 國籍 |
| gender | text | 性別 |
| birth_date | text | 生日 |
| email | text | Email |
| phone | text | 電話 |
| high_school | text | 最高學歷 |
| status | text | pending / stage1_passed / rejected |
| interview_date | date | 面試日期 |
| stage1_passed_date | date | 一階通過日期 |
| center | text | 面試中心 |

### stage1_records
一階簽到記錄（application_id, sign_in_date, center, note）

### evaluations
二階評分記錄（application_id, eval_date, department, scores jsonb, total_score, recommendation, teacher_note）

## 代理層說明（重要）
前端**不直接呼叫** Supabase。所有請求都打 `/api/submit`（Vercel Edge Function），
格式固定為：
```js
fetch('/api/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ path: '/rest/v1/資料表名?...', method: 'GET|POST|PATCH', body: {...}, prefer: 'return=representation' })
})
```
新增資料表或 API 操作時，一律在 `src/api.js` 新增 function，走這個 proxy 格式。

## 程式碼風格
- 純 React（無 TypeScript）
- 不使用任何 CSS framework，所有樣式用 inline style，參考 `src/components/UI.jsx` 的 `s` 物件
- 共用樣式從 `UI.jsx` 的 `s` export 取用，不要重複定義
- 中文字串直接寫，不抽成常數
- 沒有測試，不需要寫測試檔
- import 順序：React → 頁面/元件 → api → constants

---

## 待開發需求（四個，請依序開發）

### 需求 1：行政人員 — 同帳號多志願合併顯示

**目標**：AdminApp 的學生列表，同一個 `account` 的多筆 application 合成 1 列，
點開可展開看所有志願。

**規格**：
- 前端在 `getAllApplications()` 取回資料後，用 `reduce` 按 `account` 分組
- 每列顯示：姓名、帳號、護照號碼、國籍、第1志願系所、面試日期
- 右側加「＋N 個志願」展開按鈕（N = 總志願數 - 1），點開顯示各志願序和系所名稱
- 指派面試日期時，對**同帳號所有 application id**同步指派（一個人面一次）
- 搜尋功能同樣對 account/姓名/護照號碼搜尋

**修改檔案**：`src/pages/AdminApp.jsx`（不動資料表）

---

### 需求 2：面試題目管理（第一 + 第二階段）

**目標**：第一階段和第二階段都有題目參考清單，老師面試時可看題目、記錄重點，
並可在現場自行**新增自訂題目**。

**固定題目（Stage1 和 Stage2 共用以下基礎題，顯示在評分表旁）**：
1. 請簡單介紹一下自己。
2. 為什麼想來台灣念書？
3. 為什麼選擇實踐大學與這個科系？
4. 你對這個科系目前有哪些了解？
5. 來台灣念書有什麼計畫或規劃？
6. 畢業後你會留在台灣工作嗎？
7. 有沒有想問我們的問題？

**自訂題目功能**：
- ScoreForm 下方加一個「自訂題目」區塊
- 老師可新增任意題目（輸入題目文字 → 點「＋ 新增」）
- 每題旁可輸入備註（學生的回答重點）
- 儲存評分時，自訂題目一起存入 evaluations

**資料表異動**：
```sql
ALTER TABLE evaluations
  ADD COLUMN IF NOT EXISTS stage smallint DEFAULT 2,
  ADD COLUMN IF NOT EXISTS custom_questions jsonb DEFAULT '[]';
```
`custom_questions` 格式：`[{ question: "...", note: "..." }]`

**constants.js 異動**：
- 將現有 `QUESTIONS` 改名為 `QUESTIONS_STAGE2`
- 新增 `QUESTIONS_STAGE1`（同上面7題，但 Stage1 只顯示前5題較基本的）
- Stage1App 的評分（若有）使用 QUESTIONS_STAGE1

**修改檔案**：`src/constants.js`, `src/components/ScoreForm.jsx`

---

### 需求 3：老師帳號管理

**目標**：行政人員可在系統內新增老師帳號（帳號+密碼+角色），老師用帳密登入後才能進入 stage1/stage2。

**新增 Supabase 資料表**：
```sql
CREATE TABLE IF NOT EXISTS teachers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  password_hash text NOT NULL,  -- 用 btoa(username + ':' + password) 簡單編碼即可，非正式加密
  display_name text,
  role text CHECK (role IN ('stage1', 'stage2', 'both')),
  department text,              -- stage2 老師專屬科系（stage1 老師填 null）
  created_at timestamptz DEFAULT now()
);
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON teachers FOR ALL USING (true);
```

**前端流程**：
1. `src/pages/Landing.jsx` — stage1/stage2 按鈕改為點擊後先導到 `#/login?stage=1` 或 `#/login?stage=2`
2. 新增 `src/pages/TeacherLogin.jsx` — 輸入帳號密碼，驗證成功後將 teacher 資訊存入 `sessionStorage`（key: `teacher`），再導回目標頁面
3. `Stage1App.jsx` / `Stage2App.jsx` 頂端加守衛：沒有 `sessionStorage.teacher` 就導回 login
4. 登入驗證邏輯：從 `teachers` 表撈 `username` 對應的 row，比對 `password_hash === btoa(username + ':' + password)`

**行政人員老師管理頁**：
- `AdminApp.jsx` 新增「老師管理」分頁（TabBar 加一個 tab）
- 顯示老師列表（display_name, username, role, department）
- 可新增老師（表單：帳號、密碼、顯示名稱、角色、科系）
- 可刪除老師

**api.js 新增**：
```js
export async function getTeachers() { ... }
export async function createTeacher(row) { ... }
export async function deleteTeacher(id) { ... }
export async function loginTeacher(username, password) { ... }
```

**修改檔案**：`src/api.js`, `src/pages/Landing.jsx`, `src/pages/Stage1App.jsx`,
`src/pages/Stage2App.jsx`, `src/pages/AdminApp.jsx`
**新增檔案**：`src/pages/TeacherLogin.jsx`
**修改路由**：`src/App.jsx` 加 `#/login` 路由

---

### 需求 4：第三階段 — 最終錄取名單

**目標**：行政人員可看到兩個階段的評分結果，做最終錄取確認，並自動偵測同帳號跨系重複錄取。

**新增 Supabase 資料表**：
```sql
CREATE TABLE IF NOT EXISTS final_admissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account text NOT NULL,
  department text NOT NULL,
  final_status text DEFAULT 'pending'
    CHECK (final_status IN ('admitted', 'waitlisted', 'rejected', 'pending')),
  stage1_score numeric,
  stage2_score numeric,
  stage2_recommendation text,
  admin_note text,
  confirmed_at timestamptz,
  UNIQUE(account, department)
);
ALTER TABLE final_admissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "allow all" ON final_admissions FOR ALL USING (true);
```

**新增 `src/pages/Stage3App.jsx`**，功能：

1. **科系分頁檢視**：左側科系清單，點選後右側顯示該系通過兩階段的學生，
   每列顯示：姓名、帳號、一階分數、二階分數、老師建議（admit/waitlist/reject）、目前最終狀態

2. **衝突偵測**：頁面頂端顯示警示區，列出同一個 `account` 在多個系所都有 `recommendation = 'admit'` 的學生，
   格式：「⚠ 帳號 [account] ([姓名]) 同時在以下科系被建議錄取：設計學系、餐飲學系」

3. **行政人員確認**：點每位學生旁的按鈕，可設定 `final_status`（正取 / 備取 / 不錄取 / 待定）

4. **各系錄取總覽**：上方 summary bar 顯示各系已正取幾人、備取幾人

5. **匯出功能**：匯出「正取名單」Excel（帳號、姓名、英文名、科系、最終狀態）

**api.js 新增**：
```js
export async function getStage3Data()           // 撈所有 evaluations + applications（已通過一階）
export async function getFinalAdmissions()       // 撈 final_admissions
export async function upsertFinalAdmission(row)  // 更新最終錄取狀態
```

**修改檔案**：`src/api.js`, `src/pages/AdminApp.jsx`（Stage3 入口），`src/App.jsx`
**新增檔案**：`src/pages/Stage3App.jsx`
**修改 Landing.jsx**：加入第三階段入口（管理員專用）

---

## 開發注意事項

1. **Supabase SQL 異動**要貼給我執行，不要直接呼叫 Supabase Management API。
   每次需要建新表或 ALTER TABLE，請輸出完整 SQL，我會在 Supabase Dashboard 執行。

2. **不要動 `api/submit.js`**（Vercel Edge Function），所有新 API 操作都在 `src/api.js` 加 function，
   走現有的 `callProxy` pattern。

3. **樣式統一**：參考 `src/components/UI.jsx` 的 `s` 物件取用顏色、border、input 等樣式，
   新頁面的 inline style 要跟現有頁面視覺一致。

4. **不加 router library**：維持現有 `window.location.hash` 做路由，`App.jsx` 用 `if/else` 判斷。

5. **Vercel 部署**：`git push` 到 main branch 即自動部署，不需要任何額外指令。

6. 每次完成一個需求後，請說明：
   - 哪些檔案有改動
   - 需要在 Supabase 執行哪些 SQL（若有）
   - 如何測試驗證
