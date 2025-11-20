const GRID_SPACING = 40;
const POINTER_COLOR = "#ffb347";
const POINTER_GLOW = "#ff8c37";
const MIN_POINT_DELTA = 1.5;

function distance(a, b) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export class LabScene {
  constructor(canvas, statusEl, coachEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.statusEl = statusEl;
    this.coachEl = coachEl;

    this.pointer = null;
    this.strokes = [];
    this.currentStroke = null;
    this.currentMode = null;
    this.currentColor = "#ffd93d";
    this.brushSize = 8;
    this.eraserSize = 26;

    this.lastHintSwap = performance.now();
    this.hintInterval = 7000;
    this.hints = [
      "Extiende el índice para dibujar trazos continuos.",
      "Haz puño para borrar con una goma suave.",
      "Mano abierta sobre la paleta = cambia de color.",
      "Mano abierta en el centro por 2 s = limpia la pizarra."
    ];
    this.activeHint = this.hints[0];

    this.palette = this.createPalette();

    this.setStatus("Extiende el índice para ver el puntero activo.");
    if (this.coachEl) {
      this.coachEl.textContent =
        "Ded o índice extendido = dibujar · Puño = borrar · Mano abierta en la paleta = nuevo color · Mano abierta sostenida = limpiar.";
    }
  }

  createPalette() {
    const baseX = 70;
    const startY = 140;
    const spacing = 90;
    const colors = [
      { color: "#ffd93d", label: "Amarillo" },
      { color: "#4ecdc4", label: "Turquesa" },
      { color: "#ff6b6b", label: "Coral" },
      { color: "#c084fc", label: "Lavanda" },
      { color: "#ffffff", label: "Blanco" }
    ];

    return colors.map((entry, idx) => ({
      ...entry,
      x: baseX,
      y: startY + idx * spacing,
      radius: 28
    }));
  }

  setStatus(text) {
    if (this.statusEl) {
      this.statusEl.textContent = text;
    }
  }

  updatePointer(palm) {
    if (!palm) {
      this.pointer = null;
      return;
    }
    this.pointer = {
      x: Math.max(0, Math.min(this.canvas.width, palm.x)),
      y: Math.max(0, Math.min(this.canvas.height, palm.y))
    };
  }

  getPointer(palm) {
    if (palm) {
      return {
        x: Math.max(0, Math.min(this.canvas.width, palm.x)),
        y: Math.max(0, Math.min(this.canvas.height, palm.y))
      };
    }
    return this.pointer;
  }

  startDrawing(palm) {
    const point = this.getPointer(palm);
    if (!point) return;

    this.currentMode = "draw";
    this.currentStroke = {
      mode: "draw",
      color: this.currentColor,
      width: this.brushSize,
      points: [point]
    };
    this.strokes.push(this.currentStroke);
    this.setStatus("Dibujando... mantén el índice extendido para continuar.");
  }

  continueDrawing(palm) {
    if (!this.currentStroke || this.currentMode !== "draw") return;
    const point = this.getPointer(palm);
    if (!point) return;

    const lastPoint =
      this.currentStroke.points[this.currentStroke.points.length - 1];
    if (distance(lastPoint, point) >= MIN_POINT_DELTA) {
      this.currentStroke.points.push(point);
    }
  }

  endDrawing() {
    if (this.currentMode === "draw" && this.currentStroke) {
      if (this.currentStroke.points.length < 2) {
        this.strokes.pop();
      }
    }
    this.currentMode = null;
    this.currentStroke = null;
    this.setStatus("Trazo guardado. Extiende el índice para dibujar otro.");
  }

  startErasing(palm) {
    const point = this.getPointer(palm);
    if (!point) return;

    this.currentMode = "erase";
    this.currentStroke = {
      mode: "erase",
      width: this.eraserSize,
      points: [point]
    };
    this.strokes.push(this.currentStroke);
    this.setStatus("Goma activa. Mantén el puño para seguir borrando.");
  }

  continueErasing(palm) {
    if (!this.currentStroke || this.currentMode !== "erase") return;
    const point = this.getPointer(palm);
    if (!point) return;

    const lastPoint =
      this.currentStroke.points[this.currentStroke.points.length - 1];
    if (distance(lastPoint, point) >= MIN_POINT_DELTA) {
      this.currentStroke.points.push(point);
    }
  }

  endErasing() {
    if (this.currentMode === "erase" && this.currentStroke) {
      if (this.currentStroke.points.length < 2) {
        this.strokes.pop();
      }
    }
    this.currentMode = null;
    this.currentStroke = null;
    this.setStatus("Goma desactivada.");
  }

  isPointerInPalette(palm) {
    const point = this.getPointer(palm);
    if (!point) return false;
    return this.palette.some((entry) => distance(entry, point) <= entry.radius);
  }

  attemptColorPick(palm) {
    const point = this.getPointer(palm);
    if (!point) return;

    const entry = this.palette.find(
      (colorEntry) => distance(colorEntry, point) <= colorEntry.radius
    );

    if (entry) {
      this.currentColor = entry.color;
      this.setStatus(`Color seleccionado: ${entry.label}`);
    }
  }

  clearBoard() {
    this.strokes = [];
    this.currentStroke = null;
    this.currentMode = null;
    this.setStatus("Pizarra limpia. Extiende el índice para empezar un nuevo trazo.");
  }

  reset() {
    this.clearBoard();
  }

  drawGrid() {
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = "#ffffff15";
    ctx.lineWidth = 1;

    for (let x = 0; x <= this.canvas.width; x += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, this.canvas.height);
      ctx.stroke();
    }

    for (let y = 0; y <= this.canvas.height; y += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(this.canvas.width, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  drawBackground() {
    const ctx = this.ctx;
    const gradient = ctx.createLinearGradient(
      0,
      0,
      0,
      this.canvas.height
    );
    gradient.addColorStop(0, "#0e1325");
    gradient.addColorStop(1, "#05070f");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
  }

  drawStrokes() {
    const ctx = this.ctx;
    this.strokes.forEach((stroke) => {
      if (!stroke.points || stroke.points.length < 2) return;

      ctx.save();
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = stroke.width;

      if (stroke.mode === "erase") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = stroke.color;
        ctx.shadowColor = stroke.color + "66";
        ctx.shadowBlur = 8;
      }

      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        const point = stroke.points[i];
        ctx.lineTo(point.x, point.y);
      }
      ctx.stroke();
      ctx.restore();
    });
    ctx.globalCompositeOperation = "source-over";
  }

  drawPalette() {
    const ctx = this.ctx;
    ctx.save();
    ctx.font = "14px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";

    this.palette.forEach((entry) => {
      ctx.beginPath();
      ctx.fillStyle = "#00000033";
      ctx.arc(entry.x, entry.y, entry.radius + 6, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.fillStyle = entry.color;
      ctx.arc(entry.x, entry.y, entry.radius, 0, Math.PI * 2);
      ctx.fill();

      if (entry.color === this.currentColor) {
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 4;
        ctx.stroke();
      }

      ctx.fillStyle = "#ffffffcc";
      ctx.fillText(entry.label, entry.x + entry.radius + 16, entry.y);
    });

    ctx.restore();
  }

  drawHint(timestamp) {
    if (timestamp - this.lastHintSwap > this.hintInterval) {
      this.lastHintSwap = timestamp;
      const currentIndex = this.hints.indexOf(this.activeHint);
      const nextIndex = (currentIndex + 1) % this.hints.length;
      this.activeHint = this.hints[nextIndex];
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.fillStyle = "#ffffffcc";
    ctx.font = "16px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(
      this.activeHint,
      this.canvas.width / 2,
      this.canvas.height - 30
    );
    ctx.restore();
  }

  drawPointer() {
    if (!this.pointer) return;
    const ctx = this.ctx;
    ctx.save();
    ctx.strokeStyle = POINTER_COLOR;
    ctx.lineWidth = 2;
    ctx.shadowColor = POINTER_GLOW;
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.arc(this.pointer.x, this.pointer.y, 14, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(this.pointer.x - 18, this.pointer.y);
    ctx.lineTo(this.pointer.x + 18, this.pointer.y);
    ctx.moveTo(this.pointer.x, this.pointer.y - 18);
    ctx.lineTo(this.pointer.x, this.pointer.y + 18);
    ctx.stroke();
    ctx.restore();
  }

  draw(timestamp = performance.now()) {
    this.drawBackground();
    this.drawGrid();
    this.drawStrokes();
    this.drawPalette();
    this.drawHint(timestamp);
    this.drawPointer();
  }
}

