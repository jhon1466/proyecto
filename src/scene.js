// Importar motor de física avanzado (opcional)
// Se importa dinámicamente cuando se necesita

// Sistema de física simple para el juego de lanzamiento (fallback)
class PhysicsObject {
  constructor(x, y, radius, color, type = "ball", canvasWidth = 960, canvasHeight = 720) {
    this.x = x;
    this.y = y;
    this.vx = 0;
    this.vy = 0;
    this.radius = radius;
    this.color = color;
    this.type = type;
    this.rotation = 0;
    this.angularVel = 0;
    this.mass = radius * 0.1;
    this.active = true;
    this.trail = [];
    this.canvasWidth = canvasWidth;
    this.canvasHeight = canvasHeight;
  }

  update(dt) {
    if (!this.active) return;

    // Gravedad
    this.vy += 500 * dt; // 500 px/s²

    // Fricción del aire
    this.vx *= 0.98;
    this.vy *= 0.98;

    // Actualizar posición
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Rotación
    this.rotation += this.angularVel * dt;
    this.angularVel *= 0.95;

    // Guardar trail
    this.trail.push({ x: this.x, y: this.y });
    if (this.trail.length > 15) this.trail.shift();

    // Rebotes en los bordes
    if (this.x - this.radius < 0) {
      this.x = this.radius;
      this.vx *= -0.7;
    }
    if (this.x + this.radius > this.canvasWidth) {
      this.x = this.canvasWidth - this.radius;
      this.vx *= -0.7;
    }
    if (this.y - this.radius < 0) {
      this.y = this.radius;
      this.vy *= -0.7;
    }
    if (this.y + this.radius > this.canvasHeight) {
      this.y = this.canvasHeight - this.radius;
      this.vy *= -0.5;
      this.vx *= 0.8;
      if (Math.abs(this.vy) < 50) {
        this.vy = 0;
        this.vx *= 0.9;
      }
    }

    // Desactivar si está muy quieto y abajo
    if (this.y > this.canvasHeight - 20 && Math.abs(this.vx) < 10 && Math.abs(this.vy) < 10) {
      this.active = false;
    }
  }

  draw(ctx) {
    if (!this.active) return;

    // Dibujar trail
    if (this.trail.length > 1) {
      ctx.strokeStyle = this.color + "40";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(this.trail[0].x, this.trail[0].y);
      for (let i = 1; i < this.trail.length; i++) {
        ctx.lineTo(this.trail[i].x, this.trail[i].y);
      }
      ctx.stroke();
    }

    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.rotate(this.rotation);

    if (this.type === "ball") {
      // Pelota con gradiente
      const gradient = ctx.createRadialGradient(0, -this.radius * 0.3, 0, 0, 0, this.radius);
      gradient.addColorStop(0, "#ffffff");
      gradient.addColorStop(0.3, this.color);
      gradient.addColorStop(1, this.color + "cc");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (this.type === "box") {
      // Caja
      ctx.fillStyle = this.color;
      ctx.fillRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 2;
      ctx.strokeRect(-this.radius, -this.radius, this.radius * 2, this.radius * 2);
    }

    ctx.restore();
  }
}

class Target {
  constructor(x, y, width, height, color) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.color = color;
    this.hit = false;
    this.hitTime = 0;
  }

  checkCollision(obj) {
    if (this.hit || !obj.active) return false;
    
    return (
      obj.x + obj.radius > this.x &&
      obj.x - obj.radius < this.x + this.width &&
      obj.y + obj.radius > this.y &&
      obj.y - obj.radius < this.y + this.height
    );
  }

  draw(ctx) {
    ctx.save();
    
    if (this.hit) {
      ctx.globalAlpha = 0.3;
    }
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, this.width, this.height);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 3;
    ctx.strokeRect(this.x, this.y, this.width, this.height);
    
