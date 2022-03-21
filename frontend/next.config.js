/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  webpack: (config) => {
    config.experiments = { asyncWebAssembly: true, topLevelAwait: true }
    return config
  },
}
