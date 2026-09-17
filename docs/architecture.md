# Kiến trúc hệ thống

Tài liệu này mô tả cách các lớp trong IDE ghép với nhau, dành cho người sẽ sửa
hoặc mở rộng mã nguồn. Xem `README.md` cho hướng dẫn sử dụng.

---

## 1. Tổng quan

Toàn bộ hệ thống chạy trong **một process Next.js duy nhất**. Không có backend
riêng, không có message queue, không có container.

```
Trình duyệt                     Next.js server (Node)
┌────────────────────┐          ┌──────────────────────────────────────┐
│ src/features/**    │  fetch   │ src/app/api/**                        │
│  Explorer          │ ───────► │  REST                                 │
│  Editor (Monaco)   │          │                                       │
│  Terminal (xterm)  │ ◄─SSE─── │  /api/terminal/[id]/stream            │
│  AgentConsole      │ ◄─SSE─── │  /api/tasks/[id]/events               │
│  Git / Agents /    │ ◄─SSE─── │  /api/fs/watch                        │
│  Settings          │          │            │                          │
└────────────────────┘          │            ▼                          │
                                │  src/lib/orchestrator/engine.ts       │
                                │            │                          │
                                │   ┌────────┼─────────┬────────────┐   │
                                │   ▼        ▼         ▼            ▼   │
                                │ routing  context  checkpoints  terminal│
                                │            │                     │    │
                                │            ▼                     ▼    │
                                │   .agent-manager/            PTY thật │
                                │            │                     │    │
                                │            ▼                     ▼    │
                                │       src/db (SQLite)      Agent CLI  │
                                └──────────────────────────────────────┘
```

---

## 2. Lớp dữ liệu

`src/db/sqlite-driver.ts` mở `node:sqlite`, bật `WAL` + `foreign_keys`, rồi chạy
migration nhúng `0001_init` (ghi vào bảng `__migrations`, chạy đúng một lần).

`src/db/index.ts` bọc driver trong `drizzle-orm/sqlite-proxy`.

> **Cạm bẫy đã gặp:** `statement.all()` trả về object sẽ **âm thầm mất cột trùng
> tên** khi JOIN. Callback của proxy vì vậy luôn gọi `setReturnArrays(true)`
> trước `.all()`. `tests/db.test.ts` có test bảo vệ điều này.

13 bảng: `workspaces`, `tasks`, `agents`, `provider_accounts`, `agent_sessions`,
`agent_events`, `checkpoints`, `terminal_sessions`, `usage_snapshots`,
`settings`, `task_timeline`, `approvals`, `__migrations`.

---

## 3. Adapter layer

Mọi tương tác với CLI đều đi qua `AgentAdapter` — không nơi nào trong engine
được `if (agent === "codex")`.

```ts
interface AgentAdapter {
  id; displayName; binary;
  health():      Promise<AgentHealth>;          // đã cài chưa, version nào
  buildArgs(input):       string[];             // argv chạy mới
  buildResumeArgs(input): string[];             // argv resume theo session
  usage():       Promise<AgentUsage>;           // hạn mức — hoặc UNKNOWN
  parseEvent(raw): AgentEvent | null;           // 1 dòng output → sự kiện
  start(input):  Promise<AgentSession>;
  resume(input): Promise<AgentSession>;
  stop(sessionId): Promise<void>;
}
```

`BaseAgentAdapter` cài sẵn phần chung; mỗi adapter chỉ override argv, `usage()`
và `parseVendorEvent()`.

| Agent | Chạy | Resume | Usage |
|---|---|---|---|
| Codex | `codex exec --skip-git-repo-check <prompt>` | `codex exec resume <sid> …` | không có lệnh ổn định → `UNKNOWN_USAGE` |
| Claude | `claude --print --permission-mode acceptEdits <prompt>` | thêm `--resume <sid>` | `claude usage` → `parseUsage` |
| Antigravity | `antigravity run --prompt <prompt>` | `run --session <sid> --prompt …` | `antigravity usage --json` |

Thêm Agent mới = tạo một class kế thừa `BaseAgentAdapter`, đăng ký vào
`registry` trong `adapters.ts`, thêm id vào `AGENT_IDS`. Không cần sửa engine.

---

## 4. Định tuyến hai tầng

**Tầng 1 — chọn account** (`selectAccount`): trong cùng một Agent, ưu tiên
account còn dùng được, priority thấp hơn trước.

**Tầng 2 — chọn Agent** (`pickNextAgent`):

- `manual` — chỉ dùng Agent người dùng chỉ định.
- `priority` — duyệt theo thứ tự trong Cài đặt.
- `smart` — chấm điểm:

