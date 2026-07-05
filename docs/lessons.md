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

## CLAUDE.md 的資安宣稱已過期，RLS 實況以 pg_policies 為準
- **為什麼**：2026-07 全面體檢發現文件寫「DELETE 已用 RLS 全關」「centers 唯讀」，
  但 pg_policies 實查：applications 有 anon DELETE policy、applications/evaluations/
  stage1_records/final_admissions/stage4_confirmations/centers/teachers 都有
  FOR ALL USING(true)（含 DELETE）；7 張 enroll_* 表 RLS 原本根本沒開。
  且 api/submit.js 無認證、method 不設限，等於整條攻擊鏈對外成立。
- **2026-07-04 已處理一部分**：7 張 enroll_* 表已 ENABLE RLS 且不加 policy
  （anon 全擋、service_role 端點 /api/onboard* /api/confirm /api/onboard-admin 繞過照常，
  已實測 anon count=0 且 /api/onboard?token 仍 ok:true）；並補了 evaluations/stage1_records
  的 FK 覆蓋索引。尚未處理：applications 等表的 FOR ALL/anon DELETE policy——會斷後台
  deleteCheckin/deleteEvaluation/deleteApplication 等走 anon key 的操作，須先把那些後台刪除
  改走 service-role 端點再收緊，招生期間勿動。
- **怎麼應用**：任何涉及「哪張表能不能寫/刪」的判斷，先跑
  `SELECT tablename,policyname,cmd,roles,qual FROM pg_policies WHERE schemaname='public'`
  對照，不要信 CLAUDE.md 或記憶。改完 policy 記得同步更新 CLAUDE.md 資安段。

## 前端整表撈改分頁 fetchAll —— proxy 不回 headers，靠短頁收尾；盤點漏改要 multiline grep + fresh agent
- **為什麼**：src/api.js 幾十處 `callProxy('/rest/v1/表?select=...','GET')` 整表撈會踩 1000 列無聲截斷。
  後端 onboard-admin.js 的 fetchAllRows 用 Range header，但前端 /api/submit proxy 只回 body、
  拿不到 Content-Range，所以前端版 fetchAll 只能用 `?limit=1000&offset=N` + 「回傳列數 < pageSize
  即最後一頁」收尾。offset 分頁要求「決定性 order（含唯一鍵）」，否則頁邊界漏/重列——每個查詢
  order 尾端補該表 PK（多數 id，mail_log 是複合 account+kind）。
