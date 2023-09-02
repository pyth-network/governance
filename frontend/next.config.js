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
  webpack(config, { isServer }) {
    if (isServer) {
      config.output.webassemblyModuleFilename = './../static/wasm/[modulehash].wasm';
    } else {
      config.output.webassemblyModuleFilename = 'static/wasm/[modulehash].wasm';
    }
    config.experiments = { asyncWebAssembly: true, layers : true };
    config.optimization.moduleIds = 'named';

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
