FROM projectserum/build:v0.22.0

COPY . governance/

WORKDIR /workdir/governance
RUN anchor build
RUN ./prepare.sh

ENTRYPOINT [ "./docker/validator.sh" ]