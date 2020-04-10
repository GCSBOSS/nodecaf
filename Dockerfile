FROM 'node:13-alpine'
ENV NODE_ENV production

EXPOSE 8080

WORKDIR /app

ENTRYPOINT ["node", "/cli/node_modules/nodecaf-cli/bin/nodecaf.js", "run"]

ENV APP_PATH /app

RUN mkdir /cli && cd /cli && npm i nodecaf-cli && cd /app && \
    addgroup -g 2000 -S nodecaf && \
    adduser -u 2000 -S nodecaf -G nodecaf && \
    chown nodecaf:nodecaf /app

USER nodecaf
