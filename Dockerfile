FROM node:20-slim

RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    python3-dev \
    gcc \
    && rm -rf /var/lib/apt/lists/*

RUN pip3 install PyMuPDF Pillow anthropic --break-system-packages

WORKDIR /app

COPY . .

RUN npm ci
RUN cd backend && npm ci
RUN cd frontend && npm ci && npm run build
RUN ls -la backend/public/ && echo "Frontend build verified"

EXPOSE 8080
ENV NODE_ENV=production
CMD ["node", "backend/server.js"]
