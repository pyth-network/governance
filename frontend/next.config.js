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
  webpack(config, { isServer, dev }) {
    config.experiments = { asyncWebAssembly: true, layers: true }
    // This is hack to fix the import of the wasm files https://github.com/vercel/next.js/issues/25852
    if (!dev && isServer) {
      config.output.webassemblyModuleFilename = 'chunks/[id].wasm'
      config.plugins.push(new WasmChunksFixPlugin())
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
}

class WasmChunksFixPlugin {
  apply(compiler) {
    compiler.hooks.thisCompilation.tap('WasmChunksFixPlugin', (compilation) => {
      compilation.hooks.processAssets.tap(
        { name: 'WasmChunksFixPlugin' },
        (assets) =>
          Object.entries(assets).forEach(([pathname, source]) => {
            if (!pathname.match(/\.wasm$/)) return
            compilation.deleteAsset(pathname)

            const name = pathname.split('/')[1]
            const info = compilation.assetsInfo.get(pathname)
            compilation.emitAsset(name, source, info)
          })
      )
    })
  }
}
