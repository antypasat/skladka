// pot.js — the common pot. A raymarched liquid-gold metaball field.
// Every participant is a droplet; the pot makes them one.
// Raw WebGL1, zero dependencies. Renders transparent over the page.

const MAX_BLOBS = 10;

const VERT = `
attribute vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform int uCount;
uniform vec4 uBlobs[${MAX_BLOBS}]; // xyz center, w radius
uniform vec2 uLightTilt;           // pointer-driven light sway
uniform float uSink;               // 0..1 scroll: liquid drains downward
uniform float uCamZ;               // camera distance (farther on narrow screens)
uniform float uTaY;                // camera target height (higher on narrow screens)

// polynomial smooth min — the "liquid merge"
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

float map(vec3 p) {
  float d = 1e9;
  for (int i = 0; i < ${MAX_BLOBS}; i++) {
    if (i >= uCount) break;
    vec4 b = uBlobs[i];
    // gentle surface churn so the gold never sits still
    float wob = 0.015 * sin(6.0 * p.x + uTime * 1.4 + float(i))
              * sin(5.0 * p.y - uTime * 1.1);
    d = smin(d, length(p - b.xyz) - (b.w + wob), 0.3);
  }
  return d;
}

vec3 normalAt(vec3 p) {
  const vec2 e = vec2(0.004, -0.004);
  return normalize(
    e.xyy * map(p + e.xyy) + e.yyx * map(p + e.yyx) +
    e.yxy * map(p + e.yxy) + e.xxx * map(p + e.xxx));
}

void main() {
  vec2 uv = (2.0 * gl_FragCoord.xy - uRes) / min(uRes.x, uRes.y);

  // camera: slightly above, looking down into the pot
  vec3 ro = vec3(0.0, 0.25, uCamZ);
  vec3 ta = vec3(0.0, uTaY, 0.0);
  vec3 fw = normalize(ta - ro);
  vec3 rt = normalize(cross(fw, vec3(0.0, 1.0, 0.0)));
  vec3 up = cross(rt, fw);
  vec3 rd = normalize(fw * 1.9 + uv.x * rt + uv.y * up);

  float t = 0.0;
  float glow = 0.0;
  bool hit = false;
  vec3 p;
  for (int i = 0; i < 64; i++) {
    p = ro + rd * t;
    float d = map(p);
    glow += exp(-14.0 * abs(d)) * 0.028;      // molten halo near the surface
    if (d < 0.0015 * t) { hit = true; break; }
    t += d * 0.9;
    if (t > 8.0) break;
  }

  vec3 col = vec3(0.0);
  float alpha = 0.0;

  if (hit) {
    vec3 n = normalAt(p);
    vec3 v = -rd;
    vec3 lDir = normalize(vec3(-0.45 + uLightTilt.x, 0.85, 0.55 + uLightTilt.y));
    float ndl = clamp(dot(n, lDir), 0.0, 1.0);
    float fres = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 3.0);

    vec3 gold = vec3(0.92, 0.56, 0.14);
    vec3 goldHi = vec3(1.0, 0.86, 0.5);
    vec3 amberShadow = vec3(0.38, 0.19, 0.05);
    vec3 verdigris = vec3(0.22, 0.52, 0.42);

    // diffuse body, deep amber in the shadows
    col = mix(amberShadow, gold, ndl);
    // warm key specular — the liquid glint
    vec3 h = normalize(lDir + v);
    col += goldHi * pow(clamp(dot(n, h), 0.0, 1.0), 60.0) * 2.2;
    // broad soft sheen
    col += goldHi * pow(clamp(dot(n, h), 0.0, 1.0), 8.0) * 0.25;
    // verdigris rim from the left — the patina answer to the gold
    float rim = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), 2.5);
    col += verdigris * rim * clamp(-n.x * 0.5 + 0.55, 0.0, 1.0) * 0.55;
    // faked sky reflection band
    vec3 refl = reflect(rd, n);
    col += goldHi * smoothstep(0.15, 0.75, refl.y) * fres * 0.8;
    // fresnel lift
    col += goldHi * fres * 0.35;
    // molten bounce — the pool lights its own underside
    col += vec3(0.95, 0.55, 0.16) * clamp(-n.y, 0.0, 1.0) * 0.38;
    col *= 1.18;

    // filmic-ish tone + gamma
    col = col / (1.0 + col);
    col = pow(col, vec3(0.85));
    alpha = 1.0;
  } else {
    // soft molten aura around the silhouette
    vec3 aura = vec3(0.95, 0.72, 0.30);
    col = aura * glow;
    alpha = clamp(glow * 1.6, 0.0, 0.55);
  }

  // scroll drain: everything dissolves downward
  float fade = 1.0 - uSink * clamp(uv.y + 1.2, 0.0, 1.0) * 0.9;
  gl_FragColor = vec4(col * alpha, alpha) * fade; // premultiplied
}
`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    throw new Error(gl.getShaderInfoLog(s));
  }
  return s;
}

/**
 * Mount the pot on a canvas.
 * Returns { setPeople(n), splash(), setSink(t), destroy } — or null if WebGL is unavailable.
 */
