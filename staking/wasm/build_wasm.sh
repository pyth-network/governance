#!/bin/bash
cd programs/staking/
which wasm-pack
mkdir -p ../../wasm/bundle
mkdir -p ../../wasm/node
ls ../../wasm/
echo "##"
ls *
wasm-pack build  -d ../../wasm/bundle -- --features wasm
wasm-pack build  -d ../../wasm/node -t nodejs -- --features wasm
