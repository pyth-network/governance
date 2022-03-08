FROM projectserum/build:v0.22.0

COPY . governance/

WORKDIR /workdir/governance
RUN anchor build

ENTRYPOINT [ "./docker/validator.sh" ]