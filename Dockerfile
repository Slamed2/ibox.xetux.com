# Stage 1: Build dashboard
FROM node:20-alpine AS dashboard-build
WORKDIR /app/dashboard
COPY dashboard/package.json dashboard/package-lock.json* ./
RUN npm install
COPY dashboard/ ./
RUN npm run build

# Stage 2: Build backend
FROM node:20-alpine AS backend-build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json ./
COPY src/ ./src/
RUN npx tsc

# Stage 3: Runtime
FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --from=backend-build /app/dist ./dist
COPY src/db/migrations ./dist/db/migrations
COPY --from=dashboard-build /app/dashboard/dist ./public

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "dist/index.js"]
