FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all project files
COPY . .

# Set environment variable with explicit integer value
ENV PORT 3000

# Validate PORT at runtime
RUN echo "if ! [[ \$PORT =~ ^[0-9]+$ ]] || [ \$PORT -lt 0 ] || [ \$PORT -gt 65535 ]; then echo 'PORT must be between 0 and 65535'; exit 1; fi" >> /docker-entrypoint.sh

# Expose port
EXPOSE 3000

# Modify CMD to use entrypoint script
CMD sh /docker-entrypoint.sh && npm start