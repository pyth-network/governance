#
# Docker image to generate a deterministic build of the Pyth Staking Program
# program. This image extends projectserum/build which is based on backpackapp/build
# but with a specific version of the Solana CLI and Anchor CLI.
#

FROM backpackapp/build:v0.30.0@sha256:9aee169b2d8b89b4a4243419ae35c176773136e78d751b3e439eff692c9c1293

ARG TEST=false
ENV TEST_ENV=$TEST
WORKDIR /workspace

COPY . .

CMD ["bash", "-c", \
        "sh -c "$(curl -sSfL https://release.solana.com/v1.18.16/install)" && if [ \"$TEST_ENV\" = \"true\" ]; then anchor build -- --features mock-clock; else anchor build; fi && if [ \"$TEST_ENV\" = \"true\" ]; then chmod -R 777 target/deploy; fi"]
