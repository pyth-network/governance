export type Profile = {
  "version": "1.0.0",
  "name": "profile",
  "instructions": [
    {
      "name": "updateIdentity",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "identityAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "identity",
          "type": {
            "defined": "Identity"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "identityAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "identity",
            "type": {
              "defined": "Identity"
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "Identity",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Evm",
            "fields": [
              {
                "name": "pubkey",
                "type": {
                  "array": [
                    "u8",
                    20
                  ]
                }
              }
            ]
          }
        ]
      }
    }
  ]
};

export const IDL: Profile = {
  "version": "1.0.0",
  "name": "profile",
  "instructions": [
    {
      "name": "updateIdentity",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "identityAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "identity",
          "type": {
            "defined": "Identity"
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "identityAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "identity",
            "type": {
              "defined": "Identity"
            }
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "Identity",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Evm",
            "fields": [
              {
                "name": "pubkey",
                "type": {
                  "array": [
                    "u8",
                    20
                  ]
                }
              }
            ]
          }
        ]
      }
    }
  ]
};
