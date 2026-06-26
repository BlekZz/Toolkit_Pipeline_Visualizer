# Roadmap And Milestones

## Roadmap Strategy

建議把產品拆成兩條主線：

- Planning Layer：定義 project、pipeline、schedule，展開 recurrence，並用 calendar / roadmap / workflow graph 視覺化。
- Monitoring Layer：接收或檢查實際執行狀態，並把結果疊到 planning layer 上。

V1 先完成 Planning Layer。這會讓工具先成為可靠的排程地圖，再進一步演化成監控中心。

## Milestone 0: Product Foundation

目的：把產品規格、schema 與技術方向固定下來。

Deliverables：

- PRD
- roadmap
- JSON schema draft
- sample schedule JSON
- technical stack decision
- local run strategy

Exit criteria：

- 能清楚定義 `project --references--> pipeline --owns--> schedule`。
- 已確認 V1 不包含 drag-and-drop；drag-and-drop 固定放入 V1.5。
- 能決定第一版使用 JSON-only 或 local storage。
- 能決定 calendar library。
- Calendar library 架構決策已定案（見 ADR-001）。
- Dual-tab UI architecture decided (ADR-002).

## Milestone 0.5: Calendar Architecture Pivot — SVAR React Gantt Migration

目的：以 SVAR React Gantt 取代 FullCalendar Community，實現 Resource Timeline 佈局（Y 軸階層式 drilldown：Project → Pipeline → Schedule；X 軸為時間軸，支援橫向捲動）。

Trigger：FullCalendar Community 不支援 Resource Timeline（該功能屬 Premium 版）；本專案要求完全 open-source 方案。

ADR：ADR-001（見 `dev/decisions/ADR-001-timeline-library-migration.md`）。

Scope：

- **Phase A — Spike Validation** ✅ COMPLETE (2026-06-26)：
  - 安裝 SVAR React Gantt。
  - 建立最小可行 spike，實作 3 層階層結構（Project → Pipeline → Schedule）。
  - 驗證下列 5 項準則，全數通過方可進入 Phase B。

- **Phase B — Full dual-tab implementation** ✅ COMPLETE (2026-06-26)：
  - Timeline tab (SVAR React Gantt) + Calendar tab (FullCalendar Community)。
  - 共用 `filteredOccs`（single `expandRecurrence` call，365-day window）。
  - `viewRange` 只供 Gantt X 軸使用；FullCalendar 自行做內部日期 windowing（不覆寫 viewRange）。
  - Tab 切換後 occurrence count 穩定不掉（QA 驗證：11330/11330 consistent）。
  - TypeScript: 0 errors；Tests: 29/29 pass。

Spike validation criteria（全部通過才能推進 Phase B）：

1. 3-level collapsible hierarchy 正確渲染：Project → Pipeline → Schedule。
2. 橫向捲動（time axis）正常運作。
3. 24h 時間格式正確顯示。
4. Event bars（schedule occurrences）在 timeline 上正確渲染。
5. 與 React 19 + TypeScript 相容。

Fallback：若 SVAR spike 失敗，改採 dnd-timeline（MIT, headless）。

Exit criteria：

- 全部 5 項 spike 準則通過。
- 現有 sample data 可在 SVAR 中正確渲染。

## Milestone 1: Read-only Static Calendar MVP ✅ COMPLETE (2026-06-25)

目的：完成可讀、可匯入、可篩選的靜態排程儀表板。

Scope：

- Local frontend app。
- Load sample JSON。
- Validate JSON shape。
- Render schedule occurrences。
- 支援 day / week / month views。
- 支援 simplified recurrence、RRULE、cron expression。
- 支援 basic filters：
  - project
  - pipeline
  - owner
  - urgency
  - domain/system
  - environment
  - source type
  - custom tags
- 支援 task detail panel。
- 驗證 project `pipelineRefs`、pipeline timezone、schedule timezone。

Suggested tech：

- React + TypeScript + Vite。
- Calendar rendering 可評估：
  - FullCalendar：成熟、recurrence/event ecosystem 強，適合先做 MVP。
  - React Big Calendar：較輕，但 recurrence 與進階 timeline 可能要補較多。
  - 自製 timeline：自由度最高，但不建議第一版從零做 calendar core。
- Recurrence：
  - rrule：成熟處理 RFC 5545 RRULE 與 calendar recurrence。
  - cron-parser：處理既有 cron expression。
  - 簡化 recurrence schema：AI-friendly authoring layer，可轉成 RRULE。
- Schema validation：
  - Zod：前端 TypeScript 友善。
  - JSON Schema + Ajv：更適合跨語言與 AI contract。

Recommended MVP stack：

- React + TypeScript + Vite
- FullCalendar
- rrule
- cron-parser
- Zod 或 Ajv
- local JSON import

Exit criteria：

- 匯入範例 JSON 後，每週任務可在未來週次被正確顯示。
- Project view 能顯示 referenced pipelines 的 schedules。
- Pipeline 可以同時出現在多個 project view 中。
- RRULE 與 cron expression 都能在目前 view range 內正確展開。
- 切換 week / month view 時資料一致。
- filter 後可立即更新畫面。
- 點擊任務可看到完整 metadata。
- 未填 duration 的 schedule 會用 300 秒預設值。

## Milestone 2: Expanded Time Scales And Roadmap Views — 🔄 PARTIAL (2026-06-26)

目的：把 calendar 從日常課表延伸到 pipeline roadmap。

Scope 與進度：

