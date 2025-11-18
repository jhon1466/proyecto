## Laboratorio Gestual Interactivo

Prototipo educativo que usa gestos de manos para controlar experimentos de ciencias dentro de un laboratorio virtual. El primer módulo se centra en circuitos eléctricos básicos: el estudiante arma un circuito moviendo componentes con gestos naturales (puño para agarrar, mano abierta para soltar).

### Características principales
- Reconocimiento de gestos con MediaPipe Tasks (Gesture Recognizer).
- Máquina de estados para mapear gestos (puño para agarrar, mano abierta para soltar, puntero para rotar) a acciones del laboratorio.
- Visualización tipo Kinect con overlay de landmarks sobre el video en tiempo real.
- Mesa 3D simplificada donde se arrastran componentes y se simula el flujo eléctrico.

### Estructura
- `index.html`: landing + layout de la demo.
- `styles.css`: estilos ligeros para la UI.
- `src/app.js`: arranca la cámara, crea los detectores y coordina la simulación.
- `src/stateMachine.js`: máquina de estados y lógica de gestos→acciones.
- `src/scene.js`: lógica mínima del laboratorio (componentes, circuito, luces).
- `docs/gestos.md`: especificación de gestos, umbrales y acciones.

### Cómo ejecutar
1. Instala dependencias opcionales de desarrollo: `npm install -D live-server`.
2. Levanta un servidor estático (recomendado): `npx live-server`.
3. Abre `http://127.0.0.1:8080` (o el puerto configurado), concede acceso a la cámara y asegúrate de tener conexión a internet para descargar el modelo `gesture_recognizer.task`.

> Nota: puedes usar cualquier servidor estático; también funciona abriendo `index.html` directamente, aunque algunos navegadores bloquean cámaras en archivos locales. Si es el caso, usa `live-server` o `npx serve`.

### Próximos pasos sugeridos
- Sustituir el renderizador 2D por Three.js o Unity WebGL.
- Añadir más módulos científicos (química, física, biología).
- Guardar métricas por sesión y generar reportes PDF para las presentaciones.

