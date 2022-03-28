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
    config.experiments = { asyncWebAssembly: true, topLevelAwait: true, layers: true, }

    // Workaround from https://github.com/vercel/next.js/issues/29362#issuecomment-932767530
    // In prod mode and in the server bundle (the place where this "chunks" bug
    // appears), use the client static directory for the same .wasm bundle
    config.output.webassemblyModuleFilename =
      isServer && !dev ? "../static/wasm/[id].wasm" : "static/wasm/[id].wasm";

    // Ensure the filename for the .wasm bundle is the same on both the client
    // and the server (as in any other mode the ID's won't match)
    config.optimization.moduleIds = "named";

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
