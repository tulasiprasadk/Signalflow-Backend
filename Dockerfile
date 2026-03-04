FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --production=false
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --production=true
COPY --from=builder /app/dist ./dist
COPY prisma ./prisma
EXPOSE 9001
CMD ["node", "dist/src/main.js"]
