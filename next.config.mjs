/** @type {import('next').NextConfig} */
const nextConfig = {
  // 語のリスト（data/）は実行中に fs で読むので、Vercel などに公開するときのファイルに必ず含める
  outputFileTracingIncludes: { "/**": ["./data/**/*"] },
};

export default nextConfig;
