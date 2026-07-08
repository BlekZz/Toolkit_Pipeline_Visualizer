---
name: sprint-perf-and-visual-overhaul
sync_with:
  - "[[Tracker_Tech_Debt_And_Optimization]]"
  - "[[Tracker_Roadmap_Milestones]]"
  - "[[Design_Data_Model_Architecture]]"
---

# Sprint: 效能優化 + 視覺重設計 + Heatmap 新視圖

> 建立日期：2026-07-08
> 狀態：**已完成（2026-07-08）** — M0–M4 由 Sonnet agent 平行/序列執行，
> M5 由 Opus agent（Evidence Collector）獨立驗收。Commit：M0 `99e086f`、
> M1 `3ce4d55`、M3 `fe9788d`、M4 `9c037a3`+`953daa5`、M2 `3c7b302`、
> Escape 修復與文件同步為主線收尾 commit。M5 驗收發現 2 項缺口
> （`OccurrencePopup` 缺 Escape 鍵、文件未同步）已在收尾中修復。
> 觸發：使用者回報 (1) 啟動 loading 緩慢；(2) 切換視圖 / 篩選組合 / Projects 時明顯 lag；
> (3) Timeline 只剩文字與框框、看不到 bar；(4) 希望 Calendar 視覺美化 + view 順序調整；
> (5) 新增 Habit Tracker / GitHub 活躍圖風格的新視圖。

---

## Part 1 — 前置作業：現況診斷（Plan 前身）

### 1.1 效能瓶頸診斷（依實際程式碼定位）

Sample data 展開後約 **11,595 筆 occurrences**（368 天視窗）。所有卡頓的根因都是
「**原始 occurrence 資料量直接餵給視圖層**」，而不是函式庫本身太慢。逐項如下：

| # | 瓶頸 | 位置 | 影響 |
|---|------|------|------|
| P1 | 啟動時 sample data 被 Zod **parse 兩次**（兩個 useState initializer 各跑一次） | `src/App.tsx:273-285` | 啟動變慢（30KB JSON × 2 次完整 schema 驗證） |
| P2 | `expandRecurrence` **同步**展開 368 天 → ~11.6k occurrences，阻塞 main thread；且每次 preset 點擊（viewRange 變更）**全量重新展開**，即使是縮小範圍 | `src/App.tsx:335-339, 447-452`、`src/lib/expand.ts:330-357` | 啟動卡頓 + 切換 Week/Month/Quarter/Year 卡頓 |
| P3 | `toGanttData` 產生 **~11.6k 筆 Gantt task**（每個 occurrence 一根 bar），整棵 task tree 在每次 filter / preset / collapse 變更時全量重建，SVAR Gantt 整體 re-render | `src/App.tsx:78-163, 341-344` | 切換視圖 / 篩選組合 / Projects 時的主要 lag 來源 |
| P4 | FullCalendar 在 Week/Day view 收到**全部** filteredOccs（最多 11.6k 個 EventInput），每個 event 都走 React 自訂 `EventChip` render | `src/App.tsx:394-399, 626-655` | Calendar tab 切換與導航卡頓 |
| P5 | 搜尋框每個 keystroke 立即觸發 `applyFilters` 掃 11.6k 筆 + 下游 ganttTasks/fcEvents 全量重算，無 debounce / deferred | `src/App.tsx:530-532, 322-325` | 打字卡頓 |
| P6 | `wallClockToUtc` 每次呼叫都 `new Intl.DateTimeFormat(...)`（極昂貴的建構子）；weekly simple mode 逐日走訪整個範圍、每天呼叫一次 | `src/lib/expand.ts:18-44, 171-194` | 展開階段耗時的最大單點（數萬次 formatter 建構） |
| P7 | occurrence 預設 duration 300 秒；`MIN_VISUAL_MS` = 30 分鐘。在 Month scale（40px/天）下 30 分鐘 ≈ **0.8px 寬** → bar 實際上不可見 | `src/App.tsx:61, 136-141, 386-391` | 這就是「Timeline 只剩文字和框框」的直接原因（視覺 bug，兼效能相關） |

另注意：SVAR Gantt task 上掛的 `_urgencyBg` / `_stripe` 自訂欄位**從未被任何
template 或 CSS 消費**（`src/App.tsx:153-159`）— 顏色資料是死資料，bar 全部是預設樣式。

### 1.2 技術選型結論：**保留現有 stack，修正資料流架構**

使用者問「是否重新規劃技術」。評估結論：

- **不建議換函式庫 / 重寫**。SVAR Gantt 與 FullCalendar 都能順暢處理數千筆資料；
  問題出在我們把「原始 occurrence 粒度」直接餵給它們。換成任何其他函式庫，
  餵 11.6k 筆原始資料一樣會卡。
