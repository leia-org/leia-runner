FROM node:lts-alpine

WORKDIR /leia-runner

COPY . .

RUN npm install --omit=dev

ENTRYPOINT ["npm", "start"]
