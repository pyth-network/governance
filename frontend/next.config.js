require("dotenv").config()

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  env: {
    ENDPOINT: process.env.ENDPOINT,
    LOCALNET_PYTH_MINT: process.env.LOCALNET_PYTH_MINT,
  },
  webpack: (config, { isServer, dev }) => {
    config.experiments = { asyncWebAssembly: true, layers: true, }

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