- **正確解法是加一層「scale-aware 聚合層」**：視圖縮放程度越粗（Month/Quarter/Year），
  餵給視圖的資料就越聚合（schedule 級別的 activity bar / 每日密度），
  只有在細粒度（Week/Day）才餵原始 occurrence。
- 展開層（expand）本身用 formatter cache + 範圍快取即可提速一個數量級，
  不需要 Web Worker；**Web Worker 列為備援方案**，僅在 M1 驗收未達標時啟用。

### 1.3 視覺設計方向

#### Timeline（M2）
1. **Bar 可見性**：最小 bar 寬度改為「像素」而非「毫秒」— 依當前 cellWidth 換算，
   保證任何 scale 下 bar 至少 6–8px 寬。
2. **顏色系統落地**：用 SVAR 的 task template / CSS variable 消費 `_urgencyBg`（底色）
   與 `_stripe`（pipeline 左邊條），與 Calendar 的 EventChip 視覺語言一致。
3. **Scale-aware 聚合 bar**：Month 以上 scale，schedule 列改渲染一根「活動區間 bar」
   （首次到末次 occurrence 的跨度）+ 密度紋理/透明度表達次數；Week/Day 才逐筆畫 bar。
4. 輔助視覺：today 垂直線、週末底色、row hover 高亮。

#### Calendar（M3）— 美化建議
1. **View 切換順序改為：Day → Week → Month → Quarter → Year**
   （`headerToolbar.right: 'timeGridDay,timeGridWeek,dayGridMonth,multiMonthQuarter,multiMonthYear'`）。
2. EventChip 重設計：urgency 用實心色點 + pipeline 色左邊條 + 開始時間標籤；
   月視圖 chip 更緊湊、"+N more" popover 套用一致樣式。
3. 顏色圖例（legend）：header 或角落顯示 urgency 四色 + 目前可見 pipeline 色帶對照。
4. today 高亮、週末淡色底、FC CSS variables 統一字級/間距（對齊 App.css 既有 token）。

#### Heatmap 新視圖（M4）— Habit Tracker / GitHub 活躍圖
- **第三個 tab：`Heatmap`**，與 Timeline/Calendar 共用 `filteredOccs` 與 filter state。
- 兩種模式（tab 內切換）：
  - **Overview 模式**（GitHub contribution graph）：53 週 × 7 天格子，
    格子深淺 = 當日 occurrence 總數（5 階色階）。
  - **Tracker 模式**（Habit Tracker）：每列一個 pipeline（或 schedule，可切換粒度），
    列色相 = pipelineColor，格子深淺 = 該日該列的 occurrence 次數。
- 互動：hover tooltip（日期 + 次數 + 明細前 N 筆）；點格子 → 彈出當日 occurrence 清單
  （重用 OccurrencePopup / DetailPanel）。
- **效能天生便宜**：一次 O(n) 把 filteredOccs 聚合成 `Map<dayKey, count>`，
  渲染上限 ~371 格（Overview）或 列數×天數（Tracker 模式需上限保護，如最多 50 列）。
- 新增 `src/lib/heatmap-transform.ts`（純函式、可測試）+ `src/HeatmapView.tsx`。

---

## Part 2 — Sprint 節點（Milestones）

> 依賴順序：M0 → M1 → (M2 ∥ M3 ∥ M4 可平行) → M5。
> M0 是所有後續工作的前置，**必須先完成並 commit**，否則平行 agent 會在同一個
> 621 行的 App.tsx 上互相衝突。

---

### M0 — 基礎重構（App.tsx 拆分）

> 對應 `Tracker_Tech_Debt_And_Optimization.md` ⏳ Open 既有項目；純重構、零行為變更。
> 建議執行者：**Minimal Change Engineer** 或 **Frontend Developer**（Sonnet 級）。

工作項：
- [ ] 抽出 `src/lib/gantt-transform.ts` — `toGanttData()`、`pipelineColor()`、scale/cellWidth 計算
- [ ] 抽出 `src/lib/calendar-transform.ts` — `toEvent()`、`FC_MONTH_VIEWS`、fcEvents 建構邏輯
- [ ] 抽出 `src/OccurrencePopup.tsx`、`src/TimelineTab.tsx`、`src/CalendarTab.tsx`
- [ ] App.tsx 剩下：state 編排 + tab 切換 + header（目標 < 300 行）
- [ ] 順手修 P1：sample data 只 parse 一次（單一 initializer 共用結果）

