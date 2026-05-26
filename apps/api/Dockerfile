FROM node:22-slim

WORKDIR /repo

# Install dependencies for the API package only.
COPY apps/api/package.json apps/api/tsconfig.json ./apps/api/
RUN cd apps/api && npm install

COPY apps/api ./apps/api/

EXPOSE 8080

CMD ["sh", "-c", "cd apps/api && npm run dev"]

