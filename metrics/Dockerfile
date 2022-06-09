# syntax=docker/dockerfile:1.2

ARG NODE_VERSION=16.13.2
ARG APP_NAME=governance_metrics

FROM node:$NODE_VERSION as base

WORKDIR /app
COPY ./package.json ./tsconfig.json ./*.ts ./entrypoint.sh /app

RUN chmod +x entrypoint.sh

RUN yarn
RUN yarn add ts-node typescript

ARG APP_NAME
ENV APP_NAME=$APP_NAME


ENTRYPOINT ["/app/entrypoint.sh"]
CMD ["yarn", "ts-node", "/app/$APP_NAME.ts"]