    if (!this.hit) {
      ctx.fillStyle = "#ffffff";
      ctx.font = "bold 16px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("🎯", this.x + this.width / 2, this.y + this.height / 2 + 6);
    }
    
    ctx.restore();
  }
}

export class LabScene {
  constructor(canvas, statusEl, coachEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.statusEl = statusEl;
    this.coachEl = coachEl;
    this.selectedId = null;
    this.pointer = null;
    this.lastTime = performance.now();
    
    // Objetos físicos
    this.objects = [];
    
    // Objetivos bien distribuidos en el lado derecho del canvas (960x720)
    // Posiciones ajustadas para el nuevo tamaño, evitando estructuras
    this.targets = [
      new Target(700, 150, 80, 60, "#ff6b6b"),   // Objetivo rojo - arriba izquierda
      new Target(800, 180, 60, 50, "#4ecdc4"),   // Objetivo azul - arriba centro
      new Target(880, 140, 70, 55, "#ffe66d"),   // Objetivo amarillo - arriba derecha
    ];
    
    // Sistema de lanzamiento
    this.launchPosition = { x: 150, y: 600 }; // Posición inicial más abajo
    this.launchVelocity = { x: 0, y: 0 };
    this.lastPalmPos = null;
    this.isLaunching = false;
    this.score = 0;
    
    // Sistema de resortera
    this.slingshotActive = false;
    this.slingshotBase = { x: 150, y: 650 }; // Resortera en la parte inferior izquierda
    this.slingshotPull = null; // Posición actual del pellizco
    this.slingshotAngle = 0;
    this.slingshotForce = 0;
    
    // Objetos disponibles para lanzar (más variedad)
    this.availableObjects = [
      { type: "ball", radius: 20, color: "#ff6b6b", name: "Pelota Roja" },
      { type: "ball", radius: 25, color: "#4ecdc4", name: "Pelota Azul" },
      { type: "box", radius: 22, color: "#ffe66d", name: "Caja Amarilla" },
      { type: "bomb", radius: 18, color: "#ff0000", name: "Bomba" },
    ];
    this.currentObjectIndex = 0;
    
    // Intentar usar Matter.js si está disponible
    this.useAdvancedPhysics = false;
    this.physicsEngine = null;
    this.initAdvancedPhysics();
  }
  
  async initAdvancedPhysics() {
    if (!window.Matter) {
      console.log('Matter.js no disponible, usando física básica');
      return;
    }
    
    try {
      const physicsModule = await import('./physics-engine.js');
      const PhysicsEngine = physicsModule.PhysicsEngine;
      this.physicsEngine = new PhysicsEngine(this.canvas);
      this.useAdvancedPhysics = true;
      this.setupAdvancedLevel();
      this.setStatus("Física avanzada activada con Matter.js!");
    } catch (e) {
      console.error('Error inicializando Matter.js:', e);
      this.useAdvancedPhysics = false;
    }
  }
  
  setupAdvancedLevel() {
    if (!this.useAdvancedPhysics) return;
    
    // Crear estructuras destructibles bien organizadas
    // Canvas es 960x720, resortera está en (150, 650)
    // Estructuras en el lado derecho, a diferentes alturas
    // Y crece hacia abajo. Las estructuras se crean desde el centro.
    // Si queremos que la base esté en Y=650, y altura=120, centro = 650 - 60 = 590
    const groundLevel = 650; // Nivel del suelo
    
    const structures = [
      // Torre izquierda - más baja, cerca del suelo
      // Base en Y=640, altura=100, centro = 640 - 50 = 590
      { x: 600, y: 590, width: 100, height: 100, color: '#8b4513' },
      // Torre central - media altura
      // Base en Y=620, altura=130, centro = 620 - 65 = 555
      { x: 750, y: 555, width: 120, height: 130, color: '#654321' },
      // Torre derecha - más alta
      // Base en Y=600, altura=160, centro = 600 - 80 = 520
      { x: 850, y: 520, width: 90, height: 160, color: '#8b4513' },
    ];
    
    structures.forEach(struct => {
      this.physicsEngine.createDestructibleStructure(
        struct.x, struct.y, struct.width, struct.height, struct.color
      );
    });
    
    // Crear plataformas de apoyo para las estructuras (suelo)
    // Las plataformas deben estar en el nivel del suelo
    // Plataforma base para la torre izquierda
    this.physicsEngine.createPlatform(600, groundLevel, 120, 20, '#4a5568');
    // Plataforma base para la torre central
    this.physicsEngine.createPlatform(750, groundLevel, 140, 20, '#4a5568');
    // Plataforma base para la torre derecha
    this.physicsEngine.createPlatform(850, groundLevel, 110, 20, '#4a5568');
    
    // Plataforma adicional en el medio para más desafío
    this.physicsEngine.createPlatform(500, 550, 150, 20, '#4a5568');
  }

