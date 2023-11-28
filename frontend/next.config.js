require('dotenv').config()
const path = require('path')

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
  webpack(config, { isServer }) {
    config.experiments = { asyncWebAssembly: true, layers: true }
    // This is hack to fix the import of the wasm files https://github.com/vercel/next.js/issues/25852
    if (isServer) {
      config.output.webassemblyModuleFilename =
        './../static/wasm/[modulehash].wasm'
    } else {
      config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm'
    }
    config.optimization.moduleIds = 'named'
    // End of hack

    // Import the browser version of wasm instead of the node version
    config.resolve.alias = {
      ...config.resolve.alias,
      '@pythnetwork/staking-wasm$': path.resolve(__dirname, '../wasm/bundle'),
    }
    return config
  },
  // async redirects() {
  //   return [
  //     {
  //       source: '/',
  //       destination: '/staking',
  //       permanent: true,
  //     },
  //   ]
  // },
}
