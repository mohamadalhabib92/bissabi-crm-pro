# Contexte de build : la racine du dépôt.
#   docker build -f services/voice-gateway/Dockerfile -t bissabi-voice-gateway .
FROM node:22-alpine AS build
WORKDIR /app
COPY services/voice-gateway/package.json services/voice-gateway/package-lock.json* services/voice-gateway/tsconfig.json ./
COPY services/voice-gateway/src ./src
RUN npm install && npx tsc

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY services/voice-gateway/package.json services/voice-gateway/package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY telephonie-ia/prompts ./prompts
ENV PROMPTS_DIR=/app/prompts
ENV PORT=8080
EXPOSE 8080
CMD ["node", "dist/index.js"]
