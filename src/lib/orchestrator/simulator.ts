import { AGENT_DISPLAY_NAMES, type AgentId } from "../agents/types";

/**
 * Agent simulator.
 *
 * Coding rule #5 says agent output must never be faked — with one exception:
 * demos/tests where the real CLI is not installed. The simulator therefore:
 *   - only runs when the CLI is genuinely absent AND `simulateWhenMissing` is on,
 *   - never writes source files on the agent's behalf,
 *   - labels every line as "mô phỏng" so no one mistakes it for real work.
 *
 * It emits shell commands that a real agent would plausibly run (git status,
 * reading files, running tests), executed for real in the PTY.
 */

export interface SimulatedStep {
  label: string;
  /** Shell command executed for real inside the terminal. */
  command: string;
}

export function simulationSteps(agent: AgentId, mode: string, taskId: string): SimulatedStep[] {
  const name = AGENT_DISPLAY_NAMES[agent];
  const base = `.agent-manager/tasks/${taskId}`;
  const banner = (text: string) => `printf '\\033[36m[${name} · mô phỏng]\\033[0m %s\\n' ${JSON.stringify(text)}`;

  const common: SimulatedStep[] = [
    { label: "Đang đọc yêu cầu công việc", command: `${banner("đang đọc task.md")}; cat ${base}/task.md 2>/dev/null | head -20` },
    { label: "Đang kiểm tra trạng thái Git", command: `${banner("đang chạy git status")}; git status --short 2>/dev/null | head -20` },
    { label: "Đang xem việc còn lại", command: `${banner("đang đọc todo.md")}; cat ${base}/todo.md 2>/dev/null | head -20` },
  ];

  const byMode: Record<string, SimulatedStep[]> = {
    plan: [{ label: "Đang lập kế hoạch triển khai", command: `${banner("đang phác thảo kế hoạch")}; ls -1 | head -20` }],
    implement: [
      { label: "Đang phân tích cấu trúc mã nguồn", command: `${banner("đang phân tích mã nguồn")}; ls -1 | head -20` },
      { label: "Đang xem diff hiện tại", command: `${banner("đang chạy git diff")}; git --no-pager diff --stat 2>/dev/null | head -20` },
    ],
    fix: [
      { label: "Đang tái hiện lỗi", command: `${banner("đang tái hiện lỗi")}; git --no-pager log --oneline -5 2>/dev/null` },
      { label: "Đang xác định nguyên nhân", command: `${banner("đang phân tích nguyên nhân")}; git --no-pager diff --stat 2>/dev/null | head -20` },
    ],
    review: [
      { label: "Đang đọc diff", command: `${banner("đang đọc diff")}; git --no-pager diff --stat 2>/dev/null | head -30` },
      { label: "Đang tổng hợp nhận xét", command: `${banner("đang tổng hợp nhận xét")}; true` },
    ],
  };

  return [...common, ...(byMode[mode] ?? byMode.implement)];
}

export function simulatorNotice(agent: AgentId): string {
  return `${AGENT_DISPLAY_NAMES[agent]} CLI chưa được cài đặt trên máy này. Đang chạy trình mô phỏng (không sửa mã nguồn của bạn).`;
}
