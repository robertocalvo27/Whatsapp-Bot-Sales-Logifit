# Configuración de MongoDB con Docker

Este documento explica cómo configurar y utilizar MongoDB con Docker para el proyecto de WhatsApp Bot.

## Requisitos previos

- [Docker](https://www.docker.com/products/docker-desktop/) instalado en tu sistema
- [Docker Compose](https://docs.docker.com/compose/install/) instalado en tu sistema

## Iniciar MongoDB con Docker

1. Asegúrate de estar en la carpeta raíz del proyecto donde se encuentra el archivo `docker-compose.yml`.

2. Ejecuta el siguiente comando para iniciar el contenedor de MongoDB:

```bash
docker-compose up -d
```

El flag `-d` ejecuta el contenedor en modo "detached" (en segundo plano).

3. Para verificar que el contenedor está funcionando correctamente:

```bash
docker ps
```

Deberías ver un contenedor llamado `mongodb-whatsapp-bot` en la lista.

## Conexión a MongoDB

La aplicación ya está configurada para conectarse a MongoDB en `mongodb://localhost:27017/whatsapp-bot`, que es la URL de conexión por defecto en el archivo `.env`.

No es necesario cambiar nada en la configuración de la aplicación, ya que Docker está mapeando el puerto 27017 del contenedor al puerto 27017 de tu máquina local.

## Detener MongoDB

Para detener el contenedor de MongoDB:

```bash
docker-compose down
```

Si quieres eliminar también los volúmenes (esto borrará todos los datos almacenados):

```bash
docker-compose down -v
```

## Acceder a la base de datos directamente

Si necesitas acceder a la base de datos MongoDB directamente, puedes usar el cliente de MongoDB dentro del contenedor:

```bash
docker exec -it mongodb-whatsapp-bot mongosh
```

## Persistencia de datos

Los datos de MongoDB se almacenan en un volumen Docker llamado `mongodb_data`. Esto significa que los datos persistirán incluso si detienes o reinicias el contenedor.

## Solución de problemas

### El puerto 27017 ya está en uso

Si recibes un error indicando que el puerto 27017 ya está en uso, es posible que ya tengas MongoDB ejecutándose en tu sistema. Puedes:

1. Detener el servicio MongoDB local:
   - En macOS: `brew services stop mongodb-community`
   - En Linux: `sudo systemctl stop mongod`
   - En Windows: Detener el servicio "MongoDB Server" desde el Administrador de servicios

2. O cambiar el puerto en el archivo `docker-compose.yml`:
   ```yaml
   ports:
     - "27018:27017"  # Cambia 27017 a 27018 en el lado izquierdo
   ```
   
   Y luego actualiza la URL de conexión en el archivo `.env`:
   ```
   MONGODB_URI=mongodb://localhost:27018/whatsapp-bot
   ```

### Verificar logs del contenedor

Para ver los logs del contenedor de MongoDB:

```bash
docker logs mongodb-whatsapp-bot
``` 