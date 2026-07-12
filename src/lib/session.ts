import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth, type Role } from "./auth";

export async function getSession() {
  const auth = await getAuth();
  return auth.api.getSession({ headers: await headers() });
}

/** Redirects to /login when there is no session. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

/** Redirects to / when the user's role is not in the allowed list. */
export async function requireRole(...roles: Role[]) {
  const session = await requireSession();
  const role = (session.user as { role?: string }).role as Role | undefined;
  if (!role || !roles.includes(role)) redirect("/");
  return session;
}