**QA 項目（M0）**：
- [ ] `npm run check` 0 錯誤、`npm run test` 83/83 通過（不新增也不減少）
- [ ] 用 `verify` skill 實跑：Timeline / Calendar 兩 tab 渲染、篩選、點擊 occurrence 開 DetailPanel、Import/Export、Diagram lazy-load 全部行為不變
- [ ] git diff 審查：無任何行為變更（純搬移 + P1 單一 parse）
- [ ] `Tracker_Tech_Debt_And_Optimization.md` 對應項目移至 ✅ Resolved

---

### M1 — 效能優化（P2–P6）

> 建議執行者：**Frontend Developer**（實作）+ **Code Reviewer**（審查）。

工作項：
- [ ] **P6 formatter cache**：`expand.ts` 內以 `Map<timezone, Intl.DateTimeFormat>` 快取 formatter（模組級），`wallClockToUtc` 改用快取實例
- [ ] **P2 展開快取**：`viewRange` 縮小時不重新展開 — 快取「已展開的最大範圍 + 結果」，新範圍是子集時直接用既有 `allOccs` 過濾（occurrence 已含 ISO 時間，過濾是 O(n)）；只有範圍**超出**快取範圍才重跑 `expandRecurrence`
- [ ] **P5 搜尋 defer**：`searchText` 以 React 19 `useDeferredValue` 餵給 `applyFilters`；filter/preset 切換用 `useTransition` 包住，讓 tab/按鈕即時響應
- [ ] **P3 Gantt 聚合**：`gantt-transform.ts` 增加 scale 參數 — Month/Quarter/Year preset 下，schedule 列以聚合 bar 取代逐筆 occurrence bar（詳 M2 視覺規格；本里程碑先落資料層：聚合函式 + 單元測試），task 總數上限預期從 ~11.6k 降到 < 1k
- [ ] **P4 Calendar event 上限**：timeGrid（Week/Day）view 本身有日期窗，交給 FC 內建窗口即可；確認 `fcEvents` 在月級 view 的 sub-daily/daily 過濾邏輯維持不變，量測後若仍慢，加 per-day cap
- [ ] 效能量測腳本：Playwright 腳本（`dev/script/perf-probe.ts` 或既有 Playwright 設定）記錄：冷啟動至首次渲染、preset 切換耗時、tab 切換耗時、搜尋輸入響應 — 優化前後各跑一次留存數據

**QA 項目（M1）**：
- [ ] 優化前後數據對照表寫入本文件附錄（before/after）
- [ ] 目標（1 萬筆 occurrence 規模、開發機實測）：
  - 冷啟動至 Timeline 可互動 **< 1.5s**（原狀態記錄為 baseline）
  - preset 切換（Month→Year）**< 300ms** 可感知完成
  - tab 切換 **< 200ms**
  - 搜尋輸入不掉字、輸入中 UI 不凍結
- [ ] `expandRecurrence` 快取行為有單元測試：範圍縮小不重算（可用呼叫計數 spy）、範圍擴大正確重算、import 新文件時快取失效
- [ ] `npm run check` + `npm run test` 全綠；既有 83 測試不得改語意遷就實作
- [ ] 若目標未達 → 啟用備援方案（expand 移入 Web Worker），並在本文件記錄決策

---

### M2 — Timeline 視覺重設計

> 建議執行者：**UX Architect**（規格）→ **Frontend Developer**（實作）。依賴 M0 + M1 的聚合資料層。

工作項：
- [ ] 最小 bar 寬度改為像素制：`minBarPx = 6`，依 `ganttCellWidth` 換算成 ms 後套用（取代固定 `MIN_VISUAL_MS`）
- [ ] SVAR task template / CSS 消費 `_urgencyBg` 與 `_stripe`：occurrence bar 底色 = urgency、左邊 3px 色條 = pipeline 色（與 Calendar EventChip 同語言）
- [ ] 聚合 bar 視覺（接 M1 資料層）：Month+ scale 下 schedule 列渲染單根「活動跨度 bar」，以透明度或分段紋理表達密度；bar 上顯示次數徽章（如 `×42`）
- [ ] today 垂直參考線、週末欄底色（day-level scale 時）、row hover 高亮
- [ ] 點擊聚合 bar 的行為定義：展開該 schedule（切至逐筆模式）或彈出該期間 occurrence 清單 — 實作前先在 PR 描述中二選一並說明理由

**QA 項目（M2）**：
- [ ] **Evidence Collector 視覺驗收**：四種 preset（Week/Month/Quarter/Year）各截圖，確認 (1) 每個 scale 下 bar 皆肉眼可見；(2) urgency 顏色正確對應（critical=紅、high=琥珀、medium=藍、low=灰）；(3) pipeline 色條與 Calendar 一致
- [ ] 點擊 occurrence bar 仍正確開啟 DetailPanel（select-task 事件路徑未被 template 破壞）
- [ ] Collapse/Expand All 在聚合模式下行為合理
- [ ] 無 console 錯誤/警告新增

