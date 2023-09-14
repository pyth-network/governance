# Install Rust
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Install wasm-pack
echo "Installing wasm-pack..."
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh -s -- -y

# npm install
npm install