- ✅ Quarter view (Timeline preset + Calendar multiMonthQuarter)
- ✅ Year / roadmap density view (Timeline preset + Calendar multiMonthYear)
- ❌ Half-year view — 移除（user decision：Quarter 與 Year 之間不需要中間層）
- ✅ Search — global text search (schedule title / pipeline name / project name)
- ✅ Saved view presets — localStorage 持久化 (psv-preset / psv-tab / psv-filter)
- ✅ Frequency auto-filter — month/quarter/year 視圖自動隱藏 sub-daily / daily schedules
- ⏳ Task grouping (by owner / urgency) — 尚未實作
- ⏳ Project derived dimensions — 尚未實作

Exit criteria：

- ✅ 使用者可以回答「這一季有哪些 project / pipeline schedule」。
- ✅ 使用者可以看出某週或某月任務密度是否過高（month view 自動過濾高頻 schedule）。
- ⏳ 使用者可以用 tags 建立常用視圖（grouping 尚未完成）。

## Milestone 3: JSON Authoring And Editing

目的：讓工具不只讀 JSON，也能協助產生與維護 JSON。

Scope：

- Built-in JSON editor。
- Schema validation panel。
- Import / export JSON。
- Example templates。
- AI prompt contract page。
- Optional local persistence。

Possible implementation levels：

- Level 1：貼上 JSON，validate 後 render。
- Level 2：內建 editor，例如 Monaco。
- Level 3：表單編輯 project、pipeline、schedule，再輸出 JSON。

Exit criteria：

- 使用者可以在 UI 中修改 JSON 並立即看到結果。
- AI 產出的 JSON 有明確錯誤提示。
- 修改後可 export 回檔案。

## Milestone 4: V1.5 Calendar Canvas Editing

目的：在 V1 的 read-only calendar 穩定後，支援像 calendar 一樣拖曳與建立排程。

Scope：

- Drag task occurrence。
- Resize duration。
- Create one-time task by selecting time range。
- Create recurring task through form。
- Edit recurrence rule。
- Manage exception dates。
- Export updated JSON。
- Attach existing pipeline to project。
- Timezone alignment warning and correction flow when project timezone differs from pipeline timezone。

Important design decision：

拖曳 recurring occurrence 時必須讓使用者選擇：

- 修改整個 recurrence。
- 只修改這一次，建立 override。
- 從這一次之後修改，建立 split rule。

Exit criteria：

- 使用者可以不手寫 JSON 建立例行任務。
- UI 編輯後 JSON 仍可被 schema validation 通過。

## Milestone 5: Dependency Planning

目的：開始呈現 pipeline 與 schedule 之間的邏輯關係，並為 Mermaid workflow view 做準備。

Scope：

- Add dependency fields。
- Dependency graph view。
- Calendar item dependency indicators。
- Basic blocked-by / blocks relationships。
- Impact preview：某任務延遲會影響哪些任務。
- Schedule output metadata：
  - output location
  - output format
  - naming pattern
  - downstream notes

Exit criteria：

- 使用者可以看到某任務依賴哪些前置任務。
- 使用者可以看出 pipeline chain。
- 尚不需要串接實際 execution status。

## Milestone 5.5: Mermaid And Export Views

目的：讓 pipeline / project 可以從 JSON 轉成 workflow 或 data-flow 圖，支援文件化與對外說明。

Scope：

- Pipeline Mermaid export。
- Project Mermaid export。
- Calendar bounded export：
  - day
  - week
  - month
  - quarter
  - custom finite range
- Export preview。
- Mermaid source text copy/export。

Important design decision：

Calendar export 必須永遠是 bounded range，不能匯出 infinite recurrence。Mermaid export 則從 pipeline dependency、schedule dependency、source/target system、output metadata 產生。

Exit criteria：

- 單一 pipeline 可以產出 Mermaid workflow。
- 單一 project 可以產出 Mermaid overview。
- Calendar export 可以輸出有限時間範圍內的 schedule view。

## Milestone 6: Monitoring Layer Prototype

目的：把「排程計畫」與「實際執行狀態」疊在一起。

Scope：

- Run status data model。
- Manual status import。
- Webhook prototype。
- Validation script prototype。
- Status overlay：
  - success
  - failed
  - delayed
  - missing
  - unknown
- Log URL / evidence URL。

Exit criteria：

- 同一個 schedule occurrence 可以顯示最近一次狀態。
- 使用者可以區分計畫時間與實際結果。

## Milestone 7: Server And Collaboration

目的：從 local tool 演化成 team dashboard。

Scope：

- Backend API。
- Database。
- Auth。
- Team/user model。
- Audit history。
- Hosted deployment。
- Notification hooks。

Exit criteria：

- 多人可共同管理 schedule。
- status history 可查詢。
- webhook 可穩定接收正式 job 回報。

## Suggested First Step

第一步建議做到 Milestone 1 的 read-only MVP，不直接做 drag-and-drop。

原因：

- 最核心風險是 recurrence model 與 calendar rendering 是否準確。
- AI JSON contract 必須先穩定，否則 UI 編輯會建立在不穩的資料模型上。
- FullCalendar + rrule 可以快速驗證「每週一到無限未來動態展開」這件事。
- cron-parser 可以同步驗證既有 cron job 的表達式是否能被準確投影到 calendar。
- 一旦 read-only render 正確，拖曳編輯只是下一層功能，不會改掉產品核心。

如果想要更快看到成果，可以採用 2-step MVP：

1. Week / month read-only calendar + filters。
2. JSON editor + export。

Drag-and-drop editing 放在 V1.5。
