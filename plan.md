# Local Multi-Agent Dev IDE

## 1. Mục tiêu sản phẩm

Xây dựng một ứng dụng Web chạy local, đóng vai trò như một IDE phát triển phần mềm có tích hợp nhiều AI Coding Agent.

Ứng dụng phải cho phép người dùng:

- Mở project local.
- Duyệt source code.
- Chỉnh sửa code trực tiếp.
- Sử dụng Terminal ngay trong IDE.
- Chạy Codex, Claude Code, Antigravity CLI.
- Quản lý trạng thái và mức sử dụng của từng Agent.
- Tự động điều phối Agent.
- Chuyển Agent khi Agent hiện tại hết quota, rate limit hoặc không khả dụng.
- Giữ lại context và trạng thái công việc khi Agent bị thay đổi.
- Cho phép con người tiếp quản công việc từ Agent.
- Sau khi chỉnh sửa thủ công, giao lại cho Agent tiếp tục.
- Quản lý Git, diff và checkpoint.
- Hoạt động hoàn toàn trên máy local.

Sản phẩm không phải một AI Chat đơn thuần.

Sản phẩm cũng không phải chỉ là dashboard theo dõi token.

Định vị:

```text
Local Development IDE
        +
Multi-Agent Runtime
        +
Agent Router
        +
Provider Gateway
        +
Context Engine
        +
Checkpoint System
```

---

# 2. Triết lý cốt lõi

## 2.1 Context thuộc về hệ thống, không thuộc về Agent

Không phụ thuộc vào session riêng của Codex, Claude hoặc Antigravity để giữ context.

Ứng dụng phải tự sở hữu:

- Requirement.
- Tiến độ.
- Các quyết định kỹ thuật.
- File đã thay đổi.
- Git state.
- Test result.
- Todo còn lại.
- Terminal activity quan trọng.
- Checkpoint.

Nguyên tắc:

> Agent có thể thay đổi, provider có thể thay đổi, session có thể chết, nhưng Task Context và Workspace phải luôn tồn tại.

---

# 3. Ngôn ngữ hệ thống

Toàn bộ giao diện mặc định:

```text
Tiếng Việt
Locale: vi-VN
```

Không hard-code text UI trong component.

Sử dụng hệ thống i18n ngay từ đầu.

```text
locales/
├── vi.json
└── en.json
```

`vi.json` là mặc định.

Các thuật ngữ kỹ thuật có thể giữ nguyên:

```text
Agent
Codex
Claude
Antigravity
Terminal
Git
Branch
Commit
Diff
CLI
Context
Checkpoint
Token
Workspace
```

Các hành động và trạng thái phải dùng tiếng Việt.

Ví dụ:

```text
Start       → Bắt đầu
Pause       → Tạm dừng
Resume      → Tiếp tục
Take Over   → Tiếp quản
Complete    → Hoàn thành
Failed      → Thất bại
Running     → Đang chạy
Available   → Sẵn sàng
Settings    → Cài đặt
Usage       → Mức sử dụng
```

---

# 4. Phạm vi MVP

MVP bắt buộc phải có:

1. Mở project local.
2. File Explorer.
3. Monaco Editor.
4. Terminal tích hợp.
5. Nhiều Terminal tab.
6. Chạy shell command thật.
7. Detect Codex CLI.
8. Detect Claude CLI.
9. Detect Antigravity CLI.
10. Khởi chạy Agent từ IDE.
11. Stream output realtime.
12. Task Manager.
13. Shared Context.
14. Checkpoint.
15. Agent Router.
16. Provider/Account Router.
17. Usage/quota monitor.
18. Auto failover.
19. Agent handoff.
20. Human Take Over.
21. Resume Agent.
22. Git status.
23. Git diff.
24. SQLite.
25. Settings.
26. Command security.
27. Tiếng Việt mặc định.

Không làm trong MVP:

```text
VS Code extension compatibility
Extension marketplace
Cloud sync
Team collaboration
Remote development
SSH workspace
Mobile
Full debugger
Multi-user
SaaS account
Billing
Real-time AI autocomplete
```

---

# 5. Kiến trúc tổng thể

```text
┌───────────────────────────────────────────────┐
│               LOCAL AI DEV IDE                │
│                                               │
│ Explorer | Editor | Git | Task | Terminal     │
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│            TASK ORCHESTRATION CORE            │
│                                               │
│ Task Engine                                   │
│ Context Engine                                │
│ Checkpoint Engine                             │
│ Human ↔ Agent Handoff                         │
│ Agent Router                                  │
└──────────────────────┬────────────────────────┘
                       │
                       ▼
┌───────────────────────────────────────────────┐
│          PROVIDER / ROUTING GATEWAY           │
│                                               │
│ Provider Health                               │
│ Usage / Quota                                 │
│ Account Pool                                  │
│ Retry                                         │
│ Fallback                                      │
│ Credential Management                         │
│ Request Translation                           │
└──────────────────────┬────────────────────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Codex         Claude     Antigravity
          │            │            │
          └────────────┼────────────┘
                       ▼
                   PTY Runtime
                       │
                       ▼
                Local Workspace
```

