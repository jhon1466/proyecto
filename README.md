## Laboratorio Gestual Interactivo

Prototipo educativo que usa gestos de manos para crear y manipular contenido visual en tiempo real. El módulo actual es una **Pizarra Gestual** donde los estudiantes dibujan con el dedo índice extendido, borran con puños y cambian colores con la mano abierta sobre una paleta virtual.

### Características principales
- Reconocimiento de gestos con MediaPipe Tasks (Gesture Recognizer).
- Máquina de estados que mapea pellizco/puño/mano abierta a acciones de dibujo.
- Visualización tipo Kinect con overlay de landmarks sobre el video en tiempo real.
- Pizarra digital con grid, paleta de colores y goma dinámica.
- Gestos sostenidos para acciones secundarias (cambiar color o limpiar la pizarra).
- Efectos visuales suaves para trazos, goma y puntero.

### Estructura
- `index.html`: landing + layout de la demo.
- `styles.css`: estilos ligeros para la UI.
- `src/app.js`: arranca la cámara, crea los detectores y coordina la simulación.
- `src/stateMachine.js`: máquina de estados y lógica de gestos→acciones.
- `src/sceneWhiteboard.js`: escena principal de la pizarra gestual.
- `docs/gestos.md`: especificación de gestos, umbrales y acciones.

### Cómo ejecutar
1. **Configura la GPU del navegador** (RTX 4060 u otra dedicada). Ver [docs/configurar-gpu-dedicada.md](docs/configurar-gpu-dedicada.md).
2. Instala dependencias opcionales de desarrollo: `npm install -D live-server`.
3. Levanta un servidor estático (ej. `npx live-server`).
4. Abre `http://127.0.0.1:8080`, concede acceso a la cámara y asegúrate de tener internet para descargar `gesture_recognizer.task`.
