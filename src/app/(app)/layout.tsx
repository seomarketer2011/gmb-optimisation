import Link from "next/link";
import { requireSession } from "@/lib/session";
import { SignOutButton } from "@/components/sign-out-button";

const nav = [
  { href: "/", label: "Dashboard" },
  { href: "/gbp", label: "GBP" },
  { href: "/tasks", label: "Tasks" },
  { href: "/content", label: "Content" },
  { href: "/clients", label: "Niches" },
  { href: "/locations", label: "Properties" },
  { href: "/locations/import", label: "Import" },
];

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await requireSession();
  const role = (session.user as { role?: string }).role ?? "va";

  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200 bg-white print:hidden dark:border-gray-800 dark:bg-gray-900">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              GBP<span className="text-blue-600">Ops</span>
            </Link>
            <nav className="flex gap-4">
              {nav.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-500">
              {session.user.name}{" "}
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs uppercase text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                {role}
              </span>
            </span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