---

# 6. Tham khảo kiến trúc 9Router

9Router được dùng như một reference architecture cho:

```text
Provider abstraction
Account abstraction
Quota / Usage
Fallback
Provider health
Routing strategy
Local gateway
Multi-account
```

Không copy toàn bộ 9Router.

Không biến project thành model proxy thuần.

Project này khác ở chỗ nó quản lý:

```text
Task
Workspace
Source code
Terminal
Context
Checkpoint
Agent handoff
Human handoff
```

Phân chia:

```text
9Router concepts
      ↓
Provider Gateway

Project riêng
      ↓
Task Orchestrator
Context Engine
IDE
Terminal Runtime
```

---

# 7. Tech Stack

## Frontend

```text
Next.js
React
TypeScript
Tailwind CSS
shadcn/ui
Zustand
```

## Editor

```text
Monaco Editor
```

## Terminal

```text
xterm.js
node-pty
WebSocket
```

## Runtime

```text
Node.js
TypeScript
```

## Database

```text
SQLite
Drizzle ORM
```

## Filesystem

```text
fs/promises
chokidar
```

## Git

Ưu tiên gọi Git CLI trực tiếp.

## Validation

```text
Zod
```

---

# 8. Repository Structure

```text
local-ai-ide/
│
├── apps/
│   ├── web/
│   │   ├── app/
│   │   ├── components/
│   │   ├── features/
│   │   │   ├── explorer/
│   │   │   ├── editor/
│   │   │   ├── terminal/
│   │   │   ├── tasks/
│   │   │   ├── agents/
│   │   │   ├── usage/
│   │   │   ├── git/
│   │   │   └── settings/
│   │   ├── stores/
│   │   └── locales/
│   │
│   └── runtime/
│       └── src/
│           ├── workspace/
│           ├── filesystem/
│           ├── terminal/
│           ├── agents/
│           ├── providers/
│           ├── routing/
│           ├── tasks/
│           ├── context/
│           ├── checkpoints/
│           ├── git/
│           ├── security/
│           ├── websocket/
│           └── database/
│
├── packages/
│   ├── shared/
│   ├── protocol/
│   ├── agent-core/
│   ├── provider-gateway/
│   ├── context-engine/
│   ├── routing-engine/
│   ├── terminal-runtime/
│   └── db/
│
├── docs/
│   ├── architecture.md
│   ├── agent-protocol.md
│   ├── handoff-protocol.md
│   └── security.md
│
└── package.json
```

---

# 9. Giao diện chính

```text
┌────────────────────────────────────────────────────────────────────┐
│ DỰ ÁN           NHÁNH           AGENT         MỨC SỬ DỤNG          │
│ my-app           feature/auth    TỰ ĐỘNG       Codex 68%            │
├───────────────┬──────────────────────────┬──────────────────────────┤
│ TRÌNH DUYỆT   │ TRÌNH SOẠN THẢO          │ ĐIỀU KHIỂN AGENT        │
│               │                          │                          │
│ src/          │ auth.ts                  │ TASK-021                 │
│ api/          │                          │ Agent: Codex             │
│ components/   │ const login = ...        │ Đang chạy                │
│ package.json  │                          │                          │
│               │                          │ > đang sửa auth.ts       │
│               │                          │ > đang chạy test         │
├───────────────┴──────────────────────────┴──────────────────────────┤
│ TERMINAL                                                           │
│                                                                    │
│ $ npm run dev                                                      │
│ ready on localhost:3000                                            │
│                                                                    │
│ [Shell] [Codex] [Claude] [Antigravity] [Dev Server]               │
└────────────────────────────────────────────────────────────────────┘
```

Menu:

```text
Không gian làm việc
Công việc
AI Agent
Git
Terminal
Mức sử dụng
Cài đặt
```

---

# 10. Workspace

Model:

```ts
interface Workspace {
  id: string;
  name: string;
  path: string;

  gitRepository: boolean;

  branch?: string;

  createdAt: Date;
  lastOpenedAt: Date;
}
```

Chức năng:

```text
Mở dự án
Dự án gần đây
Đóng dự án
Mở thư mục trong hệ điều hành
```

---

