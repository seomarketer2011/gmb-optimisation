"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignOutButton() {
  const router = useRouter();
  return (
    <button
      onClick={async () => {
        await authClient.signOut();
        router.push("/login");
        router.refresh();
      }}
      className="text-sm text-gray-500 hover:text-gray-900 dark:hover:text-gray-100"
    >
      Sign out
    </button>
  );
}
