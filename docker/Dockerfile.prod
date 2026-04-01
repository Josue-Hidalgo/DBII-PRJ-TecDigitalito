FROM node:20

WORKDIR /app

COPY TecDigitalito/package*.json ./

RUN npm install

COPY TecDigitalito/ .

RUN npm run build

FROM nginx:alpine
COPY --from=0 /app/dist/TecDigitalito/browser /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
