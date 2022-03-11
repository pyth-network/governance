import { Provider, Program} from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

export class StakeConfig {
    public static async loadStakeConfig(address : PublicKey, program : Program) : Promise<StakeAccount> {
      return
    }

}
export class StakeUser {
    owner : PublicKey

    constructor(program : Program, user : PublicKey){
        this.owner = user
    }

    //gets this.owner stake accounts
    public async getStakeAccounts(program : Program) : Promise<StakeAccount[]> {
        return 
    }

    // creates stake account and returns it as a StakeAccount
    public async createStakeAccount(program : Program) : Promise<StakeAccount> {
        return
    }

}


export class StakeAccount {
    address : PublicKey
    stake_account_positions
    stake_account_metadata

    public static async loadStakeAccount(address : PublicKey, program : Program) : Promise<StakeAccount> {
      return
    }


    //unlock a provided token balance
    public async unlockTokens(amount : number, program : Program){

    }

    //deposit tokens
    public async depositAndLockTokens(amount : number, program : Program){
    }

    //withdraw tokens
    public async withdrawTokens(amount : number, program : Program){

    }

    // Withdrawable
    
    //Locked tokens :
     // - warmup 
     // - active 
     // - cooldown

    // Unvested

    public getBalanceSummary(){
        
    }


     // What is the best way to represent current vesting schedule in the UI
    public getVestingSchedule(){
       
    }


}