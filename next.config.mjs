/** @type {import('next').NextConfig} */
const nextConfig = {
  // Isolate verification builds from a running development server.
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