# 11. File Explorer

Hỗ trợ:

```text
Tạo file
Tạo thư mục
Đổi tên
Xóa
Refresh
Copy đường dẫn
Mở trong Terminal
```

Git indicator:

```text
M = Modified
A = Added
D = Deleted
? = Untracked
```

File thay đổi từ Agent phải refresh realtime qua `chokidar`.

---

# 12. Monaco Editor

MVP:

```text
Multiple tabs
Syntax highlighting
Save
Ctrl+S
Find
Replace
Dirty state
Diff
External file change detection
```

Nếu Agent sửa file đang mở:

```text
File đã được thay đổi bên ngoài.

[Tải lại]
[So sánh]
[Giữ bản hiện tại]
```

---

# 13. Terminal Runtime

Terminal phải chạy PTY thật.

```text
xterm.js
   ↓
WebSocket
   ↓
node-pty
   ↓
Shell / Agent CLI
```

Terminal tabs:

```text
Shell
Codex
Claude
Antigravity
Máy chủ phát triển
```

Terminal model:

```ts
interface TerminalSession {
  id: string;

  workspaceId: string;

  type:
    | "shell"
    | "agent"
    | "dev-server";

  agentId?: string;

  cwd: string;

  status:
    | "running"
    | "stopped"
    | "exited";

  pid?: number;
}
```

---

# 14. Agent Adapter

Mỗi CLI phải được đóng gói thành Adapter.

```ts
interface AgentAdapter {
  id: string;

  displayName: string;

  detect(): Promise<boolean>;

  getVersion(): Promise<string | null>;

  health(): Promise<AgentHealth>;

  usage(): Promise<AgentUsage>;

  start(
    input: AgentRunInput
  ): Promise<AgentSession>;

  resume(
    input: AgentResumeInput
  ): Promise<AgentSession>;

  stop(
    sessionId: string
  ): Promise<void>;

  parseEvent(
    raw: string
  ): AgentEvent | null;
}
```

Implement:

```text
CodexAdapter
ClaudeAdapter
AntigravityAdapter
```

Tương lai:

```text
GeminiCLIAdapter
KiroAdapter
OpenCodeAdapter
```

---

# 15. Detect Agent

Khi app khởi động:

```text
codex --version
claude --version
antigravity --version
```

Hoặc OS-specific binary detection.

UI:

```text
Codex
Đã cài đặt
Version x.x.x

Claude
Đã cài đặt

Antigravity
Chưa cài đặt
```

Không tự động cài CLI.

---

# 16. Provider Gateway

Provider Gateway là tầng lấy cảm hứng từ 9Router.

Nhiệm vụ:

```text
Provider management
Account management
Quota
Usage
Health
Retry
Fallback
Credential references
```

Không chứa Task Context.

---

# 17. Provider Account

```ts
interface ProviderAccount {
  id: string;

  provider: string;

  name: string;

  status:
    | "available"
    | "warning"
    | "rate_limited"
    | "exhausted"
    | "disabled"
    | "unknown";

  priority: number;

  usage?: AgentUsage;
}
```

Ví dụ:

```text
Claude

Claude Pro #1
92%
Cảnh báo

Claude Pro #2
34%
Sẵn sàng
```

---

# 18. Routing hai cấp

Router có hai tầng.

## Tầng 1 — Account Router

Ví dụ:

```text
Claude
 │
 ├── Account A
 ├── Account B
 └── Account C
```

Nếu Account A hết quota:

```text
A → B
```

Đây là Soft Handoff.

## Tầng 2 — Agent Router

Nếu toàn bộ Claude không khả dụng:

```text
Claude
 ↓
Codex
 ↓
Antigravity
```

Đây là Hard Handoff.

Hard Handoff phải tạo đầy đủ checkpoint/context package.

---

# 19. Usage System

Không giả định provider luôn trả token/quota.

```ts
interface AgentUsage {
  status:
    | "available"
    | "warning"
    | "rate_limited"
    | "quota_exhausted"
    | "unknown";

  percentageUsed?: number;

  remaining?: number;

  resetAt?: Date;

  source:
    | "cli"
    | "api"
    | "local_estimate"
    | "error_detection";
}
```

Nếu không biết quota:

```text
Mức sử dụng:
Không xác định

Trạng thái:
Sẵn sàng
```

Không fabricate số liệu.

---

# 20. Task Model

```ts
interface Task {
  id: string;

  workspaceId: string;

  title: string;

  description: string;

  status:
    | "draft"
    | "queued"
    | "preparing"
    | "running"
    | "checkpointing"
    | "handoff"
    | "human_control"
    | "paused"
    | "failed"
    | "completed";

  preferredAgent?: string;

  activeAgent?: string;

  createdAt: Date;

  startedAt?: Date;

  completedAt?: Date;
}
```

