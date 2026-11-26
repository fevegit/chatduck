# Desarrollo y estructura

## Fuente de verdad

- `src/` contiene los módulos fuente del userscript.
- `agent/` contiene el agente Windows, coordinación multimedia y recursos del producto.
- `tests/` contiene las pruebas fuente del producto y sus fixtures.
- `ChatGPT-Audio-Ducking.user.js` es el bundle de distribución versionado que enlazan los README y que utiliza el empaquetado actual. No editarlo a mano.
- El código fuente correspondiente a ChatDuck 2.8.8-rc.1 queda fijado por el commit local de restauración. No se le asigna una correspondencia Git con versiones alpha anteriores.

## Construcción

`scripts/build-public.ps1` ensambla el userscript. `scripts/build-installer.ps1` es el punto de entrada autoritativo para generar el userscript y el MSI per-user framework-dependent coherentes; escribe solo el paquete en `out/` y reserva `out/.work/` para intermedios. El bundle versionado de la raíz sigue siendo el archivo de distribución que consumen los enlaces públicos.

Los scripts de construcción y migración histórica no forman parte del flujo normal. Se conservan los archivos fuente ya versionados; los generadores de candidatos y las automatizaciones QA/migración sin seguimiento se excluyen de este punto de restauración.

## Instalación

El flujo activo es un único MSI per-user, framework-dependent y sin bootstrapper. El MSI comprueba .NET 10 Desktop Runtime antes de modificar el sistema, mantiene Run bajo HKCU, detiene ordenadamente el agente anterior y solo completa si el nuevo proceso responde por protocolo autenticado con versión y ruta coincidentes. Las preferencias y el emparejamiento están en `%LOCALAPPDATA%\ChatDuck`, separados de binarios.

La detección/migración de antiguas instalaciones per-user o per-machine debe ser una operación excepcional e independiente del MSI normal. No se incluye en el actualizador habitual; si un proceso legado conserva el mutex global de instancia, la verificación de salud falla y MSI revierte en vez de declarar éxito.

## Referencias locales preservadas

La copia estable `2.8.3-rc.1`, el paquete de referencia alpha.6 y la instantánea verificable del estado fuente están fuera del árbol de trabajo, en el archivo privado de consolidación de ChatDuck. Alpha.6 se conserva como artefacto, sin atribuirle un commit o una correspondencia exacta con el estado fuente actual.
