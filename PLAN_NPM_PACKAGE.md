# Kế hoạch chuyển ứng dụng thành npm package

## 1. Mục tiêu

Đóng gói Local Multi-Agent Dev IDE thành một npm package có thể cài và chạy bằng:

```bash
npm install -g @scope/local-agent-ide
local-agent-ide
```

Hoặc chạy trực tiếp mà không cần cài global:

```bash
npx @scope/local-agent-ide
```

Ứng dụng tiếp tục sử dụng SQLite và chạy hoàn toàn trên máy người dùng. Database, cấu hình, log và checkpoint phải nằm ngoài `node_modules` để không mất dữ liệu khi cập nhật hoặc gỡ package.

## 2. Phạm vi

### Trong phạm vi

- Tạo CLI để khởi động IDE.
- Build Next.js ở chế độ standalone.
- Đóng gói server, static assets và Monaco vào npm tarball.
- Chuẩn hóa thư mục dữ liệu người dùng trên Windows, macOS và Linux.
- Giữ SQLite làm database chính.
- Hỗ trợ cấu hình port, host, data directory và tự mở trình duyệt.
- Kiểm tra package bằng file `.tgz` trước khi publish.
- Bổ sung test cho CLI, đường dẫn dữ liệu và package artifact.
- Viết tài liệu cài đặt, nâng cấp, sao lưu và gỡ cài đặt.

### Ngoài phạm vi

- Chuyển database sang Supabase hoặc dịch vụ cloud.
- Đưa ứng dụng lên hosting công cộng.
- Tự động đăng nhập hoặc cài đặt Codex, Claude, Antigravity CLI.
- Đồng bộ workspace hoặc database giữa nhiều máy.
- Publish package thật lên npm registry trước khi package local vượt qua toàn bộ acceptance test.

## 3. Trải nghiệm người dùng mục tiêu

### Cài đặt

```bash
npm install -g @scope/local-agent-ide
```

### Khởi động mặc định

```bash
local-agent-ide
```

Kết quả mong đợi:

1. CLI kiểm tra phiên bản Node.js.
2. CLI xác định thư mục dữ liệu người dùng.
3. SQLite được tạo hoặc mở tại thư mục dữ liệu đó.
4. Server chỉ bind vào `127.0.0.1` theo mặc định.
5. CLI tìm một port khả dụng, ưu tiên port `3000`.
6. Trình duyệt được mở tại URL của IDE.
7. Terminal hiển thị URL, database path và cách dừng server.

### Tùy chọn CLI

```text
local-agent-ide [options]

--port <number>       Port muốn sử dụng, mặc định 3000
--host <address>      Địa chỉ bind, mặc định 127.0.0.1
--data-dir <path>     Ghi đè thư mục dữ liệu
--no-open             Không tự mở trình duyệt
--version             In phiên bản package
--help                In hướng dẫn sử dụng
```

Các biến môi trường tương ứng:

```text
LOCAL_AGENT_IDE_PORT
LOCAL_AGENT_IDE_HOST
LOCAL_AGENT_IDE_DATA_DIR
LOCAL_AGENT_IDE_NO_OPEN
```

`IDE_DATABASE_FILE` cũ được hỗ trợ trong ít nhất một phiên bản để tương thích ngược.

## 4. Kiến trúc package

```text
@scope/local-agent-ide
├── bin/
│   └── local-agent-ide.mjs       CLI entrypoint
├── dist/
│   ├── server/                   Next.js standalone server
│   ├── static/                   Next.js static assets
│   └── public/                   Monaco và public assets
├── scripts/
│   └── pty_bridge.py             PTY fallback nếu còn cần
├── package.json
├── LICENSE
└── README.md
```

Source TypeScript, test, tài liệu kế hoạch và công cụ phát triển không được đưa vào package phát hành.

## 5. Thư mục dữ liệu

Mặc định:

```text
Windows: %LOCALAPPDATA%\local-agent-ide
macOS:   ~/Library/Application Support/local-agent-ide
Linux:   ${XDG_DATA_HOME:-~/.local/share}/local-agent-ide
```

Cấu trúc:

