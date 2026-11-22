# ChatDuck

**Pausa o baja automáticamente tu música mientras usas el dictado por voz de ChatGPT.**

Para YouTube, YouTube Music, Spotify Web, Twitch o Plex Web **no necesitas instalar programas en Windows**: solo Tampermonkey y ChatDuck.

**También para aplicaciones de escritorio (opcional):** el agente Windows permite controlar **aplicaciones compatibles seleccionadas por el usuario**, incluso añadiendo un archivo `.exe` local desde los ajustes. Puedes elegir Pausar o Ducking para cada una. Se han probado versiones anteriores con Spotify Desktop y Plex para Windows. **No hay compatibilidad universal:** para atenuar hace falta una sesión de audio accesible en Windows y, para pausar realmente, controles multimedia compatibles. Algunas aplicaciones se excluyen por seguridad.

> **Alpha experimental — v2.7.5-alpha.2.** ChatDuck sigue en pruebas. Lee las [limitaciones](#estado-de-la-alpha) antes de usarlo como herramienta habitual.

[**Instalar ChatDuck (userscript)**](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js) · [English](README.md) · [Reportar un fallo](https://github.com/fevegit/chatduck/issues)

## Empezar — 2 pasos

1. **Instala [Tampermonkey](https://www.tampermonkey.net/)** en Firefox, Chrome o Edge (sáltate este paso si ya lo tienes).
2. **[Instala ChatDuck](https://raw.githubusercontent.com/fevegit/chatduck/main/ChatGPT-Audio-Ducking.user.js)** y confirma la instalación en Tampermonkey.

**Listo para los reproductores web compatibles.** Abre [ChatGPT](https://chatgpt.com/) y la web de música o vídeo en el **mismo navegador** y empieza a dictar. ChatDuck puede pausar la reproducción o bajar el volumen y restaurarlo al terminar.

Para ajustar el comportamiento, abre **Tampermonkey → ChatGPT Audio Ducking → Open ChatDuck settings**. *«ChatGPT Audio Ducking» es el nombre heredado que conserva Tampermonkey para evitar instalaciones duplicadas al actualizar.*

![Panel de ajustes de ChatDuck](docs/images/settings-panel.png)

## ¿Qué funciona sin programas de Windows?

| Reproductor | ¿Necesita aplicación de Windows? |
| --- | --- |
| YouTube / YouTube Music (web) | **No** |
| Spotify Web | **No** |
| Twitch (web) | **No** |
| Plex Web | **No** (algunos servidores propios requieren permisos adicionales) |
| Spotify de escritorio / Plex para Windows | **Sí, el agente opcional** |

Puedes configurar por separado Pausar o Ducking y el volumen para cada reproductor. El comportamiento puede variar según navegador o reproductor; si falla algo, repórtalo durante la alpha.

<details>
<summary><strong>Avanzado: controlar aplicaciones de escritorio de Windows (opcional)</strong></summary>

Si utilizas Spotify **de escritorio**, Plex **para Windows** u otro reproductor de escritorio compatible, Tampermonkey por sí solo no puede controlar directamente esas aplicaciones. Instala el agente de Windows **solo si necesitas esa función**.

**No se limita a Spotify y Plex:** después del emparejamiento, abre **Ajustes de ChatDuck → Advanced → Windows apps** (o sus equivalentes en español). Puedes seleccionar aplicaciones detectadas o añadir la ruta de un `.exe` local, activar o desactivar cada aplicación y elegir **Pause** o **Ducking** (y volumen propio) para cada una. El agente controla únicamente las sesiones multimedia/de audio seleccionadas y compatibles; no tiene acceso universal a las funciones de cualquier programa. **No todos los ejecutables funcionarán:** para bajar el volumen hace falta una sesión de audio accesible para Windows y, para pausar/reanudar de verdad, controles multimedia compatibles. Si no se puede pausar, puede aplicarse una alternativa de reducción de volumen según la configuración. Algunas aplicaciones protegidas (incluidos navegadores y aplicaciones de comunicación) están excluidas deliberadamente. El autor probó versiones anteriores con Spotify de escritorio y Plex para Windows; los demás ejecutables siguen sin verificar y agradecemos informes en Issues.

1. Descarga el [agente opcional ChatDuck Windows Agent (v2.7.5-alpha.1)](https://github.com/fevegit/chatduck/releases/download/v2.7.5-alpha.1/ChatDuck-Windows-Agent-2.7.5-alpha.1-x64.msi). Alpha.2 solo actualiza el userscript; este MSI sigue siendo el agente alpha.1.
2. Ejecútalo y abre **ChatDuck Agent** desde el menú Inicio de Windows.
3. Sigue las instrucciones de emparejamiento para conectar el navegador con el agente local.

**Aviso de alpha:** el MSI no está firmado, puede provocar avisos de seguridad de Windows y todavía no se ha probado en una instalación limpia de Windows. Instálalo solo si aceptas esas limitaciones. Para una instalación normal no hacen falta PowerShell, tokens escritos manualmente ni rutas personalizadas. El inicio con Windows está desactivado inicialmente.

Consulta la [seguridad del agente](docs/SECURITY.md), los [permisos](docs/PERMISSIONS.md) y la [desinstalación](docs/UNINSTALL.md) para más detalles.

</details>

## Estado de la alpha

- El creador probó manualmente la versión anterior 2.7.4 con ChatGPT, Spotify Web y de escritorio, YouTube, Plex Web y Plex para Windows.
- **Esta alpha pública todavía no está totalmente validada** en instalaciones limpias de Windows, actualizaciones del agente, emparejamiento o grabación real de ChatGPT en otros equipos.
- Es software experimental. Puedes [reportar fallos](https://github.com/fevegit/chatduck/issues) indicando navegador, versión de Windows cuando corresponda, reproductor y pasos para reproducirlos. No adjuntes códigos de emparejamiento, tokens, rutas personales ni logs sin revisar.

Consulta la [Release y descargas de v2.7.5-alpha.2](https://github.com/fevegit/chatduck/releases/tag/v2.7.5-alpha.2) y las [pruebas pendientes](docs/release-readiness.md).

## Privacidad, desinstalación y apoyo

ChatDuck funciona localmente y no tiene telemetría, funciones de pago ni cuentas. El userscript no solicita acceso al micrófono. Para quitar la integración web, elimina **ChatGPT Audio Ducking** desde Tampermonkey. El agente opcional se desinstala aparte desde Configuración de Windows → Aplicaciones. Más información en [Privacidad](docs/PRIVACY.md) y la [guía de desinstalación](docs/UNINSTALL.md).

ChatDuck es gratuito y de código abierto bajo la [licencia MIT](LICENSE). Donaciones voluntarias: [Ko-fi](https://ko-fi.com/fevee).
