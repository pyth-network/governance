import { AnchorProvider, IdlTypes, Program } from "@coral-xyz/anchor";
import { Profile } from "../target/types/profile";
import IDL from "../target/idl/profile.json";
import { Connection, PublicKey } from "@solana/web3.js";
import { PROFILE_ADDRESS } from "./constants";
import { Wallet } from "@coral-xyz/anchor/dist/cjs/provider";
import { ethers } from "ethers";

type Ecosystem = "evm";
const EcosystemValues: Ecosystem[] = ["evm"];

export type UserProfile = Partial<Record<Ecosystem, string>>;

export class ProfileConnection {
  program: Program<Profile>;

  public userPublicKey(): PublicKey {
    return this.program.provider.publicKey;
  }

  constructor(connection: Connection, wallet: Wallet) {
    this.program = new Program(
      IDL as Profile,
      new AnchorProvider(connection, wallet, {})
    );
  }

  async getProfile(user: PublicKey): Promise<UserProfile> {
    let profile = {};
    for (let ecosystem of EcosystemValues) {
      const identity = await this.getEcosystemIdentity(user, ecosystem);
      if (identity) {
        profile[ecosystem] = getIdentityAsString(identity);
      }
    }
    return profile;
  }

  async getEcosystemIdentity(
    user: PublicKey,
    ecosystem: Ecosystem
  ): Promise<IdlTypes<Profile>["identity"] | undefined> {
    const identityAccountAddress = getIdentityAccountAddress(user, ecosystem);
    return (
      await this.program.account.identityAccount.fetchNullable(
        identityAccountAddress
      )
    )?.identity;
  }

  async updateProfile(currProfile: UserProfile, newProfile: UserProfile) {
    for (let ecosystem of EcosystemValues) {
      if (currProfile[ecosystem] !== newProfile[ecosystem]) {
        await this.updateIdentity(newProfile[ecosystem], ecosystem);
      }
    }
  }

  async updateIdentity(string: string | undefined, ecosystem: Ecosystem) {
    const identityAccountAddress = getIdentityAccountAddress(
      this.userPublicKey(),
      ecosystem
    );
    const identity = getIdentityFromString(string, ecosystem);
    await this.program.methods
      .updateIdentity(identity)
      .accounts({ identityAccount: identityAccountAddress })
      .rpc();
  }

  getIdentityFromProfileAccountData(accountData: Buffer): string {
    const decoded = this.program.coder.accounts.decode(
      "IdentityAccount",
      Buffer.from(accountData)
    );
    return getIdentityAsString(decoded.identity);
  }
}

export function areDifferentProfiles(
  currProfile: UserProfile,
  newProfile: UserProfile
) {
  for (let ecosystem of EcosystemValues) {
    if (currProfile[ecosystem] !== newProfile[ecosystem]) {
      return true;
    }
  }
  return false;
}

export function getIdentityAccountAddress(
  user: PublicKey,
  ecosystem: Ecosystem
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from([EcosystemValues.findIndex((x) => x == ecosystem)]),
      user.toBuffer(),
    ],
    PROFILE_ADDRESS
  )[0];
}

function getIdentityAsString(
  identity: IdlTypes<Profile>["identity"]
): string | undefined {
  if (identity.evm) {
    if (!identity.evm.pubkey) {
      return undefined;
    } else {
      return ethers.getAddress(
        "0x" + Buffer.from(identity.evm.pubkey).toString("hex")
      );
    }
  }
}

function getIdentityFromString(
  string: string | undefined,
  ecosystem: Ecosystem
): IdlTypes<Profile>["identity"] {
  if (!string) {
    return { [ecosystem]: { pubkey: null } };
  }
  if (ecosystem === "evm") {
    try {
      const evmPubkey = Array.from(Buffer.from(string.slice(2), "hex"));
      if (evmPubkey.length !== 20) {
        throw new Error("Invalid length.");
      }
      return { evm: { pubkey: evmPubkey } };
    } catch (e) {
      throw new Error("Your EVM address is invalid.");
    }
  }
}
