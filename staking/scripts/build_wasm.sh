#!/bin/bash
cd programs/staking/
wasm-pack build  -d ../../../wasm/bundle -- --features wasm
wasm-pack build  -d ../../../wasm/node -t nodejs -- --features wasm
