require("dotenv").config()

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  env: {
    ENDPOINT: process.env.ENDPOINT,
    LOCALNET_PROGRAM: process.env.LOCALNET_PROGRAM,
    DEVNET_PROGRAM: process.env.DEVNET_PROGRAM,
    LOCALNET_PYTH_MINT: process.env.LOCALNET_PYTH_MINT,
    DEVNET_PYTH_MINT: process.env.DEVNET_PYTH_MINT,
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
