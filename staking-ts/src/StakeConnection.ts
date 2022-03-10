import { Provider, Program} from "@project-serum/anchor";
import { PublicKey } from "@solana/web3.js";

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

    //gets this.owner stake accounts
    public async getStakeAccounts() : Promise<StakeAccount[]> {
        return 
    }

    public async createStakeAccount() : Promise<StakeAccount> {
        return
    }

}


export class StakeAccount {
    provider : Provider
    stake_program : Program
    owner : PublicKey
    address : PublicKey
    

    constructor(provider : Provider, stake_program : Program, address : PublicKey){
        this.address = address;
        this.provider = provider;
        this.stake_program = stake_program;
    }

    async load(){
    }


    //unlock a provided token balance
    public async unlockTokens(amount : number){

    }

    //deposit tokens
    public async depositAndLockTokens(amount : number){
    }

    //withdraw tokens
    public async withdrawTokens(amount : number){

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