# Imagen base (LTS actual pero la fijamos)
FROM node:24.14.0

# Crear directorio de trabajo
WORKDIR /app

# Copiar package.json primero (optimiza cache)
COPY package*.json ./

# Instalar dependencias
RUN npm install

# Copiar el resto del código
COPY . .

# Exponer puerto
EXPOSE 3000

# Comando por defecto
CMD ["npm", "start"]