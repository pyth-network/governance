import { Gauge, register } from "prom-client";

async function main() {
    const e = new Gauge({
        name: 'staking_global_fetching_error',
		help: 'Whether we failed fetching the list of accounts',
    });

	const g = new Gauge({
		name: 'staking_account_value_tokens',
		help: 'The value of an account in Pyth tokens',
		labelNames: ['address'],
	});

    const f = new Gauge({
		name: 'staking_account_error_fetching',
		help: 'Whether the code failed fetching an account',
		labelNames: ['address'],
	});

    const a = new Gauge({
		name: 'staking_account_error_parsing',
		help: 'Whether the code failed parsing an account',
		labelNames: ['address'],
	});

    while (true){

        try {
            // fetch accounts
            e.set(0)
            for address in addresses :
                try {
                //fetch account
                    g.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 5);
                    a.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 0);
                    f.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 0);

                }
                catch(e){
                    if e {
                        //rpc error 
                        g.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 0);
                        a.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 0);
                        f.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 1);
                    }
                    else {
                        //parsing error 
                        g.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 0);
                        a.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 1);
                        f.set({ address: "GRLicPtrv6tmZXC4tmua8ZDvYq6ALNA89QYKP6TFZgzt" }, 0);
                    }
                }
                


        }
        catch {
            e.set(1)
        }
        
        

    }

    await register.metrics();

}

main();