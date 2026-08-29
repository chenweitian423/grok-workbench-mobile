FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages ./packages
COPY apps/web ./apps/web
RUN npm ci
RUN npm run build:web

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=80
ENV GROK2API_URL=http://host.docker.internal:38695
COPY apps/web/server.mjs ./server.mjs
COPY --from=build /app/apps/web/dist ./dist
EXPOSE 80
CMD ["node", "server.mjs"]