---

### M3 — Calendar 視覺美化 + View 順序

> 建議執行者：**Frontend Developer**（可與 M2、M4 平行）。

工作項：
- [ ] View 順序改為 **Day → Week → Month → Quarter → Year**（headerToolbar 調整）
- [ ] EventChip 重設計：urgency 實心色點 + pipeline 左邊條 + 時間標籤（HH:mm）；月視圖緊湊模式（單行省略）；Week/Day 視圖較完整模式
- [ ] "+N more" popover 樣式統一（FC `moreLinkContent` / popover CSS）
- [ ] 顏色圖例元件：urgency 四色固定圖例 + 動態 pipeline 色對照（僅列當前可見 pipelines，超過 8 個折疊）
- [ ] today 高亮、週末淡底色、FC CSS variables 字級/間距對齊 App.css 既有風格
- [ ] `initialView` 與記憶行為確認：使用者上次停留的 FC view 是否要持久化到 localStorage（比照 `psv-tab`）— 建議做，成本一行

**QA 項目（M3）**：
- [ ] **Evidence Collector 視覺驗收**：五種 view（Day/Week/Month/Quarter/Year）各截圖；確認按鈕順序、chip 樣式、圖例、today/週末效果
- [ ] 月級 view 的 frequency 自動過濾（sub-daily/daily 隱藏）行為不變 — 對照 `CLAUDE.md` Schedule Frequency Classification 表
- [ ] 點 event 開 OccurrencePopup、popup 內容正確、Escape 可關閉
- [ ] `datesSet` 仍**不**回寫 `viewRange`（守住 ADR-002 的架構約束）

---

### M4 — Heatmap 新視圖（Habit Tracker / GitHub 活躍圖）

> 建議執行者：**Rapid Prototyper**（先做可跑原型）→ **Frontend Developer**（收斂）。可與 M2/M3 平行。

工作項：
- [ ] `src/lib/heatmap-transform.ts`：`filteredOccs → { overview: Map<dayKey, count>, byPipeline: Map<pipelineId, Map<dayKey, count>> }` 純函式 + 單元測試（含 timezone 邊界：dayKey 以 display timezone 切日）
- [ ] `src/HeatmapView.tsx`：
  - Overview 模式：GitHub 風格 53×7 格年度圖（SVG 或 CSS grid），5 階深淺，月份標籤 + 星期標籤
  - Tracker 模式：每列一 pipeline（色相 = `pipelineColor`），格子深淺 = 當日次數；列數上限 50、超出顯示提示；粒度切換（pipeline / schedule）
- [ ] 第三個 tab 接入 App shell：`activeTab: 'timeline' | 'calendar' | 'heatmap'`，共用 filter state 與 `filteredOccs`；localStorage 持久化沿用 `psv-tab`
- [ ] 互動：hover tooltip（日期、總次數、前 5 筆標題）；點格子彈出當日 occurrence 清單（重用 OccurrencePopup 或新 DayListPopup，內部項目點擊開 DetailPanel）
- [ ] 色階設計依 `dataviz` 原則：色階對色盲友善、深淺單調遞增、0 值格子用邊框而非純白

**QA 項目（M4）**：
- [ ] `heatmap-transform.ts` 單元測試：跨日 UTC/local 邊界 occurrence 歸日正確、空資料、單日多筆、filter 變更後重算
- [ ] **Evidence Collector 視覺驗收**：Overview 與 Tracker 模式各截圖；深淺階梯肉眼可辨；月份/星期標籤對齊正確
- [ ] 效能：切到 Heatmap tab < 200ms；filter 變更時 Heatmap 跟著即時更新
- [ ] Timeline/Calendar 的既有行為完全不受第三 tab 影響（tab 切換保留各自狀態）
- [ ] `npm run check` + `npm run test` 全綠

---

### M5 — 整合驗收 + 文件同步

> 建議執行者：主線 session（orchestrator）親自執行，不派 agent。

工作項：
- [ ] 全量回歸：`npm run check`、`npm run test`、`npm run build` 三綠
- [ ] `verify` skill 端到端實跑三個 tab 的完整使用流程
- [ ] M1 效能數據 before/after 附錄補齊
- [ ] 文件同步（依 doc-sync 規則）：
  - `CLAUDE.md` — Dual-Tab 章節改為 Tri-Tab（+Heatmap）、view 順序、聚合層描述
  - `Tracker_Tech_Debt_And_Optimization.md` — 解決項移 ✅、新發現項補 ⏳
  - `Tracker_Roadmap_Milestones.md` — 本 sprint 完成記錄
  - 必要時新開 ADR：`ADR-003-heatmap-view` 與 `ADR-004-scale-aware-aggregation`（若架構決策有取捨值得記錄）
