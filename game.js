$(document).ready(() => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME CONFIG
  // ═══════════════════════════════════════════════════════════════════════════════
  const CONFIG = {
    PILLAR_COUNT: 6,
    PILLAR_DISTANCE: 12,
    PILLAR_RADIUS: [3, 6],
    PILLAR_HEIGHT: 18,
    BALL_RADIUS: 1.69,
    BALL_HEIGHT: 2,
    BALL_SHRINK: [1, 0.3, 0.006], // [start, min, speed]
    SPEED: [3.2, 7, 0.45],         // [initial, max, increase_per_3_score]
    TOLERANCE: 0.9,
    ROTATION_RADIUS: 12,           // Distance from pillar center
    FOG: [25, 100],
    CAM: { FOV: 49, Y: 80, Z: -25, FOLLOW: 0.12, LOOK_Y: 20 }
  };

  const COLOR_SCHEMES = [
    { bg: 0xff7e5f, pillar: 0xfeb47b, ball: 0x4ecdc4 }, // really love this
    { bg: 0xF58C5C, pillar: 0xFDA06B, ball: 0x4ecdc4 }, // OG evanbacon color
    { bg: 0x2c3e50, pillar: 0x34495e, ball: 0x7fb3d3 },
    { bg: 0x457b9d, pillar: 0x1d3557, ball: 0xf1faee },
    { bg: 0xa8e6cf, pillar: 0x88d8c0, ball: 0xff8b94 },
    { bg: 0xffd89b, pillar: 0x19547b, ball: 0xf4a261 },
    { bg: 0x8e7cc3, pillar: 0xc39bd3, ball: 0xf8f9fa },
    { bg: 0xd4a574, pillar: 0xe9c46a, ball: 0xf4a261 },
    { bg: 0xb8bedd, pillar: 0xc8d6e5, ball: 0x8fbc8f },
    { bg: 0xd4a4a4, pillar: 0xead5d5, ball: 0x9bb7d4 },
    { bg: 0x8fbc8f, pillar: 0xa8d8a8, ball: 0xfaf0e6 },
    { bg: 0x90a0b7, pillar: 0xa8b2c8, ball: 0xffffff }
  ];

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME STATE
  // ═══════════════════════════════════════════════════════════════════════════════
  let game = {
    playing: false,
    score: 0,
    best: +localStorage.pillarsBest || 0,
    // Ball specific state
    ballAngle: 0,
    ballSpeed: CONFIG.SPEED[0],
    ballScale: CONFIG.BALL_SHRINK[0],
    ballDirection: 1,
    ballPosition: { x: 0, z: 0 },
    // Pillar and camera state
    pillars: [],
    cam: { x: 0, z: 0 },
    colors: COLOR_SCHEMES[0]
  };

  let scene, camera, renderer, centerBall, activeBall, pillarMeshes = [];

  // ═══════════════════════════════════════════════════════════════════════════════
  // UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════════
  const random = (min, max) => min + Math.random() * (max - min);
  const distance = (x1, z1, x2, z2) => Math.sqrt((x1-x2)**2 + (z1-z2)**2);
  const getNextAngle = () => random(Math.PI/3, Math.PI/2);

  // ═══════════════════════════════════════════════════════════════════════════════
  // CORE INITIALIZATION
  // ═══════════════════════════════════════════════════════════════════════════════
  function init() {
    // Scene setup
    scene = new THREE.Scene();
    updateColors();

    // Camera setup
    camera = new THREE.PerspectiveCamera(CONFIG.CAM.FOV, innerWidth/innerHeight, 0.1, 300);
    camera.position.set(0, CONFIG.CAM.Y, CONFIG.CAM.Z);

    // Renderer
    renderer = new THREE.WebGLRenderer({ canvas: $('#canvas')[0], antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 50, 10);
    directionalLight.castShadow = true;
    scene.add(ambientLight, directionalLight);

    // Initialize balls
    initBalls();
    setupEvents();
    animate();
  }

  function initBalls() {
    // Create cylinder balls (lying flat)
    const ballGeo = new THREE.CylinderGeometry(
      CONFIG.BALL_RADIUS,
      CONFIG.BALL_RADIUS,
      CONFIG.BALL_HEIGHT,
      16
    );

    const ballMat = new THREE.MeshLambertMaterial({
      color: game.colors.ball
    });

    centerBall = new THREE.Mesh(ballGeo, ballMat);
    activeBall = new THREE.Mesh(ballGeo, ballMat);

    scene.add(centerBall, activeBall);
    updateBallPositions();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // BALL MECHANICS
  // ═══════════════════════════════════════════════════════════════════════════════
  function updateBallPositions() {
    if (!game.pillars.length) return;

    const ballY = CONFIG.PILLAR_HEIGHT + CONFIG.BALL_HEIGHT/2;
    const rad = game.ballAngle * Math.PI/180;

    // Center ball (static on current pillar)
    centerBall.position.set(
      game.ballPosition.x,
      ballY,
      game.ballPosition.z
    );

    // Active ball (rotating around pillar)
    activeBall.position.set(
      game.ballPosition.x + Math.cos(rad) * CONFIG.ROTATION_RADIUS,
      ballY,
      game.ballPosition.z + Math.sin(rad) * CONFIG.ROTATION_RADIUS
    );
    activeBall.scale.setScalar(game.ballScale);
  }

  function rotateBall() {
    if (!game.playing) return;

    // Update rotation with current direction
    game.ballAngle = (game.ballAngle + game.ballSpeed * game.ballDirection) % 360;

    // Dynamic speed increase
    game.ballSpeed = Math.min(
      CONFIG.SPEED[0] + Math.floor(game.score/2) * CONFIG.SPEED[2],
      CONFIG.SPEED[1]
    );

    // Ball shrinking
    if (game.score > 0) {
      game.ballScale = Math.max(
        game.ballScale - CONFIG.BALL_SHRINK[2],
        CONFIG.BALL_SHRINK[1]
      );
      if (game.ballScale <= CONFIG.BALL_SHRINK[1]) endGame();
    }

    updateBallPositions();
  }

  function checkBallCollision() {
    if (!game.playing || !game.pillars.length) return -1;

    const rad = game.ballAngle * Math.PI/180;
    const ballX = game.ballPosition.x + Math.cos(rad) * CONFIG.ROTATION_RADIUS;
    const ballZ = game.ballPosition.z + Math.sin(rad) * CONFIG.ROTATION_RADIUS;

    // Check against all pillars
    for (let i = 1; i < game.pillars.length; i++) {
      const p = game.pillars[i];
      const d = distance(ballX, ballZ, p.x, p.z);
      if (d <= p.r * CONFIG.TOLERANCE) return i;
    }

    return -1; // No collision
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // PILLAR SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════════
  function createPillars() {
    game.pillars = [{ x: 0, z: 0, r: random(...CONFIG.PILLAR_RADIUS) }];
    game.ballPosition = { x: 0, z: 0 }; // Reset ball position

    // Generate pillar chain
    for(let i = 1; i < CONFIG.PILLAR_COUNT; i++) {
      const last = game.pillars[i-1];
      let attempts = 0;
      let newPillar;

      do {
        const angle = getNextAngle();
        newPillar = {
          x: last.x + CONFIG.PILLAR_DISTANCE * Math.cos(angle),
          z: last.z + CONFIG.PILLAR_DISTANCE * Math.sin(angle),
          r: random(...CONFIG.PILLAR_RADIUS)
        };
        attempts++;
      } while(hasOverlap(newPillar) && attempts < 10);

      game.pillars.push(newPillar);
    }

    renderPillars();
  }

  function hasOverlap(newPillar) {
    return game.pillars.some(existing =>
      distance(newPillar.x, newPillar.z, existing.x, existing.z) < (newPillar.r + existing.r + 3)
    );
  }

  function renderPillars() {
    pillarMeshes.forEach(mesh => scene.remove(mesh));
    pillarMeshes = [];

    game.pillars.forEach((pillar, i) => {
      const geometry = new THREE.CylinderGeometry(pillar.r, pillar.r, CONFIG.PILLAR_HEIGHT, 16);
      const material = new THREE.MeshLambertMaterial({
        color: game.colors.pillar,
        transparent: true,
        opacity: Math.max(1 - i * 0.1, 0.4)
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.position.set(pillar.x, CONFIG.PILLAR_HEIGHT/2, pillar.z);
      mesh.receiveShadow = true;

      scene.add(mesh);
      pillarMeshes.push(mesh);
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // GAME FLOW
  // ═══════════════════════════════════════════════════════════════════════════════
  function startGame() {
    game = {
      ...game,
      playing: true,
      score: 0,
      ballAngle: 0,
      ballSpeed: CONFIG.SPEED[0],
      ballScale: CONFIG.BALL_SHRINK[0],
      ballDirection: 1,
      ballPosition: { x: 0, z: 0 },
      pillars: [],
      cam: { x: 0, z: 0 }
    };

    changeColorScheme();
    $('#menu, #gameover').removeClass('active');
    $('body').removeClass().addClass('game-playing');
    createPillars();
    updateUI();
  }

  function jump() {
    if(!game.playing) return;

    const hitIndex = checkBallCollision();
    if(hitIndex === -1) return endGame();

    // Successful jump
    game.score += hitIndex;
    game.best = Math.max(game.score, game.best);
    localStorage.pillarsBest = game.best;

    // Remove passed pillars
    game.pillars.splice(0, hitIndex);

    // Add new pillars
    while(game.pillars.length < CONFIG.PILLAR_COUNT) {
      const last = game.pillars[game.pillars.length-1];
      let attempts = 0;
      let newPillar;

      do {
        const angle = getNextAngle();
        newPillar = {
          x: last.x + CONFIG.PILLAR_DISTANCE * Math.cos(angle),
          z: last.z + CONFIG.PILLAR_DISTANCE * Math.sin(angle),
          r: random(...CONFIG.PILLAR_RADIUS)
        };
        attempts++;
      } while(hasOverlap(newPillar) && attempts < 10);

      game.pillars.push(newPillar);
    }

    // Update ball state
    game.ballScale = 1;
    game.ballDirection *= -1;
    game.ballAngle = (game.ballAngle + 180) % 360;
    game.ballPosition = { x: game.pillars[0].x, z: game.pillars[0].z };

    renderPillars();
    updateUI();
  }

  function endGame() {
    game.playing = false;
    $('#final-score').text(`Score: ${game.score}`);
    $('#gameover').addClass('active');
    $('body').removeClass().addClass('game-over');
  }

  function update() {
    if(!game.playing) return;

    rotateBall();

    // Camera follow
    const current = game.pillars[0];
    game.cam.x += (current.x - game.cam.x) * CONFIG.CAM.FOLLOW;
    game.cam.z += (current.z - game.cam.z) * CONFIG.CAM.FOLLOW;
    camera.position.set(game.cam.x, CONFIG.CAM.Y, game.cam.z + CONFIG.CAM.Z);
    camera.lookAt(game.cam.x, CONFIG.CAM.LOOK_Y, game.cam.z);
  }

  function updateUI() {
    $('#score').text(game.score);
    $('#best').text(`Best: ${game.best}`);
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // COLOR SYSTEM
  // ═══════════════════════════════════════════════════════════════════════════════
  function updateColors() {
    scene.background = new THREE.Color(game.colors.bg);
    scene.fog = new THREE.Fog(game.colors.bg, CONFIG.FOG[0], CONFIG.FOG[1]);

    // Update UI colors
    $('.screen').css('background', `rgba(${(game.colors.bg >> 16) & 255}, ${(game.colors.bg >> 8) & 255}, ${game.colors.bg & 255}, 0.95)`);
    $('body').css('background', `#${game.colors.bg.toString(16).padStart(6, '0')}`);

    // Update ball colors if they exist
    if(centerBall && activeBall) {
      centerBall.material.color.setHex(game.colors.ball);
      activeBall.material.color.setHex(game.colors.ball);
    }
  }

  function changeColorScheme() {
    game.colors = COLOR_SCHEMES[Math.floor(Math.random() * COLOR_SCHEMES.length)];
    updateColors();
  }

  // ═══════════════════════════════════════════════════════════════════════════════
  // EVENTS & ANIMATION
  // ═══════════════════════════════════════════════════════════════════════════════
  function setupEvents() {
    $('.btn').on('click', function() {
      const $btn = $(this);
      if($btn.data('speed')) startGame();
      if($btn.data('action') === 'restart') startGame();
    });

    $('#canvas').on('click touchstart', e => {
      e.preventDefault();
      jump();
    });

    $(document).on('keydown', e => {
      if(e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        jump();
      }
    });

    $(window).on('resize', () => {
      camera.aspect = innerWidth/innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(innerWidth, innerHeight);
    });
  }

  function animate() {
    requestAnimationFrame(animate);
    update();
    renderer.render(scene, camera);
  }

  // Initialize
  $('body').addClass('game-menu');
  init();
});
