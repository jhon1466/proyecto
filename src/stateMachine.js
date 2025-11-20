const COLOR_PICK_HOLD_MS = 250;
const CLEAR_HOLD_MS = 1800;

export class GestureStateMachine {
  constructor(onAction) {
    this.state = "idle";
    this.onAction = onAction;
    this.latestGestures = {};
    this.colorHoldStart = null;
    this.openHandHoldStart = null;
    this.clearTriggered = false;
  }

  update(gestures, timestamp = performance.now()) {
    this.latestGestures = gestures;
    this.handleUtilityGestures(gestures, timestamp);

    switch (this.state) {
      case "idle":
        this.handleIdle(gestures);
        break;
      case "drawing":
        this.handleDrawing(gestures);
        break;
      case "erasing":
        this.handleErasing(gestures);
        break;
      default:
        this.state = "idle";
        break;
    }
  }

  handleIdle(gestures) {
    if (!gestures?.palm) {
      return;
    }

    if (gestures.pointer) {
      this.state = "drawing";
      this.onAction("startDrawing", { palm: gestures.palm });
      return;
    }

    if (gestures.fist) {
      this.state = "erasing";
      this.onAction("startErasing", { palm: gestures.palm });
    }
  }

  handleDrawing(gestures) {
    if (gestures.pointer && gestures.palm) {
      this.onAction("continueDrawing", { palm: gestures.palm });
      return;
    }

    this.onAction("endDrawing");
    this.state = "idle";
  }

  handleErasing(gestures) {
    if (gestures.fist && gestures.palm) {
      this.onAction("continueErasing", { palm: gestures.palm });
      return;
    }

    this.onAction("endErasing");
    this.state = "idle";
  }

  handleUtilityGestures(gestures, timestamp) {
    if (!gestures?.palm) {
      this.resetHolds();
      return;
    }

    if (this.state !== "idle") {
      // No permitir acciones auxiliares mientras se dibuja o borra
      this.resetHolds();
      return;
    }

    if (!gestures.openHand) {
      this.resetHolds();
      return;
    }

    const inPalette = !!this.onAction("isPointerInPalette", {
      palm: gestures.palm,
    });

    if (inPalette) {
      if (this.colorHoldStart === null) {
        this.colorHoldStart = timestamp;
      }

      if (timestamp - this.colorHoldStart >= COLOR_PICK_HOLD_MS) {
        this.onAction("attemptColorPick", { palm: gestures.palm });
        this.colorHoldStart = timestamp;
      }

      this.openHandHoldStart = null;
      this.clearTriggered = false;
      return;
    }

    // Open hand fuera de la paleta = gesto de "limpiar"
    if (this.openHandHoldStart === null) {
      this.openHandHoldStart = timestamp;
      this.clearTriggered = false;
    }

    const heldFor = timestamp - this.openHandHoldStart;
    if (heldFor >= CLEAR_HOLD_MS && !this.clearTriggered) {
      this.onAction("clearBoard");
      this.clearTriggered = true;
    }
  }

  resetHolds() {
    this.colorHoldStart = null;
    this.openHandHoldStart = null;
    this.clearTriggered = false;
  }
}
