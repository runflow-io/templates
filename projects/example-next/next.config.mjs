/** @type {import("next").NextConfig} */
const config = {
  output: "export",
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  images: { unoptimized: true },
  outputFileTracingRoot: import.meta.dirname,
};

export default config;
