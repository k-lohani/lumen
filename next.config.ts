import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["ws"],
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  outputFileTracingIncludes: {
    "/": ["./data/charts/**/*", "./data/trials/**/*"],
    "/api/patients": ["./data/charts/**/*"],
    "/api/patients/[slug]": ["./data/charts/**/*"],
    "/api/match": ["./data/charts/**/*", "./data/trials/**/*", "./data/cache/**/*"],
    "/api/trials": ["./data/trials/**/*"],
  },
};

export default nextConfig;
