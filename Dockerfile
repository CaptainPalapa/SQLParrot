# SQL Parrot Dockerfile
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY frontend/package*.json ./frontend/
COPY backend/package*.json ./backend/

# Install dependencies
RUN npm install
RUN cd frontend && npm install
RUN cd backend && npm install

# Copy source code
COPY . .

# Build frontend (clean build)
RUN cd frontend && rm -rf dist && npm run build

# Create data directory
RUN mkdir -p /app/data

# Expose ports
EXPOSE 3000

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["npm", "run", "start:docker"]
