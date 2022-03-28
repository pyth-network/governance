#!/bin/bash
cd programs/staking/
which wasm-pack
mkdir -p ../../wasm/bundle
mkdir -p ../../wasm/node
wasm-pack build  -d ../../wasm/bundle -- --features wasm
wasm-pack build  -d ../../wasm/node -t nodejs -- --features wasm
