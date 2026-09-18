import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The IDE runs locally, but may also be reached through a proxied preview host.
  allowedDevOrigins: ["*.e2b.app", "localhost", "127.0.0.1"],
  // node-pty is a native module and must never be bundled for the client.
  serverExternalPackages: ["node-pty"],
};

export default nextConfig;
