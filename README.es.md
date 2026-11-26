# ChatDuck

**Controla la reproducción web mientras dictas a ChatGPT.**

> **Rama experimental — v2.8.4-alpha.1.** No publicada. Han cambiado los permisos del userscript y el motor multimedia universal. Una opción de Windows desactivada por defecto puede silenciar el micrófono de Discord durante el dictado; aún requiere validación aislada con Discord minimizado.

[**Instalar ChatDuck (userscript)**](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) · [English](README.md) · [Reportar un fallo](https://github.com/fevegit/chatduck/issues)

## Empezar — 2 pasos

1. Instala [Tampermonkey](https://www.tampermonkey.net/) para Firefox, Chrome o Edge (omite este paso si ya lo tienes).
2. [Instala ChatDuck](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) y confirma la instalación en Tampermonkey.

El Modo navegador funciona sin aplicación de Windows, token, permiso de micrófono ni emparejamiento. Las instalaciones nuevas empiezan con Ducking; Control web universal gestiona audio y vídeo HTML5 compatibles en páginas HTTP y HTTPS del mismo navegador. Se conserva el modo guardado en instalaciones existentes. Excluye ChatGPT y las aplicaciones de comunicación de forma predeterminada. Pausa o Ducking y el volumen son globales, con reglas por sitio y exclusiones de dominios.

Abre los ajustes desde **Tampermonkey → ChatGPT Audio Ducking → Open ChatDuck settings**. El nombre y el espacio de nombres heredados del userscript se conservan deliberadamente para actualizar instalaciones existentes sin crear duplicados. Tampermonkey guarda tus preferencias.

![Panel de ajustes de ChatDuck](docs/images/settings-panel.png)

## Modo navegador

El userscript controla directamente medios HTML5 estándar. No necesitas el agente de Windows para:

| Reproductor | Modo navegador |
| --- | --- |
| Sitios conocidos o desconocidos | Controla elementos HTMLMediaElement con volumen modificable, salvo dominios excluidos |
| Iframes del mismo dominio y de otros | Cada iframe ejecuta su propio controlador aislado |
| Shadow DOM abierto | Se analiza al inicio y cuando se añade su elemento anfitrión |

Los Shadow DOM cerrados y los reproductores que no exponen medios HTML controlables aún no son compatibles. Una alternativa optativa de Tampermonkey puede silenciar una pestaña que use solo Web Audio, pero silencia toda la pestaña en vez de atenuar y aún no se ha verificado en LibreWolf. No se intercepta Web Audio ni se modifican APIs globales. Falta probar reproducción real en los servicios.

Incidencia externa conocida: [Brave/Chromium y ChromeWideEchoCancellation](docs/known-issues/chromium-wide-echo-cancellation.md). ChatDuck no cambia esta función automáticamente.

## Agente opcional de Windows

El agente hace falta para Spotify de escritorio, Plex para Windows u otro reproductor de escritorio compatible. El Modo navegador sigue funcionando sin él.

1. Descarga el [MSI ChatDuck Windows Agent 2.7.6-beta.1](https://github.com/fevegit/chatduck/releases/download/v2.7.6-beta.1/ChatDuck-Windows-Agent-2.7.6-beta.1-x64.msi).
2. Instálalo y abre **ChatDuck Agent** desde el menú Inicio de Windows.
3. Sigue las instrucciones de emparejamiento que muestra el agente.

Después de emparejarlo, abre **Ajustes de ChatDuck → Advanced → Windows apps** para seleccionar aplicaciones detectadas o añadir un `.exe` local, activar o desactivar cada una y configurar Pausar o Ducking y el volumen por aplicación. El agente controla sesiones multimedia o de audio compatibles seleccionadas; no controla cualquier función de una aplicación. **Ducking** necesita una sesión de audio de Windows accesible; **Pausar** de verdad necesita controles multimedia compatibles. Si no se puede pausar, puede aplicarse una alternativa de reducción de volumen según la configuración. Las aplicaciones protegidas, incluidos navegadores y herramientas de comunicación, están excluidas deliberadamente. El creador probó versiones anteriores con Spotify de escritorio y Plex para Windows; los demás ejecutables personalizados no se han verificado.

La restauración del volumen depende de que la sesión de audio siga disponible y su estado pueda recuperarse. El MSI no está firmado y puede mostrar una advertencia de seguridad de Windows. La instalación limpia, actualización, reinicio, desinstalación, emparejamiento y compatibilidad en otros equipos aún no se han verificado para esta beta. El instalador es por usuario, no necesita permisos de administrador y no activa el inicio con Windows de forma predeterminada.

Consulta la [seguridad del agente](docs/SECURITY.md), los [permisos](docs/PERMISSIONS.md) y la [desinstalación](docs/UNINSTALL.md).

## Estado de la beta

- El creador probó manualmente la versión anterior 2.7.4 con ChatGPT, Spotify Web y de escritorio, YouTube, Plex Web y Plex para Windows (Ducking). Esto no significa que la beta actual se haya verificado en otros equipos.
- Las comprobaciones de esta beta y el trabajo pendiente están en [preparación de la Release](docs/release-readiness.md).
- Para reportar un fallo, indica navegador, versión de Windows cuando corresponda, reproductor y pasos para reproducirlo. No incluyas códigos de emparejamiento, tokens, rutas personales ni logs sin revisar.

El código experimental del controlador de Discord permanece aislado de la interfaz de producto y de las órdenes normales al agente. No lo uses en una llamada real hasta validar la ventana minimizada y la recuperación en una llamada controlada y autorizada. No se usa SendInput para el audio de Discord.

## Privacidad, desinstalación y apoyo

ChatDuck funciona localmente y no tiene telemetría, funciones de pago ni cuentas. El userscript no solicita acceso al micrófono. Para quitar la integración web, elimina **ChatGPT Audio Ducking** desde Tampermonkey. Desinstala el agente opcional desde Configuración de Windows → Aplicaciones. Más información en [Privacidad](docs/PRIVACY.md) y la [guía completa de desinstalación](docs/UNINSTALL.md).

ChatDuck es gratuito y de código abierto bajo la [licencia MIT](LICENSE). Donaciones voluntarias: [Ko-fi](https://ko-fi.com/fevee).
