# Radar Search

**Busca notas, texto, etiquetas, comandos y contenido web desde un solo lugar en Obsidian.**

[简体中文](../README.md) · [English](README.en.md) · [日本語](README.ja.md) · [한국어](README.ko.md) · [Español](README.es.md)

Abre una búsqueda flotante para una consulta rápida, conserva una página de búsqueda mientras exploras o inserta una barra en tu nota de inicio. No requiere Dataview ni plugins de iconos. Actualmente, los controles del plugin aparecen en chino; esta guía explica las etiquetas principales.

## Funciones

- Busca nombres de archivo, texto completo, etiquetas, propiedades, marcadores, enlaces internos y externos. Admite búsquedas en chino; pulsa un fragmento para abrir la coincidencia en la nota.
- Cambia de categoría en la barra superior, ordena los resultados y excluye una nota o cualquiera de sus carpetas superiores.
- Guarda filtros como preajustes reutilizables, con autocompletado de carpetas y ejemplos de reglas.
- Pasa de la búsqueda flotante a una página conservando la consulta, categoría, filtros y orden.
- Busca comandos y páginas web. Admite temas claros y oscuros; los resultados de página se desplazan dentro de su área y dejan espacio para los controles inferiores del móvil.

## Instalación

Requiere **Obsidian 1.7.2 o posterior**.

1. Descarga `main.js`, `manifest.json` y `styles.css` desde la [última versión](https://github.com/lmce72/radar-search/releases/latest).
2. Colócalos en `plugins/radar-search/` dentro de la carpeta de configuración de tu bóveda; normalmente, `.obsidian/plugins/radar-search/`.
3. Activa **Radar Search** en Ajustes → Plugins de la comunidad.

Para actualizar, sustituye esos tres archivos y desactiva y activa el plugin. Conserva `data.json` y `history/` para mantener tus ajustes e historial.

## Empieza a buscar

En la paleta de comandos, elige **打开浮动搜索框** (abrir búsqueda flotante) o **打开搜索页** (abrir página de búsqueda). Puedes asignar un atajo diferente a cada uno. El icono de la cinta abre la búsqueda flotante; Esc o un clic fuera la cierra. La página resulta útil para sesiones largas y teléfonos.

Selecciona el modo Vault, global o internet a la izquierda. Vault y global actualizan los resultados mientras escribes; Intro busca inmediatamente. En internet, Intro o el botón de búsqueda abre la URL del buscador. La cápsula **搜索选项** abre las opciones; su engranaje abre los ajustes del plugin.

Los nombres de categoría aparecen al pasar el puntero o enfocar con el teclado. En pantallas táctiles, pulsa el icono para cambiar de categoría. Las categorías vacías se desactivan. Si no hay ningún resultado, aparece “什么都木有”; el filtro sigue disponible para quitar restricciones.

### Insertar en una nota

Pega este bloque y utiliza la vista de lectura o la vista previa en vivo:

````markdown
```primecore-search
```
````

Puedes incluir varias barras en una nota. El antiguo script DataviewJS es una entrada independiente y no se actualiza con este plugin.

## Filtros y preajustes

El icono de exclusión de cada resultado permite excluir la nota o una carpeta superior. En la parte superior del menú, selecciona **临时过滤** (filtro temporal) o **写入预设** (guardar en preajuste). El filtro temporal solo afecta a la búsqueda actual. El filtro de la barra de resultados permite editar reglas; **保存为预设** abre una pantalla donde escribir el nombre antes de guardar.

| Ejemplo | Coincidencia |
| --- | --- |
| `Projects/Archive` | La carpeta y sus descendientes |
| `path:Projects/[notes]` | Una ruta literal, incluidos los corchetes |
| `glob:**/assets/**` | Carpetas assets a cualquier profundidad, incluida la raíz |
| `glob:**/{assets,attachments,附件}/**` | Varios nombres de carpeta de adjuntos |
| `regex:/\.(png|jpe?g|gif|webp|svg|pdf)$/i` | Imágenes y PDF sin distinguir mayúsculas |
| `exclude:path:Work/assets` | Exclusión forzada, también dentro de una lista de permitidos |

Escribe una regla por línea. `**/assets/**` es un patrón **glob**, no una expresión regular: `*` no atraviesa separadores de carpeta; `**` sí. La lista de bloqueo excluye coincidencias y la de permitidos conserva solo las coincidencias. Basta con coincidir con una regla de la lista. Las expresiones regulares necesitan el prefijo `regex:`. No se admite toda la sintaxis de búsqueda nativa de Obsidian. Las reglas inválidas se rechazan antes de guardar.

Los ajustes se editan en tablas y subpáginas, sin JSON. Pulsa **应用** (aplicar) después de editar un elemento y **保存修改** (guardar cambios) en la tabla principal. Volver sin aplicar no modifica ese elemento.

## Datos y privacidad

Los ajustes se guardan en `data.json`, el historial en `history/` y el índice de contenido en memoria. La primera búsqueda en una bóveda grande puede tardar; hay un comando para reconstruir el índice. El límite de días del historial solo cambia lo que se muestra, sin borrar archivos automáticamente.

No hay telemetría ni lectura de archivos fuera de la bóveda. **Los modos global e internet pueden enviar lo que escribes a las API de sugerencias de los buscadores activados.** Para evitarlo, desactiva esos motores o vacía sus URL de sugerencias. Ejecutar una búsqueda web abre la URL elegida. La vista web interna necesita Web viewer de Obsidian; si no está disponible, se utiliza el navegador externo.

## Ayuda

Si faltan resultados, revisa los orígenes activados, la categoría, los preajustes y los filtros temporales. Para problemas visuales, compara con el tema predeterminado. Informa en [Issues](https://github.com/lmce72/radar-search/issues) indicando versiones del plugin y Obsidian, dispositivo, tema, pasos y una captura sin datos privados.

## Desarrollo y contribuciones

Código TypeScript y herramientas de compilación Bun 1.3+. Obsidian proporciona la API de ejecución.

```sh
bun install --frozen-lockfile
bun run check
bun test --timeout 5000
bun run build
```

Los archivos se generan en `dist/`. La interfaz, búsqueda/índice, ajustes e historial están en `src/ui/`, `src/search/`, `src/settings/` y `src/history/`. Comprueba las vistas flotante y de página y los bloques reales en lectura/vista previa en una bóveda de pruebas independiente. Verificar el diseño no sustituye las pruebas táctiles en dispositivos reales.

Consulta las reglas en [AGENT.MD](../AGENT.MD). Las etiquetas y títulos de Release deben contener únicamente la versión exacta del manifest, por ejemplo `1.3.5`, sin prefijo `v`. Ejecuta `bun run release:check <version>` y publica solo los tres archivos del plugin, nunca datos personales.
