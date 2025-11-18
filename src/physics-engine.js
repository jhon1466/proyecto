// Wrapper para Matter.js - Motor de física avanzado
// Matter.js se carga globalmente desde el script en index.html
const Matter = window.Matter || {};
const { Engine, World, Bodies, Body, Events, Composite, Constraint, Mouse, MouseConstraint } = Matter;

export class PhysicsEngine {
  constructor(canvas) {
    this.canvas = canvas;
    
    // Crear motor de física
    this.engine = Engine.create();
    this.world = this.engine.world;
    
    // Configurar gravedad (más realista)
    this.engine.world.gravity.y = 1; // Gravedad estándar
    this.engine.world.gravity.scale = 0.001; // Escala para píxeles
    
    // Crear límites del mundo
    this.createBoundaries();
    
    // Almacenar referencias a objetos
    this.bodies = new Map(); // bodyId -> {body, color, type, metadata}
    this.particles = []; // Partículas para efectos visuales
    
    // Configurar eventos de colisión
    this.setupCollisionEvents();
  }
  
  createBoundaries() {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const thickness = 50; // Grosor de los límites
    
    // Paredes invisibles (solo suelo visible)
    const ground = Bodies.rectangle(width / 2, height + thickness / 2, width, thickness, {
      isStatic: true,
      render: { fillStyle: '#2a3a4a' }
    });
    
    const leftWall = Bodies.rectangle(-thickness / 2, height / 2, thickness, height, {
      isStatic: true,
      render: { visible: false }
    });
    
    const rightWall = Bodies.rectangle(width + thickness / 2, height / 2, thickness, height, {
      isStatic: true,
      render: { visible: false }
    });
    
    const ceiling = Bodies.rectangle(width / 2, -thickness / 2, width, thickness, {
      isStatic: true,
      render: { visible: false }
    });
    
    World.add(this.world, [ground, leftWall, rightWall, ceiling]);
  }
  
  setupCollisionEvents() {
    Events.on(this.engine, 'collisionStart', (event) => {
      event.pairs.forEach(pair => {
        const { bodyA, bodyB } = pair;
        const objA = this.bodies.get(bodyA.id);
        const objB = this.bodies.get(bodyB.id);
        
        // Crear partículas en colisiones fuertes
        const velocity = Math.abs(bodyA.velocity.x) + Math.abs(bodyA.velocity.y) +
                        Math.abs(bodyB.velocity.x) + Math.abs(bodyB.velocity.y);
        
        if (velocity > 5) {
          this.createImpactParticles(
            pair.collision.supports[0].x,
            pair.collision.supports[0].y,
            objA?.color || '#ffffff',
            5
          );
        }
      });
    });
  }
  
  // Crear objeto lanzable
  createProjectile(x, y, type, color, radius) {
    let body;
    
    if (type === 'ball') {
      body = Bodies.circle(x, y, radius, {
        restitution: 0.6, // Rebote
        friction: 0.3,
        density: 0.001,
        render: { fillStyle: color }
      });
    } else if (type === 'box') {
      body = Bodies.rectangle(x, y, radius * 2, radius * 2, {
        restitution: 0.4,
        friction: 0.5,
        density: 0.001,
        render: { fillStyle: color }
      });
    } else if (type === 'bomb') {
      // Objeto especial: bomba
      body = Bodies.circle(x, y, radius, {
        restitution: 0.3,
        friction: 0.2,
        density: 0.002,
        render: { fillStyle: '#ff0000' }
      });
    }
    
    if (body) {
      World.add(this.world, body);
      this.bodies.set(body.id, { body, color, type, radius, metadata: {} });
      return body;
    }
    
    return null;
  }
  
  // Aplicar velocidad a un objeto
  launchProjectile(body, vx, vy) {
    if (body && this.bodies.has(body.id)) {
      Body.setVelocity(body, { x: vx, y: vy });
      Body.setAngularVelocity(body, (Math.random() - 0.5) * 0.2);
    }
  }
  
