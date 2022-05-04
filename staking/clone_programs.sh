#!/bin/bash

if [ ! -f target/deploy/governance.so ]
then
	solana program dump -u mainnet-beta GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw ./target/deploy/governance.so
fi
if [ ! -f target/deploy/chat.so ]
then
	solana program dump -u mainnet-beta gCHAtYKrUUktTVzE4hEnZdLV4LXrdBf6Hh9qMaJALET ./target/deploy/chat.so
fi
