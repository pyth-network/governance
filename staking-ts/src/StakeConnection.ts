import { Provider, Program, Wallet} from "@project-serum/anchor";
import { Keypair, PublicKey, Connection } from "@solana/web3.js";

export class StakeConnection {
    provider : Provider
    stake_program : Program
    owner : PublicKey
    current_stake_account : StakeAccount
    constructor(provider : Provider, stake_program : Program){
        this.provider = provider;
        this.stake_program = stake_program;
        this.owner = provider.wallet.publicKey 
    }

    //finds the address of this.owner stake accounts
    public async findStakeAccounts() : Promise<PublicKey[]> {
        
        return 
    }

    //gets all the (neatly structured) data of a user's stake account using the address from the above function
    public async loadStakeAccount( stake_account_address : PublicKey){
    }

    //lock a provided token balance
    public async lockTokens(amount : number){

    }

    //unlock a provided token balance
    public async unlockTokens(amount : number){

    }

    //withdraw tokens
    public async withdrawTokens(amount : number){

    }

    public async getUnlockingSchedule(){
        // What is the best way to represent current unlocking schedule in the UI
    }

    public async getVestingSchedule(){
        // What is the best way to represent current vesting schedule in the UI
    }
}

export class StakeAccount {
    address : PublicKey
    withdrawable_balance : number
    locked_balance : number
    unvested_balance : number
    data

    constructor(address : PublicKey){
        this.address = address;
    }

    async load(){
        // populate all other fields
    }
}