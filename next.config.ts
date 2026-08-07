import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  // This project is standalone; a stray lockfile one directory up made Next
  // infer the parent folder as the workspace root.
  outputFileTracingRoot: __dirname,
};

export default nextConfig;
