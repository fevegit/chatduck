# Candidato experimental del instalador de Windows

Rama: `experimental/v2.8.0-universal-discord`. Candidato local: `2.8.0-alpha.8`.

## Causa del fallo anterior

El registro de Windows Installer del intento cancelado confirma `Error 1310` al sustituir `ChatGPTAudioDuckingAgent.exe`: seguía abierto por el agente estable (PID 17824). MSI finalizó con `1603` tras unos 2 min 37 s; no había una descarga ni una instalación del runtime en curso. La actualización no sustituyó el ejecutable ni modificó las preferencias estables.

## Cambios del instalador

- Antes de actualizar o desinstalar, el MSI solicita el cierre normal al proceso cuyo ejecutable corresponde a esa instalación y espera hasta 10 s. Nunca fuerza su terminación.
- Si la actualización falla, la acción de rollback vuelve a iniciar el ejecutable restaurado. Si se instala correctamente, el MSI inicia el agente nuevo; una instalación limpia también lo inicia.
- Los upgrades conservan preferencias y token. Para volver a una versión anterior, desinstalar el candidato con `CHATDUCK_KEEP_DATA=1` evita borrar los datos, y después instalar el MSI anterior. Una desinstalación normal sigue eliminando los datos como antes.
- El MSI framework-dependent comprueba .NET 10 Desktop x64 en las ubicaciones de usuario y equipo; informa cómo instalarlo si falta y no descarga dependencias. El self-contained no necesita runtime externo.
- La UI usa `WixUI_Minimal` y la interfaz estándar de progreso/acciones de MSI. La medición visual de la barra en instalación interactiva queda pendiente.
- El icono vectorial y el ICO multirresolución se incluyen en EXE, MSI y acceso directo. El agente no tenía icono ni ventana de bandeja: no se añadió una interfaz de bandeja nueva en esta reparación.

## Resultados medidos en esta máquina

| Caso | Resultado |
| --- | ---: |
| MSI descargado anterior | 31,66 MiB |
| Candidato framework-dependent | 5,62 MiB (agente publicado: 25,8 MiB) |
| Candidato self-contained | 53,82 MiB (agente publicado: 158,93 MiB) |
| Instalación limpia QA previa | 1,4 s |
| Upgrade QA con proceso abierto, binario nuevo sustituido y reinicio | 5,79 s |
| Instalación limpia final QA, runtime detectado y agente iniciado | 1,95 s |
| Rollback inducido, resultado MSI 1603 previsto | alrededor de 7 s |
| Desinstalación QA conservando datos y deteniendo el agente | 4,17 s |

Son tiempos de MSI silencioso local; no representan una medición de instalación interactiva ni otros equipos. En la prueba de upgrade correcta, el FileVersion cambió de `2.8.0.0` a `2.8.3.0`, el PID QA cambió de 3428 a 24648 y el archivo de configuración siguió existiendo. La instalación limpia creó el agente QA y su proceso. La desinstalación con retención detuvo ese proceso, quitó el ejecutable del producto QA y dejó los datos y el proceso estable intactos. La prueba de rollback volvió a `2.8.0.0`, restableció el agente QA y dejó el agente estable sin cambios.

## Instalación y recuperación manual

Instalación recomendada en este equipo (ya tiene .NET 10 Desktop Runtime x64):

```powershell
msiexec /i ".\ChatDuck-Windows-Agent-2.8.0-alpha.8-framework-dependent-x64.msi" /L*V! "$env:TEMP\ChatDuck-install.log"
```

Elige el paquete self-contained si prefieres no depender del runtime .NET instalado. Para recuperar la versión anterior conservando preferencias y token:

```powershell
msiexec /x ".\ChatDuck-Windows-Agent-2.8.0-alpha.8-framework-dependent-x64.msi" CHATDUCK_KEEP_DATA=1 /L*V! "$env:TEMP\ChatDuck-rollback-remove.log"
msiexec /i ".\ChatDuck-Windows-Agent-2.7.6-beta.1-x64.msi" /L*V! "$env:TEMP\ChatDuck-rollback-install.log"
```

La segunda línea requiere tener el MSI anterior. No ejecutar `/x` sin `CHATDUCK_KEEP_DATA=1` si se quiere conservar el token y las preferencias.

## Pendiente de validación manual

- Instalar el candidato estable desde el perfil habitual y revisar la barra y textos del instalador.
- Emparejar Brave con el agente actualizado si aparece desconectado. La autorización está ligada al perfil de userscript; cambiar de navegador requiere emparejar ese perfil una vez.
- Probar Spotify Desktop en modo Ducking y Pause, observando reproducción, restauración y ajustes manuales de volumen. No se accionó Spotify ni Discord durante esta fase.
- El rollback se ensayó con un fallo inducido en producto QA aislado. No se probó cancelar manualmente el cuadro de progreso.