---

# 21. Tạo công việc

Form:

```text
Tên công việc

Mô tả

Agent

[ Tự động ]
[ Codex ]
[ Claude ]
[ Antigravity ]

Chế độ

[ Lập kế hoạch ]
[ Triển khai ]
[ Sửa lỗi ]
[ Review Code ]

Ưu tiên
```

Buttons:

```text
Bắt đầu
Lưu nháp
Hủy
```

---

# 22. Task State Machine

Normal:

```text
NHÁP
 ↓
ĐANG CHỜ
 ↓
ĐANG CHUẨN BỊ
 ↓
ĐANG CHẠY
 ↓
ĐANG KIỂM TRA
 ↓
HOÀN THÀNH
```

Failover:

```text
ĐANG CHẠY
 ↓
AGENT KHÔNG KHẢ DỤNG
 ↓
ĐANG TẠO CHECKPOINT
 ↓
ĐANG CHUYỂN AGENT
 ↓
ĐANG KHÔI PHỤC CONTEXT
 ↓
ĐANG CHẠY
```

Human:

```text
ĐANG CHẠY
 ↓
TẠM DỪNG
 ↓
NGƯỜI DÙNG TIẾP QUẢN
 ↓
GIAO LẠI AGENT
 ↓
ĐANG CHẠY
```

---

# 23. Shared Task Context

Mỗi task tạo:

```text
.agent-manager/
└── tasks/
    └── TASK-001/
        ├── task.md
        ├── context.md
        ├── progress.md
        ├── decisions.md
        ├── todo.md
        ├── files-touched.json
        ├── terminal-history.log
        ├── test-results.log
        ├── git-state.json
        ├── sessions.json
        └── checkpoints/
```

---

# 24. task.md

Requirement gốc.

Ví dụ:

```text
# TASK-001

Triển khai JWT authentication.

Yêu cầu:

- Login API
- Access token
- Refresh token
- Logout
- Test
```

---

# 25. progress.md

Ví dụ:

```text
Đã hoàn thành:

- Login API
- JWT middleware
- Access token

Kiểm thử:

12 test pass
```

---

# 26. todo.md

```text
Còn lại:

- Refresh token rotation
- Logout API
- Integration test
```

---

# 27. decisions.md

```text
Decision:
Sử dụng HttpOnly cookie.

Reason:
Frontend hiện tại đã dựa trên cookie auth.
```

---

# 28. git-state.json

```json
{
  "branch": "feature/auth",
  "head": "a72b811",
  "dirty": true
}
```

---

# 29. sessions.json

```json
{
  "codex": "...",
  "claude": "...",
  "antigravity": "..."
}
```

Provider session chỉ hỗ trợ resume.

Không được xem nó là Shared Context chính.

---

# 30. Context Handoff Protocol

Trước khi Agent đổi:

```text
1. Dừng gửi task mới cho Agent hiện tại.

2. Capture Git state.

3. Capture file đã thay đổi.

4. Capture progress.

5. Capture remaining todo.

6. Capture technical decisions.

7. Capture test result.

8. Capture meaningful terminal commands.

9. Save session ID nếu có.

10. Tạo Checkpoint.

11. Router chọn Agent mới.

12. Build Context Package.

13. Khởi động Agent mới.

14. Agent mới đọc Context Package.

15. Agent mới inspect git diff.

16. Tiếp tục công việc.
```

---

# 31. Handoff Prompt

Agent mới nhận:

```text
Bạn đang tiếp quản một công việc đang được thực hiện dở.

TASK:
TASK-021

Đọc trước:

.agent-manager/tasks/TASK-021/task.md
.agent-manager/tasks/TASK-021/context.md
.agent-manager/tasks/TASK-021/progress.md
.agent-manager/tasks/TASK-021/decisions.md
.agent-manager/tasks/TASK-021/todo.md

Repository:

Branch:
feature/auth

HEAD:
a72b811

File thay đổi:

src/auth/auth.ts
src/auth/token.ts

Kết quả kiểm thử gần nhất:

18 passed
2 failed

Không thực hiện lại phần đã hoàn thành.

Trước khi sửa source:

1. Đọc context.
2. Kiểm tra git status.
3. Kiểm tra git diff.

Tiếp tục công việc đầu tiên chưa hoàn thành trong todo.md.

Trước khi dừng:

- cập nhật progress.md
- cập nhật todo.md
- cập nhật decisions.md nếu có quyết định mới
- chạy test liên quan
```

---

# 32. Checkpoint

