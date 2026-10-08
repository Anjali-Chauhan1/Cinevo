/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate verification builds from a running development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  webpack(config) {
    // Privy's SDK can load optional integrations (Farcaster mini apps,
    // Abstract wallets, permissionless smart accounts, Solana memos) that
    // Cinova doesn't use and doesn't install. Resolve them to empty modules
    // instead of failing the build.
    config.resolve.alias = {
      ...config.resolve.alias,
      "@farcaster/mini-app-solana": false,
      "@abstract-foundation/agw-client": false,
      "@abstract-foundation/agw-client/actions": false,
      "@solana-program/memo": false,
      permissionless: false,
      "permissionless/accounts": false,
      "permissionless/clients/pimlico": false,
    };
    return config;
  },
};

export default nextConfig;
