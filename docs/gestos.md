## Especificación de gestos y acciones

El sistema usa **MediaPipe Gesture Recognizer**. Cada gesto se activa cuando el modelo reporta la categoría especificada con probabilidad alta; los valores se estabilizan con un latch temporal para evitar parpadeos.

| Gesto | Categorías (MediaPipe) | Acción principal | Notas |
| --- | --- | --- | --- |
| Mano abierta | `Open_Palm` | Seleccionar y arrastrar componente | Se eleva el objeto tomado 2 cm virtuales |
| Puño | `Closed_Fist` | Soltar componente | Valida conexiones al soltar |
| Índice apuntando | `Pointing_Up` | Rotar componentes | El ángulo sigue el vector muñeca→punta índice |
| Guiño ojo derecho | Face Landmarker: ratio apertura OD/OI < 0.35 durante 150 ms | Alternar interruptor | Evitar falsos positivos cuando ambos ojos se cierran |
| Sonrisa | Face Landmarker: distancia horizontal comisuras / vertical labios > 1.8 | Ejecutar simulación | También confirma montajes |
| Ceño | Face Landmarker: ángulo ceja-ojo < 165° sostenido 3 s | Mostrar pista contextual | Se resetea tras aceptar explicación |

## Máquina de estados (resumen)

- **Idle** → espera cualquier gesto válido.
- **Arrastrando** → mano abierta activa; objeto sigue la palma.
- **Rotar** → transición desde Arrastrando al detectar puntero.
- **Soltar** → puño cierra; bloquea pieza en la mesa.
- **Evaluar** → sonrisa dispara verificación y animación.
- **Asistencia** → ceño prolongado muestra pista; regresa a estado previo tras aceptar.

## Umbrales iniciales sugeridos

- `UMBRAL_MANO_ABIERTA = 0.65`
- `UMBRAL_PUNIO = 0.35`
- `UMBRAL_PUNTERO = 0.8` (longitud índice / promedio dedos)
- `UMBRAL_GUINIO = 0.35`
- `UMBRAL_SONRISA = 1.8`
- `UMBRAL_CENO = 165°`

> Ajusta estos valores tras recopilar datos reales. Añade filtros temporales (ventanas de 5 frames) para reducir ruido.

