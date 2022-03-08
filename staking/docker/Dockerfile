FROM projectserum/build:v0.22.0

COPY . governance/

WORKDIR /workdir/governance
RUN solana-keygen new -o ./tests/default_wallet.json --no-bip39-passphrase --force && anchor build

ENTRYPOINT [ "./docker/validator.sh" ]