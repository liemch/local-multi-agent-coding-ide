import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import "@xterm/xterm/css/xterm.css";
import { I18nProvider } from "@/lib/i18n";

export const metadata: Metadata = {
  title: "Local Multi-Agent Dev IDE",
  description: "IDE phát triển local tích hợp nhiều AI Coding Agent (Codex, Claude, Antigravity).",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="vi">
      <body className="bg-[#0b0d12] text-slate-100 antialiased">
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
