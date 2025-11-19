FROM node:lts-alpine

WORKDIR /leia-runner

COPY . .

RUN npm ci --omit=dev && \
    rm -rf $(npm get cache)

ENTRYPOINT ["npm", "start"]
