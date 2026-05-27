FROM node:18-alpine

WORKDIR /app

# Install frontend deps + trigger postinstall (installs server deps)
COPY package*.json ./
COPY server/package*.json ./server/
RUN npm install

# Copy all source
COPY . .

# Build React frontend
RUN npm run build

EXPOSE 8080
ENV PORT=8080

CMD ["node", "server/index.js"]
