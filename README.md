## Laboratorio Gestual Interactivo

Prototipo educativo que usa gestos de manos para controlar experimentos de física en tiempo real. El módulo actual es un **Lanzador de Física** donde los estudiantes lanzan objetos con gestos naturales (puño para agarrar, mano abierta para lanzar) y observan física realista con gravedad, rebotes y colisiones.

### Características principales
- Reconocimiento de gestos con MediaPipe Tasks (Gesture Recognizer).
- Máquina de estados para mapear gestos (puño para agarrar, mano abierta para lanzar) a acciones del juego.
- Visualización tipo Kinect con overlay de landmarks sobre el video en tiempo real.
- Sistema de física realista con gravedad, fricción, rebotes y colisiones.
- Objetivos interactivos que se destruyen al impactar.
- Efectos visuales: trails, gradientes y animaciones fluidas.

### Estructura
- `index.html`: landing + layout de la demo.
- `styles.css`: estilos ligeros para la UI.
- `src/app.js`: arranca la cámara, crea los detectores y coordina la simulación.
- `src/stateMachine.js`: máquina de estados y lógica de gestos→acciones.
- `src/scene.js`: lógica mínima del laboratorio (componentes, circuito, luces).
- `docs/gestos.md`: especificación de gestos, umbrales y acciones.

### Cómo ejecutar
1. **Configuración de GPU (Importante para laptops con GPU dedicada):**
   Si tienes una laptop con GPU dedicada (como RTX 4060), asegúrate de configurar el navegador para usar la GPU dedicada. Ver [docs/configurar-gpu-dedicada.md](docs/configurar-gpu-dedicada.md) para instrucciones detalladas.

2. Instala dependencias opcionales de desarrollo: `npm install -D live-server`.
3. Levanta un servidor estático (recomendado): `npx live-server`.
4. Abre `http://127.0.0.1:8080` (o el puerto configurado), concede acceso a la cámara y asegúrate de tener conexión a internet para descargar el modelo `gesture_recognizer.task`.

> Nota: puedes usar cualquier servidor estático; también funciona abriendo `index.html` directamente, aunque algunos navegadores bloquean cámaras en archivos locales. Si es el caso, usa `live-server` o `npx serve`.

### Próximos pasos sugeridos
- Añadir más tipos de objetos (bombas, imanes, resortes).
- Implementar niveles con diferentes objetivos y desafíos.
- Añadir sistema de partículas para explosiones más espectaculares.
- Guardar métricas por sesión y generar reportes PDF para las presentaciones.

