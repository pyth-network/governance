source "$HOME/.cargo/env"
pushd staking/
# generate wasm
npm run build_wasm

popd
npx lerna run build --scope pyth-staking-frontend --include-dependencies