  selectNearest(palm) {
    if (!palm) return null;
    
    // Permitir agarrar desde cualquier lugar (más intuitivo)
    // Si no hay objeto seleccionado y hay objetos disponibles, agarrar
    if (!this.selectedId && this.availableObjects.length > 0) {
      this.selectedId = "launcher";
      this.launchPosition = { x: palm.x, y: palm.y };
      this.lastPalmPos = { x: palm.x, y: palm.y };
      this.launchVelocity = { x: 0, y: 0 };
      this.isLaunching = true;
      this.setStatus("Apunta y mueve la mano para lanzar");
      return "launcher";
    }
    
    return null;
  }

  dragSelected(palm) {
    if (!this.selectedId || !palm) return;
    
    if (this.selectedId === "launcher") {
      // Actualizar posición de lanzamiento
      this.launchPosition = { x: palm.x, y: palm.y };
      
      // Si no estamos ajustando con el puntero, calcular velocidad basada en movimiento
      if (this.lastPalmPos) {
        const dx = palm.x - this.lastPalmPos.x;
        const dy = palm.y - this.lastPalmPos.y;
        const dt = 0.016; // ~60fps
        
        // Suavizar la velocidad (promedio móvil)
        const smoothing = 0.5;
        this.launchVelocity.x = this.launchVelocity.x * (1 - smoothing) + (dx / dt) * smoothing;
        this.launchVelocity.y = this.launchVelocity.y * (1 - smoothing) + (dy / dt) * smoothing;
      }
      
      this.lastPalmPos = { x: palm.x, y: palm.y };
      
      // Mostrar velocidad actual
      const speed = Math.hypot(this.launchVelocity.x, this.launchVelocity.y);
      this.setStatus(`Apunta y suelta para lanzar (velocidad: ${Math.round(speed)} px/s)`);
    }
  }

  adjustTrajectory(angle, indexDistance, palm) {
    if (!this.selectedId || this.selectedId !== "launcher" || !palm) return;
    
    // Usar el ángulo del índice para determinar la dirección
    const angleRad = (angle * Math.PI) / 180;
    
    // Calcular la fuerza basada en la distancia del índice desde la muñeca
    // La distancia normalizada (0-1) se mapea a fuerza (200-2000 px/s)
    const minForce = 200;
    const maxForce = 2000;
    let force = minForce;
    
    if (indexDistance !== null && indexDistance > 0) {
      // La distancia del índice indica qué tan extendido está
      // Normalizar: distancia típica de índice extendido es ~0.15-0.25
      const normalizedDist = Math.max(0, Math.min(1, (indexDistance - 0.1) / 0.2));
      force = minForce + (maxForce - minForce) * normalizedDist;
    } else {
      // Si no hay distancia, usar fuerza base basada en movimiento
      const baseForce = 800;
      if (this.lastPalmPos && palm) {
        const dx = palm.x - this.lastPalmPos.x;
        const dy = palm.y - this.lastPalmPos.y;
        const movementSpeed = Math.hypot(dx, dy) / 0.016;
        force = Math.max(minForce, Math.min(maxForce, movementSpeed * 1.5 + baseForce * 0.5));
      } else {
        force = baseForce;
      }
    }
    
    // Calcular velocidad basada en ángulo y fuerza
    this.launchVelocity.x = Math.cos(angleRad) * force;
    this.launchVelocity.y = Math.sin(angleRad) * force;
    
    // Mostrar información
    const speed = Math.hypot(this.launchVelocity.x, this.launchVelocity.y);
    const angleDeg = Math.round(angle);
    const forcePercent = Math.round(((force - minForce) / (maxForce - minForce)) * 100);
    this.setStatus(`Dirección: ${angleDeg}° | Fuerza: ${forcePercent}% (${Math.round(speed)} px/s) | Extiende más el índice para más fuerza`);
  }