export function initPot(canvas, { reducedMotion = false } = {}) {
  const gl = canvas.getContext('webgl', {
    alpha: true, antialias: true, premultipliedAlpha: true,
    powerPreference: 'low-power',
  });
  if (!gl) return null;

  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

  const U = (n) => gl.getUniformLocation(prog, n);
  const uRes = U('uRes'), uTime = U('uTime'), uCount = U('uCount'),
        uBlobs = U('uBlobs'), uLightTilt = U('uLightTilt'), uSink = U('uSink'),
        uCamZ = U('uCamZ'), uTaY = U('uTaY');

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  // ---- droplet simulation --------------------------------------------------
  // blob 0 is the pot itself; the rest are participant droplets
  const drops = []; // { angle, speed, r, y, bob, born, falling }
  let peopleCount = 0;
  let sink = 0;
  let lightTilt = [0, 0];
  let splashT = -10;

  function setPeople(n) {
    const target = Math.min(n, MAX_BLOBS - 3);
    while (drops.length < target) {
      const i = drops.length;
      drops.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.25 + Math.random() * 0.2,
        r: 0.95 + (i % 3) * 0.24,
        y: -1.06 + (i % 4) * 0.09,
        bob: Math.random() * Math.PI * 2,
        born: perfNow(),
        falling: true,
      });
    }
    while (drops.length > target) drops.pop();
    peopleCount = n;
  }

  function splash() { splashT = perfNow(); }

  const blobData = new Float32Array(MAX_BLOBS * 4);
  const t0 = performance.now();
  const perfNow = () => (performance.now() - t0) / 1000;

  function fillBlobs(time) {
    // the pot: a wide pool cresting from the bottom edge — three welded spheres.
    // It grows a little with each person and breathes slowly.
    const potR = 0.72 + Math.min(peopleCount, 8) * 0.018
      + 0.02 * Math.sin(time * 0.6)
      + 0.09 * Math.exp(-Math.max(0, time - splashT) * 3.0); // splash swell
    const potY = -1.98 - sink * 1.7;
    const sway = 0.05 * Math.sin(time * 0.45);
    blobData[0] = -0.66 + sway; blobData[1] = potY - 0.04; blobData[2] = 0; blobData[3] = potR * 0.82;
    blobData[4] = 0; blobData[5] = potY + 0.08; blobData[6] = 0; blobData[7] = potR;
    blobData[8] = 0.66 - sway; blobData[9] = potY - 0.04; blobData[10] = 0; blobData[11] = potR * 0.82;

    for (let i = 0; i < drops.length; i++) {
      const d = drops[i];
      const age = time - d.born;
      let x, y, z;
      if (d.falling && age < 1.1) {
        // fall from above, ease into the surface
        const k = Math.min(age / 1.1, 1);
        const e = 1 - Math.pow(1 - k, 3);
        x = Math.cos(d.angle) * d.r * e;
        z = Math.sin(d.angle) * d.r * e;
        y = 2.1 - e * (2.1 - d.y);
      } else {
        d.falling = false;
        // orbit resumes exactly where the fall landed — no position jump
        const a = d.angle + (time - d.born - 1.1) * d.speed;
        x = Math.cos(a) * d.r;
        z = Math.sin(a) * d.r;
        y = d.y + 0.07 * Math.sin(time * 1.3 + d.bob);
      }
      const o = (i + 3) * 4;
      blobData[o] = x;
      blobData[o + 1] = y - sink * 2.2;
      blobData[o + 2] = z;
      blobData[o + 3] = 0.135 + 0.015 * Math.sin(time * 2.0 + d.bob);
    }
  }

  // ---- render loop ---------------------------------------------------------
  let raf = 0, running = false, destroyed = false;

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5) * 0.72; // internal supersample cap
    const w = Math.round(canvas.clientWidth * dpr);
    const h = Math.round(canvas.clientHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w; canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  function frame() {
    if (destroyed) return;
    resize();
    const time = perfNow();
    fillBlobs(time);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(uRes, canvas.width, canvas.height);
    gl.uniform1f(uTime, time);
    gl.uniform1i(uCount, 3 + drops.length);
    gl.uniform4fv(uBlobs, blobData);
    gl.uniform2f(uLightTilt, lightTilt[0], lightTilt[1]);
    gl.uniform1f(uSink, sink);
    // narrow (portrait) screens see a wider shot so the liquid stays low
    const aspect = canvas.width / Math.max(1, canvas.height);
    const narrow = Math.max(0, 0.85 - aspect);
    gl.uniform1f(uCamZ, 4.15 + narrow * 3.6);
    gl.uniform1f(uTaY, -0.55 + narrow * 0.9);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (running && !reducedMotion) raf = requestAnimationFrame(frame);
  }

  function start() {
    if (running || destroyed) return;
    running = true;
    raf = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // pause when offscreen
  const io = new IntersectionObserver(
    (entries) => { entries[0].isIntersecting ? start() : stop(); },
    { threshold: 0.02 });
  io.observe(canvas);

  // pointer sways the key light
  const onMove = (e) => {
    const r = canvas.getBoundingClientRect();
    lightTilt = [
      ((e.clientX - r.left) / r.width - 0.5) * 0.5,
      ((e.clientY - r.top) / r.height - 0.5) * -0.3,
    ];
  };
  window.addEventListener('pointermove', onMove, { passive: true });

  if (reducedMotion) { resize(); setPeople(3); frame(); } // single still frame

  return {
    setPeople(n) { setPeople(n); if (reducedMotion) frame(); },
    splash,
    setSink(t) { sink = Math.max(0, Math.min(1, t)); },
    destroy() {
      destroyed = true; stop(); io.disconnect();
      window.removeEventListener('pointermove', onMove);
    },
  };
}