```text
local-agent-ide/
├── data/
│   └── ide.db
├── logs/
├── cache/
└── config.json
```

Quy tắc bắt buộc:

- Không ghi dữ liệu runtime vào thư mục cài package.
- Không ghi dữ liệu runtime vào `node_modules`.
- Không tự xóa database khi package được nâng cấp hoặc gỡ cài đặt.
- Migration SQLite phải idempotent và tự chạy khi mở database.
- CLI phải in đường dẫn database thực tế trong chế độ verbose hoặc health output.

## 6. Các file cần tạo

### `bin/local-agent-ide.mjs`

- Parse command-line arguments.
- Kiểm tra Node.js `>=22.5`.
- Resolve package root và data directory.
- Thiết lập biến môi trường cho server.
- Kiểm tra hoặc chọn port khả dụng.
- Khởi động Next.js standalone server bằng Node.
- Chuyển tiếp `SIGINT`, `SIGTERM` và exit code.
- Tự mở trình duyệt khi không có `--no-open`.
- Không sử dụng shell command được ghép từ input người dùng.

### `src/lib/app-data.ts`

- Resolve data directory theo hệ điều hành.
- Validate đường dẫn ghi đè.
- Tạo các thư mục cần thiết.
- Trả về đường dẫn database, log và cache.
- Cho phép dependency injection trong test.

### `scripts/prepare-package.mjs`

- Chạy production build.
- Tạo cấu trúc `dist/` sạch.
- Copy `.next/standalone`.
- Copy `.next/static` đúng vị trí mà standalone server yêu cầu.
- Copy `public/monaco` và các public assets.
- Copy `pty_bridge.py` nếu runtime còn sử dụng.
- Kiểm tra các file bắt buộc trước khi cho phép `npm pack`.

### Test mới

```text
tests/app-data.test.ts
tests/cli.test.ts
tests/package.test.ts
```

## 7. Các file cần sửa

### `package.json`

- Bỏ `"private": true` khi sẵn sàng publish.
- Chọn package name có scope thuộc quyền quản lý của dự án.
- Thêm `description`, `license`, `repository`, `homepage`, `bugs` và `keywords`.
- Thêm `bin` trỏ tới CLI entrypoint.
- Thêm `engines.node: ">=22.5"`.
- Thêm whitelist `files`.
- Thêm script `package:prepare`, `package:check`, `pack:local` và `prepublishOnly`.
- Không chạy production build nặng trong `postinstall` của người dùng.
- Pin các dependency runtime quan trọng và commit lockfile.

Script mục tiêu:

```json
{
  "scripts": {
    "build": "next build",
    "package:prepare": "node scripts/prepare-package.mjs",
    "package:check": "node scripts/check-package.mjs",
    "pack:local": "npm run package:prepare && npm pack",
    "prepublishOnly": "npm run test && npm run typecheck && npm run lint && npm run package:prepare && npm run package:check"
  }
}
```

### `next.config.ts`

- Bật `output: "standalone"`.
- Giữ `node-pty` trong `serverExternalPackages`.
- Giới hạn filesystem tracing vào project thay vì vô tình trace toàn bộ workspace.
- Kiểm tra lại các dynamic import và filesystem path trong server routes.

### `src/db/sqlite-driver.ts`

- Dùng đường dẫn từ `src/lib/app-data.ts`.
- Giữ hỗ trợ `IDE_DATABASE_FILE` để tương thích ngược.
- Thêm hàm đóng database để test và graceful shutdown giải phóng file handle.
- Không dựa vào `process.cwd()` làm vị trí lưu mặc định.

### `scripts/setup-monaco.mjs`

- Chuyển vai trò từ consumer `postinstall` sang bước chuẩn bị package.
- Không xóa hoặc ghi file trong global `node_modules` khi người dùng cài package.
- Xác minh Monaco worker và asset path sau khi copy.

### `src/lib/terminal/pty.ts`

- Sửa logic phát hiện backend theo hệ điều hành.
- Không báo backend `python` nếu Python hoặc module PTY không dùng được.
- Windows ưu tiên `node-pty`/ConPTY.
- macOS và Linux có thể dùng `node-pty` hoặc Python PTY fallback.
- Báo lỗi có hướng dẫn rõ ràng khi không có backend hợp lệ.
- Không để test terminal timeout khi backend khởi động thất bại.