Checkpoint được tạo:

```text
Trước khi handoff
Trước khi Agent dừng
Khi user yêu cầu
Trước thay đổi lớn
```

Structure:

```text
checkpoints/
└── checkpoint-0007/
    ├── metadata.json
    ├── progress.md
    ├── todo.md
    ├── decisions.md
    ├── git-state.json
    └── terminal.log
```

---

# 33. Context Compaction

Không gửi toàn bộ lịch sử Agent vào prompt.

Context Package chỉ gồm:

```text
Task Summary
Current Architecture Context
Latest Decisions
Completed Work
Remaining Work
Changed Files
Git State
Test State
Relevant Commands
```

Logs cũ vẫn giữ trong DB/file nhưng không inject mặc định.

---

# 34. Agent Router

Modes:

```text
Thủ công
Theo ưu tiên
Tự động thông minh
```

Priority example:

```text
1. Codex
2. Claude
3. Antigravity
```

Smart scoring:

```text
score =
  availability * 0.35
+ usageHealth * 0.25
+ taskCompatibility * 0.20
+ recentReliability * 0.10
+ userPriority * 0.10
```

Không cần AI để route.

Rule-based là đủ.

---

# 35. Routing Config

```yaml
routing:
  mode: smart

  agentPriority:
    - codex
    - claude
    - antigravity

  warningThreshold: 85

  autoHandoff: true

  failoverOn:
    - quota_exhausted
    - rate_limit
    - provider_unavailable
    - authentication_error
    - repeated_provider_error
```

---

# 36. Không Failover khi

Không chuyển Agent nếu:

```text
Build fail
Compile error
Unit test fail
Lint error
Application bug
```

Đây là lỗi task.

Agent phải xử lý tiếp.

---

# 37. Preemptive Handoff

Có option:

```text
Tự động chuyển Agent trước khi hết hạn mức
```

Ví dụ:

```text
Ngưỡng cảnh báo: 85%
```

Nếu Agent đạt 88% và task còn dài:

```text
Checkpoint
↓
Router
↓
Agent khác
```

---

# 38. Human Take Over

Buttons:

```text
Tạm dừng
Tiếp quản
Tạo Checkpoint
Chuyển Agent
Dừng công việc
```

Khi user chọn:

```text
Tiếp quản
```

System:

```text
AI Agent đã tạm dừng.

Bạn đang trực tiếp kiểm soát Workspace.
```

User có thể sửa code và chạy Terminal.

Sau đó:

```text
Giao lại cho Agent
```

Options:

```text
Tiếp tục với Codex
Tiếp tục với Claude
Tiếp tục với Antigravity
Tự động chọn Agent
```

---

# 39. Agent Console

Ví dụ:

```text
TASK-021

Triển khai Authentication

Agent:
Claude

Trạng thái:
Đang chạy

Thời gian:
12 phút 31 giây

File thay đổi:
8

Hoạt động gần nhất:
Đang chạy npm test
```

Realtime:

```text
> đang đọc auth.ts

> đang cập nhật token.ts

> đang chạy npm test

✓ 18 test đã pass
```

---

# 40. Timeline

```text
20:10
Claude / Account #1 bắt đầu

20:21
Account #1 đạt giới hạn

20:21
Chuyển Claude sang Account #2

20:30
Claude bị rate limit

20:31
Đã tạo Checkpoint #8

20:31
Đang chuyển sang Codex

20:32
Codex đã khôi phục context

20:41
Test hoàn tất

20:42
Task hoàn thành
```

---

# 41. Git

MVP:

```text
Branch hiện tại
Git status
File thay đổi
Diff
Commit history
Commit
```

Không tự động:

```text
Push
Merge main
Rebase
Reset hard
```

---

# 42. Git Branch cho Task

Khuyến nghị:

```text
agent/TASK-001
```

MVP không bắt buộc auto create branch.

Có setting:

```text
Tự tạo branch cho task
ON / OFF
```

---

# 43. Git Worktree

Sau MVP:

```text
worktrees/
├── TASK-001/
├── TASK-002/
└── TASK-003/
```

Cho phép:

```text
TASK-001 → Codex
TASK-002 → Claude
TASK-003 → Antigravity
```

chạy song song.

---

# 44. Local Gateway

Chuẩn bị kiến trúc để có thể expose:

```text
http://127.0.0.1:<port>/v1
```

Không bắt buộc hoàn thiện đầy đủ trong MVP.

Mục đích:

```text
Local provider gateway
Usage
Routing
Credential handling
Fallback
```

Tool hỗ trợ custom endpoint có thể sử dụng gateway này sau này.

---

# 45. Database

## workspaces

