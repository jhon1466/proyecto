## Especificación de gestos y acciones

El sistema usa **MediaPipe Gesture Recognizer**. Cada gesto se activa cuando el modelo reporta la categoría especificada con probabilidad alta; los valores se estabilizan con un latch temporal para evitar parpadeos.

| Gesto | Categorías (MediaPipe) | Acción principal | Notas |
| --- | --- | --- | --- |
| Puño | `Closed_Fist` | Agarrar y mover componente | Como agarrar un objeto físico |
| Mano abierta | `Open_Palm` | Soltar componente | Como soltar un objeto físico |
| Índice apuntando | `Pointing_Up` | Rotar componentes | El ángulo sigue el vector muñeca→punta índice |

## Máquina de estados (resumen)

- **Idle** → espera gesto de puño para agarrar.
- **Arrastrando** → puño activo; objeto sigue la palma mientras mantienes el puño.
- **Rotar** → transición desde Arrastrando al detectar puntero (índice extendido).
- **Soltar** → mano abierta suelta el componente; bloquea pieza en la mesa.

## Umbrales iniciales sugeridos

- `UMBRAL_PUNIO = 0.55` (probabilidad mínima para agarrar)
- `UMBRAL_MANO_ABIERTA = 0.55` (probabilidad mínima para soltar)
- `UMBRAL_PUNTERO = 0.45` (probabilidad mínima para rotar)

> Ajusta estos valores tras recopilar datos reales. Los latches temporales (3-5 frames) reducen ruido y falsos positivos.
