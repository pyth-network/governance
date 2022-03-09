FROM projectserum/build:v0.22.0

COPY . governance/

WORKDIR /workdir/governance
RUN ./prepare.sh
RUN mkdir ./.anchor && mkdir ./.anchor/test-ledger
RUN anchor build


ENTRYPOINT [ "./docker/validator.sh" ]