```text
id
name
path
created_at
last_opened_at
```

## tasks

```text
id
workspace_id
title
description
status
preferred_agent
active_agent
created_at
started_at
completed_at
```

## agents

```text
id
name
binary_path
version
enabled
```

## provider_accounts

```text
id
agent
provider
name
priority
status
created_at
```

## agent_sessions

```text
id
task_id
agent
provider_account_id
provider_session_id
status
started_at
ended_at
```

## checkpoints

```text
id
task_id
agent_session_id
path
git_head
created_at
```

## agent_events

```text
id
task_id
agent
type
message
created_at
```

## terminal_sessions

```text
id
workspace_id
type
agent
cwd
pid
status
created_at
```

## usage_snapshots

```text
id
agent
provider_account_id
status
percentage_used
remaining
reset_at
created_at
```

---

# 46. WebSocket Protocol

```text
terminal:data
terminal:input
terminal:resize

workspace:file-change

git:status
git:diff

agent:event
agent:status
agent:usage

task:status
task:checkpoint
task:handoff
```

---

# 47. Command Palette

Shortcut:

```text
Ctrl + Shift + P
```

Commands:

```text
Mở dự án

Tạo công việc

Mở Terminal

Chạy với Codex

Chạy với Claude

Chạy với Antigravity

Tự động chọn Agent

Tạm dừng Agent

Tiếp tục Agent

Tiếp quản

Chuyển Agent

Tạo Checkpoint

Xem Git Status

Xem Diff

Mở Cài đặt
```

---

# 48. Dashboard Agent

```text
AI AGENT

Codex
Sẵn sàng
Mức sử dụng: 71%
Task đang chạy: 0

Claude
Đang chạy

Claude Pro #1
92% - Cảnh báo

Claude Pro #2
34% - Sẵn sàng

Antigravity
Sẵn sàng
Mức sử dụng: Không xác định
```

---

# 49. Security

Ứng dụng local vẫn phải có security boundary.

Agent chỉ được mặc định truy cập Workspace đang mở.

Protected paths:

```text
/
~/.ssh
~/.aws
~/.config
/etc
```

---

# 50. Sensitive Files

Cảnh báo:

```text
.env
.env.local
*.pem
*.key
credentials.json
```

Ví dụ UI:

```text
Cảnh báo file nhạy cảm

Agent đang yêu cầu đọc:

.env

File này có thể chứa secret.
```

---

# 51. Dangerous Commands

Yêu cầu confirm:

```text
rm -rf
sudo
git reset --hard
git clean -fd
DROP DATABASE
docker system prune
```

UI:

```text
Agent đang yêu cầu thực thi lệnh có thể gây mất dữ liệu.

rm -rf dist

[Cho phép một lần]

[Luôn cho phép trong Workspace này]

[Từ chối]
```

---

# 52. Permission Modes

```text
AN TOÀN

CÂN BẰNG

TỰ ĐỘNG
```

## An toàn

Write và command quan trọng phải approve.

## Cân bằng

Agent được:

```text
edit source
run tests
install project dependency
run build
```

Dangerous command phải confirm.

## Tự động

Agent được thao tác tự do trong Workspace.

System-level dangerous command vẫn block.

---

# 53. Logging

Log:

```text
Agent events
Routing
Handoff
Checkpoint
Process status
Task state
Provider errors
```

Không log:

```text
API key
Password
Access token
Refresh token
.env content
```

---

# 54. First Run

```text
Chào mừng đến với Local Multi-Agent Dev IDE
```

Buttons:

```text
Mở dự án

Kiểm tra AI Agent
```

Detection:

```text
Codex          Đã cài đặt

Claude         Đã cài đặt

Antigravity    Chưa cài đặt
```

Sau đó:

```text
Bắt đầu làm việc
```

---

# 55. Dashboard chính

Sections:

## Công việc đang chạy

```text
TASK-021
Authentication

Claude

Đang chạy 12 phút
```

## AI Agent

```text
Codex          Sẵn sàng

Claude         Đang chạy

Antigravity    Sẵn sàng
```

## Workspace

```text
Branch:
feature/auth

File thay đổi:
7

Test:
18 passed
```

## Hoạt động gần đây

```text
Checkpoint #8 đã tạo

Claude → Codex

auth.ts đã thay đổi

npm test thành công
```

---

# 56. Implementation Phases

## Phase 1 — Foundation

Build:

```text
Monorepo
Next.js
Runtime
SQLite
i18n
```

---

## Phase 2 — Workspace

Build:

```text
Open folder
Explorer
Filesystem watcher
Monaco Editor
```

DoD:

Có thể mở project, sửa và lưu source.

