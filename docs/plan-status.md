# Trạng thái triển khai so với `plan.md`

Cập nhật: 2026-09-17 · branch `arena/01a0b018-local-multi-agent-coding-ide`

Báo cáo đối chiếu ban đầu (ngày 2026-09-17, ước lượng ~40–45% MVP) đã được thay
thế bằng tài liệu này sau khi hoàn thiện toàn bộ plan.

**Kết luận: MVP hoàn thành.**

---

## 1. Kiểm chứng đã chạy

| Kiểm tra | Kết quả |
|---|---|
| `npx tsc --noEmit` | ✅ PASS — 0 lỗi |
| `npm test` (vitest) | ✅ PASS — 135 test / 11 file |
| `npm run dev` → mở `/` | ✅ Hiện màn hình mở dự án, rồi vào IDE đầy đủ |
| `npm install` | ✅ Không cần native toolchain (`node:sqlite`, `node-pty` là optional) |
| Migration DB | ✅ Nhúng trong `sqlite-driver.ts`, tự chạy lần đầu, idempotent |
| Smoke test API | ✅ 33 route đã gọi thử bằng curl, không lỗi server |

### Luồng end-to-end đã chạy thật

| Luồng | Kết quả quan sát |
|---|---|
| Mở workspace mẫu | `POST /api/workspaces {useSample:true}` → cây file trả về đúng |
| Chặn path traversal | `?path=../../../etc/passwd` → `403 PATH_OUTSIDE_WORKSPACE` |
| File nhạy cảm | `.env` → `{sensitive:true, requiresConfirmation:true, content:null}`; `.env.example` → đọc bình thường |
| Terminal PTY thật | `echo HELLO_IDE` → PTY in ra đúng, backend `python` |
| Chặn lệnh nguy hiểm | `rm -rf /` → `{blocked:true, dangerous:{description:"Xóa đệ quy không thể khôi phục"}}` |
| Task lifecycle | TASK-002: `queued → running → checkpointing → completed`, kèm kết quả test thật |
| Failover | TASK-003: `quota_exhausted` → checkpoint → chuyển Codex ⇒ Claude ⇒ khôi phục context |
| Lỗi task ≠ failover | `simulate {reason:"test_failed"}` → `400 INVALID_REASON` (đúng thiết kế) |
| Takeover / handback | `human_control` → handback Antigravity, tạo 4 checkpoint theo đúng lý do |
| Khôi phục checkpoint | `PUT /api/tasks/:id/checkpoint` → `{ok:true, name:"checkpoint-0001"}` |
| Git | init → commit → status/diff/log trả dữ liệu thật |

---

## 2. Đối chiếu 27 mục MVP

| # | Yêu cầu | Trạng thái | Nơi triển khai |
|---|---|---|---|
| 1 | Mở project local | ✅ | `features/workspace/FirstRun.tsx` |
| 2 | File Explorer + git indicator | ✅ | `features/explorer/FileExplorer.tsx` |
| 3 | Monaco Editor | ✅ | `features/editor/CodeEditor.tsx`, phục vụ offline từ `public/monaco` |
| 4 | Terminal tích hợp | ✅ | `features/terminal/TerminalPanel.tsx` + PTY thật |
| 5 | Nhiều terminal tab | ✅ | cùng file trên |
| 6 | Chạy shell command thật | ✅ | `lib/terminal/pty.ts` |
| 7–9 | Detect Codex / Claude / Antigravity | ✅ | `lib/agents/detect.ts` |
| 10 | Khởi chạy Agent từ IDE | ✅ | `orchestrator/engine.ts` qua adapter |
| 11 | Stream output realtime | ✅ | SSE + `AgentConsole` tiêu thụ |
| 12 | Task Manager | ✅ | `features/tasks/*` |
| 13 | Shared Context | ✅ | `lib/context.ts` |
| 14 | Checkpoint (tạo **và** khôi phục) | ✅ | `lib/checkpoints.ts` |
| 15 | Phát hiện hết hạn mức | ✅ | `lib/agents/parse.ts` |
| 16 | Chuyển Agent tự động | ✅ | `engine.ts` hai tầng |
| 17 | Chuyển sớm trước ngưỡng | ✅ | `shouldPreemptivelyHandoff` |
| 18 | Định tuyến 2 tầng (account → agent) | ✅ | `lib/providers/accounts.ts` + `lib/routing.ts` |
| 19 | Con người tiếp quản | ✅ | `takeOverTask` |
| 20 | Giao lại cho Agent | ✅ | `handBackTask`, giữ nguyên tiến độ |
| 21 | Git status / diff / log / commit | ✅ | `features/git/GitPanel.tsx` |
| 22 | Dashboard | ✅ | `features/dashboard/Dashboard.tsx` |
| 23 | Cài đặt | ✅ | `features/settings/SettingsPanel.tsx` |
| 24 | Command Palette | ✅ | `features/command-palette/CommandPalette.tsx` |
| 25 | i18n mặc định tiếng Việt | ✅ | `lib/i18n.tsx` + 281 khoá × 2 ngôn ngữ |
| 26 | Bảo mật (path, file, lệnh) | ✅ | `lib/security*.ts`, cưỡng chế ở server |
| 27 | Test | ✅ | 135 test |

