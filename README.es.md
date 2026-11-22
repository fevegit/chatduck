# ChatDuck

> **ALPHA — v2.7.5-alpha.1.** Esta versión es experimental y busca pruebas y comentarios de la comunidad. La instalación limpia del agente Windows y la compatibilidad en otros equipos todavía no se han verificado por completo. Puede contener fallos.

**Atenuación de audio para la entrada de voz de ChatGPT.** ChatDuck pausa o reduce el volumen de los reproductores seleccionados mientras dictas. El userscript de Tampermonkey funciona localmente; el agente opcional de Windows añade compatibilidad con algunos reproductores de escritorio.

![Panel de configuración de ChatDuck](docs/images/settings-panel.png)

## Instalar el userscript

1. Instala [Tampermonkey](https://www.tampermonkey.net/) en Firefox, Chrome o Edge.
2. Abre el [userscript de ChatDuck](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) y confirma la instalación en Tampermonkey.
3. Abre ChatGPT y un reproductor compatible en el mismo navegador. Abre ChatDuck desde el menú de Tampermonkey.

Las integraciones web compatibles funcionan sin el agente de Windows. No hay que introducir tokens ni editar rutas locales. ChatGPT y el navegador gestionan el micrófono; ChatDuck no solicita permiso para usarlo.

## Agente opcional de Windows

Descarga el [instalador MSI del agente de Windows](https://github.com/fevegit/chatduck/releases/download/v2.7.5-alpha.1/ChatDuck-Windows-Agent-2.7.5-alpha.1-x64.msi) solo si quieres controlar Spotify u otro reproductor de escritorio seleccionado. La instalación es por usuario y no requiere privilegios de administrador. Ejecuta el instalador manualmente y luego abre **ChatDuck Agent** desde el menú Inicio para emparejar el navegador. Nunca se descarga ni se instala en segundo plano.

La instalación limpia y las actualizaciones del agente aún no se han probado en un Windows aislado. El MSI no está firmado. El inicio con Windows está desactivado hasta que se active en la configuración. El agente controla sesiones multimedia seleccionadas y el volumen por aplicación; no graba el micrófono ni modifica el volumen maestro.

## Funciones

- Pausa o atenúa reproductores web compatibles mientras ChatGPT está dictando.
- Control opcional de Spotify de escritorio y otros reproductores multimedia seleccionados en Windows.
- Reglas independientes de pausa y atenuación, volumen objetivo, fades y reproductores.
- Compatibilidad opcional con Plex Web y sitios personalizados.
- Panel de configuración en español e inglés.
- Sin analítica, telemetría, cuentas ni funciones de pago.

## Estado de compatibilidad

El propietario probó manualmente la versión anterior 2.7.4 con dictado de ChatGPT, Spotify Web y de escritorio, YouTube, Plex Web y Plex para Windows (Ducking). Eso no verifica el empaquetado de esta alpha, una instalación limpia de Windows, la actualización desde un agente anterior ni la compatibilidad en otros equipos. Consulta [preparación de publicación](docs/release-readiness.md) para ver las pruebas pendientes.

El userscript conserva el nombre y la identidad de actualización heredados que muestra Tampermonkey para actualizar instalaciones existentes sin crear otra entrada. El producto, el panel y el instalador nuevos usan la marca ChatDuck.

## Privacidad y permisos

ChatDuck no incluye analítica ni telemetría. El userscript no accede a las APIs del micrófono ni solicita ese permiso. El agente opcional se comunica por loopback local y guarda su token por instalación en los datos locales del usuario actual. Lee [Privacidad](docs/PRIVACY.md), [Permisos](docs/PERMISSIONS.md) y [Seguridad](docs/SECURITY.md) antes de activar funciones del agente.

## Desinstalación

- Elimina **ChatGPT Audio Ducking** del panel de Tampermonkey. Se conserva ese nombre heredado para mantener la compatibilidad de actualización.
- Si lo instalaste, desinstala **ChatDuck Windows Agent** desde Configuración de Windows → Aplicaciones → Aplicaciones instaladas.
- Consulta la [guía de desinstalación](docs/UNINSTALL.md).

## Comentarios y apoyo

Abre un [issue en GitHub](https://github.com/fevegit/chatduck/issues) con una plantilla. Antes de adjuntar diagnósticos, elimina nombres de usuario, tokens, rutas locales y logs sin revisar. El apoyo es voluntario mediante [Ko-fi](https://ko-fi.com/fevee).

## Licencia

ChatDuck se distribuye bajo la [licencia MIT](LICENSE). Copyright (c) 2026 ChatDuck contributors.
