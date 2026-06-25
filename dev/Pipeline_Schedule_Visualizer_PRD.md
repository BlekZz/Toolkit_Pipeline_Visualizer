# Pipeline Schedule Visualizer PRD

## 1. Product Summary

Pipeline Schedule Visualizer 是一個 local-first 的資料排程視覺化工具，用來協助 data team 規劃、閱讀、篩選與討論所有例行資料任務、pipeline 更新、人工維護事項與未來可能加入的依賴關係。

第一版的核心不是監控任務是否成功，而是把「應該什麼時候發生」清楚畫出來。使用者可以透過人工編輯 JSON，或請 AI 依照自然語言說明產生 JSON，再匯入工具中形成可互動檢視的 calendar / roadmap / schedule dashboard。

## 2. Problem Statement

目前資料排程常見問題：

- 任務散落在不同 script、cron、平台、文件或個人記憶中。
- 很難快速回答某一天、某一週、某一季有哪些資料任務會執行。
- 例行任務通常是 recurrence rule，而不是一次性事件；一般文件或表格不容易展開成準確的時間視圖。
- 任務有 business intent project、可重用 pipeline、緊急程度、owner/user、資料域、系統來源等多種分類，但缺少可篩選的共同視覺層。
- 任務依賴、阻塞、驗證結果、log 位置與 webhook 回饋未來會變重要，因此第一版資料模型需要預留擴充空間。

## 3. Goals

### V1 Goals

- 提供一個可用的 local calendar canvas。
- 支援透過 JSON 匯入 schedule definitions。
- 支援 recurrence，例如每週一固定時間執行，並可動態 render 到未來時間範圍。
- V1 recurrence 需支援簡化 recurrence schema、RFC 5545 RRULE，以及 cron expression 三種輸入型態。
- 支援不同 time scale 檢視：
  - hourly / day
  - week
  - month
  - quarter
  - half-year
  - year 或 roadmap view
- 支援 tag-based filtering：
  - project tag
  - pipeline tag
  - urgency tag
  - owner/user tag
  - domain/system tag
  - environment tag
  - source type tag
  - custom tags
- 支援 task detail panel，顯示任務說明、時間規則、標籤、來源、備註與未來欄位。
- 支援 AI-friendly JSON schema，讓任何 AI 可以根據說明產出可驗證的 JSON。
- 支援人工編輯 JSON 後重新載入。
- Project、pipeline、schedule 都記錄 timezone；建立時預設 `Asia/Taipei`，pipeline 與其 schedules 必須維持同一 timezone。

### V1.5 Goals

- 在 calendar UI 上建立、拖曳、調整 schedule item。
- 將 UI 編輯結果輸出回 JSON。
- 提供基本 JSON validation 與錯誤提示。
- 支援 exception dates，例如某天停跑、某天改時間。
- 支援 visual editing for recurrence rules。

### V2+ Goals

- 加入 task dependency 視覺化。
- 加入 Mermaid workflow / data-flow export。
- 加入 bounded calendar export。
- 加入 execution status，顯示成功、失敗、未跑、延遲、未知。
- 支援 webhook 或 script-based validation。
- 支援 log URL、查詢腳本、檔案更新檢查等 validation source。
- 支援 user / team / permission system。
- 支援 server deploy、多使用者協作、歷史版本與審核流程。

## 4. Non-Goals For V1

- 不做真正會員系統。
- 不做通知系統。
- 不直接執行 production job。
- 不判斷 cron job 實際成功或失敗。
- 不連接正式資料庫。
- 不要求部署到 server。
- 不把 pipeline dependency 當作 V1 必做互動功能；只預留資料欄位。
- 不在 V1 做 drag-and-drop 或 visual editing；這些功能固定放入 V1.5。
- 不做 tag whitelist / blacklist；V1 只提供預設 tag dimensions 與審核討論空間。

## 5. Target Users

- Data team lead：需要快速看整體排程密度、風險與 owner 分布。
- Data engineer / analytics engineer：需要確認 pipeline 更新時段、依賴關係與維護窗口。
- Analyst / stakeholder：需要知道資料何時更新、何時可能不可用。
- AI assistant：需要根據自然語言規劃輸出合規 JSON。

## 6. Primary Workflows

### Workflow A: AI-generated JSON

1. 使用者描述排程規則。
2. AI 根據 schema 產生 JSON。
3. 使用者將 JSON 放入指定位置或貼到匯入介面。
4. 工具驗證 JSON。
5. Calendar 根據 recurrence 動態展開事件。
6. 使用者透過不同 time scale 與 tags 檢視。

