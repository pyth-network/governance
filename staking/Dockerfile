#
# Docker image to generate a deterministic build of the Pyth Staking Program
# program. This image extends projectserum/build which is based on backpackapp/build
# but with a specific version of the Solana CLI and Anchor CLI.
#

FROM backpackapp/build:v0.30.1@sha256:c160fe32cba7c463981110b2aac2924de4833c06a0af6473a830ead880c4ef3b

ARG TEST=false
ENV TEST_ENV=$TEST
WORKDIR /workspace

COPY . .

CMD ["bash", "-c", \
        "if [ \"$TEST_ENV\" = \"true\" ]; then anchor build -- --features mock-clock; else anchor build; fi && if [ \"$TEST_ENV\" = \"true\" ]; then chmod -R 777 target/; fi"]
