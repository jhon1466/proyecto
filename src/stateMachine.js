const GESTURE_TIMEOUT = 120; // ms

export class GestureStateMachine {
  constructor(onAction) {
    this.state = "idle";
    this.lastGestureAt = 0;
    this.onAction = onAction;
    this.currentSelection = null;
    this.latestGestures = {};
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

    if (gestures.smile) this.onAction("evaluate", { palm: gestures.palm });
    if (gestures.wink) this.onAction("toggleSwitch", { palm: gestures.palm });
    if (gestures.frown) this.onAction("assist", { palm: gestures.palm });
  }

  handleIdle(gestures) {
    if (gestures.openHand) {
      this.state = "dragging";
      this.currentSelection = this.onAction("select", { palm: gestures.palm });
    }
  }

  handleDragging(gestures) {
    if (!gestures.openHand && !gestures.pointer && !gestures.fist) {
      // No gesto válido → timeout a idle
      if (performance.now() - this.lastGestureAt > GESTURE_TIMEOUT) {
        this.state = "idle";
      }
      return;
    }

    if (gestures.pointer) {
      this.state = "rotating";
      this.onAction("rotateStart", {
        selectionId: this.currentSelection,
        palm: gestures.palm,
      });
      return;
    }

    this.onAction("drag", {
      selectionId: this.currentSelection,
      palm: gestures.palm,
    });

    if (gestures.fist) {
      this.onAction("drop", { selectionId: this.currentSelection });
      this.currentSelection = null;
      this.state = "idle";
    }
  }

  handleRotating(gestures) {
    if (gestures.pointer) {
      this.onAction("rotate", {
        selectionId: this.currentSelection,
        angle: gestures.angle ?? 0,
        palm: gestures.palm,
      });
      return;
    }

    if (gestures.openHand) {
      this.state = "dragging";
      this.onAction("rotateEnd", { selectionId: this.currentSelection });
      return;
    }

    if (gestures.fist) {
      this.onAction("rotateEnd", { selectionId: this.currentSelection });
      this.onAction("drop", { selectionId: this.currentSelection });
      this.currentSelection = null;
      this.state = "idle";
    }
  }
}

