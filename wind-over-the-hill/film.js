// THE FILM: "Wind Over the Hill". Every frame is a pure function of t, read from score.js.
(function () {
  const U = globalThis.U, G = globalThis.G, Ch = globalThis.Ch, S = globalThis.SCORE, Studio = globalThis.Studio;
  const { T, BEAT, ev, clock } = S;
  const { clamp, lerp, ease } = U;
  const W = G.W, H = G.H;

  // ---------- the world (designed on a 1920x1080 stage) ----------
  const HZ = 585; // horizon (sea line)
  const hillY = (x) => 700 + 0.00012 * (x - 1250) * (x - 1250);
  const GIRL_X = 1180, GIRL_S = 0.42;
  const CAT_X = 1075;
  const TREE_X = 1590;

  const GIRL = {
    skin: '#F4D6BC', hair: '#3A2A24', hairStyle: 'long', outfit: 'dress', shirt: '#5E8FC2', sleeves: 'short', shoes: '#8A5A3A', build: 'slim',
  };
  globalThis.CAST = { girl: GIRL };

  // ---------- palettes: midday, golden (the sky shot) and dusk ----------
  const PAL = {
    day: { sky0: '#7FB4E0', sky1: '#DCEBF2', cloud: '#FFFDF7', cloudShade: '#C9D8E6', sea: '#4F8DB8', seaHi: '#CFE6F0', far: '#7EA6A6', hill: '#7DB65A', hillDark: '#5C9944', grass: ['#5E9E3F', '#86BF55', '#4C8A35', '#A3CF6A'], roof: ['#C85B4A', '#3F7F8C', '#D98A4B'], wall: '#F3EBDD', tree: '#4F8F3E', treeDark: '#3B7232', trunk: '#6B4A33', sun: '#FFF6D8', ink: '#2A2320' },
    gold: { sky0: '#6C9BD0', sky1: '#F7D9A6', cloud: '#FFF3DD', cloudShade: '#E9B98F', sea: '#4F7FA8', seaHi: '#FFE2B0', far: '#7F95A0', hill: '#86AE52', hillDark: '#668F3F', grass: ['#6A9A3C', '#9BBE55', '#557F31', '#B9CF6A'], roof: ['#C85B4A', '#3F7F8C', '#D98A4B'], wall: '#F6E6CF', tree: '#5B8A3A', treeDark: '#456E2F', trunk: '#6B4A33', sun: '#FFE7A8', ink: '#2A2320' },
    dusk: { sky0: '#2C2C5E', sky1: '#F09A6B', cloud: '#F4B7A0', cloudShade: '#8E6A93', sea: '#3E4B7E', seaHi: '#F6B98A', far: '#5B5C82', hill: '#4F6B4E', hillDark: '#3C5440', grass: ['#3F5C40', '#5C7A4E', '#334C36', '#6F8A55'], roof: ['#8C4E5A', '#3F5770', '#9A6255'], wall: '#B9A3B2', tree: '#3A5240', treeDark: '#2C4033', trunk: '#4A3A3A', sun: '#FFB66B', ink: '#231C26' },
  };
  const mixHex = (a, b, k) => {
    const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
    const ch = (p, s) => (p >> s) & 255;
    const c = (s) => Math.round(lerp(ch(pa, s), ch(pb, s), k));
    return '#' + ((1 << 24) | (c(16) << 8 * 2) | (c(8) << 8) | c(0)).toString(16).slice(1);
  };
  const mixPal = (A, B, k) => {
    const o = {};
    for (const key in A) o[key] = Array.isArray(A[key]) ? A[key].map((v, i) => mixHex(v, B[key][i], k)) : mixHex(A[key], B[key], k);
    return o;
  };
  const duskK = (t) => ease.inOutQuad(clamp((t - ev.dusk) / (T(15, 1) - ev.dusk)));
  const palAt = (t) => (t < ev.dusk ? PAL.day : mixPal(PAL.gold, PAL.dusk, 0.35 + 0.65 * duskK(t)));

  // the wind: a gentle breathing, plus the big gust
  const gust = (t) => Math.exp(-Math.pow((t - ev.gust - 0.4) / 0.9, 2));
  const wind = (t) => 0.35 + 0.25 * Math.sin(t * 0.9) + 1.6 * gust(t);

  // ---------- sky, sun, clouds ----------
  function sky(ctx, p, y0 = 0, y1 = HZ) {
    const g = ctx.createLinearGradient(0, y0, 0, y1);
    g.addColorStop(0, p.sky0); g.addColorStop(1, p.sky1);
    ctx.fillStyle = g; ctx.fillRect(-W, -H, W * 3, H * 3);
  }
  function sun(ctx, x, y, r, p, glow = 1) {
    const g = ctx.createRadialGradient(x, y, r * 0.3, x, y, r * 5);
    g.addColorStop(0, `rgba(255,240,200,${0.55 * glow})`); g.addColorStop(1, 'rgba(255,240,200,0)');
    ctx.fillStyle = g; ctx.fillRect(x - r * 5, y - r * 5, r * 10, r * 10);
    G.ellipse(ctx, x, y, r, r, { fill: p.sun, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: 5 });
  }
  // a cumulus: puffs along an arc over a flat base
  function cloud(ctx, cx, cy, s, seed, p) {
    const n = 7;
    const puffs = [];
    for (let i = 0; i < n; i++) {
      const u = i / (n - 1);
      const r = (60 + 70 * Math.sin(Math.PI * u) + 30 * U.hash(seed, i)) * s;
      puffs.push([cx + (u - 0.5) * 520 * s, cy - Math.sin(Math.PI * u) * 90 * s - r * 0.35, r]);
    }
    for (let i = 0; i < 3; i++) puffs.push([cx + (U.hash(seed, 9 + i) - 0.5) * 220 * s, cy - (150 + 60 * U.hash(seed, 20 + i)) * s, (70 + 30 * U.hash(seed, 30 + i)) * s]);
    // shadowed underside first, then the lit tops slightly up
    for (const [x, y, r] of puffs) G.ellipse(ctx, x, y + r * 0.12, r, r * 0.9, { fill: p.cloudShade, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: seed + Math.round(x) });
    for (const [x, y, r] of puffs) G.ellipse(ctx, x - r * 0.06, y - r * 0.08, r * 0.9, r * 0.8, { fill: p.cloud, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: seed + 50 + Math.round(y) });
    G.ellipse(ctx, cx, cy + 6 * s, 300 * s, 34 * s, { fill: p.cloudShade, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: seed + 99 });
  }
  const CLOUDS = [
    { x: 350, y: 330, s: 0.95, seed: 11, v: 6 },
    { x: 1080, y: 250, s: 1.25, seed: 23, v: 4 },
    { x: 1700, y: 380, s: 0.8, seed: 37, v: 7 },
    { x: 2350, y: 300, s: 1.0, seed: 41, v: 5 },
  ];
  function clouds(ctx, t, p) {
    for (const c of CLOUDS) {
      const x = ((c.x - c.v * t + 400) % 2800 + 2800) % 2800 - 400;
      cloud(ctx, x, c.y, c.s, c.seed, p);
    }
  }

  // ---------- sea, village, far hills ----------
  function sea(ctx, t, p) {
    G.poly(ctx, [[-60, HZ], [1980, HZ], [1980, 1100], [-60, 1100]], { fill: p.sea, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: 7 });
    ctx.save(); ctx.strokeStyle = p.seaHi; ctx.lineCap = 'round';
    for (let i = 0; i < 40; i++) {
      const x = U.hash(i, 1) * 1900, y = HZ + 8 + U.hash(i, 2) * 70;
      const a = 0.25 + 0.35 * Math.max(0, Math.sin(t * 1.4 + i * 1.7));
      ctx.globalAlpha = a; ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 18 + 20 * U.hash(i, 3), y); ctx.stroke();
    }
    ctx.restore();
  }
  function farHills(ctx, p) {
    G.poly(ctx, [[700, HZ + 4], [880, 530], [1100, 505], [1350, 520], [1600, 490], [1820, 515], [1990, 540], [1990, HZ + 30], [700, HZ + 30]], { fill: p.far, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: 8, step: 40 });
    // the coastal slope under the village
    G.poly(ctx, [[-60, 545], [200, 540], [480, 560], [720, 600], [760, 640], [-60, 650]], { fill: mixHex(p.far, p.hill, 0.55), stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: 9, step: 40 });
  }
  // one house per lantern note: its window lights when the note plays
  const HOUSES = S.lanternNotes.slice().sort((a, b) => a.y - b.y);
  function village(ctx, t, p) {
    for (const h of HOUSES) {
      const w = 34 + 14 * U.hash(h.i, 1), hh = 26 + 10 * U.hash(h.i, 2);
      const x = h.x, y = h.y - 20;
      G.rrect(ctx, x - w / 2, y - hh, w, hh, 2, { fill: p.wall, lw: 1.6, stroke: p.ink, seed: 200 + h.i, amp: 0.6 });
      G.poly(ctx, [[x - w / 2 - 5, y - hh], [x, y - hh - 20 - 6 * U.hash(h.i, 3)], [x + w / 2 + 5, y - hh]], { fill: p.roof[h.i % 3], lw: 1.6, stroke: p.ink, seed: 220 + h.i, step: 8, amp: 0.6 });
      const lit = t >= h.t ? 1 - 0.75 * Math.exp(-(t - h.t) * 6) : 0;
      const wx = x - 5, wy = y - hh * 0.62;
      ctx.fillStyle = lit > 0 ? `rgba(255,${Math.round(200 + 30 * lit)},120,${0.55 + 0.45 * lit})` : 'rgba(60,60,80,0.5)';
      ctx.fillRect(wx, wy, 10, 10);
      if (lit > 0) {
        const pop = t - h.t < 0.4 ? 1 + 1.4 * (1 - (t - h.t) / 0.4) : 1;
        const g = ctx.createRadialGradient(wx + 5, wy + 5, 0, wx + 5, wy + 5, 46 * pop);
        g.addColorStop(0, `rgba(255,214,140,${0.55 * lit})`); g.addColorStop(1, 'rgba(255,214,140,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(wx - 60 * pop, wy - 60 * pop, 120 * pop, 120 * pop); ctx.restore();
      }
    }
  }

  // ---------- the hill, the tree, the grass ----------
  function hill(ctx, p) {
    const pts = [];
    for (let x = -80; x <= 2000; x += 40) pts.push([x, hillY(x)]);
    G.poly(ctx, [...pts, [2000, 1300], [-80, 1300]], { fill: p.hill, stroke: p.hillDark, lw: 1, seed: 12, step: 30 });
    G.poly(ctx, [[-80, 930], [500, 905], [1100, 960], [1700, 925], [2000, 950], [2000, 1300], [-80, 1300]], { fill: p.hillDark, stroke: 'rgba(0,0,0,0)', lw: 0.1, seed: 13, step: 40 });
  }
  function tree(ctx, t, p) {
    const x = TREE_X, y = hillY(TREE_X) + 6;
    const sway = (Math.sin(t * 1.3) * 0.5 + 0.5) * 4 * wind(t);
    G.poly(ctx, [[x - 16, y], [x - 8, y - 150], [x - 40, y - 200], [x - 2, y - 170], [x + 10, y - 230], [x + 14, y - 150], [x + 22, y]], { fill: p.trunk, lw: 2.5, stroke: p.ink, seed: 30, step: 14 });
    const blobs = [[-90, -230, 80], [0, -290, 100], [90, -235, 82], [-40, -200, 70], [50, -190, 68], [10, -230, 90]];
    blobs.forEach(([bx, by, r], i) => G.ellipse(ctx, x + bx + sway * (1 + by / -300), y + by, r * 1.05, r * 0.9, { fill: i % 2 ? p.treeDark : p.tree, lw: 2, stroke: p.ink, seed: 31 + i }));
  }
  // one blade per 8 px in three rows; they bow with the wind wave that rolls across the hill
  function grass(ctx, t, p, rows = [[0, 26], [60, 34], [150, 46]]) {
    ctx.save(); ctx.lineCap = 'round';
    const wv = wind(t);
    rows.forEach(([dy, len], r) => {
      for (let x = -40; x < 1980; x += 8) {
        const k = U.hash(x, r);
        const bx = x + k * 6, by = hillY(bx) + dy + k * 30;
        const L = len * (0.7 + 0.6 * U.hash(x, r + 7));
        const wave = Math.sin(bx * 0.01 - t * 2.4) * 0.5 + 0.5;
        const bend = (6 + 18 * wave) * wv * (0.6 + 0.4 * k);
        ctx.strokeStyle = p.grass[Math.floor(U.hash(x, r + 3) * 4)];
        ctx.lineWidth = 3 + r;
        ctx.beginPath(); ctx.moveTo(bx, by);
        ctx.quadraticCurveTo(bx + bend * 0.4, by - L * 0.6, bx + bend, by - L + bend * 0.15);
        ctx.stroke();
      }
    });
    ctx.restore();
  }
  // white curls of wind crossing the frame during the gust
  function windLines(ctx, t, x0, y0, span) {
    const g = gust(t);
    if (g < 0.05) return;
    for (let i = 0; i < 5; i++) {
      const ph = (t - ev.gust) * 1.1 + i * 0.17;
      const x = x0 + (ph % 1.6) * span, y = y0 + i * 60 + Math.sin(i * 3) * 30;
      const pts = [];
      for (let k = 0; k < 14; k++) {
        const u = k / 13;
        const a = u * 5.5;
        pts.push([x + u * 260 + (u > 0.7 ? Math.sin(a) * 30 : 0), y + Math.sin(u * 6 + i) * 10 - (u > 0.7 ? (1 - Math.cos(a)) * 18 : 0)]);
      }
      G.line(ctx, pts, { color: `rgba(255,255,255,${0.75 * g})`, lw: 4, seed: 60 + i, step: 16 });
    }
  }

  // ---------- the straw hat ----------
  function hat(ctx, x, y, s, rot, t) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(s, s);
    G.ellipse(ctx, 0, 0, 120, 30, { fill: '#E9C46A', lw: 3, seed: 501 });
    G.poly(ctx, [[-58, 2], [-52, -46], [-20, -64], [20, -64], [52, -46], [58, 2]], { fill: '#F2D27E', lw: 3, seed: 502, step: 12 });
    G.poly(ctx, [[-57, -6], [57, -6], [55, -24], [-55, -24]], { fill: '#D9534F', lw: 2.5, seed: 503, step: 12 });
    // ribbon tails flutter
    const fl = Math.sin(t * 14) * 8;
    G.poly(ctx, [[50, -18], [96, -6 + fl], [92, 8 + fl], [52, -8]], { fill: '#D9534F', lw: 2.5, seed: 504, step: 10 });
    ctx.restore();
  }
  // where the hat sits on her head (Ch.person: shoulders at hip-172, head centre 82 above)
  const headTop = (x, y, s, pose) => [x, y + ((pose === 'stand' ? -150 : 0) - 172 - 82 - 64) * s];

  // ---------- the cat (a sleepy grey tabby) ----------
  function cat(ctx, t, x, look, happy = 0.5) {
    Ch.cat(ctx, { x, y: hillY(x) + 4, s: 0.42, color: '#8E8A94', look, happy, seed: 740 });
  }

  // ---------- swallows ----------
  function swallow(ctx, x, y, s, t, ph) {
    const f = Math.sin(t * 16 + ph);
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    ctx.fillStyle = '#2B3352';
    ctx.beginPath();
    ctx.moveTo(-40, -14 * f); ctx.quadraticCurveTo(-14, -6, 0, 0); ctx.quadraticCurveTo(14, -6, 40, -14 * f);
    ctx.quadraticCurveTo(14, 4, 6, 6); ctx.lineTo(12, 22); ctx.lineTo(0, 10); ctx.lineTo(-12, 22); ctx.lineTo(-6, 6);
    ctx.quadraticCurveTo(-14, 4, -40, -14 * f); ctx.fill();
    ctx.restore();
  }

  // ---------- the whole landscape, in world coordinates ----------
  function world(ctx, t, p, { sunAt, girl, catLook = 0, hatOn = null }) {
    sky(ctx, p);
    if (sunAt) sun(ctx, sunAt[0], sunAt[1], sunAt[2], p, sunAt[3]);
    clouds(ctx, t, p);
    sea(ctx, t, p);
    farHills(ctx, p);
    village(ctx, t, p);
    hill(ctx, p);
    tree(ctx, t, p);
    grass(ctx, t, p, [[0, 26]]);
    cat(ctx, t, CAT_X, catLook);
    if (girl) Ch.person(ctx, girl);
    if (hatOn) hat(ctx, hatOn[0], hatOn[1], hatOn[2], hatOn[3], t);
    grass(ctx, t, p, [[60, 34], [150, 46]]);
  }
  const camera = (ctx, cx, cy, zoom) => { ctx.translate(W / 2, H / 2); ctx.scale(zoom * W / 1920, zoom * W / 1920); ctx.translate(-cx, -cy); };

  // ---------- SHOT 1: the hill at midday ----------
  function shotHill(ctx, t) {
    const p = PAL.day;
    const gy = hillY(GIRL_X);
    const z = lerp(1.0, 1.06, ease.inOutQuad(t / ev.gust));
    ctx.save(); camera(ctx, 960 + 40 * (z - 1) * 10, 540, z);
    const breathe = Math.sin(t * 1.8) * 0.01;
    const girl = { x: GIRL_X, y: gy, s: GIRL_S, sy: 1 + breathe, pose: 'floor', eyes: t % 4.3 < 0.14 ? 'closed' : 'happy', mouth: 'smile', look: 0.6, lookY: -0.4, handL: [-100, 14], handR: [100, 14], blush: 0.4, style: GIRL, headRot: Math.sin(t * 0.8) * 0.04 };
    const [hx, hy] = headTop(GIRL_X, gy, GIRL_S, 'floor');
    world(ctx, t, p, { sunAt: [1650, 140, 46, 1], girl, catLook: 0.4, hatOn: [hx, hy + 6 * GIRL_S, GIRL_S, -0.08 + Math.sin(t * 1.6) * 0.03] });
    ctx.restore();
  }

  // ---------- SHOT 2: the gust (closer) ----------
  function shotGust(ctx, t) {
    const p = PAL.day;
    const gy = hillY(GIRL_X);
    const z = lerp(2.2, 2.4, ease.inOutQuad((t - ev.gust) / (ev.sky - ev.gust)));
    const standing = t >= ev.stand;
    const pose = standing ? 'stand' : 'floor';
    const [hx0, hy0] = headTop(GIRL_X, gy, GIRL_S, 'floor');
    // the hat's flight: up and to the right, tumbling, gone by bar 7
    const u = clamp((t - ev.gust) / (T(7, 1) - ev.gust));
    const hx = hx0 + ease.inQuad(u) * 560 + Math.sin(u * 7) * 30;
    const hy = hy0 - (u * 230 + ease.inQuad(u) * 120) + Math.sin(u * 9) * 14;
    const hrot = -0.08 + u * 7;
    // she reacts: wide eyes, reaches; jumps up on bar 6 and stretches after it
    const since = t - ev.gust;
    const reach = standing ? [140, -330 - 30 * Math.sin((t - ev.stand) * 3)] : [120, -230 - 40 * clamp(since / 0.6)];
    const hop = standing ? Math.max(0, Math.sin(Math.PI * clamp((t - ev.stand) / 0.45))) * 26 : 0;
    const sq = standing ? 1 + 0.08 * Math.exp(-(t - ev.stand) * 8) : 1;
    const girl = {
      x: GIRL_X, y: gy - hop, s: GIRL_S, sx: sq, sy: 2 - sq, pose, style: GIRL,
      eyes: since < 0.25 ? 'wide' : t > T(7, 1) ? 'normal' : 'wide', brows: t > T(7, 1) ? 'worried' : 'up', mouth: t > T(7, 1) ? 'wavy' : 'o',
      look: clamp((hx - GIRL_X) / 260, -1, 1), lookY: -1, handR: reach, handL: standing ? [70, -300 - 20 * Math.sin((t - ev.stand) * 3 + 1)] : [-100, 14], blush: 0.5,
    };
    const cy = gy - (standing ? 190 : 140) * GIRL_S * 1.4;
    ctx.save(); camera(ctx, GIRL_X + 30, cy, z);
    world(ctx, t, p, { sunAt: [1650, 140, 46, 1], girl, catLook: clamp((hx - CAT_X) / 200, -1, 1), hatOn: [hx, hy, GIRL_S, hrot] });
    windLines(ctx, t, 820, gy - 260, 900);
    ctx.restore();
  }

  // ---------- SHOT 3: the hat sails through the clouds ----------
  function shotSky(ctx, t) {
    const p = PAL.gold;
    const u = (t - ev.sky) / (ev.dusk - ev.sky);
    const tilt = lerp(0, 160, ease.inOutQuad(u)); // the camera drifts up with the hat
    ctx.save();
    ctx.translate(0, tilt);
    sky(ctx, p, -300, 1200);
    sun(ctx, 1500, 260 - tilt * 0.3, 70, p, 1.3);
    // three depths of cloud, parallax
    const layer = (k, list) => { for (const c of list) { const x = ((c[0] - (t - ev.sky) * 90 * k) % 2900 + 2900) % 2900 - 450; cloud(ctx, x, c[1] - tilt * (k - 1) * 0.4, c[2], c[3], p); } };
    layer(0.5, [[300, 420, 0.7, 61], [1300, 360, 0.8, 62], [2200, 440, 0.6, 63]]);
    layer(1.0, [[700, 820, 1.4, 71], [1900, 760, 1.6, 72], [2700, 880, 1.3, 73]]);
    // the hat and its swallow escort
    const hp = S.hatSky(t);
    for (let i = 0; i < 4; i++) {
      const lag = 0.25 + i * 0.12;
      const q = S.hatSky(t - lag);
      swallow(ctx, q.x - 60 + i * 30, q.y + (i % 2 ? -90 : 80) + Math.sin(t * 3 + i) * 20 - tilt, 0.9 - i * 0.1, t, i);
    }
    hat(ctx, hp.x, hp.y - tilt, 1.0, hp.rot, t);
    layer(1.9, [[1200, 1180, 2.2, 81], [2700, 1220, 2.4, 82]]);
    ctx.restore();
    // golden light
    ctx.save(); ctx.globalCompositeOperation = 'soft-light';
    const g = ctx.createRadialGradient(1500, 200, 0, 1500, 200, 1400);
    g.addColorStop(0, 'rgba(255,220,150,0.7)'); g.addColorStop(1, 'rgba(255,200,150,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H); ctx.restore();
  }

  // ---------- SHOT 4: dusk, the hat comes home ----------
  function shotDusk(ctx, t) {
    const p = palAt(t);
    const gy = hillY(GIRL_X);
    const k = duskK(t);
    const z = lerp(1.08, 1.0, ease.outQuad(clamp((t - ev.dusk) / 4)));
    // the hat drifts down like a leaf, into her hands on the bell
    const u = clamp((t - ev.dusk) / (ev.catch - ev.dusk));
    const hands = [GIRL_X + 4, gy + (-150 - 120) * GIRL_S];
    let hx = lerp(1720, hands[0], ease.outQuad(u)) + Math.sin(u * Math.PI * 3) * 70 * (1 - u);
    let hy = lerp(80, hands[1], ease.inOutQuad(u));
    let hs = GIRL_S, hrot = Math.sin(u * Math.PI * 3) * 0.5 * (1 - u);
    const caught = t >= ev.catch;
    const onHead = t >= T(15);
    const hop = onHead ? Math.max(0, Math.sin(Math.PI * clamp((t - T(15)) / 0.4))) * 14 : 0;
    if (onHead) { const [ax, ay] = headTop(GIRL_X, gy - hop, GIRL_S, 'stand'); hx = ax; hy = ay + 6 * GIRL_S; hrot = -0.08; }
    const lookStars = t >= T(14, 1);
    const girl = {
      x: GIRL_X, y: gy - hop, s: GIRL_S, pose: 'stand', style: GIRL,
      eyes: caught ? (t % 3.7 < 0.14 ? 'closed' : 'happy') : 'wide', mouth: caught ? 'smile' : 'o', brows: caught ? 'neutral' : 'up',
      look: caught ? (lookStars ? -0.3 : 0) : clamp((hx - GIRL_X) / 300, -1, 1), lookY: caught && !lookStars ? 0.2 : -1, blush: 0.6,
      handL: onHead ? [-92, -120] : caught ? [-40, -130] : [-70, -300], handR: onHead ? [92, -120] : caught ? [40, -130] : [80, -320],
    };
    ctx.save(); camera(ctx, 960, 540, z);
    const sunY = lerp(470, 620, k);
    world(ctx, t, p, { sunAt: [1480, sunY, 64, 1.2 - 0.6 * k], girl, catLook: caught ? -0.3 : 0.6, hatOn: [hx, hy, hs, hrot] });
    // a sparkle where it lands
    if (t >= ev.catch && t < ev.catch + 0.8) G.rays(ctx, hands[0], hands[1], { n: 10, r0: 30, r1: 30 + 90 * ease.outQuad((t - ev.catch) / 0.8), color: '#FFE3A0', lw: 3, alpha: 1 - (t - ev.catch) / 0.8 });
    ctx.restore();
    // night falls from the top, with the stars on the music box
    ctx.save(); ctx.globalCompositeOperation = 'multiply';
    const n = ctx.createLinearGradient(0, 0, 0, H);
    n.addColorStop(0, `rgba(40,40,110,${0.55 * k})`); n.addColorStop(0.6, `rgba(120,90,160,${0.25 * k})`); n.addColorStop(1, `rgba(90,80,140,${0.35 * k})`);
    ctx.fillStyle = n; ctx.fillRect(0, 0, W, H); ctx.restore();
    for (const s of S.starNotes) {
      const a = t - s.t;
      if (a < 0) continue;
      const pop = ease.outBack(clamp(a / 0.3), 3);
      const tw = 0.85 + 0.15 * Math.sin(t * 5 + s.i);
      if (a < 0.6) {
        const g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, 60);
        g.addColorStop(0, `rgba(255,240,200,${0.7 * (1 - a / 0.6)})`); g.addColorStop(1, 'rgba(255,240,200,0)');
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = g; ctx.fillRect(s.x - 60, s.y - 60, 120, 120); ctx.restore();
      }
      G.star(ctx, s.x, s.y, 20 * pop * tw, { fill: '#FFF1C9', seed: 900 + s.i });
    }
    title(ctx, t);
  }

  function title(ctx, t) {
    const c = S.titleCard;
    const a = clamp((t - c.t) / 1.2);
    if (a <= 0) return;
    const size = 92;
    const x = 160, y = 230;
    const full = G.measure(ctx, c.text, size, 'Caveat', 700);
    ctx.save(); ctx.beginPath(); ctx.rect(x - 10, y - size, full * ease.inOutQuad(a) + 20, size * 1.6); ctx.clip();
    G.text(ctx, c.text, x, y, { size, color: '#FFF4E0', fam: 'Caveat', weight: 700 });
    ctx.restore();
  }

  Studio.film({
    draw(ctx, t) {
      if (t < ev.gust) shotHill(ctx, t);
      else if (t < ev.sky) shotGust(ctx, t);
      else if (t < ev.dusk) shotSky(ctx, t);
      else shotDusk(ctx, t);
      // fade in from black
      if (t < 1.0) { ctx.fillStyle = `rgba(10,10,20,${1 - ease.outQuad(t / 1.0)})`; ctx.fillRect(0, 0, W, H); }
    },
    post: { paper: 0.7, vignette: 0.25, grain: 0.03 },
  });
})();
