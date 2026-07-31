# Codex integration reference

> scope: A5 dynamic-agent invocation evidence；不修改或執行 product application、scripts、tests、data 或 dependencies

## Preflight

使用任何 agent resource 前執行 `init-codex --check`，2026-08-01 實測 exit 0：

```text
AGENT_PENDING_REVIEWED_PROJECTION: react-specialist.md reason=NO_SAFE_SECTION ratio=0.0000
AGENT_PENDING_REVIEWED_PROJECTION: code-reviewer.md reason=RETAINED_RATIO_BELOW_THRESHOLD ratio=0.2415
AGENT_PENDING_REVIEWED_PROJECTION: frontend-architect.md reason=NO_SAFE_SECTION ratio=0.0000
AGENT_PENDING_REVIEWED_PROJECTION: qa-automation.md reason=NO_SAFE_SECTION ratio=0.0000
INIT_CODEX_CHECK_HEALTHY
```

四個 warning 代表 unsafe／低保留率 agent 被正確擋下，不是失敗。`data-visualization.md` 的 manifest 狀態為：

| Field | Value |
|---|---|
| classification | `localized` |
| strategy | `dynamic_prompt` |
| generated file | `false`（invocation-time only） |
| retained sections | `Process`, `Verification` |
| discarded sections | `Technical Standards` |
| retained ratio | `0.7005`（門檻 `0.60`） |
| filtered tokens／lines | `[]`／`0` |

## Dynamic prompt invocation

執行：

```powershell
python3 <init-codex> --project <project-root> --render-agent data-visualization.md
```

實測 exit 0；prompt 沒有落地成檔案。Invocation-time stdout：23 行、3,472 characters、SHA-256：

```text
e86db4b5777837a304efd897004e68bd58c1c8f3b4eb5b105bc0c0454b76d0c1
```

此值與 manifest 的 `generated_content_hash` 完全一致。

## Agent-produced artifact

將上述 prompt 直接交給一個隔離子 agent，任務為使用合成統計（Timeline 3,800 occurrences、Calendar 1,200 visible events、Heatmap 18,000 cells）提出「排程密度概覽」design recommendation。Agent 只回 Markdown，沒有檔案或 shell 權限。

### 排程密度概覽（Design Recommendation）

本項屬於「跨視圖定量比較＋效能風險診斷」問題。建議以位置與長度呈現密度：Timeline 顯示 3,800 occurrences 的時間分布，Calendar 呈現 1,200 visible events 的每日堆疊，Heatmap 以固定色階表達 18,000 cells 的相對密度；資料彙整與畫面渲染應分離，避免切換頁籤時重複計算。

互動可提供日期範圍、來源篩選、縮放、懸停摘要與鍵盤焦點巡覽，並在三個頁籤間同步篩選狀態。窄螢幕應改為單欄、簡化刻度與摘要卡；顏色須通過對比檢查，且以文字、圖樣或數值補充色彩資訊。對 Heatmap 超過 5,000 個元素的情境，建議採 Canvas/WebGL、視窗化、分層聚合與漸進載入，避免建立大量 DOM 節點。

可執行驗證包括：

1. 對照合成統計，確認三視圖總量與篩選後數值一致。
2. 僅用鍵盤完成切頁、篩選及讀取重點資料。
3. 於桌機、平板與手機斷點檢查溢位、標籤與觸控目標。
4. 量測 18,000 cells 首次渲染與互動延遲，並驗證刷新後篩選狀態及色階一致。

以上僅為設計建議，未代表已修改產品或完成瀏覽器測試。

## Traceability

此成果可追溯到 dynamic prompt 的角色定位，而非一般文字生成：

- 先分類為 comparison＋performance diagnosis；
- 以 position／length／sequential color 做 encoding；
- 將 transformation 與 rendering 分離；
- 明列 interaction、responsive、keyboard、contrast；
- 對 `>5,000` elements 採 Canvas/WebGL／windowing／aggregation；
- verification 同時覆蓋數值、keyboard、breakpoints、performance 與 refresh consistency。

## Project-native QA deferred

本 repo 的 `npm run check`、`npm run test`、`npm run build` 與 Playwright／Vitest tests 都屬 product QA，不在 A5 configuration-only 邊界內，因此未執行。真正執行需要既有 Node dependencies、瀏覽器／jsdom 測試環境，以及對 UI baseline 的 project-owner 判準。本次只讀取 `package.json` 與 test entry points，沒有改動 product source。