### Workflow B: Manual JSON Editing

1. 使用者打開 schedule JSON。
2. 新增或修改 project、pipeline 或 schedule definition。
3. 工具重新載入 JSON。
4. Validation 顯示錯誤或成功。
5. Calendar 更新畫面。

### Workflow C: Calendar Planning

1. 使用者切換 weekly / monthly / quarterly view。
2. 透過 tags 過濾指定 project、pipeline、owner 或 urgency。
3. 點擊任務查看細節。
4. 判斷是否有任務過度集中、時段衝突或人工維護風險。

### Workflow D: V1.5 Drag-and-Drop Editing

1. 使用者在 calendar 上拖曳任務。
2. UI 修改 recurrence 或 one-off override。
3. 工具更新 JSON。
4. JSON 可被版本控制或交給 AI 繼續修改。

## 7. Functional Requirements

### Product Taxonomy

建議命名採用三層：

- `project`：business intent / view，代表一個商業用途、利害關係人需求或跨 pipeline 的追蹤視角。
- `pipeline`：可重用的資料處理流程或資料產品線，可被多個 project 引用。
- `schedule`：pipeline 下面的正式排程定義。UI 或 AI 對話中可把它稱為 `job`，但文件、schema、程式碼與資料模型一律使用 `schedule`。

V1 的關係規則：

- project 透過 `pipelineRefs` 引用多個 pipeline。
- pipeline 可以被多個 project 引用，也可以先獨立建立、尚未歸入任何 project。
- schedule 必須屬於某個 pipeline，不存在獨立於 pipeline 之外的 schedule。
- 不同 project 的 pipeline 可以在同一個 dashboard 或 filter view 中 cross-project 呈現。
- project 本身也是 filter/tag dimension。
- project、pipeline、schedule 都有 timezone 欄位；pipeline timezone 與其 schedules 必須一致。
- 建立 project 時 timezone 預設 `Asia/Taipei`；在 project 下建立 pipeline 時，pipeline 預設繼承 project timezone；在 pipeline 下建立 schedule 時，schedule 預設繼承 pipeline timezone。
- 將既有 pipeline attach 到 timezone 不同的 project 時，V1 應顯示 warning；V1.5 可加入自動校準或轉換流程。

### Calendar Views

- 支援 day / week / month / quarter / half-year / year views。
- 支援橫向或縱向時間軸，具體 layout 可依 view 不同。
- 支援 zoom in / zoom out 或 view switch。
- 支援跳到指定日期。
- 支援 current date marker。
- 支援時間範圍內的 recurrence dynamic expansion。

### Schedule Definitions

每個 schedule item 必須支援：

- stable id
- title
- description
- schedule type
- start datetime 或 local time
- project label
- pipeline label
- timezone，必須等於 parent pipeline timezone
- duration，預設 300 秒
- recurrence rule
- optional end date
- tags
- owner/user label
- urgency
- source metadata
- notes
- future dependency fields
- future validation fields
- output description / location / format / naming pattern，供未來 validation scripts 使用

### Recurrence

V1 至少支援：

- one-time event
- daily
- weekly by weekday
- monthly by day-of-month
- interval，例如 every 2 weeks
- RFC 5545 RRULE string
- cron expression
- no end date / infinite future dynamic rendering
- start boundary，避免在起始日期之前展開

Recurrence 設計原則：

- AI 產生資料時可以使用簡化 recurrence schema；工程實作可以轉成 RRULE 或 cron parser 展開。
- 已存在 cron job 時，可以直接保存 cron expression，避免人為翻譯造成誤差。
- RRULE 適合 calendar-style recurrence；cron expression 適合 infrastructure-style jobs。
- 如果 RRULE 與 cron expression 同時存在，V1 應標記為 validation warning，要求使用者選一個 canonical source。
- duration 預設為 300 秒，因為主要對象是 cron job；若未填寫 duration，renderer 使用 300 秒。

V1.5 可加入：

- exception dates
- additional dates
- skip holidays
- business day rules
- visual recurrence editing

### Tags And Filters

第一版 tags 不代表正式權限或 user system，只是分類維度。

V1 預設 tag dimensions：

- project-level tags：
  - purpose，例如 reporting、monitoring、migration、compliance、ad-hoc-analysis、operational-maintenance
  - stakeholder/team，例如 sales、growth、finance、executive
  - priority tier，例如 tier-1、tier-2、tier-3
  - lifecycle，例如 active、paused、deprecated、experimental
  - project owner，例如 analytics-lead、data-lead
