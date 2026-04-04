# Proyecto de Bases de Datos II - TecDigitalito
Este es un proyecto en el que se hace una red social de usuarios que pueden publicar sus cursos y aplicar a cursos de amigos u otros usuarios. 


## Autores

- [@Josue-Hidalgo](https://www.github.com/Josue-Hidalgo)


<img width="1536" height="1024" alt="Logo" src="https://github.com/user-attachments/assets/dc419661-84d0-49bb-b74d-14910697099a" />

## Instalación

### Instalar Docker (Desktop) en su Máquina
- [Instalar Docker Engine](https://docs.docker.com/engine/install/)

### Desarrollo

Iniciar el proyecto en modo desarrollo
```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
```

Ver logs en tiempo real
```bash
docker-compose -f docker-compose.dev.yml logs -f backend
docker-compose -f docker-compose.dev.yml logs -f frontend
```

Detener y borrar todo
```bash
docker-compose -f docker-compose.dev.yml down
```

Reconstruir solo un servicio
```bash
docker-compose -f docker-compose.dev.yml up --build backend
```

Entrar a un contenedor para debug
```bash
docker-compose -f docker-compose.dev.yml exec backend sh
docker-compose -f docker-compose.dev.yml exec frontend sh
```

### Producción

Iniciar el proyecto en modo producción
```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

## Documentación

 - [Documentación Externa](https://drive.google.com/drive/folders/191Fu_unpxx2SRVF8wXk4hV6b3Rpnpd-g?usp=sharing)
