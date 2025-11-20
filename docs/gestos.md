## Especificación de gestos y acciones

El sistema usa **MediaPipe Gesture Recognizer** + validaciones geométricas. Cada gesto pasa por filtros temporales y suavizados para reducir falsos positivos.

| Gesto | Categorías (MediaPipe) | Acción en la pizarra | Notas |
| --- | --- | --- | --- |
| Índice apuntando | `Pointing_Up` + validaciones geométricas | Dibujar trazo continuo | Mantén el dedo extendido para dibujar; se suaviza la trayectoria |
| Puño | `Closed_Fist` | Activar goma / borrar | El radio de la goma crece para borrar rápido |
| Mano abierta | `Open_Palm` | Cambiar color o limpiar | Mano sobre la paleta por 250 ms cambia el color; mano abierta en el centro por 2 s limpia todo |
| Mano detectada (sin gesto específico) | `Presence` | Controlar el puntero | El puntero sigue la palma suavizada |

## Máquina de estados (resumen)

- **Idle** → gestos utilitarios (cambiar color / limpiar) y espera de acciones principales.
- **Drawing** → pellizco activo; se agregan puntos si hay movimiento significativo.
- **Erasing** → puño activo; se generan trazos con modo `destination-out`.
- Transiciones automáticas cuando se pierde cada gesto.

## Umbrales sugeridos

- `minHandDetectionConfidence = 0.5`
- `minHandPresenceConfidence = 0.5`
- `minTrackingConfidence = 0.5`
- Latches de 4–5 frames para pellizco/puño y 3 frames para mano abierta.

> Mantén buena iluminación y fondo contrastante para lograr punteros estables.
