import { GestureStateMachine } from "./stateMachine.js";
import { LabScene } from "./scene.js";
import {
  FilesetResolver,
  GestureRecognizer,
  FaceLandmarker,
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3";

const videoEl = document.getElementById("input-video");
const gestureEl = document.getElementById("gesture-readout");
const statusEl = document.getElementById("lab-status");
const coachEl = document.getElementById("coach-message");
const labCanvas = document.getElementById("lab-canvas");
const handsOverlay = document.getElementById("hands-overlay");
const resetBtn = document.getElementById("reset-btn");
const challengeBtn = document.getElementById("challenge-btn");

const scene = new LabScene(labCanvas, statusEl, coachEl);

const gestures = {
  openHand: false,
  fist: false,
  pointer: false,
  wink: false,
  smile: false,
  frown: false,
  handPresent: false,
  angle: 0,
};

const gestureLatches = {
  openHand: createLatch(4, 5),
  fist: createLatch(3, 4),
  pointer: createLatch(4, 4),
  wink: createLatch(3, 3),
  smile: createLatch(3, 4),
  frown: createLatch(8, 5),
};

const gestureLabels = {
  openHand: "mano abierta",
  fist: "puño",
  pointer: "puntero",
  wink: "guiño",
  smile: "sonrisa",
  frown: "ceño",
};

const gestureCategoryMap = {
  openHand: new Set(["Open_Palm"]),
  fist: new Set(["Closed_Fist"]),
  pointer: new Set(["Pointing_Up"]),
};

let gestureRecognizer = null;
let lastVideoTime = -1;
let gestureModelReady = false;
let faceLandmarker = null;
let faceModelReady = false;
let lastFaceTime = -1;
let currentHandLandmarks = null;
let overlayCtx = null;

const filesetResolverPromise = FilesetResolver.forVisionTasks(
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm"
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
      break;
    case "rotate":
      scene.rotateSelected(payload.angle ?? 0);
      break;
    case "rotateEnd":
      break;
    case "toggleSwitch":
      scene.toggleSwitch();
      break;
    case "evaluate":
      scene.evaluate(true);
      break;
    case "assist":
      scene.requestAssistance();
      break;
    default:
      break;
  }
});

const palm = { x: 0, y: 0 };
const palmFilter = { x: 0, y: 0, ready: false };

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
  gestures[name] = updateLatch(gestureLatches[name], condition);
}

function getGestureScore(categories = [], namesSet = new Set()) {
  for (const category of categories) {
    if (namesSet.has(category.categoryName)) {
      return category.score ?? 0;
    }
  }
  return 0;
}

function smoothPalmCoords(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  
  // Invertir X para modo espejo
  const mirroredX = labCanvas.width - x;
  
  if (!palmFilter.ready) {
    palmFilter.x = mirroredX;
    palmFilter.y = y;
    palmFilter.ready = true;
  } else {
    // Suavizado más agresivo para estabilidad
    const alpha = 0.25;
    palmFilter.x = lerp(palmFilter.x, mirroredX, alpha);
    palmFilter.y = lerp(palmFilter.y, y, alpha);
  }
  palm.x = palmFilter.x;
  palm.y = palmFilter.y;
  return palm;
}

function lerp(a, b, alpha) {
  return a + (b - a) * alpha;
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
    smoothPalmCoords(wrist.x * labCanvas.width, wrist.y * labCanvas.height);
    gestures.handPresent = true;
  } else {
    gestures.handPresent = false;
    return;
  }

  const categories = result.gestures?.[0] ?? [];
  const openScore = getGestureScore(categories, gestureCategoryMap.openHand);
  const fistScore = getGestureScore(categories, gestureCategoryMap.fist);
  const pointerScore = getGestureScore(categories, gestureCategoryMap.pointer);

  setLatchedGesture("openHand", openScore > 0.55);
  setLatchedGesture("fist", fistScore > 0.55);
  setLatchedGesture("pointer", pointerScore > 0.45 && fistScore < 0.4);

  const indexTip = landmarks?.[8];
  if (indexTip) {
    const angleRad = Math.atan2(
      indexTip.y - wrist.y,
      indexTip.x - wrist.x
    );
    gestures.angle = (angleRad * 180) / Math.PI;
  }
}

function processGestureFrame(timestampMs) {
  if (!gestureRecognizer || !gestureModelReady) return;
  if (lastVideoTime === videoEl.currentTime) return;
  lastVideoTime = videoEl.currentTime;

  const result = gestureRecognizer.recognizeForVideo(videoEl, timestampMs);
  handleGestureResult(result);
}