  dropSelected() {
    if (!this.selectedId) return;
    
    if (this.selectedId === "launcher" && this.isLaunching) {
      // Lanzar objeto solo si hay velocidad mínima
      const minSpeed = 100;
      const speed = Math.hypot(this.launchVelocity.x, this.launchVelocity.y);
      
      if (speed > minSpeed) {
        const objConfig = this.availableObjects[this.currentObjectIndex];
        
        if (this.useAdvancedPhysics && this.physicsEngine) {
          // Usar Matter.js para física avanzada
          const body = this.physicsEngine.createProjectile(
            this.launchPosition.x,
            this.launchPosition.y,
            objConfig.type,
            objConfig.color,
            objConfig.radius
          );
          
          if (body) {
            // Convertir velocidad de px/s a la escala de Matter.js
            this.physicsEngine.launchProjectile(
              body,
              this.launchVelocity.x * 0.01,
              this.launchVelocity.y * 0.01
            );
          }
        } else {
          // Usar física básica
          const obj = new PhysicsObject(
            this.launchPosition.x,
            this.launchPosition.y,
            objConfig.radius,
            objConfig.color,
            objConfig.type,
            this.canvas.width,
            this.canvas.height
          );
          
          obj.vx = this.launchVelocity.x;
          obj.vy = this.launchVelocity.y;
          obj.angularVel = (Math.random() - 0.5) * 10;
          this.objects.push(obj);
        }
        
        // Cambiar al siguiente objeto
        this.currentObjectIndex = (this.currentObjectIndex + 1) % this.availableObjects.length;
        
        this.setStatus(`¡Objeto lanzado! Puntos: ${this.score}`);
      } else {
        this.setStatus("Mueve la mano más rápido para lanzar");
      }
      
      this.isLaunching = false;
      this.launchVelocity = { x: 0, y: 0 };
      this.lastPalmPos = null;
    }
    
    this.selectedId = null;
  }

  startSlingshot(pinchPosition, pinchDistance, angle) {
    if (!pinchPosition) return null;
    
    // Mapear coordenadas normalizadas usando el mismo sistema que smoothPalmCoords
    const scaleX = 1.0;
    const scaleY = 1.3;
    const offsetY = -0.1;
    
    let normalizedX = pinchPosition.x;
    let normalizedY = (pinchPosition.y + offsetY) * scaleY;
    normalizedY = Math.max(0, Math.min(1, normalizedY));
    
    const mappedX = normalizedX * this.canvas.width;
    const mappedY = normalizedY * this.canvas.height;
    
    // Invertir X para modo espejo
    const mirroredX = this.canvas.width - mappedX;
    
    // Establecer posición base de la resortera (parte inferior izquierda)
    this.slingshotBase = {
      x: 150,
      y: this.canvas.height - 70
    };
    
    // Posición inicial del pellizco
    this.slingshotPull = {
      x: Math.max(0, Math.min(this.canvas.width, mirroredX)),
      y: Math.max(0, Math.min(this.canvas.height, mappedY))
    };
    
    this.slingshotActive = true;
    this.slingshotAngle = angle || 0;
    this.slingshotForce = 0;
    
    this.setStatus("Pellizca y estira para cargar la resortera. Suelta para lanzar!");
    return "slingshot";
  }

