# Local Multi-Agent Dev IDE

IDE phát triển chạy hoàn toàn **local**, điều phối nhiều AI Coding Agent CLI
(**Codex**, **Claude Code**, **Antigravity**) trên cùng một repository, với
context dùng chung, checkpoint, và khả năng tự chuyển Agent khi một nhà cung cấp
hết hạn mức.

---

## Cài đặt nhanh

```bash
npm install
npm run dev
```

Mở http://localhost:3000 — không cần Docker, không cần database server, không
cần `DATABASE_URL`.

> `npm install` sẽ tự chạy `scripts/setup-monaco.mjs` để chép Monaco Editor vào
> `public/monaco/` (khoảng 24 MB). Nhờ vậy trình soạn thảo chạy offline hoàn
> toàn, không gọi CDN.

### Yêu cầu

| Thành phần | Bắt buộc | Ghi chú |
|---|---|---|
| Node.js ≥ 22.5 | ✅ | Dùng module `node:sqlite` có sẵn |
| `git` | ✅ | Cho panel Git |
| Python 3 | ⚠️ | Backend PTY dự phòng khi `node-pty` không build được |
| Codex / Claude / Antigravity CLI | ❌ | Không có thì IDE chạy ở chế độ mô phỏng có nhãn rõ ràng |

---

## Kiến trúc

```
Next.js App Router (UI + API routes, cùng một process)
│
├── src/app/api/**        REST + SSE
├── src/features/**       UI theo tính năng (explorer, editor, terminal, tasks, git, agents, settings)
├── src/lib/
│   ├── agents/           Adapter layer: detect / buildArgs / parseEvent / usage / health / resume
│   ├── orchestrator/     Task engine, routing, usage, settings, event bus, simulator
│   ├── terminal/         PTY thật (node-pty hoặc pty_bridge.py)
│   ├── checkpoints.ts    Tạo & khôi phục checkpoint
│   ├── context.ts        Shared context .agent-manager/tasks/TASK-xxx/
│   ├── routing.ts        Chấm điểm và chọn Agent
│   ├── git.ts            status / diff / log / commit / branch
│   └── security*.ts      Protected path, file nhạy cảm, lệnh nguy hiểm, redact secret
└── src/db/               SQLite (node:sqlite) + Drizzle qua sqlite-proxy
```

### Quyết định kiến trúc

| ADR | Quyết định | Lý do |
|---|---|---|
| 001 | `node:sqlite` + `drizzle-orm/sqlite-proxy` thay vì `better-sqlite3` | Cài đặt không cần native toolchain |
| 002 | PTY hai backend: `node-pty`, dự phòng `scripts/pty_bridge.py` | Terminal luôn là PTY thật |
| 003 | Không bao giờ bịa số hạn mức | Chỉ hiển thị số khi CLI thực sự in ra |
| 004 | Task engine giữ runtime trên `globalThis` | Sống sót qua hot-reload của Next.js |
| 005 | Monaco phục vụ từ `public/monaco/vs` | Local-first, không CDN |

---

## Tính năng

### Workspace & Explorer
Mở thư mục bất kỳ (chặn các đường dẫn hệ thống), cây file có màu theo trạng thái
Git, menu chuột phải (tạo/đổi tên/xoá/copy path), tự làm mới qua SSE khi file
thay đổi trên đĩa.

### Editor
Monaco đa tab, đánh dấu file chưa lưu, `Ctrl/Cmd+S` để lưu, chế độ Diff, và cảnh
báo khi file bị Agent sửa bên ngoài (Tải lại / So sánh / Giữ bản hiện tại).

### Terminal
PTY thật, nhiều tab, resize theo khung. Lệnh nguy hiểm bị chặn trước khi gửi vào
shell và hiện hộp thoại xác nhận (Từ chối / Cho phép một lần / Luôn cho phép).

### Task & Agent Console
Tạo task → engine chọn Agent → chạy CLI thật trong PTY → phát sự kiện SSE.
Console có 4 tab (hoạt động / dòng thời gian / context / checkpoint) và các nút
Tạm dừng, Tiếp tục, Tiếp quản, Giao lại, Đổi Agent, Checkpoint, Dừng.