function processFaceFrame(timestampMs) {
  if (!faceLandmarker || !faceModelReady) return;
  if (lastFaceTime === videoEl.currentTime) return;
  lastFaceTime = videoEl.currentTime;

  const result = faceLandmarker.detectForVideo(videoEl, timestampMs);
  detectFaceGestures(result?.faceLandmarks);
}

function detectFaceGestures(landmarks) {
  if (!landmarks?.length) {
    ["wink", "smile", "frown"].forEach((key) =>
      setLatchedGesture(key, false)
    );
    return;
  }
  const face = landmarks[0];
  
  // Validar landmarks críticos
  if (!face[159] || !face[145] || !face[386] || !face[374]) {
    setLatchedGesture("wink", false);
  } else {
    const leftEyeHeight = Math.abs(face[159].y - face[145].y);
    const rightEyeHeight = Math.abs(face[386].y - face[374].y);
    const eyeRatio = Math.min(leftEyeHeight, rightEyeHeight) / Math.max(leftEyeHeight, rightEyeHeight);
    
    // Guiño: un ojo mucho más cerrado que el otro, pero no ambos cerrados
    const bothEyesOpen = leftEyeHeight > 0.01 && rightEyeHeight > 0.01;
    const rawWink = eyeRatio < 0.4 && bothEyesOpen && 
                    (rightEyeHeight / leftEyeHeight < 0.4 || leftEyeHeight / rightEyeHeight < 0.4);
    setLatchedGesture("wink", rawWink);
  }

  // Sonrisa mejorada
  if (!face[61] || !face[291] || !face[13] || !face[14]) {
    setLatchedGesture("smile", false);
  } else {
    const mouthWide = Math.abs(face[61].x - face[291].x);
    const mouthTall = Math.abs(face[13].y - face[14].y);
    
    // Validar que la boca esté abierta lo suficiente para evitar falsos positivos
    const mouthOpen = mouthTall > 0.005;
    const rawSmile = mouthWide / (mouthTall || 0.001) > 1.6 && mouthOpen;
    setLatchedGesture("smile", rawSmile);
  }

  // Ceño mejorado
  if (!face[70] || !face[105]) {
    setLatchedGesture("frown", false);
  } else {
    const browAngle = Math.abs(face[70].y - face[105].y);
    // Validar que ambas cejas estén presentes
    const browHeight = (Math.abs(face[70].y - face[159].y) + Math.abs(face[105].y - face[386].y)) / 2;
    const rawFrown = browAngle < 0.015 && browHeight > 0.01;
    setLatchedGesture("frown", rawFrown);
  }
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
  
  if (gestures.openHand) {
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
  gestureRecognizer = await GestureRecognizer.createFromOptions(
    filesetResolver,
    {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-tasks/gesture_recognizer/gesture_recognizer.task",
      },
      runningMode: "VIDEO",
      numHands: 1,
    }
  );
  gestureModelReady = true;
}

async function initFaceLandmarker(filesetResolver) {
  faceLandmarker = await FaceLandmarker.createFromOptions(
    filesetResolver,
    {
      baseOptions: {
        modelAssetPath:
          "https://storage.googleapis.com/mediapipe-tasks/face_landmarker/face_landmarker.task",
      },
      runningMode: "VIDEO",
      numFaces: 1,
      outputFacialTransformationMatrixes: false,
    }
  );
  faceModelReady = true;
}

async function initCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 360 },
  });
  videoEl.srcObject = stream;
  await videoEl.play();

  const camera = new Camera(videoEl, {
    onFrame: () => {
      const timestamp = performance.now();
      processGestureFrame(timestamp);
      processFaceFrame(timestamp);
    },
    width: 640,
    height: 360,
  });
  camera.start();
}

async function bootstrap() {
  try {
    initOverlayCanvas();
    const filesetResolver = await filesetResolverPromise;
    await Promise.all([
      initGestureRecognizer(filesetResolver),
      initFaceLandmarker(filesetResolver),
    ]);
    await initCamera();
  } catch (err) {
    statusEl.textContent = `No se pudo iniciar la cámara: ${err.message}`;
  }
}

bootstrap();

resetBtn.addEventListener("click", () => scene.reset());
challengeBtn.addEventListener("click", () => {
  coachEl.textContent = "Reto: arma un circuito en paralelo con una segunda bombilla.";
});

