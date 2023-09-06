cat "~/profile"
source "~/profile"
echo $PATH
pushd staking/
npm run build_wasm
anchor build
popd
npx lerna run build --scope pyth-staking-frontend --include-dependencies