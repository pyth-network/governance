# Install Rust 
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

echo "Installing dependencies..."
ldd --version
apt-cache policy libc6

# Install wasm-pack
echo "Installing wasm-pack..."
curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh -s -- -y

# Install solana 
sh -c "$(curl -sSfL https://release.solana.com/v1.14.20/install)"

# Install anchor
cargo install --git https://github.com/coral-xyz/anchor --tag v0.27.0 anchor-cli --locked


# npm install 
npm install