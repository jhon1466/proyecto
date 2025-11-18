const GESTURE_TIMEOUT = 120; // ms

export class GestureStateMachine {
  constructor(onAction) {
    this.state = "idle";
    this.lastGestureAt = 0;
    this.onAction = onAction;
    this.currentSelection = null;
    this.latestGestures = {};
    this.rotationStartHandAngle = null;
    this.rotationStartComponentAngle = null;
    this.lastRotationAngle = null;
    this.rotationSensitivity = 2.5; // Multiplicador de sensibilidad
  }

  update(gestures, timestamp = performance.now()) {
    this.lastGestureAt = timestamp;
    this.latestGestures = gestures;
    switch (this.state) {
      case "idle":
        this.handleIdle(gestures);
        break;
      case "dragging":
        this.handleDragging(gestures);
        break;
      case "rotating":
        this.handleRotating(gestures);
        break;
      default:
        break;
    }

  }

  handleIdle(gestures) {
    // Puño para agarrar (como agarrar un objeto)
    if (gestures.fist) {
      this.state = "dragging";
      this.currentSelection = this.onAction("select", { palm: gestures.palm });
    }
  }

  handleDragging(gestures) {
    if (!gestures.fist && !gestures.pointer && !gestures.openHand) {
      // No gesto válido → timeout a idle
      if (performance.now() - this.lastGestureAt > GESTURE_TIMEOUT) {
        this.state = "idle";
      }
      return;
    }

    if (gestures.pointer) {
      this.state = "rotating";
      const currentHandAngle = gestures.angle ?? 0;
      // Obtener el ángulo inicial del componente
      const componentInfo = this.onAction("rotateStart", {
        selectionId: this.currentSelection,
        palm: gestures.palm,
        handAngle: currentHandAngle,
      });
      // Guardar el ángulo inicial de la mano y del componente
      this.rotationStartHandAngle = currentHandAngle;
      this.rotationStartComponentAngle = componentInfo?.componentAngle ?? 0;
      this.lastRotationAngle = currentHandAngle;
      return;
    }

    // Mantener agarrado con puño
    if (gestures.fist) {
      this.onAction("drag", {
        selectionId: this.currentSelection,
        palm: gestures.palm,
      });
      return;
    }

    // Mano abierta para soltar (como soltar un objeto)
    if (gestures.openHand) {
      this.onAction("drop", { selectionId: this.currentSelection });
      this.currentSelection = null;
      this.state = "idle";
    }
  }

  handleRotating(gestures) {
    if (gestures.pointer) {
      const currentHandAngle = gestures.angle ?? 0;
      
      // Calcular cambio relativo desde el ángulo inicial de la mano
      if (this.lastRotationAngle !== null && 
          this.rotationStartHandAngle !== null && 
          this.rotationStartComponentAngle !== null) {
        // Calcular cuánto ha cambiado la mano desde el último frame
        let handDelta = currentHandAngle - this.lastRotationAngle;
        
        // Normalizar delta para manejar el cruce de 180/-180
        if (handDelta > 180) handDelta -= 360;
        if (handDelta < -180) handDelta += 360;
        
        // Aplicar sensibilidad al cambio
        const scaledDelta = handDelta * this.rotationSensitivity;
        
        // Obtener el ángulo actual del componente y sumar el cambio
        const componentInfo = this.onAction("getCurrentAngle", {
          selectionId: this.currentSelection,
        });
        const currentComponentAngle = componentInfo?.angle ?? this.rotationStartComponentAngle;
        
        // Calcular nuevo ángulo del componente
        let newComponentAngle = currentComponentAngle + scaledDelta;
        newComponentAngle = ((newComponentAngle % 360) + 360) % 360;
        
        this.onAction("rotate", {
          selectionId: this.currentSelection,
          angle: newComponentAngle,
          deltaAngle: scaledDelta,
          palm: gestures.palm,
        });
      }
      
      this.lastRotationAngle = currentHandAngle;
      return;
    }

    // Volver a arrastrar con puño
    if (gestures.fist) {
      this.state = "dragging";
      this.rotationStartHandAngle = null;
      this.rotationStartComponentAngle = null;
      this.lastRotationAngle = null;
      this.onAction("rotateEnd", { selectionId: this.currentSelection });
      return;
    }

    // Soltar con mano abierta
    if (gestures.openHand) {
      this.rotationStartHandAngle = null;
      this.rotationStartComponentAngle = null;
      this.lastRotationAngle = null;
      this.onAction("rotateEnd", { selectionId: this.currentSelection });
      this.onAction("drop", { selectionId: this.currentSelection });
      this.currentSelection = null;
      this.state = "idle";
    }
  }
}

