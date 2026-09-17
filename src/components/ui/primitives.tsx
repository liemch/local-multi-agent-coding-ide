"use client";

import React from "react";

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}

export function Panel({
  title,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("flex min-h-0 flex-col overflow-hidden bg-[#0f1219]", className)}>
      {(title || actions) && (
        <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/5 px-3 py-2">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">{title}</h2>
          {actions ? <div className="flex items-center gap-1">{actions}</div> : null}
        </header>
      )}
      <div className={cn("min-h-0 flex-1 overflow-auto", bodyClassName)}>{children}</div>
    </section>
  );
}

type ButtonVariant = "primary" | "ghost" | "danger" | "subtle";

export function Button({
  variant = "subtle",
  size = "md",
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: "sm" | "md" }) {
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-sky-500 text-white hover:bg-sky-400 disabled:bg-sky-500/40",
    ghost: "bg-transparent text-slate-300 hover:bg-white/5",
    danger: "bg-rose-500/90 text-white hover:bg-rose-500",
    subtle: "bg-white/5 text-slate-200 hover:bg-white/10",
  };
  return (
    <button
      {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm",
        variants[variant],
        className,
      )}
    />
  );
}

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-md border border-white/10 bg-[#0b0d12] px-3 py-1.5 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/60",
        className,
      )}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "w-full rounded-md border border-white/10 bg-[#0b0d12] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-600 focus:border-sky-500/60",
        className,
      )}
    />
  );
}

export function Select({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "w-full rounded-md border border-white/10 bg-[#0b0d12] px-3 py-1.5 text-sm text-slate-100 outline-none focus:border-sky-500/60",
        className,
      )}
    />
  );
}

export function Badge({
  tone = "neutral",
  children,
  className,
}: {
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  children: React.ReactNode;
  className?: string;
}) {
  const tones = {
    neutral: "bg-white/5 text-slate-300 ring-white/10",
    success: "bg-emerald-500/10 text-emerald-300 ring-emerald-500/20",
    warning: "bg-amber-500/10 text-amber-300 ring-amber-500/20",
    danger: "bg-rose-500/10 text-rose-300 ring-rose-500/20",
    info: "bg-sky-500/10 text-sky-300 ring-sky-500/20",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-lg",
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  React.useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-4 pt-[10vh]" onMouseDown={onClose}>
      <div
        className={cn("w-full rounded-xl border border-white/10 bg-[#111520] shadow-2xl", width)}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="border-b border-white/5 px-4 py-3 text-sm font-semibold text-slate-100">{title}</header>
        <div className="px-4 py-4">{children}</div>
        {footer ? <footer className="flex justify-end gap-2 border-t border-white/5 px-4 py-3">{footer}</footer> : null}
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
      <p className="text-sm text-slate-400">{title}</p>
      {hint ? <p className="max-w-sm text-xs text-slate-600">{hint}</p> : null}
      {action}
    </div>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn("inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-600 border-t-sky-400", className)}
    />
  );
}
