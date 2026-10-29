# syntax=docker/dockerfile:1
# Build one web app: docker build --build-arg APP=employee-web -f infra/docker/frontend.Dockerfile .
FROM node:24-slim AS build
ARG APP
WORKDIR /repo
COPY . .
RUN npm ci
RUN npm run build -w @dexa/$APP

FROM nginxinc/nginx-unprivileged:stable
ARG APP
COPY infra/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/$APP/dist /usr/share/nginx/html
EXPOSE 8080
