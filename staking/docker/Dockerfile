FROM projectserum/build:v0.22.0

COPY . governance/
WORKDIR /workdir/governance

RUN yarn 

ENTRYPOINT [ "yarn","ts-node","./docker/validator.ts"]