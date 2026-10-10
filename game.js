// 灯台 — 夜の海で光を回し、岩礁に向かう船を照らして追い返す。
(() => {
  'use strict';

  const canvas = document.getElementById('c');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const CX = W / 2, CY = H / 2;

  const ROCK_R = 70;          // 岩礁の半径（ここに船が来たら難破）
  const BEAM_HALF = 0.16;     // 光の半開き角（rad）
  const BEAM_RANGE = 420;     // 光が届く距離
  const TURN_SPEED = 2.6;     // 灯台の回転速度（rad/s）
  const SHIP_SPEED = 28;      // 船の速度（px/s）
  const LIT_NEEDED = 1.1;     // 何秒照らせば気づくか
  const LIVES = 3;
  const SPAWN_R = Math.max(W, H) * 0.62; // 船が出てくる円の半径（画面の角より外）

  const S = {
    phase: 'title',   // title | play | over
    t: 0,
    angle: -Math.PI / 2,
    targetAngle: null,   // マウスで指定した向き
    keys: { left: false, right: false },
    ships: [],
    wrecks: [],
    saved: 0,
    lives: LIVES,
    spawnTimer: 0,
    nextSpawn: 1.5,
    msg: null,
    seed: 1,
  };

  // 乱数は再現できるようにしておく（テストで便利）
  function rnd() {
    S.seed = (S.seed * 1664525 + 1013904223) >>> 0;
    return S.seed / 4294967296;
  }

  function reset() {
    S.t = 0;
    S.angle = -Math.PI / 2;
    S.targetAngle = null;
    S.ships = [];
    S.wrecks = [];
    S.saved = 0;
    S.lives = LIVES;
    S.spawnTimer = 0;
    S.nextSpawn = 1.5;
    S.msg = null;
  }

  function start() {
    reset();
    S.phase = 'play';
  }

  function spawnShip() {
    // 画面の外周のどこかから、島の少し脇を狙って入ってくる
    const a = rnd() * Math.PI * 2;
    const r = SPAWN_R;
    const x = CX + Math.cos(a) * r;
    const y = CY + Math.sin(a) * r;
    const off = (rnd() - 0.5) * 60; // 島の中心からのずれ
    const ta = Math.atan2(CY - y, CX - x) + off / 300;
    const speed = SHIP_SPEED * (0.8 + rnd() * 0.5 + Math.min(S.t / 120, 0.6));
    S.ships.push({
      x, y,
      vx: Math.cos(ta) * speed,
      vy: Math.sin(ta) * speed,
      lit: 0,            // 照らされた累積秒数
      awake: false,      // 灯台に気づいて向きを変えたか
      turnLeft: rnd() < 0.5,
      life: 0,
      bob: rnd() * 6.28,
    });
  }

  function angleDiff(a, b) {
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  function inBeam(x, y) {
    const dx = x - CX, dy = y - CY;
    const d = Math.hypot(dx, dy);
    if (d > BEAM_RANGE || d < ROCK_R * 0.5) return false;
    const a = Math.atan2(dy, dx);
    // 遠いほど光が広がるが、距離で減衰するぶん少し厳しく
    return Math.abs(angleDiff(a, S.angle)) < BEAM_HALF * (1 - d / BEAM_RANGE * 0.35);
  }

  function update(dt) {
    S.t += dt;

    // 灯台の回転
    if (S.keys.left) { S.angle -= TURN_SPEED * dt; S.targetAngle = null; }
    if (S.keys.right) { S.angle += TURN_SPEED * dt; S.targetAngle = null; }
    if (S.targetAngle !== null) {
      const d = angleDiff(S.targetAngle, S.angle);
      const step = TURN_SPEED * dt;
      if (Math.abs(d) <= step) { S.angle = S.targetAngle; }
      else S.angle += Math.sign(d) * step;
    }

    if (S.phase !== 'play') return;

    // 出現
    S.spawnTimer += dt;
    if (S.spawnTimer >= S.nextSpawn) {
      S.spawnTimer = 0;
      spawnShip();
      // 時間とともに間隔が詰まる（下限 1.2 秒）
      S.nextSpawn = Math.max(1.2, 4.0 - S.t / 40) * (0.7 + rnd() * 0.6);
    }

    for (const s of S.ships) {
      s.life += dt;
      if (!s.awake) {
        if (inBeam(s.x, s.y)) {
          s.lit += dt;
          if (s.lit >= LIT_NEEDED) {
            s.awake = true;
            // 岩礁から離れる向きへ大きく舵を切る
            const away = Math.atan2(s.y - CY, s.x - CX);
            const sp = Math.hypot(s.vx, s.vy) * 1.25;
            const a = away + (s.turnLeft ? -0.5 : 0.5);
            s.vx = Math.cos(a) * sp;
            s.vy = Math.sin(a) * sp;
          }
        } else {
          s.lit = Math.max(0, s.lit - dt * 0.5); // 外れると少しずつ忘れる
        }
      }
      s.x += s.vx * dt;
      s.y += s.vy * dt;
    }

    // 難破・離脱の判定
    const keep = [];
    for (const s of S.ships) {
      const d = Math.hypot(s.x - CX, s.y - CY);
      if (!s.awake && d <= ROCK_R) {
        S.wrecks.push({ x: s.x, y: s.y, t: 0 });
        S.lives -= 1;
        S.msg = { text: '難破', t: 0 };
        if (S.lives <= 0) { S.phase = 'over'; S.msg = null; }
        continue;
      }
      // 出現円より外に出たら離脱（出た直後に消えないよう、距離で判定する）
      if (d > SPAWN_R + 30 && s.life > 1) {
        if (s.awake) { S.saved += 1; }
        continue;
      }
      keep.push(s);
    }
    S.ships = keep;
    for (const w of S.wrecks) w.t += dt;
    S.wrecks = S.wrecks.filter(w => w.t < 6);
    if (S.msg) { S.msg.t += dt; if (S.msg.t > 1.2) S.msg = null; }
  }

  // ---------- 描画 ----------
  function drawSea() {
    const g = ctx.createRadialGradient(CX, CY, 20, CX, CY, Math.max(W, H) * 0.75);
    g.addColorStop(0, '#0b1326');
    g.addColorStop(1, '#03050b');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // うねり
    ctx.strokeStyle = 'rgba(120,150,200,0.06)';
    ctx.lineWidth = 1;
    for (let y = 20; y < H; y += 26) {
      ctx.beginPath();
      for (let x = 0; x <= W; x += 16) {
        const yy = y + Math.sin(x * 0.03 + S.t * 0.8 + y * 0.1) * 3;
        if (x === 0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy);
      }
      ctx.stroke();
    }
  }

  function drawBeam() {
    ctx.save();
    ctx.translate(CX, CY);
    ctx.rotate(S.angle);
    const g = ctx.createLinearGradient(0, 0, BEAM_RANGE, 0);
    g.addColorStop(0, 'rgba(255,240,190,0.55)');
    g.addColorStop(0.5, 'rgba(255,230,160,0.18)');
    g.addColorStop(1, 'rgba(255,220,140,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, BEAM_RANGE, -BEAM_HALF, BEAM_HALF);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawIsland() {
    // 岩礁
    ctx.fillStyle = '#1a1f2a';
    ctx.beginPath();
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      const r = ROCK_R * (0.82 + 0.18 * Math.sin(i * 2.3));
      const x = CX + Math.cos(a) * r, y = CY + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    // 岩の縁の白波
    ctx.strokeStyle = 'rgba(200,220,255,0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    // 灯台
    ctx.fillStyle = '#d8d0c0';
    ctx.fillRect(CX - 6, CY - 34, 12, 34);
    ctx.fillStyle = '#8a2b2b';
    ctx.fillRect(CX - 6, CY - 22, 12, 8);
    ctx.fillStyle = '#fff1c0';
    ctx.beginPath(); ctx.arc(CX, CY - 36, 5, 0, Math.PI * 2); ctx.fill();
    // 光源の照り
    const g = ctx.createRadialGradient(CX, CY - 36, 0, CX, CY - 36, 40);
    g.addColorStop(0, 'rgba(255,240,190,0.5)');
    g.addColorStop(1, 'rgba(255,240,190,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(CX, CY - 36, 40, 0, Math.PI * 2); ctx.fill();
  }

  function drawShip(s) {
    const lit = inBeam(s.x, s.y);
    const a = Math.atan2(s.vy, s.vx);
    ctx.save();
    ctx.translate(s.x, s.y + Math.sin(S.t * 2 + s.bob) * 1.5);
    ctx.rotate(a);
    // 船体
    ctx.fillStyle = lit ? '#e8dcc0' : (s.awake ? '#6b7890' : '#3a4356');
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, 6);
    ctx.lineTo(-10, 0);
    ctx.lineTo(-8, -6);
    ctx.closePath();
    ctx.fill();
    // 舷灯（暗い海で船を見つける手がかり。気づいた船は緑に変わる）
    const lampColor = s.awake ? '#7fd38a' : '#e0553f';
    const glow = ctx.createRadialGradient(-2, 0, 0, -2, 0, 14);
    glow.addColorStop(0, s.awake ? 'rgba(127,211,138,0.45)' : 'rgba(224,85,63,0.45)');
    glow.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(-2, 0, 14, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = lampColor;
    ctx.beginPath(); ctx.arc(-2, 0, 2, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // 気づきゲージ
    if (!s.awake && s.lit > 0) {
      const w = 22, p = Math.min(1, s.lit / LIT_NEEDED);
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(s.x - w / 2, s.y - 16, w, 3);
      ctx.fillStyle = '#ffe28a';
      ctx.fillRect(s.x - w / 2, s.y - 16, w * p, 3);
    }
  }

  function drawWreck(w) {
    const k = 1 - w.t / 6;
    ctx.fillStyle = `rgba(230,120,80,${0.6 * k})`;
    ctx.beginPath(); ctx.arc(w.x, w.y, 5 + w.t * 3, 0, Math.PI * 2); ctx.fill();
  }

  function drawHUD() {
    ctx.fillStyle = '#cfd6e6';
    ctx.font = '16px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`救った船: ${S.saved}`, 16, 28);
    ctx.textAlign = 'right';
    let hearts = '';
    for (let i = 0; i < LIVES; i++) hearts += i < S.lives ? '●' : '○';
    ctx.fillText(hearts, W - 16, 28);
    if (S.msg) {
      ctx.textAlign = 'center';
      ctx.fillStyle = `rgba(255,140,110,${1 - S.msg.t / 1.2})`;
      ctx.font = 'bold 28px system-ui, sans-serif';
      ctx.fillText(S.msg.text, CX, CY + 110);
    }
  }

  function drawOverlay() {
    ctx.fillStyle = 'rgba(3,5,11,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f2ecd8';
    ctx.textAlign = 'center';
    if (S.phase === 'title') {
      ctx.font = 'bold 56px serif';
      ctx.fillText('灯台', CX, CY - 40);
      ctx.font = '16px system-ui, sans-serif';
      ctx.fillStyle = '#cfd6e6';
      ctx.fillText('船を光で照らして、岩礁から追い返す。', CX, CY + 10);
      ctx.fillText('スペースかクリックで始める', CX, CY + 40);
    } else if (S.phase === 'over') {
      ctx.font = 'bold 40px serif';
      ctx.fillText('夜が明けた', CX, CY - 40);
      ctx.font = '18px system-ui, sans-serif';
      ctx.fillStyle = '#cfd6e6';
      ctx.fillText(`救った船: ${S.saved}`, CX, CY + 6);
      ctx.fillText('スペースかクリックでもう一度', CX, CY + 40);
    }
  }

  function draw() {
    drawSea();
    drawBeam();
    for (const w of S.wrecks) drawWreck(w);
    for (const s of S.ships) drawShip(s);
    drawIsland();
    drawHUD();
    if (S.phase !== 'play') drawOverlay();
  }

  // ---------- 入力 ----------
  function keyDown(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') { S.keys.left = true; e.preventDefault(); }
    if (e.code === 'ArrowRight' || e.code === 'KeyD') { S.keys.right = true; e.preventDefault(); }
    if (e.code === 'Space' || e.code === 'Enter') {
      if (S.phase !== 'play') start();
      e.preventDefault();
    }
  }
  function keyUp(e) {
    if (e.code === 'ArrowLeft' || e.code === 'KeyA') S.keys.left = false;
    if (e.code === 'ArrowRight' || e.code === 'KeyD') S.keys.right = false;
  }
  function canvasPos(e) {
    const r = canvas.getBoundingClientRect();
    return { x: (e.clientX - r.left) * W / r.width, y: (e.clientY - r.top) * H / r.height };
  }
  function mouseMove(e) {
    if (S.phase !== 'play') return;
    const p = canvasPos(e);
    S.targetAngle = Math.atan2(p.y - CY, p.x - CX);
  }
  function click(e) {
    if (S.phase !== 'play') { start(); return; }
    const p = canvasPos(e);
    S.targetAngle = Math.atan2(p.y - CY, p.x - CX);
  }
  window.addEventListener('keydown', keyDown);
  window.addEventListener('keyup', keyUp);
  canvas.addEventListener('mousemove', mouseMove);
  canvas.addEventListener('click', click);

  // ---------- ループ ----------
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  draw();
  requestAnimationFrame(frame);

  // テスト用に中身を覗けるようにしておく
  window.__game = { S, update, start, spawnShip, inBeam, consts: { ROCK_R, BEAM_HALF, BEAM_RANGE, LIT_NEEDED } };
})();
