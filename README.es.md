# ChatDuck

**Pausa o baja automáticamente tu música mientras usas el dictado por voz de ChatGPT.**

> **Beta experimental — v2.7.6-beta.1.** Esta versión no es estable. La instalación y actualización del MSI de Windows aún no se han verificado en una máquina de pruebas limpia, y la compatibilidad en otros equipos sigue en pruebas. El MSI no está firmado.

[**Instalar ChatDuck (userscript)**](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) · [English](README.md) · [Reportar un fallo](https://github.com/fevegit/chatduck/issues)

## Empezar — 2 pasos

1. Instala [Tampermonkey](https://www.tampermonkey.net/) para Firefox, Chrome o Edge (omite este paso si ya lo tienes).
2. [Instala ChatDuck](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) y confirma la instalación en Tampermonkey.

El Modo navegador está listo sin una aplicación de Windows, tokens, permisos de micrófono ni emparejamiento. Abre [ChatGPT](https://chatgpt.com/) y un reproductor web compatible en el **mismo navegador**. ChatDuck puede pausar la reproducción o bajar su volumen durante el dictado y restaurarlo al terminar.

Abre los ajustes desde **Tampermonkey → ChatGPT Audio Ducking → Open ChatDuck settings**. El nombre y el espacio de nombres heredados del userscript se conservan deliberadamente para actualizar instalaciones existentes sin crear duplicados. Tampermonkey guarda tus preferencias.

![Panel de ajustes de ChatDuck](docs/images/settings-panel.png)

## Modo navegador

El userscript controla directamente los reproductores web compatibles. No necesitas el agente de Windows para:

| Reproductor | Modo navegador |
| --- | --- |
| YouTube / YouTube Music | Compatible |
| Spotify Web | Compatible |
| Twitch | Compatible |
| Plex Web | Compatible; algunos servidores propios requieren permisos adicionales |

Puedes configurar Pausar o Ducking y el volumen objetivo por reproductor. El reproductor web debe estar abierto en el mismo navegador donde instalaste ChatDuck.

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

Consulta la [Release y descargas de v2.7.6-beta.1](https://github.com/fevegit/chatduck/releases/tag/v2.7.6-beta.1).

## Privacidad, desinstalación y apoyo

ChatDuck funciona localmente y no tiene telemetría, funciones de pago ni cuentas. El userscript no solicita acceso al micrófono. Para quitar la integración web, elimina **ChatGPT Audio Ducking** desde Tampermonkey. Desinstala el agente opcional desde Configuración de Windows → Aplicaciones. Más información en [Privacidad](docs/PRIVACY.md) y la [guía completa de desinstalación](docs/UNINSTALL.md).

ChatDuck es gratuito y de código abierto bajo la [licencia MIT](LICENSE). Donaciones voluntarias: [Ko-fi](https://ko-fi.com/fevee).