- [ ] Commit 粒度：每個 milestone 至少一個獨立 commit，訊息含 milestone 編號

---

## Part 3 — 最終驗收標準（成功驗收 Check List）

全部勾選才算 sprint 完成：

**效能**
- [ ] 冷啟動至可互動 < 1.5s（開發機、sample data、`vite preview` 量測）
- [ ] Timeline preset 切換 < 300ms、tab 切換 < 200ms、搜尋輸入不凍結
- [ ] Gantt 餵入 task 數在 Month+ scale 下 < 1,000（原 ~11.6k）
- [ ] before/after 量測數據已存檔於本文件附錄

**Timeline 視覺**
- [ ] 四種 preset 下 occurrence/聚合 bar 全部肉眼可見且著色正確
- [ ] urgency 色 + pipeline 色條與 Calendar 完全一致

**Calendar**
- [ ] View 按鈕順序 = Day, Week, Month, Quarter, Year
- [ ] Chip / 圖例 / today / 週末美化完成，月級 frequency 過濾行為不變

**Heatmap**
- [ ] 第三 tab 上線，Overview + Tracker 兩模式可切換
- [ ] 與 filter state 完全連動；點格子可下鑽到當日明細

**工程品質**
- [ ] `npm run check`、`npm run test`、`npm run build` 三綠；測試數 ≥ 83 且新邏輯（快取、聚合、heatmap-transform）皆有覆蓋
- [ ] App.tsx < 300 行；無新增 console 錯誤
- [ ] `CLAUDE.md` / Tracker 文件已同步；V1「read-only」邊界未被突破（無編輯功能混入）

---

## Part 4 — 派工建議（Agent Dispatch Map)

| Milestone | 建議 agent | Tier | 平行性 |
|---|---|---|---|
| M0 基礎重構 | Minimal Change Engineer | Sonnet | 前置，單獨先跑 |
| M1 效能優化 | Frontend Developer + Code Reviewer 複審 | Sonnet | M0 後單獨跑 |
| M2 Timeline 視覺 | UX Architect（規格）→ Frontend Developer | Sonnet | 可與 M3/M4 平行 |
| M3 Calendar 美化 | Frontend Developer | Sonnet | 可與 M2/M4 平行 |
| M4 Heatmap | Rapid Prototyper → Frontend Developer | Sonnet | 可與 M2/M3 平行 |
| M5 整合驗收 | 主線 orchestrator（不派 agent） | — | 最後 |
| 視覺 QA（M2–M4） | Evidence Collector | Haiku/Sonnet | 各 milestone 完成後 |

**平行派工注意**（依全域規則「Multi-Agent Audit Arbitration」）：
- 本文件與 Tracker 檔案為**主線持有**，平行 agent 禁止直接編輯 — 各自在回報中列出應更新內容，由主線統一合併。
- M2/M3/M4 平行時各自只碰自己的元件檔 + 各自的 transform lib；共用檔（App.tsx、App.css）的修改集中在接入點，衝突時主線裁決。
- 每個 agent 完成後主線先 `npm run check && npm run test` 再收貨。

---

## 附錄 A — 效能量測數據（M1 實作 + M5 驗收覆核，2026-07-08）

| 指標 | Before | After | 目標 | 判定 |
|---|---|---|---|---|
| 冷啟動至可互動 | — | 1369–1417ms（4 次量測） | < 1.5s | ✅ PASS |
| preset 切換 Month→Year | — | 43–46ms | < 300ms | ✅ PASS |
| tab 切換 Timeline↔Calendar | — | 75–96ms | < 200ms | ✅ PASS |
| Gantt task 數（Month/Quarter/Year scale） | ~11,625 | ~29 列（collapsed）/ 11 個聚合 bar（expanded） | < 1,000 | ✅ PASS |
| `Intl.DateTimeFormat` 建構 vs 快取（11,595 次呼叫） | 492ms | 35ms（~14×） | — | 參考數據 |

量測方式：`dev/script/perf-probe.mjs`（Playwright，對 `vite preview` 執行）；
Gantt task 數與 formatter 數據為隔離測試腳本量測（未留存於 repo，數字記錄於
本文件）。M5 驗收（Evidence Collector, Opus）覆核重跑三次確認數據穩定。
