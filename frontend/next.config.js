/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.experiments = { asyncWebAssembly: true }
    return config
  },
}

module.exports = nextConfig
