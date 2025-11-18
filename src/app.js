import { GestureStateMachine } from "./stateMachine.js";
import { LabScene } from "./scene.js";
import {
  FilesetResolver,
  GestureRecognizer,
  HandLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9";

const videoEl = document.getElementById("input-video");
const gestureEl = document.getElementById("gesture-readout");
const statusEl = document.getElementById("lab-status");
const coachEl = document.getElementById("coach-message");
const labCanvas = document.getElementById("lab-canvas");
const handsOverlay = document.getElementById("hands-overlay");
const resetBtn = document.getElementById("reset-btn");

const scene = new LabScene(labCanvas, statusEl, coachEl);

const gestures = {
  openHand: false,
  fist: false,
  pointer: false,
  pinch: false,
  handPresent: false,
  angle: 0,
  indexDistance: null,
  pinchPosition: null,
  pinchDistance: null,
};

const gestureLatches = {
  openHand: createLatch(6, 7), // Más frames para más estabilidad
  fist: createLatch(5, 6),
  pointer: createLatch(6, 6),
  pinch: createLatch(5, 6), // Latch más robusto para pellizco
};

// Filtros de suavizado temporal para gestos (reduce falsos positivos)
const gestureSmoothers = {
  openHand: { value: 0, target: 0, alpha: 0.12 }, // Más suave
  fist: { value: 0, target: 0, alpha: 0.12 },
  pointer: { value: 0, target: 0, alpha: 0.18 },
  pinch: { value: 0, target: 0, alpha: 0.22 }, // Más rápido para pellizco
};

// Historial de gestos para validación temporal
const gestureHistory = {
  openHand: [],
  fist: [],
  pointer: [],
  pinch: [],
  maxHistory: 10, // Mantener últimos 10 frames
};

const gestureLabels = {
  openHand: "mano abierta",
  fist: "puño",
  pointer: "puntero",
  pinch: "pellizco",
};

const gestureCategoryMap = {
  openHand: new Set(["Open_Palm"]),
  fist: new Set(["Closed_Fist"]),
  pointer: new Set(["Pointing_Up"]),
};

let gestureRecognizer = null;
let handLandmarker = null; // MediaPipe Hands para validación geométrica más precisa
let lastVideoTime = -1;
let gestureModelReady = false;
let handLandmarkerReady = false;
let currentHandLandmarks = null;
let overlayCtx = null;

const filesetResolverPromise = FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.9/wasm"
);

const stateMachine = new GestureStateMachine((action, payload = {}) => {
  switch (action) {
    case "select":
      return scene.selectNearest(payload.palm);
    case "drag":
      scene.dragSelected(payload.palm);
      break;
    case "drop":
      scene.dropSelected();
      break;
    case "rotateStart":
      return scene.getSelectedAngle();
    case "getCurrentAngle":
      return scene.getSelectedAngle();
    case "rotate":
      scene.rotateSelected(payload.angle ?? 0, payload.deltaAngle);
      break;
    case "rotateEnd":
      break;
    case "adjustTrajectory":
      scene.adjustTrajectory(payload.angle, payload.indexDistance, payload.palm);
      break;
    case "startSlingshot":
      return scene.startSlingshot(payload.pinchPosition, payload.pinchDistance, payload.angle);
      break;
    case "updateSlingshot":
      scene.updateSlingshot(payload.pinchPosition, payload.pinchDistance, payload.angle);
      break;
    case "releaseSlingshot":
      scene.releaseSlingshot();
      break;
    default:
      break;
  }
});

const palm = { x: 0, y: 0 };
const palmFilter = { 
  x: 0, 
  y: 0, 
  ready: false,
  velocityX: 0,
  velocityY: 0,
  history: [] // Historial para filtro de mediana
};

// Filtro para el ángulo del puntero
const angleFilter = {
  value: 0,
  ready: false,
  history: []
};

// Umbral de movimiento mínimo (en píxeles) para ignorar temblores
const MIN_MOVEMENT_THRESHOLD = 2.0; // Píxeles
const MIN_ANGLE_CHANGE_THRESHOLD = 1.0; // Grados

function updateGestureDisplay() {
  const active = Object.entries(gestures)
    .filter(([, val]) => val)
    .filter(([name]) => gestureLabels[name])
    .map(([name]) => gestureLabels[name])
    .join(", ");
  gestureEl.textContent = `Gestos: ${active || "—"}`;
}

