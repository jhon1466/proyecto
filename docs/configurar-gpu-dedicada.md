# Configurar GPU Dedicada (RTX 4060) para el Navegador

Si tienes una laptop con GPU dedicada (como RTX 4060) y GPU integrada, el navegador puede estar usando la GPU integrada en vez de la dedicada. Esto puede afectar el rendimiento de MediaPipe y la detección de gestos.

## Solución: Forzar el uso de la GPU dedicada

### Opción 1: Configuración de Windows (Recomendado)

1. **Abrir Configuración de Gráficos de Windows:**
   - Presiona `Win + I` para abrir Configuración
   - Ve a **Sistema** → **Pantalla** → **Configuración de gráficos**
   - O busca "Configuración de gráficos" en el menú de inicio

2. **Agregar el navegador:**
   - Haz clic en **"Examinar"** o **"Agregar una aplicación"**
   - Busca el ejecutable de tu navegador:
     - **Chrome**: `C:\Program Files\Google\Chrome\Application\chrome.exe`
     - **Edge**: `C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe`
     - **Firefox**: `C:\Program Files\Mozilla Firefox\firefox.exe`

3. **Configurar como GPU de alto rendimiento:**
   - Una vez agregado, haz clic en el navegador en la lista
   - Selecciona **"Opciones"**
   - Elige **"Alto rendimiento"** o **"GPU de alto rendimiento"**
   - Guarda los cambios

### Opción 2: Panel de Control de NVIDIA

1. **Abrir el Panel de Control de NVIDIA:**
   - Clic derecho en el escritorio → **Panel de control de NVIDIA**
   - O busca "NVIDIA Control Panel" en el menú de inicio

2. **Configurar gestión de energía:**
   - Ve a **Administrar configuración 3D** → **Configuración global**
   - En **Procesador gráfico preferido**, selecciona **"Procesador NVIDIA de alto rendimiento"**
   - Aplica los cambios

3. **Configurar programa específico (más preciso):**
   - Ve a **Administrar configuración 3D** → **Configuración del programa**
   - Haz clic en **"Agregar"** y selecciona tu navegador
   - Configura:
     - **Procesador gráfico preferido**: Procesador NVIDIA de alto rendimiento
     - **Modo de energía**: Preferir máximo rendimiento
   - Aplica los cambios

### Opción 3: Línea de comandos (Chrome/Edge)

Puedes forzar el uso de la GPU dedicada al iniciar el navegador con flags específicos:

**Chrome:**
```bash
"C:\Program Files\Google\Chrome\Application\chrome.exe" --use-gl=desktop --enable-features=VaapiVideoDecoder --ignore-gpu-blacklist
```

**Edge:**
```bash
"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe" --use-gl=desktop --enable-features=VaapiVideoDecoder --ignore-gpu-blacklist
```

### Verificar que está funcionando

1. Abre la consola del navegador (F12)
2. Ve a la pestaña **Console**
3. Deberías ver mensajes como:
   - `GPU Vendor: ...`
   - `GPU Renderer: NVIDIA GeForce RTX 4060 Laptop GPU` (o similar)
   - `✅ GPU NVIDIA detectada`

Si ves "Intel" o "AMD" en el renderer, el navegador está usando la GPU integrada.

### Nota sobre MediaPipe

MediaPipe en el navegador usa **WebGL** para aceleración, no acceso directo a CUDA. El mensaje "CPU only ops" es normal porque algunas operaciones del modelo de gestos solo pueden ejecutarse en CPU, pero la mayoría del procesamiento se hace en GPU (WebGL).

### Solución de problemas

- **El navegador sigue usando la GPU integrada:**
  - Reinicia el navegador después de cambiar la configuración
  - Cierra todas las instancias del navegador antes de reiniciar
  - Verifica que los drivers de NVIDIA estén actualizados

- **No aparece la opción de GPU de alto rendimiento:**
  - Asegúrate de tener los drivers de NVIDIA más recientes
  - Verifica que la GPU dedicada esté habilitada en el BIOS
  - Revisa que el modo de energía de Windows no esté en "Ahorro de energía"

- **Rendimiento aún bajo:**
  - Cierra otras aplicaciones que usen la GPU
  - Verifica que el modo de energía de Windows esté en "Alto rendimiento"
  - Reduce la resolución del video si es necesario (aunque 1280x720 debería funcionar bien)