---

## Phase 3 — Terminal

Build:

```text
xterm.js
node-pty
WebSocket
Multiple tabs
```

DoD:

Có thể chạy thật:

```bash
npm install
npm run dev
git status
```

---

## Phase 4 — Agent Adapters

Build:

```text
CodexAdapter
ClaudeAdapter
AntigravityAdapter
```

DoD:

Có thể launch từng CLI thật.

---

## Phase 5 — Task Engine

Build:

```text
Create Task
Task state
Agent Console
Task events
```

---

## Phase 6 — Context Engine

Build:

```text
task.md
context.md
progress.md
todo.md
decisions.md
```

---

## Phase 7 — Checkpoint

Build:

```text
Create checkpoint
Restore checkpoint
Context package
```

---

## Phase 8 — Provider Gateway

Build:

```text
Account model
Usage
Health
Soft fallback
```

---

## Phase 9 — Agent Router

Build:

```text
Manual routing
Priority routing
Smart routing
Hard failover
```

---

## Phase 10 — Human Handoff

Build:

```text
Pause
Take Over
Resume
Switch Agent
```

---

## Phase 11 — Git

Build:

```text
Status
Diff
Branch
History
```

---

## Phase 12 — Security

Build:

```text
Workspace sandbox
Protected paths
Sensitive files
Dangerous command rules
Secret redaction
```

---

# 57. Unit Tests

Test:

```text
Agent detection

Usage normalization

Account routing

Agent routing

Quota detection

Rate limit detection

Checkpoint creation

Context compaction

Handoff prompt generation

Dangerous command detection

Protected path detection
```

---

# 58. Integration Tests

## Agent failover

```text
Codex starts task

Codex modifies file

Codex mock returns QUOTA_EXHAUSTED

System creates checkpoint

Router chooses Claude

Claude receives context

Claude continues task
```

---

# 59. Critical Acceptance Test

Task:

```text
Tạo GET /health API và viết test.
```

Flow:

```text
TASK-001
   ↓
Codex
```

Codex làm 50%.

Mock:

```text
QUOTA_EXHAUSTED
```

System bắt buộc:

```text
Save progress

Save todo

Save git state

Save changed files

Save test state

Create checkpoint
```

Router:

```text
Codex
 ↓
Claude
```

Claude phải biết:

```text
Task gốc

Phần đã hoàn thành

Phần còn lại

Git diff

File thay đổi

Test hiện tại
```

Claude hoàn tất.

Final:

```text
Test pass

TASK-001 = HOÀN THÀNH
```

Nếu flow này không chạy được:

> MVP chưa hoàn thành.

---

# 60. Human Handoff Acceptance Test

Agent đang sửa code.

User chọn:

```text
Tiếp quản
```

Agent dừng.

User sửa file bằng Monaco.

User chạy:

```bash
npm test
```

User chọn:

```text
Giao lại cho Agent
```

System phải capture lại:

```text
Git diff
File thay đổi
Test state
```

Agent tiếp tục từ trạng thái mới.

Không được undo thay đổi của user.

---

# 61. Terminal Acceptance Test

Phải chạy được:

```bash
git status

npm install

npm run dev
```

ANSI color phải hiển thị đúng.

Terminal resize phải hoạt động.

Input latency local không gây cảm giác trễ.

---

# 62. Performance

Mục tiêu:

```text
Open project < 3s

Terminal input < 100ms

Filesystem update < 500ms
```

Output lớn phải buffer.

Không render từng ký tự trực tiếp vào React state.

---

# 63. Error Handling

Nếu CLI không tồn tại:

```text
Claude CLI chưa được cài đặt.
```

Không crash app.

Nếu Agent chết:

```text
Agent đã dừng bất thường.

Mã lỗi: X
```

Button:

```text
Xem chi tiết kỹ thuật
```

---

# 64. Error UI hai tầng

User-facing:

```text
Codex hiện không khả dụng.
Hệ thống đang chuyển sang Claude.
```

Advanced:

```text
QUOTA_EXCEEDED
exit_code=1
provider=codex
```

---

# 65. Routing Timeline

UI phải thể hiện minh bạch:

```text
18:30
TASK-102 bắt đầu bằng Codex

18:42
Codex đạt ngưỡng cảnh báo

18:43
Checkpoint #4 được tạo

18:43
Codex hết hạn mức

18:44
Đang chuyển sang Claude

18:44
Claude đã đọc context

18:45
Claude tiếp tục công việc
```

---

# 66. Future V1.1

```text
Git Worktree

Parallel Task

Usage graph

Task templates

Custom Agent order

More provider accounts
```

---

# 67. Future V1.2