function createLatch(onFrames, offFrames) {
  return {
    active: false,
    onFrames,
    offFrames,
    activeCount: 0,
    inactiveCount: 0,
  };
}

function updateLatch(latch, condition) {
  if (condition) {
    latch.activeCount += 1;
    latch.inactiveCount = 0;
    if (!latch.active && latch.activeCount >= latch.onFrames) {
      latch.active = true;
    }
  } else {
    latch.inactiveCount += 1;
    latch.activeCount = 0;
    if (latch.active && latch.inactiveCount >= latch.offFrames) {
      latch.active = false;
    }
  }
  return latch.active;
}

function setLatchedGesture(name, condition) {
  if (!gestureLatches[name]) {
    gestures[name] = condition;
    return;
  }
  
  // Aplicar suavizado temporal antes del latch
  const smoother = gestureSmoothers[name];
  if (smoother) {
    smoother.target = condition ? 1 : 0;
    smoother.value = lerp(smoother.value, smoother.target, smoother.alpha);
    // Usar umbral para convertir valor suavizado a booleano
    const smoothedCondition = smoother.value > 0.5;
    gestures[name] = updateLatch(gestureLatches[name], smoothedCondition);
  } else {
    gestures[name] = updateLatch(gestureLatches[name], condition);
  }
}

function getGestureScore(categories = [], namesSet = new Set()) {
  for (const category of categories) {
    if (namesSet.has(category.categoryName)) {
      return category.score ?? 0;
    }
  }
  return 0;
}

// Filtro de mediana para reducir ruido
function medianFilter(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 
    ? (sorted[mid - 1] + sorted[mid]) / 2 
    : sorted[mid];
}

function smoothPalmCoords(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  
  // Mapeo mejorado: usar más área de la cámara
  // x, y vienen normalizados (0-1) desde MediaPipe
  // Factor de escala para cubrir más área vertical
  const scaleX = 1.0; // Usar todo el ancho
  const scaleY = 1.3; // Usar más altura para cubrir arriba y abajo
  const offsetY = -0.1; // Offset para centrar mejor
  
  // Mapear coordenadas normalizadas (0-1) al canvas
  // Primero aplicar offset y escala
  let normalizedX = x;
  let normalizedY = (y + offsetY) * scaleY;
  
  // Normalizar Y de vuelta al rango 0-1 después del offset y escala
  normalizedY = Math.max(0, Math.min(1, normalizedY));
  
  // Mapear al tamaño del canvas
  const mappedX = normalizedX * labCanvas.width;
  const mappedY = normalizedY * labCanvas.height;
  
  // Invertir X para modo espejo
  const mirroredX = labCanvas.width - mappedX;
  
  // Limitar al área del canvas
  const clampedX = Math.max(0, Math.min(labCanvas.width, mirroredX));
  const clampedY = Math.max(0, Math.min(labCanvas.height, mappedY));
  
  if (!palmFilter.ready) {
    palmFilter.x = clampedX;
    palmFilter.y = clampedY;
    palmFilter.ready = true;
    palmFilter.history = [{ x: clampedX, y: clampedY }];
  } else {
    // Agregar al historial (últimos 5 puntos para filtro de mediana)
    palmFilter.history.push({ x: clampedX, y: clampedY });
    if (palmFilter.history.length > 5) {
      palmFilter.history.shift();
    }
    
    // Aplicar filtro de mediana para reducir ruido
    const medianX = medianFilter(palmFilter.history.map(p => p.x));
    const medianY = medianFilter(palmFilter.history.map(p => p.y));
    
    // Calcular distancia desde la posición actual
    const dx = medianX - palmFilter.x;
    const dy = medianY - palmFilter.y;
    const distance = Math.hypot(dx, dy);
    
    // Si el movimiento es menor que el umbral, ignorarlo (reduce temblor)
    if (distance < MIN_MOVEMENT_THRESHOLD) {
      // No actualizar si el movimiento es muy pequeño
      // Aplicar un suavizado muy agresivo para mantener la posición estable
      const alpha = 0.05; // Muy bajo para mantener quieto
      palmFilter.x = lerp(palmFilter.x, medianX, alpha);
      palmFilter.y = lerp(palmFilter.y, medianY, alpha);
    } else {
      // Movimiento significativo: suavizado normal pero más agresivo
      const alpha = 0.15; // Más bajo que antes (0.3) para más estabilidad
      palmFilter.x = lerp(palmFilter.x, medianX, alpha);
      palmFilter.y = lerp(palmFilter.y, medianY, alpha);
    }
    
    // Asegurar que después del suavizado también esté dentro del canvas
    palmFilter.x = Math.max(0, Math.min(labCanvas.width, palmFilter.x));
    palmFilter.y = Math.max(0, Math.min(labCanvas.height, palmFilter.y));
  }
  palm.x = palmFilter.x;
  palm.y = palmFilter.y;
  return palm;
}

