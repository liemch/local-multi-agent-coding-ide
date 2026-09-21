import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  outputFileTracingRoot: process.cwd(),
  // The IDE serves local assets as-is and does not use next/image. Disabling
  // optimization avoids shipping platform-specific Sharp binaries in a
  // cross-platform npm tarball.
  images: { unoptimized: true },
  // The IDE runs locally, but may also be reached through a proxied preview host.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  // node-pty is a native module and must never be bundled for the client.
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
