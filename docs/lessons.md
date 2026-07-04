# Lessons

## 學生端公開頁自成一體，不共用 UI.jsx 的 s
- **為什麼**：ConfirmApp / OnboardApp 這類 token landing 頁是給學生手機看的獨立頁面，
  自帶 wrap/card/infoBox/sectionBox 樣式與四語 T 字典（zh/en/vi/id）+ `langOf(nationality)`，
  與後台 UI.jsx 的 `s` 分離，避免後台改樣式波及學生端。
- **怎麼應用**：新增學生端頁面時直接複製 ConfirmApp 的骨架（ACCENT `#7c2d12`、
  card maxWidth 480、langBar），不要 import UI.jsx。

## token-only 公開 edge function 的固定模式
- **為什麼**：api/confirm.js / api/onboard.js 唯一憑證是 confirm_token，絕不接受 account/id；
  用 `SUPABASE_SERVICE_ROLE_KEY`（只在 Vercel 環境變數）查詢，select 只挑學生可見的安全欄位
  （排除 passport_number、drive_folder_id 等）。
- **怎麼應用**：新公開端點鏡像 confirm.js：`export const config = { runtime: 'edge' }`、
  `json()` helper、先驗 method → 驗 KEY → 驗 token → 只回 token 命中那一列。
  唯讀端點可用 GET；會寫入或怕 mail client prefetch 誤觸的用 POST。

## enroll_progress.step 是數字 1~5，不是字串 key
- **為什麼**：Phase 1 憑空假設 step 存 'confirm'/'payment' 等字串 key，實測
  `/api/onboard?token=test-onboard-0001` 才發現 DB 回的是 `{"1":{...},"5":{...}}`。
  前端用字串 key 查 progress 全部落空 → 所有步驟被當 locked、gating 整個錯。
- **怎麼應用**：接一張「別人已建好」的表之前，先打一筆真資料驗 schema 實際型別
  （curl 部署端點或 execute_sql），不要照規格文字腦補。ENROLL_STEPS 現在同時帶
  `step`（數字，查 DB）與 `key`（程式識別名），查 progress/settings 一律用 `st.step`。

## onboard 五步 gating 在前端算，不信 DB 原始 state
- **為什麼**：enroll_progress 可能缺列或狀態不一致；顯示規則是「confirmed 保持 ✓、
  最低一個非 confirmed 的步驟顯示 open（DB 標 submitted 則顯示待確認）、其後一律 locked」。
  前端 `effectiveStates()` 統一推導，缺列預設 locked。
- **怎麼應用**：Phase 2 做寫入時，伺服器端也要用同一 gating 規則擋非當前步驟的提交，
  不能只靠前端鎖。

## 行政人員貼的「圖片網址」多半是 Drive 分享頁，不是圖片檔
- **為什麼**：設定頁 LINE QR 顯示不出來，查 enroll_config 發現存的是
  `drive.google.com/file/d/ID/view?usp=sharing`（HTML 頁），`<img src>` 讀不到。
  行政人員的心智模型是「複製分享連結」，不會知道要直連圖檔。
- **怎麼應用**：凡是讓行政輸入圖片網址的欄位，顯示端一律過 `driveImageUrl()`（src/utils.js），
  自動把 Drive 分享連結轉成 `lh3.googleusercontent.com/d/ID`（檔案須開「知道連結者可檢視」）。
  排查這類問題先 execute_sql 看 DB 實際存值，不要只看前端程式。

## Supabase REST 整表查詢超過 1000 列會被無聲截斷
- **為什麼**：onboard 後台漏斗加總 203 ≠ 總人數 208。查 DB 才發現 enroll_progress 已 1045 列
  （209 人 × 5 步），PostgREST 預設單次最多回 1000 列且不報錯，被截掉的學生 progress 缺列
  → 前端當 locked → 從漏斗與步驟分頁消失。錯誤完全無聲，只有加總對不上才看得出來。
- **怎麼應用**：任何「整表撈」的 REST 查詢（尤其列數 = 學生數 × 倍數的表：enroll_progress、
  applications、enroll_files）一律走 `api/onboard-admin.js` 的 `fetchAllRows()`（Range header
  分頁到短頁為止），且 url 必帶唯一鍵 order 才不會跨頁重複/漏列。發現統計加總對不上時，
  先懷疑 1000 列截斷，用 execute_sql 數真實列數對照。