// Suavizar ángulo del puntero
function smoothAngle(newAngle) {
  if (!Number.isFinite(newAngle)) return angleFilter.value;
  
  if (!angleFilter.ready) {
    angleFilter.value = newAngle;
    angleFilter.ready = true;
    angleFilter.history = [newAngle];
    return newAngle;
  }
  
  // Normalizar ángulo a rango -180 a 180
  const normalizeAngle = (angle) => {
    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;
    return angle;
  };
  
  const normalizedNew = normalizeAngle(newAngle);
  const normalizedCurrent = normalizeAngle(angleFilter.value);
  
  // Calcular diferencia de ángulo (considerando wraparound)
  let delta = normalizedNew - normalizedCurrent;
  if (delta > 180) delta -= 360;
  if (delta < -180) delta += 360;
  
  // Si el cambio es menor que el umbral, ignorarlo
  if (Math.abs(delta) < MIN_ANGLE_CHANGE_THRESHOLD) {
    // Mantener el ángulo actual con suavizado muy agresivo
    return angleFilter.value;
  }
  
  // Agregar al historial
  angleFilter.history.push(normalizedNew);
  if (angleFilter.history.length > 5) {
    angleFilter.history.shift();
  }
  
  // Aplicar filtro de mediana para reducir ruido
  const medianAngle = medianFilter(angleFilter.history);
  
  // Calcular delta desde la mediana
  let medianDelta = medianAngle - normalizeAngle(angleFilter.value);
  if (medianDelta > 180) medianDelta -= 360;
  if (medianDelta < -180) medianDelta += 360;
  
  // Suavizado agresivo basado en la mediana
  const alpha = 0.2;
  angleFilter.value = normalizeAngle(angleFilter.value + medianDelta * alpha);
  
  return angleFilter.value;
}

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
}

// Actualizar historial de gestos
function updateGestureHistory(gestureName, detected) {
  if (!gestureHistory[gestureName]) return;
  
  gestureHistory[gestureName].push(detected ? 1 : 0);
  if (gestureHistory[gestureName].length > gestureHistory.maxHistory) {
    gestureHistory[gestureName].shift();
  }
}

// Obtener consistencia de un gesto en el historial
function getGestureConsistency(gestureName, threshold = 0.7) {
  const history = gestureHistory[gestureName];
  if (!history || history.length < 3) return false;
  
  // Calcular promedio de los últimos frames
  const recent = history.slice(-5); // Últimos 5 frames
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  
  // Requiere al menos 70% de consistencia
  return avg >= threshold;
}

