/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/wallet_tester.json`.
 */
export type WalletTester = {
  "address": "tstPARXbQ5yxVkRU2UcZRbYphzbUEW6t5ihzpLaafgz",
  "metadata": {
    "name": "walletTester",
    "version": "1.0.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "test",
      "discriminator": [
        163,
        36,
        134,
        53,
        232,
        223,
        146,
        222
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "testReceipt",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "payer"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    }
  ]
};
