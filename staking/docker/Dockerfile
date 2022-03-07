FROM projectserum/build:v0.22.0

# RUN echo "pyth ALL=(ALL) NOPASSWD:ALL" >> /etc/sudoers
# RUN useradd -m pyth

COPY . governance/

WORKDIR /workdir/governance

RUN solana-keygen new -o ./tests/default_wallet.json --no-bip39-passphrase --force
ENV PUBKEY="$(solana-keygen pubkey ./tests/default_wallet.json)"

RUN anchor build
RUN solana-test-validator --ledger ./.anchor/test-ledger --mint ${PUBKEY}