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
  async redirects() {
    return [
      {
        source: '/',
        destination: '/governance',
        permanent: true,
      },
    ]
  },
}

module.exports = nextConfig