  updateSlingshot(pinchPosition, pinchDistance, angle) {
    if (!pinchPosition || !this.slingshotActive) return;
    
    // Mapear coordenadas normalizadas usando el mismo sistema que smoothPalmCoords
    const scaleX = 1.0;
    const scaleY = 1.3;
    const offsetY = -0.1;
    
    let normalizedX = pinchPosition.x;
    let normalizedY = (pinchPosition.y + offsetY) * scaleY;
    normalizedY = Math.max(0, Math.min(1, normalizedY));
    
    const mappedX = normalizedX * this.canvas.width;
    const mappedY = normalizedY * this.canvas.height;
    
    // Invertir X para modo espejo
    const mirroredX = this.canvas.width - mappedX;
    
    // Actualizar posición del pellizco
    this.slingshotPull = {
      x: Math.max(0, Math.min(this.canvas.width, mirroredX)),
      y: Math.max(0, Math.min(this.canvas.height, mappedY))
    };
    
    // Calcular distancia desde la base (fuerza)
    const dx = this.slingshotPull.x - this.slingshotBase.x;
    const dy = this.slingshotPull.y - this.slingshotBase.y;
    const distance = Math.hypot(dx, dy);
    
    // Limitar distancia máxima
    const maxDistance = 200;
    const clampedDistance = Math.min(distance, maxDistance);
    
    // Calcular fuerza (más distancia = más fuerza)
    this.slingshotForce = clampedDistance;
    this.slingshotAngle = angle || Math.atan2(dy, dx) * 180 / Math.PI;
    
    // Calcular velocidad de lanzamiento
    const forceMultiplier = 8; // Ajustar según necesidad
    const angleRad = Math.atan2(dy, dx);
    this.launchVelocity.x = Math.cos(angleRad) * this.slingshotForce * forceMultiplier;
    this.launchVelocity.y = Math.sin(angleRad) * this.slingshotForce * forceMultiplier;
    
    // Mostrar información
    const forcePercent = Math.round((this.slingshotForce / maxDistance) * 100);
    this.setStatus(`Resortera: ${forcePercent}% de fuerza | Suelta para lanzar`);
  }

  releaseSlingshot() {
    if (!this.slingshotActive) return;
    
    // Lanzar objeto con la fuerza calculada
    const minForce = 50;
    if (this.slingshotForce > minForce) {
      const objConfig = this.availableObjects[this.currentObjectIndex];
      
      if (this.useAdvancedPhysics && this.physicsEngine) {
        // Usar Matter.js
        const body = this.physicsEngine.createProjectile(
          this.slingshotBase.x,
          this.slingshotBase.y,
          objConfig.type,
          objConfig.color,
          objConfig.radius
        );
        
        if (body) {
          this.physicsEngine.launchProjectile(
            body,
            this.launchVelocity.x * 0.01,
            this.launchVelocity.y * 0.01
          );
        }
      } else {
        // Usar física básica
        const obj = new PhysicsObject(
          this.slingshotBase.x,
          this.slingshotBase.y,
          objConfig.radius,
          objConfig.color,
          objConfig.type,
          this.canvas.width,
          this.canvas.height
        );
        
        obj.vx = this.launchVelocity.x;
        obj.vy = this.launchVelocity.y;
        obj.angularVel = (Math.random() - 0.5) * 10;
        this.objects.push(obj);
      }
      
      // Cambiar al siguiente objeto
      this.currentObjectIndex = (this.currentObjectIndex + 1) % this.availableObjects.length;
      
      this.setStatus(`¡Objeto lanzado con resortera! Puntos: ${this.score}`);
    } else {
      this.setStatus("Estira más la resortera para lanzar");
    }
    
    // Resetear resortera
    this.slingshotActive = false;
    this.slingshotPull = null;
    this.slingshotForce = 0;
    this.launchVelocity = { x: 0, y: 0 };
  }

