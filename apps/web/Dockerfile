FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY index.html ./
COPY src ./src
COPY server.mjs ./
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV PORT=80
COPY --from=build /app/dist ./dist
COPY --from=build /app/server.mjs ./server.mjs
EXPOSE 80
CMD ["node", "server.mjs"]
