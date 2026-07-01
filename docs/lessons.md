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

## onboard 五步 gating 在前端算，不信 DB 原始 state
- **為什麼**：enroll_progress 可能缺列或狀態不一致；顯示規則是「confirmed 保持 ✓、
  最低一個非 confirmed 的步驟顯示 open（DB 標 submitted 則顯示待確認）、其後一律 locked」。
  前端 `effectiveStates()` 統一推導，缺列預設 locked。
- **怎麼應用**：Phase 2 做寫入時，伺服器端也要用同一 gating 規則擋非當前步驟的提交，
  不能只靠前端鎖。
