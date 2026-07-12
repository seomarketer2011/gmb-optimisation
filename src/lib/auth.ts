import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { count } from "drizzle-orm";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

// better-auth is instantiated per request because Cloudflare bindings (D1)
// are only available inside a request context.
export async function getAuth() {
  const { env } = await getCloudflareContext({ async: true });
  const db = await getDb();

  return betterAuth({
    secret: env.BETTER_AUTH_SECRET,
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    emailAndPassword: {
      enabled: true,
    },
    user: {
      additionalFields: {
        role: {
          type: "string",
          defaultValue: "va",
          input: false,
        },
        clientId: {
          type: "string",
          required: false,
          input: false,
        },
      },
    },
    databaseHooks: {
      user: {
        create: {
          // First registered user becomes the admin; everyone after
          // defaults to VA until an admin changes their role.
          before: async (u) => {
            const [row] = await db
              .select({ value: count() })
              .from(schema.user);
            return {
              data: { ...u, role: row.value === 0 ? "admin" : "va" },
            };
          },
        },
      },
    },
  });
}

export type Role = "admin" | "operator" | "va" | "client";
