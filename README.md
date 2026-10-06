# Otrora

*Lo que las palabras fueron otrora.*

Juego diario para móvil: cada día, tres palabras del español con su sentido actual. Hay que adivinar qué significaban antaño entre cuatro opciones. Es una PWA hecha con HTML, CSS y JavaScript, sin dependencias ni compilación.

## Estructura

```
index.html          Pantallas de inicio, juego y final
css/estilos.css     Estilos (paleta, modo oscuro, transiciones)
js/app.js           Lógica del juego, calendario, estadísticas y compartir
data/palabras.json  Contenido: 3 palabras por día
manifest.json       Manifiesto de la PWA
sw.js               Service worker (juego sin conexión)
icons/              Logo e iconos
.nojekyll           Hace que GitHub Pages sirva los archivos tal cual
```

## Configuración

- **Fecha de inicio**: la constante `FECHA_INICIO` de `js/app.js` es el «Día 1». El día cambia a medianoche, hora de Madrid.
- **Contenido**: cada entrada de `data/palabras.json` tiene `dia`, `orden`, `palabra`, `hoy`, `otrora`, `distractores` (3), `explicacion`, `epoca` y `fuente`. Cuando se acaban los días con contenido, el ciclo vuelve a empezar. Hay 38 días: el último es el 10 de noviembre de 2026 y el 11 vuelve el día 1. Para ampliar el juego, basta con añadir días.
- **Modo prueba**: `?dia=5` en la URL carga el día 5. Se juega en memoria, no altera las estadísticas y se puede repetir.

## Almanaque

Otrora forma parte de [Almanaque](https://joseleking.github.io/Almanaque/). `volver-almanaque.js` es una copia del de Almanaque (`para-los-juegos/`): si se entra desde allí, muestra la franja «☜ Regresar al Almanaque» y el botón de volver de la pantalla final. Al terminar la partida del día, `js/app.js` llama a `window.almanaqueHecho({ aciertos, total, racha })` para que la hoja salga como «Hecho» con el resultado. En modo prueba no avisa.

## Probar en local

El service worker y `fetch` necesitan un servidor; abrir `index.html` con doble clic no basta.

```sh
python3 -m http.server 8000
```

Después, abre <http://localhost:8000/> o <http://localhost:8000/?dia=3>.

## Publicar en GitHub Pages

1. Sube el repositorio a GitHub con estos archivos en la raíz de `main`.
2. En **Settings → Pages**, elige **Deploy from a branch**, rama `main` y carpeta `/ (root)`.
3. Al cabo de un minuto estará en `https://<usuario>.github.io/<repositorio>/`.

Todas las rutas son relativas, así que funciona dentro de esa subruta. Si cambias la lista de archivos que cachea `sw.js`, sube su `VERSION`. Los cambios de contenido llegan solos, porque el service worker pide primero a la red.