### Chuyển Agent tự động
Khi CLI in ra lỗi hạn mức/rate-limit/xác thực:

1. tạo checkpoint,
2. đóng gói context (progress, todo, decisions, git diff, kết quả test),
3. chọn Agent kế tiếp (ưu tiên đổi **account** cùng Agent trước, rồi mới đổi Agent),
4. khởi động Agent mới với prompt bàn giao “không làm lại việc đã xong”.

**Lỗi của chính task** (test fail, compile error, lint error) **không bao giờ**
kích hoạt chuyển Agent — task được tạm dừng để con người xem.

### Git
Branch hiện tại, danh sách thay đổi kèm mã trạng thái, diff có tô màu, commit, lịch sử.

### Bảo mật
- Chặn mở workspace tại `/`, `/etc`, `/usr`, `$HOME`, `~/.ssh`, `~/.aws`, …
- Chặn path traversal ra ngoài workspace.
- File nhạy cảm (`.env`, `*.pem`, `id_rsa`, …) cần xác nhận mới mở; **nội dung không bao giờ trả về client trước khi xác nhận**. `.env.example` không bị coi là nhạy cảm.
- Ba chế độ quyền: `safe` / `balanced` / `auto`.
- Mọi log và sự kiện đều đi qua `redactSecrets()`.

---

## Trung thực về dữ liệu (quy tắc bắt buộc)

| Hạng mục | Cam kết |
|---|---|
| Output của Agent | Luôn là output thật của CLI. Khi CLI chưa cài, chế độ mô phỏng chạy lệnh shell **thật** và mọi dòng đều gắn nhãn “mô phỏng”, không tự sửa mã nguồn. |
| Hạn mức | `parseUsage` trả `null` nếu CLI không in số. UI hiển thị “Không xác định”. `CodexAdapter.usage()` luôn trả `UNKNOWN_USAGE`. |
| Terminal | PTY thật, không giả lập output. |
| Kết quả test | Lấy từ lần chạy `npm test` thật; chưa chạy thì trả `null`. |

---

## Lệnh

```bash
npm run dev         # chạy IDE
npm run build       # build production
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest (135 test)
```

## Kiểm thử

```
tests/security.test.ts     Đường dẫn/lệnh nguy hiểm, redact secret, chế độ quyền
tests/parse.test.ts        Nhận diện lỗi provider vs lỗi task, parse hạn mức trung thực
tests/routing.test.ts      Chấm điểm, chọn Agent, chuyển sớm
tests/adapters.test.ts     argv, resume, usage, phát hiện binary
tests/context.test.ts      Shared context, nén context, prompt bàn giao
tests/checkpoints.test.ts  Tạo/đọc/khôi phục checkpoint
tests/terminal.test.ts     PTY thật: chạy lệnh và kiểm tra output thật
tests/git.test.ts          status/diff/log/commit/branch trên repo thật
tests/db.test.ts           Migration, drizzle proxy, JSON column, join
tests/workspace.test.ts    Protected path, path traversal, cây file
tests/i18n.test.ts         vi/en trùng khoá, không có key thiếu trong UI
```

## Phím tắt

| Phím | Chức năng |
|---|---|
| `Ctrl/Cmd + Shift + P` | Command Palette |
| `Ctrl/Cmd + S` | Lưu file |

## Ngôn ngữ

Mặc định **tiếng Việt**, có thể chuyển sang English trong Cài đặt. Toàn bộ chuỗi
UI nằm trong `src/locales/{vi,en}.json` — test sẽ fail nếu có khoá bị thiếu.

## Lưu trữ

| Đường dẫn | Nội dung |
|---|---|
| `data/ide.db` | SQLite: workspace, task, agent, account, event, checkpoint, settings |
| `<workspace>/.agent-manager/tasks/TASK-xxx/` | Context dùng chung + checkpoint |

Đổi vị trí database bằng biến môi trường `IDE_DATABASE_FILE`.
