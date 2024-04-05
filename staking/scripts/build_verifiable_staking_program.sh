#!/bin/bash

set -euo pipefail

# Root of the repository
REPO_ROOT=$(git rev-parse --show-toplevel)

# Default value for TEST
TEST=false

# Parse command-line arguments
# -t: build the staking program for tests
while getopts "t" opt; do
    case ${opt} in
    t)
        TEST=true
        ;;
    \?)
        echo "Invalid option: -$OPTARG" 1>&2
        exit 1
        ;;
    esac
done

if [ "$TEST" = "true" ]; then
    echo "Building the image for the staking program test"
    docker build --platform linux/amd64 --build-arg TEST=true -t staking-build-test -f "$REPO_ROOT"/staking/Dockerfile "$REPO_ROOT"/staking
else
    echo "Building the image for the staking program production"
    docker build --platform linux/amd64 -t staking-build -f "$REPO_ROOT"/staking/Dockerfile "$REPO_ROOT"/staking
fi

if [ "$TEST" = "true" ]; then
    echo "Building the staking program test"
    docker run --platform linux/amd64 --rm -v "$REPO_ROOT"/staking/target:/workspace/target staking-build-test
else
    echo "Building the staking program"
    docker run --platform linux/amd64 --rm -v "$REPO_ROOT"/staking/target:/workspace/target staking-build
fi

echo "Successfully built the staking program."
echo "The artifacts are available at $REPO_ROOT/staking/target"

CHECKSUM=$(sha256sum $REPO_ROOT/staking/target/deploy/staking.so | awk '{print $1}')
echo "sha256sum of the staking program: $CHECKSUM"
