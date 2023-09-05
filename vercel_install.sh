# Install Rust 
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

# Install wasm-pack
echo "Installing wasm-pack..."
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh -s -- -y

# Install solana 
sh -c "$(curl -sSfL https://release.solana.com/v1.14.20/install)"

# Install anchor
npm i -g @coral-xyz/anchor-cli@0.27.0

# npm install 
npm install