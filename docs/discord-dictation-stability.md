# Discord: ciclo de mute y deafen

## Diagnóstico observado

El registro existente del agente 2.8.4-alpha.2 contiene esta secuencia:

| Hora local | Evento |
| --- | --- |
| 19:54:55.771 | `begin`: UI Automation no confirmó el cambio de ensordecimiento |
| 19:54:56.207 | `apply-failed-rolled-back` |
| 19:54:57.971 | Restauración posterior con motivo reducido a `dictation-ended` |
| 19:55:00.555 | Otro `begin` sin confirmación de deafen |
| 19:55:00.891 | La restauración UIA encontró `ElementNotAvailableException` |
| 19:55:00.892 | `apply-failed-restore-pending` |

El agente antiguo no registraba las órdenes recibidas, el estado anterior/posterior ni la razón real de fin. Por ello el archivo no permite atribuir con certeza cada restauración a un `end` duplicado o temprano. Sí prueba que, ante una confirmación UIA fallida, el controlador intentaba revertir inmediatamente la acción y la clasificaba como rollback completado. Ese camino produce exactamente un ciclo de activar/desactivar si Discord aceptó el toggle pero UI Automation no pudo observarlo a tiempo.

## Correcciones

- Una invocación UIA seguida de estado no confirmado se guarda como resultado incierto. No se pulsa el control en sentido contrario durante `begin`; se vuelve a leer el estado al finalizar y se restaura solo si coincide con lo aplicado por ChatDuck.
- La restauración incierta tampoco reenvía toggles. El agente conserva la instantánea y solo observa el estado hasta confirmar la restauración; las lecturas quedan limitadas a una cada dos segundos.
- Deafen se confirma junto al mute que implica. Si la pareja no queda observable, ChatDuck no emite una segunda pulsación de Mute.
- La identidad de llamada deja de incluir los runtime IDs de los botones de audio, que Discord puede reemplazar durante un render. Se conserva la identidad de ventana y del indicador accesible de llamada.
- Se vuelve a enlazar el observador UIA después de cambios de interfaz. Los cambios manuales permanecen separados de las notificaciones generadas por la propia acción de ChatDuck.
- El detector de fin exige 250 ms de estado inactivo en vez de 32 ms; un stop sin sesión asociada y un stop obsoleto ya no pueden ejecutar `restore-all` sobre otra sesión.
- El registro nuevo anota en orden las órdenes `begin`/`restore`, sesión y motivo, preferencias booleanas, estado de mute/deafen leído, invocación UIA, confirmaciones, resultado incierto y restauración. No registra etiquetas ni contenido de la llamada.

## Límites de validación

Las pruebas del controlador usan una interfaz Discord simulada: comprueban mute aislado, deafen, ambas opciones, acciones inciertas, concurrencia, cambios manuales, reinicio del agente y restauraciones duplicadas. No se consultó ni manipuló la sesión personal de Discord. Por esa restricción no se verificaron en vivo el árbol UIA de la compilación actual, la llamada activa ni el comportamiento minimizado/segundo plano; el nuevo log sirve para diagnosticar la próxima ejecución autorizada sin aceptar silenciosamente una llamada UIA no confirmada.
