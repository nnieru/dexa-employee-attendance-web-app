# syntax=docker/dockerfile:1
# Build one backend app: docker build --build-arg APP=auth-service -f infra/docker/backend.Dockerfile .
FROM node:24-slim AS build
ARG APP
WORKDIR /repo
COPY . .
RUN npm ci
RUN npm run build:shared && npm run build -w @dexa/$APP
RUN npm prune --omit=dev

FROM node:24-slim
ARG APP
ENV NODE_ENV=production APP=$APP
WORKDIR /repo
COPY --from=build --chown=node:node /repo /repo
USER node
CMD ["sh", "-c", "node apps/$APP/dist/main.js"]