- **盤點漏改的坑**：單行 grep（`callProxy\(\s*['"]/rest/v1/...`）抓不到「callProxy( 換行接 url」的
  多行寫法，第一輪自己 grep 漏了 9 處（getStage2Progress/AllPrefs/Unscheduled、getStage4Rejected、
  syncStage4FromStage3、getStage1Pending、getStage2List）。派 fresh-context opus 讀全文對抗複查抓回 7 處，
  再用 multiline grep 補抓 2 處。教訓：盤點「某模式散落全檔」一律 multiline grep + 對抗複查，別信單行 grep 的乾淨。
- **怎麼應用**：新增整表撈一律走 fetchAll 並補唯一鍵 order；單日/單筆/單系 filter（=eq. 單值、in.() 分批、
  limit=1）的查詢不會逼近 1000，不必改。改完 npm run build 驗語法、關鍵名單/統計實測列數對照。

## 通知信引用學生端按鈕文案時，逐字對 OnboardApp 的 T 字典
- **為什麼**：簽證批次信四語化時，信裡教學生「點選『我已收到通知，會準時前往』」這類句子，
  三語版必須跟 OnboardApp.jsx 的 T 字典（visaVnAckBtn / visaPaperReceivedBtn / visaPaperHelpBtn）
  逐字一致，否則學生在頁面上找不到信中說的按鈕。對抗複查時是拿兩邊字串 diff 驗的。
- **怎麼應用**：任何信件模板要引用 UI 上的按鈕/選項文字，先 grep 學生端字典取原文貼入，
  不要憑記憶重翻；改按鈕文案時同步 grep 信件模板有無引用。

## 步驟③清單的「中心」篩選範圍約定
- **為什麼**：搜尋框只影響顯示（沿用第二批需求1的約定），但「中心」下拉同時縮小
  「批次設定現場收件」與「寄送簽證通知」兩顆批次按鈕的對象——兩顆按鈕範圍不一致會誤寄。
- **怎麼應用**：日後在名單頁加新篩選器時，先決定它是「顯示用」還是「批次操作用」，
  並讓同頁所有批次按鈕吃同一組篩選，提示文字寫明。

## 可點擊統計格的母體必須跟點開後的名單一致
- **為什麼**：步驟③簽證階段統計格最初以「梯次×校區」計數，但點擊後過濾的名單還吃
  「中心」下拉——中心選了某站時，格子寫 8 人、點開只剩 3 人，使用者無從得知差在哪。
  對抗複查抓到後改為統計格同吃 `matchCenter`（搜尋框仍只影響名單，註腳寫明）。
  另一個連帶發現：supplement（補件中）不在推進下拉的 option 序裡，controlled select
  的 value 沒有對應 option 時瀏覽器會顯示第一項，與旁邊 Pill 矛盾——旁支狀態作為
  當前值時要補一個 option。
- **怎麼應用**：做「點統計格 → 過濾名單」的互動時，統計計數跟名單過濾要用同一組
  篩選鏈（差異只允許顯示用的搜尋框，且註腳寫明）；controlled select 的 value 若可能
  是選項序以外的旁支值，render 時要條件式補上該 option。

## 開放新步驟給學生前的三件事（2026-07-05 簽證步驟體檢得出）
- **為什麼**：簽證步驟開放前體檢發現：(1) api/onboard.js 四個 visa action 與
  onboard-upload.js 都只驗 token 不驗 step state——「伺服器端也要擋 gating」的教訓
  寫了但 Phase 2 實作時沒落地，靠對抗複查才抓回；(2) TEST0001/TEST0002 的
  enroll_students.is_test = false，而名單/寄信收件人全靠 is_test=eq.false 過濾，
  測試帳號會混進真實批次寄信與統計（漏斗 +2）；(3) admission_letter_url 等
  「行政要先填的營運資料」全空，對應的學生端按鈕條件渲染直接不出現，程式看起來
  正常但功能形同沒做。
- **怎麼應用**：每次要開放一個步驟，照三清單檢查：①該步所有寫入 action 在伺服器端
  grep 一次，逐個確認有驗 state；②測試帳號 is_test 旗標實查 DB，不信記憶；
  ③該步引用的營運資料欄位（信件連結、收件時間地點）用 execute_sql 數非空筆數。

## 個別學生繳費單開錯的下架/重掛標準做法（2026-07-06 宿舍費檔位開錯案）
- **為什麼**：繳費單連結存在 enroll_progress step=2 的 data.slip_url。下架只需刪掉該 key
  （`data = data - 'slip_url'`），學生端自動顯示四語「繳費單準備中」，不動 gating 也不影響他人。
  備份舊連結時**不要留在 data jsonb 裡**（api/onboard 會把 data 原樣回給學生端，改名藏在裡面
  仍會外洩），要 INSERT 進 enroll_log（action: slip_unpublished / slip_republished，payload 帶
  舊/新 url 與原因）。另外：DB 下架 ≠ 徹底下架——步驟②曾 open 的學生可能已存過 Drive 連結，
  必須同步刪除或關閉舊 Drive 檔案的分享才算收乾淨。
- **怎麼應用**：重掛前先用 Drive metadata 核對新檔（檔名學號 + 內文金額）再寫 DB，避免兩人貼反；
  掛完用 `curl /api/onboard?token=` 實測回傳，舊檔刪除後再查一次 metadata 確認連結失效。