```text
Gemini CLI

Kiro

OpenCode

Custom CLI Adapter
```

---

# 68. Future V1.3

```text
MCP Registry

Skills

Project Memory

Reusable workflows
```

---

# 69. Future V2

Multi-agent task decomposition.

Ví dụ:

```text
Epic
 ↓
Planner
 ↓

Backend
→ Codex

Frontend
→ Claude

Tests
→ Antigravity
```

Task graph:

```text
TASK
├── SUBTASK-01
├── SUBTASK-02
└── SUBTASK-03
```

---

# 70. Future V2.5

Agent Roles:

```text
Planner Agent

Developer Agent

Reviewer Agent

Test Agent

Security Agent
```

---

# 71. Future V3

```text
Ollama

Local models

Remote agents

SSH workspace

Remote runtime
```

---

# 72. Coding Rules

Coding Agent triển khai project phải tuân thủ:

1. Không build clone VS Code.

2. Hoàn thành MVP trước.

3. Không fake Terminal.

4. Terminal phải chạy PTY thật.

5. Không fake Agent output ngoài test.

6. Provider-specific logic phải nằm trong Adapter.

7. Task Context không phụ thuộc provider session.

8. Không fabricate quota.

9. Shared Context phải tồn tại sau Agent failure.

10. Hard handoff phải có checkpoint.

11. Không tự động Push.

12. Không tự động Merge main.

13. Không đọc file ngoài Workspace nếu chưa được phép.

14. Không expose secret lên UI/log.

15. UI mặc định phải là tiếng Việt.

16. Không hard-code UI text.

17. Mỗi module quan trọng phải có test.

18. Không dành thời gian polish UI trước khi flow core hoạt động.

---

# 73. Definition of Done

Project chỉ hoàn thành khi chạy được:

```bash
npm install
npm run dev
```

Mở Web UI.

User:

```text
Mở một repository local.
```

Sau đó:

```text
Explorer hoạt động.

Editor hoạt động.

Terminal hoạt động.

Git status hoạt động.

Codex được detect.

Claude được detect.

Antigravity được detect.
```

User tạo:

```text
TASK-001
```

Chọn:

```text
Agent: Tự động
```

Agent chạy thật.

Agent sửa code thật.

Output stream realtime.

Git diff xuất hiện.

System tạo Checkpoint.

Agent bị hết quota hoặc simulate provider failure.

Router chuyển Agent.

Agent mới đọc context.

Agent mới tiếp tục task mà không làm lại từ đầu.

User có thể:

```text
Tiếp quản
```

sửa code thủ công.

Sau đó:

```text
Giao lại cho Agent
```

Agent tiếp tục.

Test pass.

Task:

```text
HOÀN THÀNH
```

Toàn bộ UI chính hiển thị tiếng Việt.

Không mất source.

Không mất task.

Không mất context.

Không cần mở Terminal bên ngoài IDE.

---

# 74. Product Principle cuối cùng

Đây là nguyên tắc quan trọng nhất khi triển khai:

> Không cố gắng duy trì một cuộc trò chuyện AI thật dài.

Thay vào đó:

```text
Source Code
+
Git State
+
Task State
+
Progress
+
Decision
+
Todo
+
Tests
+
Checkpoint
```

mới là nguồn sự thật của project.

Agent chỉ là worker có thể được thay thế.

Kiến trúc cuối cùng:

```text
             LOCAL MULTI-AGENT DEV IDE
                         │
        ┌────────────────┼────────────────┐
        │                │                │
     Editor           Terminal          Git
        │                │                │
        └────────────────┼────────────────┘
                         │
                    Task Engine
                         │
                  Context Engine
                         │
                Checkpoint Engine
                         │
                    Agent Router
                         │
                 Provider Gateway
                         │
          ┌──────────────┼──────────────┐
          │              │              │
        Codex          Claude       Antigravity
          │              │              │
          └──────────────┼──────────────┘
                         │
                    Workspace
```

## Mục tiêu cuối cùng

Người dùng chỉ cần:

```text
Mở project
↓
Tạo Task
↓
Bấm Bắt đầu
```

Hệ thống tự xử lý:

```text
Chọn Agent
↓
Theo dõi usage
↓
Chạy Agent
↓
Theo dõi code
↓
Checkpoint
↓
Agent hết quota
↓
Chọn Agent khác
↓
Khôi phục context
↓
Tiếp tục
↓
Test
↓
Hoàn thành
```

Người dùng không cần quan tâm Agent nào còn bao nhiêu token hay phải tự copy prompt từ Codex sang Claude.

Đó chính là giá trị cốt lõi của Local Multi-Agent Dev IDE.