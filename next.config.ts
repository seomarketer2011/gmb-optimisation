import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {};

export default nextConfig;

// Makes Cloudflare bindings (D1, R2, vars) available during `next dev`
initOpenNextCloudflareForDev();
