require('dotenv').config()
const path = require('path')
const CopyPlugin = require("copy-webpack-plugin");

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
    config.resolve.alias = {
      ...config.resolve.alias,
        "./staking_bg.wasm": path.resolve(__dirname, "../staking/app/wasm/bundle/staking_bg.wasm")
    }
    config.plugins = [
      ...config.plugins,
      new CopyPlugin({
        patterns: [
          { from: path.resolve(__dirname, "../wasm/bundle/staking_bg.wasm"), to: path.resolve(__dirname, "./.next/server/pages/staking_bg.wasm") },
        ],
      }),
    ]
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
