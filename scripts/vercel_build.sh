source "$HOME/.cargo/env"
pushd staking/
npm run build_wasm

popd
npx lerna run build --scope pyth-staking-frontend --include-dependencies