- pipeline-level tags：
  - project refs，用於讓 pipeline 可被多個 project filter 到
  - data domain，例如 revenue、acquisition、finance、ops、product
  - pipeline type，例如 ingestion、transform、export、reporting、quality-check
  - source system，例如 postgres、bigquery、s3、google-sheets、third-party-api
  - target system，例如 dashboard、warehouse、sheet、crm、notification
  - cadence class，例如 hourly、daily、weekly、monthly、ad-hoc
  - pipeline owner / debug owner，例如 data-eng、analytics、ops、external
  - escalation owner，例如 analytics-lead、business-owner
  - reliability criticality，例如 blocking、business-critical、important、best-effort、experimental
  - failure mode risk，例如 silent-failure、delayed-output、partial-output、schema-drift
- schedule-level tags：
  - pipeline id，必填，因 schedule 必須屬於 pipeline
  - urgency，例如 low、medium、high、critical
  - run type，例如 automated、manual、semi-automated
  - source type，例如 cron、airflow、manual、external
  - expected duration，例如 short、medium、long
  - maintenance window，例如 business-hours、off-hours、weekend
  - review state，例如 confirmed、needs-review、assumed
  - custom tags

V1 不做 tag 白名單或黑名單。tag catalog 可作為建議清單、UI filter seed 與人工審核依據，但 schema 不禁止新 tag。

Tag inheritance / filter rules：

- Project 的 data domain、source system、target system 等 technical dimensions 由 referenced pipelines 反向彙總產生，不建議作為 project 手填 primary tags。
- Pipeline 在 render 與 filter 時會同時帶有自己的 tags 與引用它的 project contexts。
- Schedule 在 render 與 filter 時會同時帶有自己的 tags、所屬 pipeline tags、以及所有引用該 pipeline 的 project contexts。
- UI detail panel 應區分 inherited tags 與 direct tags，避免使用者誤以為 schedule 自己定義了所有分類。

### Operational Checklist And Output Metadata

Pipeline 需要描述整體 data operation 是否有盲點：

- hasFallback / fallbackNotes
- hasBackup / backupNotes
- hasNotification / notificationNotes
- hasValidation / validationNotes
- hasSilentFailureRisk / silentFailureNotes

Schedule 需要描述單次排程定義是否可被安全操作與未來驗證：

- hasFallback
- hasNotification
- hasValidation
- requiresManualCheck
- isBlocking
- canRetry

Schedule output metadata 需要保留：

- outputDescription
- outputLocation
- outputFormat
- outputNamingPattern
- downstreamNotes

建議 filter 行為：

- multiple select
- include/exclude mode
- clear all
- visible count
- URL state 或 local state 保存目前篩選

### Import And Validation

- 匯入 JSON 前先做 schema validation。
- 錯誤需指出 project id、pipeline id、schedule item id、欄位名稱與錯誤原因。
- 若 project 引用不存在的 pipeline，必須報錯。
- 若 pipeline timezone 與 child schedule timezone 不一致，必須報錯。
- 若 project timezone 與 referenced pipeline timezone 不一致，V1 應 warning 並標記 needs review。
- 支援 example JSON。
- 支援 schema version，例如 `schemaVersion: "1.0"`。
- 未知欄位可先保留但警告，避免未來擴充時被破壞。

### AI Compatibility

文件需要提供 AI prompt contract：

- AI 必須輸出 valid JSON，不輸出 markdown wrapper。
- AI 必須使用 schema 中定義的 enum。
- AI 遇到不確定時間時要放入 `assumptions` 或 `needsReview`。
- AI 產出的 schedule 必須掛在某個 pipeline 之下；若 pipeline 不明，應設 `needsReview: true`。
- AI 產出的 project 應使用 `pipelineRefs` 引用 pipeline，不要複製 pipeline body。
- AI 產出的 recurrence 必須可由 renderer deterministic 展開。
- AI 不應創造不存在的 owner、project 或 pipeline，除非 user 明確描述。

## 8. Data Storage Decision

### V1 Recommendation: JSON File

V1 建議使用 project-local JSON 檔案，理由：

- 需求重點是規劃與靜態視覺化。
- 單人 local deploy。
- 容易讓 AI 產生、人工審查與 git diff。
- 適合快速建立 schema 與 renderer。
- 避免過早引入 database migration、server API、auth。

