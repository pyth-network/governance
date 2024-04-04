#!/bin/bash

set -euo pipefail

# Root of the repository
REPO_ROOT=$(git rev-parse --show-toplevel)

echo "Building the image for the staking program"
docker build --platform linux/x86_64 -t staking-build -f "$REPO_ROOT"/staking/Dockerfile "$REPO_ROOT"/staking

echo "Building the staking program"
docker run --platform linux/x86_64 --rm -v "$REPO_ROOT"/staking/artifacts:/artifacts staking-build

echo "Successfully built the staking program."
echo "The artifacts are available at $REPO_ROOT/staking/artifacts"

CHECKSUM=$(sha256sum $REPO_ROOT/staking/artifacts/staking.so | awk '{print $1}')
echo "sha256sum of the staking program: $CHECKSUM"
