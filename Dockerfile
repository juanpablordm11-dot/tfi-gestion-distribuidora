# Imagen de producción (Railway u otro hosting con Docker). Sin dependencias: no hace falta npm install.
# La base de datos NO va en la imagen: vive en el volumen persistente montado en /data.
FROM node:24-slim
WORKDIR /app
COPY . .
ENV NODE_ENV=production HOST=0.0.0.0 TRUST_PROXY=1
EXPOSE 3000
CMD ["node", "--disable-warning=ExperimentalWarning", "server/index.js"]