```
điểm = 0.35·khả dụng + 0.25·sức khoẻ hạn mức + 0.20·độ hợp task
      + 0.10·độ tin cậy gần đây + 0.10·ưu tiên người dùng
```

Hạn mức **không xác định** được chấm 0.8 — thấp hơn "chắc chắn còn nhiều" nhưng
vẫn dùng được, vì phần lớn CLI đơn giản là không báo số.

---

## 5. Vòng đời task

```
draft → preparing → running → checkpointing → completed
                       │              │
                       │              └─► handoff → running (Agent khác)
                       └─► paused / human_control
```

`finalizeTask` chạy `npm test` thật (timeout 120s). Pass → `completed`.
Fail → `paused` và ghi rõ là lỗi task, **không** chuyển Agent.

Runtime nằm trên `globalThis.__ideTaskRuntime` để sống sót qua hot-reload, có cờ
`finishing` / `handingOff` chống chạy trùng.

---

## 6. Context dùng chung

```
<workspace>/.agent-manager/tasks/TASK-001/
├── task.md               yêu cầu gốc
├── context.md            kiến trúc / ràng buộc
├── progress.md           việc đã xong (append-only)
├── todo.md               việc còn lại
├── decisions.md          quyết định kỹ thuật + lý do
├── files-touched.json    file đã chạm vào
├── git-state.json        branch / HEAD / dirty
├── terminal-history.log  lệnh đã chạy
├── test-results.log      kết quả test thật
├── sessions.json         session id theo từng Agent (để resume)
└── checkpoints/
    └── checkpoint-0001/  ảnh chụp toàn bộ mục trên
```

`buildContextPackage()` nén trước khi bàn giao (`compactSection`: giữ N dòng
cuối, cắt theo ngưỡng ký tự; diff giới hạn 12.000 ký tự) để prompt không phình.

**Khôi phục checkpoint chỉ ghi lại các file context — không bao giờ revert mã
nguồn.** Git là nguồn sự thật cho code; tự ý xoá thay đổi của người dùng là vi
phạm plan §60.

---

## 7. Terminal

`spawnPty()` chọn backend theo thứ tự:

1. `node-pty` nếu native binding build được;
2. `scripts/pty_bridge.py` dùng `pty.fork()` — luôn có trên Linux/macOS.

Khung dữ liệu vào bridge: `I<len>\n<bytes>` cho input, `R<cols>,<rows>\n` cho resize.

`POST /api/terminal/[id]/input` **không** ghi thẳng vào PTY. Route phát hiện khi
người dùng nhấn Enter, ghép lại dòng lệnh, chạy `analyzeCommandLine()`, và trả
`{ blocked: true, … }` nếu cần phê duyệt — chặn ngay tại server, không tin UI.

---

## 8. Sự kiện realtime

`src/lib/orchestrator/bus.ts` là một event bus in-process trên `globalThis`.

| Endpoint | Sự kiện | Nội dung |
|---|---|---|
| `/api/tasks/[id]/events` | `agent` | `AgentEventView` (kèm 100 sự kiện lịch sử khi mở) |
| `/api/terminal/[id]/stream` | `data`, `exit` | chuỗi đã JSON-encode |
| `/api/fs/watch` | thay đổi file | dùng chokidar |

Tất cả đều gửi comment `: ping` mỗi 15 giây để proxy không đóng kết nối.

---

## 9. Bảo mật

| Lớp | Cài đặt ở |
|---|---|
| Protected path | `isProtectedPath()` — chặn cả thư mục con của `/usr`, `/etc`, `~/.ssh`… |
| Path traversal | `assertInsideWorkspace()` / `resolveWorkspaceFile()` |
| File nhạy cảm | `isSensitiveFile()`; route trả `requiresConfirmation` **kèm `content: null`** |
| Lệnh nguy hiểm | `analyzeCommandLine()` tách chuỗi lệnh theo `; && \|\| \|` rồi kiểm từng lệnh |
| Rò rỉ secret | `redactSecrets()` chạy trên mọi event trước khi lưu/phát |

---

## 10. i18n

`src/lib/i18n.tsx` cung cấp `useI18n()` với `t(key, params)`. Tiếng Việt là mặc
định; lựa chọn lưu trong `localStorage` và trong bảng `settings`.

`tests/i18n.test.ts` quét toàn bộ `.tsx`, gom mọi khoá `t("…")` và fail nếu có
khoá không tồn tại trong `vi.json`, đồng thời bắt buộc `en.json` trùng khoá.