function handleGestureResult(result) {
  if (!result?.landmarks?.length) {
    ["openHand", "fist", "pointer"].forEach((key) =>
      setLatchedGesture(key, false)
    );
    gestures.handPresent = false;
    palmFilter.ready = false;
    currentHandLandmarks = null;
    return;
  }

  const landmarks = result.landmarks[0];
  currentHandLandmarks = landmarks;
  const wrist = landmarks?.[0];

  if (wrist && Number.isFinite(wrist.x) && Number.isFinite(wrist.y)) {
    // Pasar coordenadas normalizadas (0-1) directamente
    smoothPalmCoords(wrist.x, wrist.y);
    gestures.handPresent = true;
  } else {
    gestures.handPresent = false;
    return;
  }

  const categories = result.gestures?.[0] ?? [];
  const openScore = getGestureScore(categories, gestureCategoryMap.openHand);
  const fistScore = getGestureScore(categories, gestureCategoryMap.fist);
  const pointerScore = getGestureScore(categories, gestureCategoryMap.pointer);

  // Detección mejorada de puntero usando geometría de la mano
  let isPointerGeometric = false;
  let pointerAngle = gestures.angle; // Mantener último ángulo si no hay puntero
  
  // Variables de pellizco (inicializadas antes del bloque)
  let isPinch = false;
  let pinchPos = null;
  let pinchDist = null;
  
  if (landmarks && landmarks.length >= 21) {
    // Puntos clave del índice
    const indexMCP = landmarks[5];  // Base del índice
    const indexPIP = landmarks[6];  // Articulación media
    const indexDIP = landmarks[7];  // Articulación distal
    const indexTip = landmarks[8];   // Punta del índice
    
    // Puntos de otros dedos para validar que estén recogidos
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const thumbTip = landmarks[4];
    
    if (indexMCP && indexPIP && indexDIP && indexTip && wrist) {
      // Calcular distancias desde la muñeca
      const distIndexTip = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
      const distIndexMCP = Math.hypot(indexMCP.x - wrist.x, indexMCP.y - wrist.y);
      const distMiddleTip = middleTip ? Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y) : 0;
      const distRingTip = ringTip ? Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y) : 0;
      const distPinkyTip = pinkyTip ? Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y) : 0;
      const distThumbTip = thumbTip ? Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y) : 0;
      
      // Validar que el índice esté extendido (punta más lejos que la base)
      // Más permisivo: 1.2 en lugar de 1.3
      const indexExtended = distIndexTip > distIndexMCP * 1.2;
      
      // Validar que otros dedos estén recogidos (más cerca que el índice)
      // Más permisivo: 0.9 en lugar de 0.85
      const otherFingersRetracted = 
        (!middleTip || distMiddleTip < distIndexTip * 0.9) &&
        (!ringTip || distRingTip < distIndexTip * 0.9) &&
        (!pinkyTip || distPinkyTip < distIndexTip * 0.9);
      
      // El pulgar puede estar en cualquier posición (más permisivo)
      const thumbOK = !thumbTip || distThumbTip < distIndexTip * 1.3;
      
      // Validar que las articulaciones del índice formen una línea (dedo extendido)
      // Más permisivo: 1.8 en lugar de 1.5
      const indexStraight = 
        Math.hypot(indexPIP.x - indexMCP.x, indexPIP.y - indexMCP.y) <
        Math.hypot(indexTip.x - indexPIP.x, indexTip.y - indexPIP.y) * 1.8;
      
      // Validación adicional: el índice debe estar más extendido que el medio
      const indexMoreExtended = !middleTip || distIndexTip > distMiddleTip * 1.1;
      
      isPointerGeometric = indexExtended && otherFingersRetracted && thumbOK && indexStraight && indexMoreExtended;
      
      if (isPointerGeometric) {
        // Calcular ángulo con mayor sensibilidad
        const angleRad = Math.atan2(
          indexTip.y - wrist.y,
          indexTip.x - wrist.x
        );
        const rawAngle = (angleRad * 180) / Math.PI;
        // Aplicar filtro de suavizado para reducir temblor
        pointerAngle = smoothAngle(rawAngle);
        
        // Guardar distancia del índice para calcular fuerza
        gestures.indexDistance = distIndexTip;
      } else {
        gestures.indexDistance = null;
      }
    }
    
    // Detección de pellizco (pulgar e índice juntos) - mejorada
    if (thumbTip && indexTip && wrist) {
      // Calcular distancia entre pulgar e índice
      const thumbIndexDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
      
      // Calcular distancias desde la muñeca para validar posición
      const distThumbTip = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y);
      const distIndexTip = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
      
      // Umbral adaptativo basado en el tamaño de la mano
      const handSize = Math.max(distThumbTip, distIndexTip);
      const pinchThreshold = Math.max(0.025, handSize * 0.18); // 18% del tamaño de la mano, mínimo 0.025 (más permisivo)
      
      // Validar que el pulgar y el índice estén realmente juntos
      // No solo cerca, sino en posición de pellizco (ambos dedos extendidos hacia el centro)
      const thumbIP = landmarks[3]; // Articulación IP del pulgar
      const indexPIP = landmarks[6]; // Articulación PIP del índice
      
      // Calcular si los dedos están apuntando uno hacia el otro
      let fingersPointingTogether = true;
      if (thumbIP && indexPIP) {
        // Vector del pulgar hacia el índice
        const thumbToIndex = {
          x: indexTip.x - thumbTip.x,
          y: indexTip.y - thumbTip.y
        };
        
        // Vector del pulgar desde su articulación
        const thumbDirection = {
          x: thumbTip.x - thumbIP.x,
          y: thumbTip.y - thumbIP.y
        };
        
        // Vector del índice desde su articulación
        const indexDirection = {
          x: indexTip.x - indexPIP.x,
          y: indexTip.y - indexPIP.y
        };
        
        // Normalizar vectores
        const thumbToIndexLen = Math.hypot(thumbToIndex.x, thumbToIndex.y);
        const thumbDirLen = Math.hypot(thumbDirection.x, thumbDirection.y);
        const indexDirLen = Math.hypot(indexDirection.x, indexDirection.y);
        
        if (thumbToIndexLen > 0 && thumbDirLen > 0 && indexDirLen > 0) {
          // Calcular producto punto para ver si apuntan uno hacia el otro
          const thumbDot = (thumbDirection.x * thumbToIndex.x + thumbDirection.y * thumbToIndex.y) / (thumbDirLen * thumbToIndexLen);
          const indexDot = (indexDirection.x * -thumbToIndex.x + indexDirection.y * -thumbToIndex.y) / (indexDirLen * thumbToIndexLen);
          
          // Ambos dedos deben apuntar hacia el otro (producto punto positivo)
          fingersPointingTogether = thumbDot > 0.3 && indexDot > 0.3;
        }
      }
      
      // Validar pellizco: distancia pequeña Y dedos apuntando uno hacia el otro
      if (thumbIndexDist < pinchThreshold && fingersPointingTogether) {
        isPinch = true;
        
        // Calcular posición del pellizco (punto medio)
        pinchPos = {
          x: (thumbTip.x + indexTip.x) / 2,
          y: (thumbTip.y + indexTip.y) / 2
        };
        
        // Calcular distancia desde muñeca hasta pellizco (para fuerza)
        pinchDist = Math.hypot(pinchPos.x - wrist.x, pinchPos.y - wrist.y);
        
        // Calcular ángulo desde muñeca hasta pellizco (para dirección)
        const angleRad = Math.atan2(
          pinchPos.y - wrist.y,
          pinchPos.x - wrist.x
        );
        const rawAngle = (angleRad * 180) / Math.PI;
        // Aplicar filtro de suavizado para reducir temblor
        pointerAngle = smoothAngle(rawAngle);
      }
    }
  }
  
  // Detección geométrica mejorada para puño y mano abierta
  let isFistGeometric = false;
  let isOpenHandGeometric = false;
  
  if (landmarks && landmarks.length >= 21 && wrist) {
    // Detectar puño: todos los dedos deben estar cerrados
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    
    // Puntos de articulaciones para validar si los dedos están cerrados
    const thumbIP = landmarks[3];
    const indexPIP = landmarks[6];
    const indexDIP = landmarks[7];
    const middlePIP = landmarks[10];
    const middleDIP = landmarks[11];
    const ringPIP = landmarks[14];
    const ringDIP = landmarks[15];
    const pinkyPIP = landmarks[18];
    const pinkyDIP = landmarks[19];
    
    if (thumbTip && indexTip && middleTip && ringTip && pinkyTip) {
      // Calcular distancias desde la muñeca
      const distThumb = Math.hypot(thumbTip.x - wrist.x, thumbTip.y - wrist.y);
      const distIndex = Math.hypot(indexTip.x - wrist.x, indexTip.y - wrist.y);
      const distMiddle = Math.hypot(middleTip.x - wrist.x, middleTip.y - wrist.y);
      const distRing = Math.hypot(ringTip.x - wrist.x, ringTip.y - wrist.y);
      const distPinky = Math.hypot(pinkyTip.x - wrist.x, pinkyTip.y - wrist.y);
      
      // Calcular distancias de articulaciones para validar si están doblados
      let fingersClosed = 0;
      let fingersOpen = 0;
      
      // Validar índice
      if (indexPIP && indexDIP) {
        const distIndexPIP = Math.hypot(indexPIP.x - wrist.x, indexPIP.y - wrist.y);
        // Si la punta está más cerca que la articulación media, el dedo está cerrado
        if (distIndex < distIndexPIP * 0.95) fingersClosed++;
        else if (distIndex > distIndexPIP * 1.2) fingersOpen++;
      }
      
      // Validar medio
      if (middlePIP && middleDIP) {
        const distMiddlePIP = Math.hypot(middlePIP.x - wrist.x, middlePIP.y - wrist.y);
        if (distMiddle < distMiddlePIP * 0.95) fingersClosed++;
        else if (distMiddle > distMiddlePIP * 1.2) fingersOpen++;
      }
      
      // Validar anular
      if (ringPIP && ringDIP) {
        const distRingPIP = Math.hypot(ringPIP.x - wrist.x, ringPIP.y - wrist.y);
        if (distRing < distRingPIP * 0.95) fingersClosed++;
        else if (distRing > distRingPIP * 1.2) fingersOpen++;
      }
      
      // Validar meñique
      if (pinkyPIP && pinkyDIP) {
        const distPinkyPIP = Math.hypot(pinkyPIP.x - wrist.x, pinkyPIP.y - wrist.y);
        if (distPinky < distPinkyPIP * 0.95) fingersClosed++;
        else if (distPinky > distPinkyPIP * 1.2) fingersOpen++;
      }
      
      // Validar pulgar (más complejo)
      if (thumbIP) {
        const distThumbIP = Math.hypot(thumbIP.x - wrist.x, thumbIP.y - wrist.y);
        // El pulgar puede estar en diferentes posiciones, pero si está muy cerca está cerrado
        if (distThumb < distThumbIP * 1.1) fingersClosed++;
        else if (distThumb > distThumbIP * 1.4) fingersOpen++;
      }
      
      // Puño: al menos 4 dedos cerrados
      isFistGeometric = fingersClosed >= 4;
      
      // Mano abierta: al menos 4 dedos abiertos y no hay pellizco
      isOpenHandGeometric = !isPinch && fingersOpen >= 4 && fingersClosed <= 1;
    }
  }
  
  // Combinar detección de MediaPipe con validación geométrica
  // Priorizar geometría cuando sea clara, usar MediaPipe como respaldo
  const isPointer = !isPinch && (pointerScore > 0.35 || (isPointerGeometric && pointerScore > 0.2)) && !isFistGeometric && !isOpenHandGeometric;
  
  // Combinar detecciones: geometría tiene más peso
  const finalFist = (isFistGeometric || fistScore > 0.6) && !isPointer && !isPinch;
  const finalOpenHand = (isOpenHandGeometric || openScore > 0.6) && !isPointer && !isPinch && !isFistGeometric;
  
  // Actualizar historial
  updateGestureHistory("fist", finalFist);
  updateGestureHistory("openHand", finalOpenHand);
  updateGestureHistory("pointer", isPointer);
  updateGestureHistory("pinch", isPinch);
  
  // Usar historial para validación temporal (requiere consistencia)
  const fistConsistent = getGestureConsistency("fist");
  const openHandConsistent = getGestureConsistency("openHand");
  const pointerConsistent = getGestureConsistency("pointer");
  const pinchConsistent = getGestureConsistency("pinch");
  
  setLatchedGesture("openHand", openHandConsistent);
  setLatchedGesture("fist", fistConsistent);
  setLatchedGesture("pointer", pointerConsistent);
  setLatchedGesture("pinch", pinchConsistent);
  
  // Usar el ángulo suavizado (ya está suavizado en smoothAngle)
  gestures.angle = pointerAngle;
  gestures.pinchPosition = pinchPos;
  gestures.pinchDistance = pinchDist;
}

