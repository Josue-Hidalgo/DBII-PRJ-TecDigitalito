FROM node:24.14.0-alpine AS base
WORKDIR /app

FROM base AS frontend-dev
COPY Frontend/package*.json ./
RUN npm ci
RUN npm install -g @angular/cli
COPY Frontend/ .
EXPOSE 4200
CMD ["ng", "serve", "--host", "0.0.0.0"]

FROM base AS frontend-build
COPY Frontend/package*.json ./
RUN npm ci --only=production
COPY Frontend/ .
RUN npm run build

FROM nginx:alpine AS frontend-prod
COPY --from=frontend-build /app/dist/Frontend/browser /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

FROM node:24.14.0-alpine AS backend
COPY package*.json ./
RUN npm ci
COPY . .
EXPOSE 3000
CMD ["npm", "start"]
