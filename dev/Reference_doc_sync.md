# Reference_doc_sync — Document Sync Registry

> 本專案採用全域 Document Sync System（規範見 `~/.claude/dev/Reference_doc_sync_standard.md`）。
> Hook 配置在 `.claude/settings.json`（PostToolUse Write/Edit → SYNC_HOOK 提醒）。
> 此檔為初始種子（2026-07-03 隨 A8 落地建立）：sync 關係尚未逐檔宣告，
> 首次修改某文件時再補該檔 frontmatter 與下方對應條目。

## Part A — Sync Groups

| Group | 成員 | Authority（source of truth） |
|-------|------|------------------------------|
| json-schema | [[Reference_JSON_Schedule_Schema]]、[[Reference_AI_Output_Contract]]、`src/`（型別定義） | [[Reference_JSON_Schedule_Schema]] |
| product-scope | [[Pipeline_Schedule_Visualizer_PRD]]、[[Plan_Shipping_Artifacts_V1]]、[[Tracker_V1_Checklist]] | [[Pipeline_Schedule_Visualizer_PRD]] |

## Part B — Quick Lookup（改了左邊，檢查右邊）

| 修改對象 | 必須檢查/更新 |
|----------|---------------|
| `src/` 內 schema/型別相關程式 | [[Reference_JSON_Schedule_Schema]]、[[Reference_AI_Output_Contract]] |
| [[Reference_JSON_Schedule_Schema]] | [[Reference_AI_Output_Contract]]、`src/` 型別定義 |
| [[Pipeline_Schedule_Visualizer_PRD]]（範圍變動） | [[Plan_Shipping_Artifacts_V1]]、[[Tracker_V1_Checklist]] |
| `documentation/` 內使用者文件 | 對照 [[Pipeline_Schedule_Visualizer_PRD]] 確認描述一致 |

## 尚未納入 sync 的文件

`Audit_Assumption_Risk`、`Design_Data_Model_Architecture`、`Tracker_Roadmap_Milestones`、`Tracker_Sprint1_Plan`、`tech-notes` —— 目前無跨檔一致性需求，首次出現 sync 需求時再登記。