### `src/app/api/health/route.ts`

- Không làm lộ secret hoặc thông tin nhạy cảm.
- Trả về package version, database status, PTY backend và platform.
- Chỉ trả database path đầy đủ khi chế độ debug cho phép.

### `README.md`

- Thêm hướng dẫn `npm install -g` và `npx`.
- Mô tả yêu cầu Node.js và terminal backend.
- Mô tả vị trí dữ liệu trên từng hệ điều hành.
- Thêm hướng dẫn nâng cấp, sao lưu, khôi phục và gỡ package.
- Giữ hướng dẫn chạy source dành cho contributor ở mục riêng.

## 8. Các phase triển khai

### Phase 0 — Chốt quyết định phát hành

- [ ] Chọn package scope và tên chính thức.
- [ ] Chọn license.
- [ ] Xác định Windows, macOS và Linux có đều nằm trong phạm vi bản đầu hay không.
- [ ] Chốt lệnh CLI chính thức.
- [ ] Chốt package public hay private registry.

DoD:

- Package name và CLI command không còn placeholder.
- Có quyền publish vào npm scope đã chọn.

### Phase 1 — Chuẩn hóa runtime data

- [ ] Tạo `src/lib/app-data.ts`.
- [ ] Chuyển SQLite ra user data directory.
- [ ] Hỗ trợ data directory tùy chỉnh.
- [ ] Giữ tương thích với `IDE_DATABASE_FILE`.
- [ ] Thêm hàm đóng database.
- [ ] Sửa test SQLite không còn lỗi `EBUSY`.

DoD:

- Chạy ứng dụng từ bất kỳ working directory nào vẫn mở cùng database mặc định.
- Nâng cấp package không làm mất database.
- `tests/db.test.ts` và `tests/checkpoints.test.ts` không còn lỗi cleanup.

### Phase 2 — Làm ổn định terminal đa nền tảng

- [ ] Sửa backend detection.
- [ ] Xử lý Windows bằng `node-pty`/ConPTY.
- [ ] Giữ fallback phù hợp cho macOS/Linux.
- [ ] Fail fast với thông báo rõ ràng.
- [ ] Bổ sung test riêng theo platform/backend.

DoD:

- Hai terminal test hiện đang timeout phải pass.
- Terminal thực thi được lệnh thật trên các hệ điều hành nằm trong phạm vi hỗ trợ.
- Không có backend giả.

### Phase 3 — Next.js standalone build

- [ ] Bật standalone output.
- [ ] Tạo script chuẩn bị `dist/`.
- [ ] Copy static và public assets.
- [ ] Xử lý Turbopack filesystem tracing warning.
- [ ] Chạy server trực tiếp từ `dist/` mà không cần source tree.

DoD:

```bash
node dist/server/server.js
```

khởi động được toàn bộ IDE, Monaco, API routes, SQLite và terminal.

### Phase 4 — CLI launcher

- [ ] Tạo CLI entrypoint.
- [ ] Thêm argument parser tối giản, không cần dependency nếu không cần thiết.
- [ ] Kiểm tra Node.js version.
- [ ] Hỗ trợ port, host, data-dir và no-open.
- [ ] Xử lý port đang được sử dụng.
- [ ] Xử lý signal và graceful shutdown.
- [ ] Bổ sung help/version output.

DoD:

```bash
node bin/local-agent-ide.mjs --no-open --port 4310
```

khởi động server và health endpoint trả thành công.

### Phase 5 — Đóng gói npm

- [ ] Cập nhật package metadata.
- [ ] Thêm `bin`, `files` và `engines`.
- [ ] Loại source/test/dev config khỏi artifact.
- [ ] Đưa Monaco vào tarball trước khi publish.
- [ ] Kiểm tra shebang và executable mode của CLI.
- [ ] Tạo package `.tgz` bằng `npm pack`.

DoD:

- Tarball chỉ chứa runtime cần thiết.
- Không chứa `.env`, database, log, test fixture hoặc file nhạy cảm.
- Package không yêu cầu TypeScript compiler để chạy.
- Package không build lại Next.js trên máy người dùng.

### Phase 6 — Kiểm thử cài đặt thực tế

Kiểm thử trong thư mục tạm sạch, không dùng dependency của repository:

```bash
npm install -g ./local-agent-ide-<version>.tgz
local-agent-ide --no-open
```

Và:

```bash
npx --yes ./local-agent-ide-<version>.tgz --no-open
```

- [ ] Test cài global.
- [ ] Test npx.
- [ ] Test chạy từ working directory không phải repository.
- [ ] Test đường dẫn có khoảng trắng và Unicode.
- [ ] Test port conflict.
- [ ] Test tạo và mở lại SQLite.
- [ ] Test upgrade không mất dữ liệu.
- [ ] Test gỡ package không xóa dữ liệu.
- [ ] Test workspace path traversal vẫn bị chặn.
- [ ] Test terminal thật.

DoD:

- Tất cả acceptance test pass trên các hệ điều hành được hỗ trợ.
- Git worktree sạch sau khi chạy bộ test package.

### Phase 7 — Chuẩn bị publish

- [ ] Chạy `npm audit` và xử lý dependency có rủi ro thực tế.
- [ ] Chạy test, typecheck, lint và production build.
- [ ] Kiểm tra nội dung bằng `npm pack --dry-run`.
- [ ] Kiểm tra package name/version chưa tồn tại hoặc thuộc quyền quản lý.
- [ ] Viết changelog và release notes.
- [ ] Publish bản prerelease trước, ví dụ `1.1.0-beta.1`.
- [ ] Cài lại prerelease từ registry và chạy smoke test.

DoD:

- Không publish nếu test hoặc package smoke test thất bại.
- Bản từ registry hoạt động giống bản `.tgz` local.

## 9. Package acceptance test bắt buộc

### Cài đặt và khởi động

- [ ] Cài được bằng npm với Node.js `>=22.5`.
- [ ] Node.js không phù hợp bị từ chối với thông báo rõ ràng.
- [ ] `local-agent-ide --help` không khởi động server.
- [ ] `local-agent-ide --version` khớp package version.
- [ ] Server mặc định chỉ bind localhost.
- [ ] `--port`, `--host`, `--data-dir`, `--no-open` hoạt động.

### Giao diện và API

- [ ] Trang chính tải thành công.
- [ ] Monaco và worker tải từ local package.
- [ ] Tất cả API route chính trả kết quả hợp lệ.
- [ ] Không có request bắt buộc tới CDN.

### SQLite

- [ ] Database tự tạo ở user data directory.
- [ ] Migration chạy đúng một lần.
- [ ] Dữ liệu tồn tại sau restart.
- [ ] Dữ liệu tồn tại sau package upgrade.
- [ ] Hai process không âm thầm làm hỏng database.
- [ ] Shutdown giải phóng database handle.

### Terminal và Agent CLI

- [ ] Terminal chạy lệnh thật.
- [ ] Resize, input, output stream và kill hoạt động.
- [ ] Backend không tồn tại phải báo lỗi ngay, không timeout.
- [ ] Detect agent CLI dùng đúng PATH của user.
- [ ] Child process được dừng khi CLI chính thoát.

### Bảo mật

- [ ] Không đóng `.env`, database hoặc secret vào tarball.
- [ ] Không bind `0.0.0.0` mặc định.
- [ ] Path traversal vẫn bị chặn.
- [ ] Sensitive file và dangerous command rule vẫn hoạt động.
- [ ] CLI không ghép input người dùng thành shell command nguy hiểm.

## 10. Rủi ro và biện pháp giảm thiểu

### Native `node-pty`

Rủi ro: cài đặt có thể cần binary phù hợp với OS, Node ABI hoặc toolchain native.

Giảm thiểu:

- Pin phiên bản đã kiểm chứng.
- Kiểm tra prebuilt binary trên từng OS/Node được hỗ trợ.
- Giữ `optionalDependencies` nếu ứng dụng có fallback thực sự hoạt động.
- Fail fast và hướng dẫn cài dependency nếu không có backend.

