/** @type {import('next').NextConfig} */
export default {
  serverExternalPackages: ["pdf-lib"],
  experimental: { serverActions: { bodySizeLimit: "20mb" } },
};
