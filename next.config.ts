import type { NextConfig } from "next";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const githubPagesBasePath = "/Presen-a-";

const nextConfig: NextConfig = {
  ...(isGitHubPages
    ? {
        output: "export",
        basePath: githubPagesBasePath,
        assetPrefix: `${githubPagesBasePath}/`,
        images: {
          unoptimized: true,
        },
      }
    : {}),
};

export default nextConfig;