### Kích thước Monaco và Next.js

Rủi ro: package lớn hơn tarball source hiện tại.

Giảm thiểu:

- Dùng whitelist `files`.
- Không đóng source map/dev dependency nếu không cần.
- Đo tarball và installed size trong CI.
- Ưu tiên tính ổn định/offline hơn giảm vài MB thiếu an toàn.

### Dữ liệu trong sai thư mục

Rủi ro: database bị tạo theo working directory hoặc nằm trong package.

Giảm thiểu:

- Một module duy nhất chịu trách nhiệm resolve app data.
- Test trên đường dẫn có khoảng trắng, Unicode và thư mục read-only.
- In data directory rõ ràng khi khởi động.

### Port và quyền truy cập mạng

Rủi ro: bind ra mạng LAN ngoài ý muốn hoặc port bị chiếm.

Giảm thiểu:

- Mặc định `127.0.0.1`.
- Chỉ bind địa chỉ khác khi user chỉ định rõ.
- Tự tìm port hoặc báo lỗi có hướng dẫn.

### Build artifact không đầy đủ

Rủi ro: thiếu `.next/static`, Monaco, Python bridge hoặc dependency runtime.

Giảm thiểu:

- `package:check` xác minh artifact trước `npm pack`.
- Cài và chạy `.tgz` trong thư mục sạch ở CI.
- Không kiểm tra package bằng chính `node_modules` của repository.

## 11. CI đề xuất

Ma trận ban đầu:

```text
OS: Windows, Ubuntu, macOS
Node: 22 LTS và phiên bản Node mới nhất được hỗ trợ
```

Pipeline:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run lint`
5. `npm run package:prepare`
6. `npm run package:check`
7. `npm pack`
8. Cài `.tgz` vào môi trường sạch.
9. Khởi động CLI với `--no-open`.
10. Gọi health endpoint và smoke test API/UI.
11. Dừng CLI và xác minh graceful shutdown.

## 12. Thứ tự ưu tiên thực hiện

```text
P0  Sửa test SQLite cleanup và terminal Windows
P0  Chuẩn hóa app data directory
P0  Tạo standalone build
P0  Tạo CLI launcher
P0  Smoke test package .tgz trong môi trường sạch
P1  Hoàn thiện metadata, docs và security audit
P1  CI đa nền tảng
P2  Publish prerelease lên npm
P2  Tự động kiểm tra update/version mới
```

## 13. Definition of Done

Việc chuyển đổi chỉ được xem là hoàn thành khi:

```bash
npm install -g @scope/local-agent-ide
local-agent-ide
```

hoạt động trên các hệ điều hành đã công bố hỗ trợ, đồng thời:

- IDE mở được ngoài source repository.
- Monaco, Explorer, Git, Terminal, Task và Agent Console hoạt động.
- SQLite nằm trong user data directory và giữ nguyên qua nâng cấp.
- Không cần TypeScript, source repository hoặc lệnh build trên máy người dùng.
- Không có test thất bại.
- Không có secret hoặc dữ liệu runtime trong tarball.
- Terminal dùng backend thật và không timeout âm thầm.
- Package `.tgz` và package cài từ registry vượt qua cùng một smoke test.

## 14. Trạng thái ban đầu

Tại thời điểm lập kế hoạch:

- `npm pack --dry-run` tạo tarball source khoảng 116 KB với 102 file.
- Package đang có `"private": true`.
- Package chưa có `bin`, `files`, `engines`, license và metadata publish đầy đủ.
- Tarball chưa có production build hoặc CLI entrypoint.
- Monaco đang được copy bằng consumer `postinstall`.
- SQLite đang mặc định phụ thuộc `process.cwd()`.
- Production build pass nhưng có cảnh báo filesystem tracing.
- Typecheck pass.
- Lint không có error, còn 14 warning.
- Test đạt 133/135 assertion; terminal Windows timeout và SQLite test chưa đóng file handle sạch.

Do đó, package hiện tại mới đóng được source để phân phối, chưa phải package ứng dụng có thể cài rồi chạy.
