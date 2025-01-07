/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/profile.json`.
 */
export type Profile = {
  "address": "prfmVhiQTN5Spgoxa8uZJba35V1s7XXReqbBiqPDWeJ",
  "metadata": {
    "name": "profile",
    "version": "1.0.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "updateIdentity",
      "discriminator": [
        130,
        54,
        88,
        104,
        222,
        124,
        238,
        252
      ],
      "accounts": [
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "identityAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "identity",
          "type": {
            "defined": {
              "name": "identity"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "identityAccount",
      "discriminator": [
        194,
        90,
        181,
        160,
        182,
        206,
        116,
        158
      ]
    }
  ],
  "types": [
    {
      "name": "identity",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "evm",
            "fields": [
              {
                "name": "pubkey",
                "type": {
                  "option": {
                    "array": [
                      "u8",
                      20
                    ]
                  }
                }
              }
            ]
          }
        ]
      }
    },
    {
      "name": "identityAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "identity",
            "type": {
              "defined": {
                "name": "identity"
              }
            }
          }
        ]
      }
    }
  ]
};
