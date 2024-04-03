#
# Docker image to generate a deterministic build of the Pyth Staking Program
# program. This image extends projectserum/build which is based on backpackapp/build
# but with a specific version of the Solana CLI and Anchor CLI.
#

FROM projectserum/build:v0.27.0@sha256:0e11aced57c448c7da9bf0a563a146398ac8b88f357b8fc2e1be314b42320686

ARG TEST=false

WORKDIR /workspace

COPY . .

CMD ["bash", "-c", \
        "if [ \"$TEST\" = \"true\" ]; then anchor build -- --features mock-clock; else anchor build; fi && cp -r target/ /artifacts && if [ \"$TEST\" = \"true\" ]; then chmod -R 777 /artifacts; fi"]