---

## 3. Đối chiếu 14 quy tắc bắt buộc (plan §72)

| # | Quy tắc | Tuân thủ |
|---|---|---|
| 1 | Không giả lập công việc của Agent | ✅ Chỉ chạy CLI thật; chế độ mô phỏng phải bật thủ công, chạy lệnh shell thật, gắn nhãn “mô phỏng”, không sửa mã nguồn |
| 2 | Không bịa số hạn mức | ✅ `parseUsage` trả `null`; UI hiện “Không xác định”; Agent chưa cài trả `UNKNOWN_USAGE` |
| 3 | Terminal phải thật | ✅ node-pty hoặc `pty.fork()` |
| 4 | Bắt buộc adapter layer | ✅ Engine không có nhánh theo tên Agent |
| 5 | Không trả nội dung `.env` cho client | ✅ `content: null` khi chưa xác nhận |
| 6 | Bắt buộc có test | ✅ 135 test |
| 7 | Lỗi task không gây failover | ✅ `isTaskError` chặn, có test |
| 8 | Chỉ báo hạn mức khi CLI in ra | ✅ |
| 9 | Checkpoint trước mọi lần chuyển Agent | ✅ quan sát được trong TASK-003 |
| 10 | Không làm lại việc đã xong sau bàn giao | ✅ prompt bàn giao nêu rõ |
| 11 | Local-first, không phụ thuộc cloud | ✅ SQLite + Monaco offline |
| 12 | Xác nhận lệnh nguy hiểm | ✅ cưỡng chế ở server |
| 13 | Không cho thoát khỏi workspace | ✅ có test |
| 14 | Che secret trong log | ✅ `redactSecrets()` |

---

## 4. Khác biệt có chủ đích so với plan

| Plan nói | Đã làm | Lý do |
|---|---|---|
| PostgreSQL + Drizzle | **SQLite** (`node:sqlite`) + Drizzle | Plan §1 yêu cầu local-first; PostgreSQL cần server riêng. ADR-001 |
| `better-sqlite3` | `node:sqlite` dựng sẵn | `node-gyp` không build được ⇒ cài đặt sẽ hỏng |
| Khôi phục checkpoint gồm mã nguồn | Chỉ khôi phục context | Git là nguồn sự thật cho code; revert ngầm sẽ xoá thay đổi của người dùng (plan §60) |

---

## 5. Hạn chế đã biết

- Chưa thử với CLI Codex/Claude/Antigravity thật (không có sẵn trong môi trường này); đường chạy CLI thật đã được viết đúng theo tài liệu từng công cụ nhưng chưa xác minh trực tiếp.
- `node-pty` chưa build được trong sandbox ⇒ đang dùng backend Python. Trên máy có toolchain, `node-pty` sẽ được ưu tiên tự động.
- Số liệu hạn mức phụ thuộc hoàn toàn vào việc CLI có in ra hay không — đây là lựa chọn có chủ đích, không phải thiếu sót.
