const COMPONENTS = [
  { id: "bateria", x: 100, y: 200, angle: 0 },
  { id: "bulb", x: 300, y: 150, angle: 0 },
  { id: "switch", x: 500, y: 220, angle: 0, closed: false },
  { id: "wireA", x: 200, y: 260, angle: 0 },
  { id: "wireB", x: 400, y: 120, angle: 0 },
];

export class LabScene {
  constructor(canvas, statusEl, coachEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.statusEl = statusEl;
    this.coachEl = coachEl;
    this.components = JSON.parse(JSON.stringify(COMPONENTS));
    this.selectedId = null;
    this.lastHint = 0;
    this.pointer = null;
  }

  selectNearest(palm) {
    if (!palm) return null;
    let best = null;
    let minDist = Infinity;
    this.components.forEach((comp) => {
      const d = Math.hypot(comp.x - palm.x, comp.y - palm.y);
      if (d < minDist) {
        minDist = d;
        best = comp;
      }
    });
    this.selectedId = best?.id ?? null;
    return this.selectedId;
  }

  dragSelected(palm) {
    if (!this.selectedId || !palm) return;
    const comp = this.components.find((c) => c.id === this.selectedId);
    comp.x = palm.x;
    comp.y = palm.y;
    this.setStatus(`Moviendo ${comp.id}`);
  }

  dropSelected() {
    if (!this.selectedId) return;
    this.setStatus(`Colocaste ${this.selectedId}`);
    this.selectedId = null;
  }

  getSelectedAngle() {
    if (!this.selectedId) return { componentAngle: 0, angle: 0 };
    const comp = this.components.find((c) => c.id === this.selectedId);
    return { componentAngle: comp?.angle ?? 0, angle: comp?.angle ?? 0 };
  }

  rotateSelected(angle, deltaAngle = null) {
    if (!this.selectedId) return;
    const comp = this.components.find((c) => c.id === this.selectedId);
    
    // Usar el ángulo calculado con sensibilidad aplicada
    // Normalizar a rango 0-360
    comp.angle = ((angle % 360) + 360) % 360;
    
    const angleDeg = Math.round(comp.angle);
    this.setStatus(`Rotando ${comp.id} (${angleDeg}°)`);
  }

  toggleSwitch() {
    const sw = this.components.find((c) => c.id === "switch");
    sw.closed = !sw.closed;
    this.setStatus(`Interruptor ${sw.closed ? "cerrado" : "abierto"}`);
  }

  evaluate(smileDetected) {
    const sw = this.components.find((c) => c.id === "switch");
    const success = sw.closed && this.isCircuitClosed();
    if (success) {
      this.setStatus("Circuito completo ⚡");
    } else {
      this.setStatus("Revisa las conexiones…");
      if (smileDetected) {
        this.coachEl.textContent = "Cerca, necesitarás unir los cables positivo y negativo.";
      }
    }
    return success;
  }

  requestAssistance() {
    const now = performance.now();
    if (now - this.lastHint < 5000) return;
    this.lastHint = now;
    this.coachEl.textContent = "Tip: conecta la batería al foco usando ambos cables y cierra el switch.";
  }

  updatePointer(palm) {
    this.pointer = palm ? { ...palm } : null;
  }

  isCircuitClosed() {
    // Placeholder: en un prototipo real revisaríamos colisiones y enlaces.
    return this.components.every((c) => c.x > 50 && c.x < 590);
  }

  reset() {
    this.components = JSON.parse(JSON.stringify(COMPONENTS));
    this.selectedId = null;
    this.setStatus("Estado: reiniciado");
    this.coachEl.textContent = "Intenta armar el circuito básico antes del reto.";
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.fillStyle = "#0b1018";
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.components.forEach((component) => {
      ctx.save();
      ctx.translate(component.x, component.y);
      ctx.rotate((component.angle * Math.PI) / 180);
      ctx.fillStyle = component.id === "bulb" ? "#ffd54f" : "#6cb4ff";
      ctx.strokeStyle = this.selectedId === component.id ? "#ff5f9e" : "#1f8fff";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(-40, -20, 80, 40, 6);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0b1018";
      ctx.font = "12px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(component.id, 0, 4);
      ctx.restore();
    });

    if (this.pointer) {
      ctx.save();
      ctx.strokeStyle = "#ff9f43";
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      ctx.arc(this.pointer.x, this.pointer.y, 12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.pointer.x - 16, this.pointer.y);
      ctx.lineTo(this.pointer.x + 16, this.pointer.y);
      ctx.moveTo(this.pointer.x, this.pointer.y - 16);
      ctx.lineTo(this.pointer.x, this.pointer.y + 16);
      ctx.stroke();
      ctx.restore();
    }
  }

  setStatus(text) {
    this.statusEl.textContent = text;
  }
}