  getSelectedAngle() {
    return { componentAngle: 0, angle: 0 };
  }

  rotateSelected(angle, deltaAngle = null) {
    // No se usa en este juego
  }

  updatePointer(palm) {
    if (palm) {
      // Asegurar que el puntero esté dentro del canvas
      this.pointer = {
        x: Math.max(0, Math.min(this.canvas.width, palm.x)),
        y: Math.max(0, Math.min(this.canvas.height, palm.y))
      };
    } else {
      this.pointer = null;
    }
  }

  reset() {
    this.objects = [];
    
    // Limpiar Matter.js si está activo
    if (this.useAdvancedPhysics && this.physicsEngine) {
      this.physicsEngine.clear();
      this.setupAdvancedLevel(); // Recrear estructuras
    }
    
    this.targets.forEach(t => {
      t.hit = false;
      t.hitTime = 0;
    });
    this.score = 0;
    this.currentObjectIndex = 0;
    this.selectedId = null;
    this.isLaunching = false;
    this.slingshotActive = false;
    this.slingshotPull = null;
    this.slingshotForce = 0;
    this.setStatus("Juego reiniciado. Pellizca para usar la resortera!");
    this.coachEl.textContent = "Apunta a los objetivos rojos, azules y amarillos. ¡Destrúyelos todos!";
  }

  update(dt) {
    if (this.useAdvancedPhysics && this.physicsEngine) {
      // Usar Matter.js
      this.physicsEngine.update(dt);
      
      // Verificar colisiones con objetivos usando Matter.js
      this.targets.forEach(target => {
        const bodies = this.physicsEngine.getBodiesInArea(
          target.x, target.y, target.width, target.height
        );
        
        if (bodies.length > 0 && !target.hit) {
          target.hit = true;
          target.hitTime = performance.now();
          this.score += 10;
          this.setStatus(`¡Objetivo alcanzado! Puntos: ${this.score}`);
        }
      });
    } else {
      // Usar física básica
      this.objects.forEach(obj => {
        obj.update(dt);
        
        // Verificar colisiones con objetivos
        this.targets.forEach(target => {
          if (target.checkCollision(obj)) {
            target.hit = true;
            target.hitTime = performance.now();
            this.score += 10;
            this.setStatus(`¡Objetivo alcanzado! Puntos: ${this.score}`);
            
            obj.active = false;
          }
        });
      });
      
      // Limpiar objetos inactivos
      this.objects = this.objects.filter(obj => obj.active || obj.y < 400);
    }
  }

  draw() {
    const ctx = this.ctx;
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.02);
    this.lastTime = now;
    
    this.update(dt);
    
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Fondo con gradiente
    const bgGradient = ctx.createLinearGradient(0, 0, 0, this.canvas.height);
    bgGradient.addColorStop(0, "#1a1f35");
    bgGradient.addColorStop(1, "#0a0e1a");
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    
    // Dibujar objetivos
    this.targets.forEach(target => target.draw(ctx));
    
    // Dibujar objetos físicos
    if (this.useAdvancedPhysics && this.physicsEngine) {
      // Dibujar con Matter.js
      this.physicsEngine.draw(ctx);
    } else {
      // Dibujar física básica
      this.objects.forEach(obj => obj.draw(ctx));
    }
    