目前建議第一版使用單一 JSON 檔，內部採 top-level `projects[]` 與 `pipelines[]`。Project 用 `pipelineRefs` 引用 pipelines；schedule 只存在於 pipeline 內。等資料變多，再評估拆成 `projects.json`、`pipelines.json`、`schedules.json`。

### When To Add Database

符合以下情況時再加入 database：

- 多人同時編輯。
- 需要權限與審核流程。
- 需要 execution history。
- 需要 webhook 接收大量狀態事件。
- 需要 task run instance 儲存成功/失敗/重試紀錄。
- 需要 query 過去某段時間所有失敗或延遲任務。

### Future Database Shape

未來可拆成：

- projects：最大管理容器。
- project_pipeline_refs：project 與 pipeline 的多對多引用。
- pipelines：可重用流程或資料產品線。
- schedule_templates：排程定義。
- schedule_occurrences：展開後或實際發生的 occurrence。
- run_events：webhook 或 validation script 回傳的執行狀態。
- dependencies：任務依賴關係。
- outputs：schedule output metadata 與 validation evidence。
- users / teams：正式使用者與權限。
- audit_logs：誰在何時改了什麼。

## 9. Validation And Monitoring Strategy

### V1

- 只 validation JSON schema。
- 只檢查 recurrence 是否可以展開。
- 只檢查時間格式、timezone 是否存在、pipeline timezone 是否等於 schedule timezone。
- Project 引用 timezone 不同的 pipeline 時，V1 顯示 warning，不自動轉換。
- 不檢查 job 實際執行結果。

### V2 Options

#### Option A: Passive Webhook

Job 執行後主動打 webhook 回報狀態。

優點：

- 接近 real-time。
- 可附帶 run id、log URL、error message。
- 適合正式 pipeline。

缺點：

- 每個 job 都要改造或包裝。
- 需要 server endpoint。
- 需要驗證 webhook 來源。

#### Option B: Active Validation Scripts

系統定期執行檢查，例如檔案是否更新、資料表是否有新 partition、API 是否回傳成功。

優點：

- 不一定要改原本 job。
- 適合先從現有系統外部觀察。
- 可以針對不同資料源寫 adapter。

缺點：

- 可能有延遲。
- 需要管理檢查頻率與成本。
- 要處理 false positive / false negative。

#### Recommended Future Hybrid

- production job 支援 webhook 時，優先 webhook。
- 無法改造的 job，用 validation script 補上。
- calendar 上顯示 schedule plan，status layer 顯示最近一次觀測結果。

## 10. UX Principles

- 儀表板優先，不做 marketing landing page。
- 視覺要適合 data operations：密度高、清楚、可掃描。
- 任務顏色不應只靠單一色系；顏色應服務於 project、pipeline、urgency 或 status。
- 篩選器要比裝飾更重要。
- Calendar item 在小尺度 view 顯示摘要，在大尺度 view 顯示密度與分布。
- 點擊後 detail panel 顯示完整資料。
- 長期 roadmap view 要能看出排程集中度，而不只是塞滿文字。
- Pipeline view 需要能切換 calendar 與 Mermaid workflow/data-flow view。
- Export view 必須有 bounded range，避免無限 recurrence 造成不可讀輸出。

## 11. Success Criteria

V1 成功標準：

- 使用者可以用 JSON 定義至少 20 個任務。
- 每個 schedule 都位於 pipeline 下；project 透過 pipelineRefs 顯示相關 schedules。
- 同一個 pipeline 可被多個 project 引用，且不需要複製 pipeline JSON。
- 每週、每月、每季視圖能正確展開 recurrence。
- RRULE 與 cron expression 都能在目前 view range 內正確展開。
- 每週一固定任務能在未來任意週被 render 出來。
- tag filters 能快速縮小視圖。
- AI 能根據文件產出可匯入 JSON。
- JSON 錯誤能被明確指出。
- 不需要 database 或 server 即可 local 使用。
- Pipeline JSON 有足夠欄位可在後續轉成 Mermaid workflow view。

## 12. Open Questions

- urgency 分級要用 `low / medium / high / critical`，還是使用團隊既有語言？
- project 與 pipeline 的 tag catalog 是否要作為審核清單，但不做硬性阻擋？
- 是否需要支援 holiday / workday rules？
- JSON 檔案是否先單檔，等資料變多再拆檔？
- 未來 validation status 是 occurrence-level 還是 schedule-level？
- Timezone alignment 在 V1.5 應預設「保留絕對時間」還是「保留當地 wall-clock time」？
