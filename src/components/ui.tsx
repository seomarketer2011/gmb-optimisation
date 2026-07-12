import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: "primary" | "secondary" | "danger" }) {
  const styles = {
    primary:
      "bg-blue-600 text-white hover:bg-blue-700 disabled:bg-blue-300",
    secondary:
      "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
    danger: "bg-red-600 text-white hover:bg-red-700",
  }[variant];
  return (
    <button
      className={`rounded-md px-3 py-2 text-sm font-medium transition-colors ${styles} ${className}`}
      {...props}
    />
  );
}

export function LinkButton({
  href,
  children,
  variant = "primary",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "secondary";
  className?: string;
}) {
  const styles = {
    primary: "bg-blue-600 text-white hover:bg-blue-700",
    secondary:
      "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-800 dark:text-gray-200 dark:hover:bg-gray-700",
  }[variant];
  return (
    <Link
      href={href}
      className={`inline-block rounded-md px-3 py-2 text-sm font-medium transition-colors ${styles} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Input({
  className = "",
  ...props
}: ComponentProps<"input">) {
  return (
    <input
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${className}`}
      {...props}
    />
  );
}

export function Textarea({
  className = "",
  ...props
}: ComponentProps<"textarea">) {
  return (
    <textarea
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${className}`}
      {...props}
    />
  );
}

export function Select({
  className = "",
  ...props
}: ComponentProps<"select">) {
  return (
    <select
      className={`w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none dark:border-gray-600 dark:bg-gray-800 dark:text-gray-100 ${className}`}
      {...props}
    />
  );
}

export function Label({ className = "", ...props }: ComponentProps<"label">) {
  return (
    <label
      className={`mb-1 block text-sm font-medium text-gray-700 dark:text-gray-300 ${className}`}
      {...props}
    />
  );
}

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-gray-200 bg-white p-4 shadow-sm dark:border-gray-700 dark:bg-gray-900 ${className}`}
    >
      {children}
    </div>
  );
}

const badgeColors: Record<string, string> = {
  green:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300",
  yellow:
    "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/40 dark:text-yellow-300",
  red: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  gray: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

export function Badge({
  color = "gray",
  children,
}: {
  color?: keyof typeof badgeColors;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${badgeColors[color]}`}
    >
      {children}
    </span>
  );
}

export function statusBadgeColor(status: string): keyof typeof badgeColors {
  switch (status) {
    case "active":
    case "done":
    case "validated":
    case "published":
    case "accepted":
      return "green";
    case "paused":
    case "waiting":
    case "monitoring":
    case "onboarding":
    case "draft":
      return "yellow";
    case "suspended":
    case "blocked":
    case "rejected":
    case "reverted":
      return "red";
    case "in_progress":
    case "ready":
      return "blue";
    default:
      return "gray";
  }
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 p-10 text-center dark:border-gray-700">
      <p className="font-medium text-gray-700 dark:text-gray-300">{title}</p>
      {hint && (
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{hint}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