    // Dibujar objetos disponibles (más visibles) - en la parte superior izquierda
    this.availableObjects.forEach((objConfig, index) => {
      const x = 80 + index * 100;
      const y = 60;
      const isSelected = index === this.currentObjectIndex;
      const isReady = !this.isLaunching;
      
      ctx.save();
      ctx.translate(x, y);
      
      // Sombra
      ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
      ctx.beginPath();
      ctx.ellipse(0, objConfig.radius + 5, objConfig.radius * 0.8, objConfig.radius * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();
      
      // Efecto de pulso si está seleccionado y listo
      if (isSelected && isReady) {
        const pulse = Math.sin(Date.now() / 200) * 0.2 + 0.8;
        ctx.globalAlpha = pulse;
      }
      
      if (objConfig.type === "ball") {
        const gradient = ctx.createRadialGradient(0, -objConfig.radius * 0.3, 0, 0, 0, objConfig.radius);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.3, objConfig.color);
        gradient.addColorStop(1, objConfig.color + "cc");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, objConfig.radius, 0, Math.PI * 2);
        ctx.fill();
      } else if (objConfig.type === "box") {
        ctx.fillStyle = objConfig.color;
        ctx.fillRect(-objConfig.radius, -objConfig.radius, objConfig.radius * 2, objConfig.radius * 2);
      }
      
      ctx.strokeStyle = isSelected ? "#ffd93d" : "#ffffff";
      ctx.lineWidth = isSelected ? 3 : 2;
      ctx.globalAlpha = 1;
      
      if (objConfig.type === "ball") {
        ctx.stroke();
      } else {
        ctx.strokeRect(-objConfig.radius, -objConfig.radius, objConfig.radius * 2, objConfig.radius * 2);
      }
      
      // Indicador de "próximo"
      if (isSelected && isReady) {
        ctx.fillStyle = "#ffd93d";
        ctx.font = "bold 12px Inter, sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("✓", 0, objConfig.radius + 20);
      }
      
      ctx.restore();
    });
    
    // Instrucción visual
    if (!this.isLaunching && !this.selectedId && !this.slingshotActive) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
      ctx.font = "14px Inter, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("Pellizca para usar la resortera o haz puño para agarrar", this.canvas.width / 2, 80);
    }
    
    // Dibujar resortera
    if (this.slingshotActive && this.slingshotPull) {
      ctx.save();
      
      // Puntos de anclaje de la resortera (Y invertido)
      const anchorLeft = {
        x: this.slingshotBase.x - 30,
        y: this.slingshotBase.y
      };
      const anchorRight = {
        x: this.slingshotBase.x + 30,
        y: this.slingshotBase.y
      };
      
      // Dibujar estructura de la resortera
      ctx.strokeStyle = "#8b4513";
      ctx.lineWidth = 8;
      ctx.lineCap = "round";
      
      // Poste izquierdo
      ctx.beginPath();
      ctx.moveTo(anchorLeft.x, anchorLeft.y);
      ctx.lineTo(anchorLeft.x, anchorLeft.y - 40);
      ctx.stroke();
      
      // Poste derecho
      ctx.beginPath();
      ctx.moveTo(anchorRight.x, anchorRight.y);
      ctx.lineTo(anchorRight.x, anchorRight.y - 40);
      ctx.stroke();
      
      // Gomas de la resortera (elásticas)
      ctx.strokeStyle = "#ffd93d";
      ctx.lineWidth = 4;
      ctx.setLineDash([]);
      
      // Goma izquierda
      ctx.beginPath();
      ctx.moveTo(anchorLeft.x, anchorLeft.y - 40);
      ctx.lineTo(this.slingshotPull.x, this.slingshotPull.y);
      ctx.stroke();
      
      // Goma derecha
      ctx.beginPath();
      ctx.moveTo(anchorRight.x, anchorRight.y - 40);
      ctx.lineTo(this.slingshotPull.x, this.slingshotPull.y);
      ctx.stroke();
      
      // Objeto en la resortera
      const objConfig = this.availableObjects[this.currentObjectIndex];
      ctx.translate(this.slingshotPull.x, this.slingshotPull.y);
      
      if (objConfig.type === "ball") {
        const gradient = ctx.createRadialGradient(0, -objConfig.radius * 0.3, 0, 0, 0, objConfig.radius);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.3, objConfig.color);
        gradient.addColorStop(1, objConfig.color + "cc");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, objConfig.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (objConfig.type === "box") {
        ctx.fillStyle = objConfig.color;
        ctx.fillRect(-objConfig.radius, -objConfig.radius, objConfig.radius * 2, objConfig.radius * 2);
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 3;
        ctx.strokeRect(-objConfig.radius, -objConfig.radius, objConfig.radius * 2, objConfig.radius * 2);
      }
      
      // Trayectoria prevista
      const speed = Math.hypot(this.launchVelocity.x, this.launchVelocity.y);
      if (speed > 50) {
        ctx.restore();
        ctx.save();
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.6;
        
        // Predecir trayectoria
        let predX = this.slingshotPull.x;
        let predY = this.slingshotPull.y;
        let predVx = this.launchVelocity.x;
        let predVy = this.launchVelocity.y;
        
        ctx.beginPath();
        ctx.moveTo(predX, predY);
        
        for (let i = 0; i < 30; i++) {
          predVy += 500 * 0.016; // gravedad
          predVx *= 0.98; // fricción
          predVy *= 0.98;
          predX += predVx * 0.016;
          predY += predVy * 0.016;
          
          if (predY > this.canvas.height - 20) break;
          if (predX < 0 || predX > this.canvas.width) break;
          
          ctx.lineTo(predX, predY);
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
      }
      
      ctx.restore();
    }
    
    // Dibujar indicador de lanzamiento (mejorado)
    if (this.isLaunching && this.selectedId === "launcher") {
      ctx.save();
      
      // Dibujar objeto en la mano
      const objConfig = this.availableObjects[this.currentObjectIndex];
      ctx.translate(this.launchPosition.x, this.launchPosition.y);
      
      if (objConfig.type === "ball") {
        const gradient = ctx.createRadialGradient(0, -objConfig.radius * 0.3, 0, 0, 0, objConfig.radius);
        gradient.addColorStop(0, "#ffffff");
        gradient.addColorStop(0.3, objConfig.color);
        gradient.addColorStop(1, objConfig.color + "cc");
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, objConfig.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 3;
        ctx.stroke();
      } else if (objConfig.type === "box") {
        ctx.fillStyle = objConfig.color;
        ctx.fillRect(-objConfig.radius, -objConfig.radius, objConfig.radius * 2, objConfig.radius * 2);
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 3;
        ctx.strokeRect(-objConfig.radius, -objConfig.radius, objConfig.radius * 2, objConfig.radius * 2);
      }
      
      ctx.restore();
      
      // Trayectoria prevista
      const speed = Math.hypot(this.launchVelocity.x, this.launchVelocity.y);
      if (speed > 50) {
        ctx.save();
        ctx.strokeStyle = "#ffd93d";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.globalAlpha = 0.6;
        
        // Predecir trayectoria
        let predX = this.launchPosition.x;
        let predY = this.launchPosition.y;
        let predVx = this.launchVelocity.x;
        let predVy = this.launchVelocity.y;
        
        ctx.beginPath();
        ctx.moveTo(predX, predY);
        
        for (let i = 0; i < 30; i++) {
          predVy += 500 * 0.016; // gravedad
          predVx *= 0.98; // fricción
          predVy *= 0.98;
          predX += predVx * 0.016;
          predY += predVy * 0.016;
          
          if (predY > this.canvas.height - 20) break;
          if (predX < 0 || predX > this.canvas.width) break;
          
          ctx.lineTo(predX, predY);
        }
        
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        ctx.restore();
      }
    }
    
    // Puntuación
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px Inter, sans-serif";
    ctx.textAlign = "left";
    ctx.fillText(`Puntos: ${this.score}`, 10, 30);
    
    // Dibujar puntero
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
