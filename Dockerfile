FROM node:16-alpine

WORKDIR /cli
RUN npm i -P --no-save nodecaf-cli
RUN mkdir /dist
RUN cp -r ./node_modules/nodecaf-cli/bin /dist/
RUN cp -r ./node_modules/nodecaf-cli/lib /dist/
RUN rm -rf ./node_modules/
RUN npm i -P --no-save eclipt
RUN cp -r ./node_modules /dist/

FROM mhart/alpine-node:slim-16

ENV NODE_ENV production
ENV APP_PATH /app

WORKDIR /app

ENTRYPOINT ["node", "/cli/bin/nodecaf.js", "run"]

COPY --from=0 /dist /cli

RUN addgroup -g 2000 -S nodecaf && \
    adduser -u 2000 -S nodecaf -G nodecaf && \
    chown nodecaf:nodecaf /app

USER nodecaf
