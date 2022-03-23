require("dotenv").config()
const webpack = require('webpack')

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  experimental: {
    externalDir: true,
  },
  env: {
    ENDPOINT: process.env.ENDPOINT,
  },
  webpack: (config) => {
    config.experiments = { asyncWebAssembly: true, topLevelAwait: true }
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
