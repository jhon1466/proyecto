# Optimización de GPU y Precisión de Gestos

## ¿Por qué no CUDA?

**CUDA no está disponible en navegadores web** porque:
- CUDA es una tecnología de NVIDIA para aplicaciones nativas (C/C++)
- Los navegadores web usan **WebGL** para aceleración por GPU
- MediaPipe en el navegador usa WebGL, que se ejecuta en la GPU pero a través de APIs web estándar

## Cómo MediaPipe usa la GPU

MediaPipe en el navegador usa **WebGL** para:
- Ejecutar operaciones de redes neuronales en la GPU
- Procesar imágenes y video más rápido
- Mejorar la precisión al permitir procesar más frames por segundo

## Optimizaciones Implementadas

### 1. Configuración de GPU (WebGL)

El código ahora:
- ✅ Detecta automáticamente si WebGL está disponible
- ✅ Verifica si estás usando GPU NVIDIA
- ✅ Usa umbrales más altos (0.5) cuando hay GPU para mejor precisión
- ✅ Procesa a 60fps en vez de 30fps cuando hay GPU disponible

### 2. Umbrales Optimizados

**Con GPU (WebGL):**
- `minHandDetectionConfidence: 0.5` - Más alto = menos falsos positivos
- `minHandPresenceConfidence: 0.5` - Mejor detección de presencia
- `minTrackingConfidence: 0.5` - Mejor seguimiento continuo

**Con CPU (fallback):**
- `minHandDetectionConfidence: 0.4` - Más bajo para compensar menor rendimiento
- `minHandPresenceConfidence: 0.4`
- `minTrackingConfidence: 0.4`

### 3. Procesamiento a Mayor FPS

Con GPU disponible:
- **60fps** de procesamiento de gestos (antes 30fps)
- **60fps** de reconocimiento de gestos (antes 30fps)
- Esto permite detectar cambios más rápidos y mejorar la precisión

### 4. HandLandmarker con GPU

El `HandLandmarker` ahora:
- Se inicializa con GPU (WebGL) por defecto
- Usa modelo `float16` para mejor rendimiento
- Tiene fallback a CPU si GPU no está disponible
- Proporciona landmarks más precisos para validación geométrica

## Verificar que estás usando GPU

1. Abre la consola del navegador (F12)
2. Busca estos mensajes:
   - `✅ Gesture Recognizer inicializado con GPU (WebGL) - Alta precisión`
   - `✅ Hand Landmarker inicializado con GPU (WebGL) - Alta precisión`
   - `✅ GPU NVIDIA detectada - WebGL acelerado disponible`

Si ves mensajes de CPU, verifica:
- Que el navegador esté usando la GPU dedicada (ver `docs/configurar-gpu-dedicada.md`)
- Que WebGL esté habilitado en el navegador
- Que los drivers de NVIDIA estén actualizados

## Mejoras de Precisión Adicionales

### 1. Validación Geométrica

El código usa validación geométrica adicional:
- Compara posiciones de dedos
- Valida ángulos y distancias
- Reduce falsos positivos

### 2. Filtros Temporales

- **Latches**: Requieren múltiples frames para confirmar gestos
- **Smoothing**: Suaviza las transiciones
- **Historial**: Valida consistencia temporal

### 3. Calibración Dinámica

- Mapea el rango real de movimiento de tu mano
- Permite que el cursor alcance todos los bordes de la pantalla
- Mejora la precisión del seguimiento

## Comparación: GPU vs CPU

| Característica | GPU (WebGL) | CPU |
|---------------|-------------|-----|
| FPS de procesamiento | 60fps | 30fps |
| Umbrales de confianza | 0.5 (más precisos) | 0.4 (más permisivos) |
| Precisión | Alta | Media |
| Latencia | Baja | Media |
| Falsos positivos | Menos | Más |

## Próximos Pasos para Mejor Precisión

1. **Asegúrate de usar GPU dedicada**: Ver `docs/configurar-gpu-dedicada.md`
2. **Buena iluminación**: Mejora la detección de la mano
3. **Fondo contrastante**: Facilita la segmentación
4. **Mantén la mano visible**: Evita salir del frame de la cámara
5. **Gestos claros**: Extiende bien los dedos para gestos como puntero

## Notas Técnicas

- WebGL usa la GPU a través de APIs estándar del navegador
- No hay acceso directo a CUDA desde JavaScript
- MediaPipe optimiza automáticamente las operaciones para WebGL
- El modelo `float16` es más rápido que `float32` con mínima pérdida de precisión

