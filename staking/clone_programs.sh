#!/usr/bin/env bash

if [ ! -f target/deploy/governance.so ]
then
	# This is the real governance
	# solana program dump -u mainnet-beta GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw ./target/deploy/governance.so
	# This is the version of governance with the extra instructions for testing, check PR 184 for more info:
	solana program dump -u devnet 2WFsTyAoD4Q9stTgSAyz1xZ38D4bmdLxGngvcr53jcK3 ./target/deploy/governance.so
fi
if [ ! -f target/deploy/chat.so ]
then
	solana program dump -u devnet gCHAtYKrUUktTVzE4hEnZdLV4LXrdBf6Hh9qMaJALET ./target/deploy/chat.so
fi
