require('dotenv').config()

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  swcMinify: false,
  env: {
    ENDPOINT: process.env.ENDPOINT,
    CLUSTER: process.env.CLUSTER,
  },
  webpack: (config, { isServer, dev }) => {
    config.experiments = { asyncWebAssembly: true, layers: true }

    return config
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/staking',
        permanent: true,
      },
    ]
  },
}
