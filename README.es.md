# ChatGPT Audio Ducking

Pausa o atenúa los reproductores seleccionados mientras dictas en ChatGPT. Audio Ducking funciona localmente en Tampermonkey. El agente opcional de Windows añade compatibilidad con reproductores de escritorio.

![Panel de configuración de Audio Ducking](docs/images/settings-panel.png)

## Instalación

1. Instala [Tampermonkey](https://www.tampermonkey.net/) en Firefox, Chrome o Edge.
2. Abre el [userscript de Audio Ducking](https://raw.githubusercontent.com/fevegit/audio-ducking/main/ChatGPT-Audio-Ducking.user.js) y confirma el aviso de instalación de Tampermonkey.
3. Abre ChatGPT y un reproductor compatible en el mismo navegador. Abre Audio Ducking desde el menú de Tampermonkey.

Las integraciones web compatibles funcionan sin el agente de Windows. No tienes que introducir tokens ni editar rutas locales. ChatGPT y el navegador gestionan el acceso al micrófono; Audio Ducking no solicita ese permiso.

### Agente opcional de Windows

Instala el [MSI del agente de Windows](https://github.com/fevegit/audio-ducking/releases/latest/download/Audio-Ducking-Windows-Agent-2.7.5-x64.msi) solo si quieres controlar Spotify u otro reproductor de escritorio seleccionado. La instalación es por usuario y no requiere privilegios de administrador. Después, abre **Audio Ducking Agent** desde el menú Inicio para emparejar el navegador. El agente no se descarga ni instala en segundo plano.

El agente solo se inicia con Windows si activas esa opción en la configuración de Audio Ducking. Controla las sesiones multimedia y el volumen por aplicación seleccionada. No graba el micrófono ni cambia el volumen maestro.

## Funciones

- Pausar o atenuar reproductores web compatibles durante el dictado de ChatGPT.
- Control opcional de Spotify de escritorio y aplicaciones multimedia seleccionadas.
- Reglas independientes, volumen objetivo, fades y selección por reproductor.
- Compatibilidad opcional con el origen de Plex Web y sitios personalizados.
- Panel en inglés y español.
- Sin analítica, telemetría, cuentas ni funciones de pago.

## Compatibilidad verificada

El propietario verificó manualmente Audio Ducking 2.7.4 con ChatGPT, Spotify Web y escritorio, YouTube, Plex Web y Plex para Windows en Ducking. Las capturas pertenecen a la auditoría visual en Firefox. Este candidato público 2.7.5 cambia el emparejamiento y el empaquetado del agente; las pruebas de instalación limpia y de cada navegador están pendientes y se enumeran en [Preparación de publicación](docs/release-readiness.md).

Consulta [Privacidad](docs/PRIVACY.md), [Permisos](docs/PERMISSIONS.md), [Seguridad del agente](docs/SECURITY.md) y la [Guía de desinstalación](docs/UNINSTALL.md).

Apoyo voluntario: [Ko-fi](https://ko-fi.com/fevee).