function processGestureFrame(timestampMs) {
  if (!gestureRecognizer || !gestureModelReady) return;
  if (lastVideoTime === videoEl.currentTime) return;
  lastVideoTime = videoEl.currentTime;

  const result = gestureRecognizer.recognizeForVideo(videoEl, timestampMs);
  handleGestureResult(result);
}


function drawHandOverlay() {
  if (!overlayCtx || !currentHandLandmarks) {
    if (overlayCtx) {
      overlayCtx.clearRect(0, 0, handsOverlay.width, handsOverlay.height);
    }
    return;
  }

  const ctx = overlayCtx;
  const landmarks = currentHandLandmarks;
  const width = handsOverlay.width;
  const height = handsOverlay.height;

  ctx.clearRect(0, 0, width, height);

  // Determinar color según gesto
  let baseColor = "#00d4ff"; // Azul por defecto
  let glowColor = "#00a8cc";
  
  if (gestures.pinch) {
    baseColor = "#ff9f43";
    glowColor = "#ff7f00";
  } else if (gestures.openHand) {
    baseColor = "#00ff88";
    glowColor = "#00cc6a";
  } else if (gestures.fist) {
    baseColor = "#ff6b6b";
    glowColor = "#cc5555";
  } else if (gestures.pointer) {
    baseColor = "#ffd93d";
    glowColor = "#ccb030";
  }

  // Conexiones de la mano (estructura tipo Kinect)
  const connections = [
    [0, 1], [1, 2], [2, 3], [3, 4], // Pulgar
    [0, 5], [5, 6], [6, 7], [7, 8], // Índice
    [0, 9], [9, 10], [10, 11], [11, 12], // Medio
    [0, 13], [13, 14], [14, 15], [15, 16], // Anular
    [0, 17], [17, 18], [18, 19], [19, 20], // Meñique
    [5, 9], [9, 13], [13, 17], // Base de dedos
  ];

  // Dibujar conexiones con efecto de profundidad
  ctx.strokeStyle = baseColor;
  ctx.lineWidth = 2.5;
  ctx.shadowBlur = 8;
  ctx.shadowColor = glowColor;
  
  connections.forEach(([start, end]) => {
    const startPoint = landmarks[start];
    const endPoint = landmarks[end];
    if (startPoint && endPoint) {
      ctx.beginPath();
      ctx.moveTo(startPoint.x * width, startPoint.y * height);
      ctx.lineTo(endPoint.x * width, endPoint.y * height);
      ctx.stroke();
    }
  });

  // Dibujar puntos con efecto de relieve
  landmarks.forEach((point, index) => {
    if (!point) return;
    
    const x = point.x * width;
    const y = point.y * height;
    const z = point.z || 0;
    
    // Tamaño del punto según importancia (puntas de dedos más grandes)
    const isTip = [4, 8, 12, 16, 20].includes(index);
    const isWrist = index === 0;
    const radius = isTip ? 8 : isWrist ? 10 : 5;
    
    // Efecto de profundidad (z más negativo = más cerca)
    const depth = Math.max(0, 1 + z * 2);
    const pointRadius = radius * depth;
    
    // Sombra para efecto 3D
    ctx.fillStyle = "#000000";
    ctx.globalAlpha = 0.3;
    ctx.beginPath();
    ctx.arc(x + 2, y + 2, pointRadius * 0.8, 0, Math.PI * 2);
    ctx.fill();
    
    // Punto principal con gradiente
    ctx.globalAlpha = 1;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, pointRadius);
    gradient.addColorStop(0, baseColor);
    gradient.addColorStop(0.5, glowColor);
    gradient.addColorStop(1, baseColor + "80");
    
    ctx.fillStyle = gradient;
    ctx.shadowBlur = 12;
    ctx.shadowColor = glowColor;
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.fill();
    
    // Borde brillante
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(x, y, pointRadius, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Resaltar punta del índice si está en modo puntero
  if (gestures.pointer && landmarks[8]) {
    const indexTip = landmarks[8];
    const x = indexTip.x * width;
    const y = indexTip.y * height;
    
    // Aura pulsante
    const pulse = Math.sin(Date.now() / 200) * 0.3 + 0.7;
    ctx.strokeStyle = "#ffd93d";
    ctx.lineWidth = 3;
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#ffd93d";
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(x, y, 25 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  
  // Resaltar pellizco (pulgar e índice juntos)
  if (gestures.pinch && landmarks[4] && landmarks[8]) {
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const thumbX = thumbTip.x * width;
    const thumbY = thumbTip.y * height;
    const indexX = indexTip.x * width;
    const indexY = indexTip.y * height;
    
    // Aura pulsante alrededor de ambos dedos
    const pulse = Math.sin(Date.now() / 150) * 0.4 + 0.6;
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = "#ff9f43";
    ctx.lineWidth = 4;
    ctx.shadowBlur = 15;
    ctx.shadowColor = "#ff7f00";
    
    // Círculo alrededor del pulgar
    ctx.beginPath();
    ctx.arc(thumbX, thumbY, 20 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    
    // Círculo alrededor del índice
    ctx.beginPath();
    ctx.arc(indexX, indexY, 20 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    
    // Línea conectando ambos dedos
    ctx.beginPath();
    ctx.moveTo(thumbX, thumbY);
    ctx.lineTo(indexX, indexY);
    ctx.stroke();
    
    // Círculo en el punto medio (posición del pellizco)
    const midX = (thumbX + indexX) / 2;
    const midY = (thumbY + indexY) / 2;
    ctx.fillStyle = "#ff9f43";
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    ctx.arc(midX, midY, 8, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }
}

function initOverlayCanvas() {
  if (!handsOverlay) return;
  
  overlayCtx = handsOverlay.getContext("2d");
  
  function resizeOverlay() {
    const rect = videoEl.getBoundingClientRect();
    handsOverlay.width = rect.width;
    handsOverlay.height = rect.height;
  }
  
  videoEl.addEventListener("loadedmetadata", resizeOverlay);
  window.addEventListener("resize", resizeOverlay);
  resizeOverlay();
}

function loop(timestamp) {
  const palmPayload = gestures.handPresent ? { ...palm } : null;
  scene.updatePointer(palmPayload);
  updateGestureDisplay();
  stateMachine.update({ ...gestures, palm: palmPayload }, timestamp);
  scene.draw();
  drawHandOverlay();
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);

async function initGestureRecognizer(filesetResolver) {
  try {
    // Intentar con GPU primero (más rápido)
    gestureRecognizer = await GestureRecognizer.createFromOptions(
      filesetResolver,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.4, // Más bajo para detectar más fácilmente
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      }
    );
    console.log("Gesture Recognizer inicializado con GPU");
  } catch (gpuError) {
    // Fallback a CPU si GPU no está disponible
    console.log("GPU no disponible, usando CPU:", gpuError);
    gestureRecognizer = await GestureRecognizer.createFromOptions(
      filesetResolver,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      }
    );
    console.log("Gesture Recognizer inicializado con CPU");
  }
  gestureModelReady = true;
  
  // Inicializar HandLandmarker para validación geométrica adicional
  try {
    handLandmarker = await HandLandmarker.createFromOptions(
      filesetResolver,
      {
        baseOptions: {
          modelAssetPath:
            "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task",
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        numHands: 1,
        minHandDetectionConfidence: 0.4,
        minHandPresenceConfidence: 0.4,
        minTrackingConfidence: 0.4,
      }
    );
    handLandmarkerReady = true;
    console.log("Hand Landmarker inicializado");
  } catch (error) {
    console.log("Hand Landmarker no disponible, usando solo Gesture Recognizer:", error);
    handLandmarkerReady = false;
  }
}

async function initCamera() {
  // Mayor resolución para mejor detección
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { 
      width: { ideal: 1280 },
      height: { ideal: 720 },
      facingMode: 'user'
    },
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const camera = new Camera(videoEl, {
    onFrame: () => {
      const timestamp = performance.now();
      processGestureFrame(timestamp);
    },
    width: 1280,
    height: 720,
  });
  camera.start();
}

// Detectar y mostrar información de GPU
function detectGPU() {
  const canvas = document.createElement('canvas');
  const gl = canvas.getContext('webgl2') || canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  
  if (!gl) {
    console.warn('WebGL no está disponible');
    return null;
  }
  
  const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
  if (debugInfo) {
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    
    console.log('GPU Vendor:', vendor);
    console.log('GPU Renderer:', renderer);
    
    // Verificar si es NVIDIA
    const isNVIDIA = renderer.includes('NVIDIA') || renderer.includes('GeForce') || renderer.includes('RTX');
    if (isNVIDIA) {
      console.log('✅ GPU NVIDIA detectada:', renderer);
    } else {
      console.warn('⚠️ Puede que no esté usando la GPU dedicada. Renderer:', renderer);
    }
    
    return { vendor, renderer, isNVIDIA };
  }
  
  return null;
}

async function bootstrap() {
  try {
    // Detectar GPU antes de inicializar
    const gpuInfo = detectGPU();
    if (gpuInfo && !gpuInfo.isNVIDIA) {
      statusEl.textContent = '⚠️ Verifica que el navegador esté usando la GPU dedicada (RTX 4060). Revisa la consola para más información.';
    }
    
    initOverlayCanvas();
    const filesetResolver = await filesetResolverPromise;
    await initGestureRecognizer(filesetResolver);
    await initCamera();
  } catch (err) {
    statusEl.textContent = `No se pudo iniciar la cámara: ${err.message}`;
  }
}

bootstrap();

resetBtn.addEventListener("click", () => scene.reset());

