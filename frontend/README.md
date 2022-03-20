# Next.js + Tailwind CSS Example

This example shows how to use [Tailwind CSS](https://tailwindcss.com/) [(v3.0)](https://tailwindcss.com/blog/tailwindcss-v3) with Next.js. It follows the steps outlined in the official [Tailwind docs](https://tailwindcss.com/docs/guides/nextjs).

## Getting started

First, start the test validator:

```bash
cd staking
sh build_wasm.sh
yarn install
yarn start
```

Once the Idl account has been created, keep the process running, open a new terminal process in the same directory and run the setup script to create pyth token, as well as create a couple of keypairs to receive SOL, receive PYTH token, create stake accounts, deposit and lock tokens:

```bash
yarn setup
```

One setup is done, change directory to the `staking-ts` directory and run:
```bash
yarn install
```

Once that's done, change directory to the frontend directory and run:

```bash
npm install
npm run dev
```