  // Crear estructura destructible (como Angry Birds)
  createDestructibleStructure(x, y, width, height, color = '#8b4513') {
    const blocks = [];
    const blockSize = 30;
    const rows = Math.floor(height / blockSize);
    const cols = Math.floor(width / blockSize);
    
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const blockX = x + col * blockSize - width / 2 + blockSize / 2;
        const blockY = y + row * blockSize - height / 2 + blockSize / 2;
        
        const block = Bodies.rectangle(blockX, blockY, blockSize - 2, blockSize - 2, {
          restitution: 0.3,
          friction: 0.8,
          density: 0.001,
          render: { fillStyle: color }
        });
        
        blocks.push(block);
        this.bodies.set(block.id, {
          body: block,
          color,
          type: 'block',
          radius: blockSize / 2,
          metadata: { isDestructible: true }
        });
      }
    }
    
    World.add(this.world, blocks);
    return blocks;
  }
  
  // Crear plataforma estática
  createPlatform(x, y, width, height, color = '#4a5568') {
    const platform = Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      render: { fillStyle: color }
    });
    
    World.add(this.world, platform);
    this.bodies.set(platform.id, {
      body: platform,
      color,
      type: 'platform',
      radius: Math.min(width, height) / 2,
      metadata: { isStatic: true }
    });
    
    return platform;
  }
  
  // Crear partículas de impacto
  createImpactParticles(x, y, color, count = 10) {
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const speed = 2 + Math.random() * 3;
      const particle = {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.02 + Math.random() * 0.03,
        size: 3 + Math.random() * 5,
        color
      };
      this.particles.push(particle);
    }
  }
  
  // Actualizar física
  update(deltaTime) {
    // Actualizar motor de física
    Engine.update(this.engine, deltaTime * 1000);
    
    // Actualizar partículas
    this.particles = this.particles.filter(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      particle.vy += 0.3; // Gravedad para partículas
      particle.vx *= 0.95; // Fricción
      particle.life -= particle.decay;
      return particle.life > 0 && particle.y < this.canvas.height + 50;
    });
    
    // Limpiar objetos que salieron de la pantalla
    this.bodies.forEach((obj, id) => {
      if (obj.body.position.y > this.canvas.height + 100) {
        World.remove(this.world, obj.body);
        this.bodies.delete(id);
      }
    });
  }
  
  // Dibujar todo
  draw(ctx) {
    // Dibujar cuerpos físicos
    this.bodies.forEach((obj) => {
      const { body, color, type, radius } = obj;
      
      ctx.save();
      ctx.translate(body.position.x, body.position.y);
      ctx.rotate(body.angle);
      
      if (type === 'ball' || type === 'bomb') {
        // Círculo
        const gradient = ctx.createRadialGradient(0, -radius * 0.3, 0, 0, 0, radius);
        gradient.addColorStop(0, '#ffffff');
        gradient.addColorStop(0.3, color);
        gradient.addColorStop(1, color + 'cc');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(0, 0, radius, 0, Math.PI * 2);
        ctx.fill();
        
        if (type === 'bomb') {
          // Indicador de bomba
          ctx.strokeStyle = '#ff0000';
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 12px Arial';
          ctx.textAlign = 'center';
          ctx.fillText('💣', 0, 4);
        } else {
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      } else if (type === 'box') {
        // Caja
        ctx.fillStyle = color;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
      } else if (type === 'block') {
        // Bloque destructible
        ctx.fillStyle = color;
        ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
        ctx.strokeStyle = '#654321';
        ctx.lineWidth = 1;
        ctx.strokeRect(-radius, -radius, radius * 2, radius * 2);
      } else if (type === 'platform') {
        // Plataforma
        ctx.fillStyle = color;
        ctx.fillRect(-radius * 2, -radius, radius * 4, radius * 2);
        ctx.strokeStyle = '#2d3748';
        ctx.lineWidth = 2;
        ctx.strokeRect(-radius * 2, -radius, radius * 4, radius * 2);
      }
      
      ctx.restore();
    });
    
    // Dibujar partículas
    this.particles.forEach(particle => {
      ctx.save();
      ctx.globalAlpha = particle.life;
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    });
  }
  
  // Obtener objetos en un área (para detección de colisiones con objetivos)
  getBodiesInArea(x, y, width, height) {
    const results = [];
    this.bodies.forEach((obj) => {
      const { body } = obj;
      if (body.position.x >= x - width / 2 &&
          body.position.x <= x + width / 2 &&
          body.position.y >= y - height / 2 &&
          body.position.y <= y + height / 2) {
        results.push(obj);
      }
    });
    return results;
  }
  
  // Limpiar todos los objetos (excepto límites)
  clear() {
    const bodiesToRemove = [];
    this.bodies.forEach((obj, id) => {
      if (!obj.metadata.isStatic) {
        bodiesToRemove.push(obj.body);
        this.bodies.delete(id);
      }
    });
    World.remove(this.world, bodiesToRemove);
    this.particles = [];
  }
  
  // Obtener velocidad de un cuerpo
  getVelocity(body) {
    if (body && this.bodies.has(body.id)) {
      return body.velocity;
    }
    return { x: 0, y: 0 };
  }
}

