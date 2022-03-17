This is a [Next.js](https://nextjs.org/) project bootstrapped with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## Getting Started

First, start the test validator:

```bash
cd staking
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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `pages/index.tsx`. The page auto-updates as you edit the file.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!
