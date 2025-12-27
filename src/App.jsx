import React, { useEffect, useMemo, useRef, useState } from "react";

function clamp(x, a, b) {
  return x < a ? a : x > b ? b : x;
}

function mod(a, n) {
  return ((a % n) + n) % n;
}

function wrapRange(x, min, max) {
  const span = max - min;
  if (span <= 0) return min;
  return min + mod(x - min, span);
}

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function fmt(n, d = 0) {
  const p = Math.pow(10, d);
  return Math.round(n * p) / p;
}

function makeRng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function gaussian(rng) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function parseSize(s) {
  const raw = String(s || "").trim().toLowerCase();
  const parts = raw.split("x").map((p) => p.trim());
  if (parts.length !== 2) return null;
  const w = Number(parts[0]);
  const h = Number(parts[1]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w < 16 || h < 16) return null;
  return { w: Math.floor(w), h: Math.floor(h) };
}

function createRainParticle(rng, w, h, p) {
  const ang = (p.angleDeg * Math.PI) / 180;
  const baseVy = p.speed * Math.cos(ang);
  const baseVx = p.speed * Math.sin(ang);

  const vy = baseVy + (rng() * 2 - 1) * p.speedJitter;
  const vx = baseVx + (rng() * 2 - 1) * p.speedJitter * 0.25;

  const rawSize = p.dropSize + gaussian(rng) * p.dropSizeJitter;
  const size = Math.max(1, clamp(rawSize, p.minDropSize, p.maxDropSize));
  const alpha = clamp(p.opacity + gaussian(rng) * p.opacityJitter, 0.05, 1);

  const lenScale = clamp(1 + gaussian(rng) * 0.35, 0.55, 1.9);
  const thickScale = clamp(1 + gaussian(rng) * 0.25, 0.65, 1.7);
  const sparkle = clamp(rng() * 1.25, 0.0, 1.0);

  return {
    x0: (rng() * 1.4 - 0.2) * w,
    y0: (rng() * 1.2 - 0.2) * h,
    vx,
    vy,
    size,
    alpha,
    lenScale,
    thickScale,
    phase0: rng() * Math.PI * 2,
    sparkle,
  };
}

function createSnowParticle(rng, w, h, p) {
  const rawSize = p.flakeSize + gaussian(rng) * p.flakeSizeJitter;
  const size = Math.max(1, clamp(rawSize, p.minFlakeSize, p.maxFlakeSize));
  const alpha = clamp(p.opacity + gaussian(rng) * p.opacityJitter, 0.05, 1);
  return {
    x0: (rng() * 1.2 - 0.1) * w,
    y0: (rng() * 1.2 - 0.2) * h,
    vx: p.wind + (rng() * 2 - 1) * p.drift,
    vy: (0.7 + 0.6 * rng()) * p.fall,
    size,
    alpha,
    phase0: rng() * Math.PI * 2,
  };
}

function ensureCanvas(ref, w, h) {
  if (!ref.current) ref.current = document.createElement("canvas");
  const c = ref.current;
  if (c.width !== w) c.width = w;
  if (c.height !== h) c.height = h;
  return c;
}

function blurCanvasReuse(ctx, blurRef, w, h, blurPx) {
  const b = Math.floor(blurPx);
  if (!b || b <= 0) return;
  const off = ensureCanvas(blurRef, w, h);
  const octx = off.getContext("2d", { alpha: true });
  octx.clearRect(0, 0, w, h);
  octx.filter = `blur(${b}px)`;
  octx.drawImage(ctx.canvas, 0, 0);
  ctx.clearRect(0, 0, w, h);
  ctx.filter = "none";
  ctx.drawImage(off, 0, 0);
}

function makeCheckerDataUrl(tile = 24) {
  const c = document.createElement("canvas");
  const s = tile * 2;
  c.width = s;
  c.height = s;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#1f1f1f";
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = "#2b2b2b";
  ctx.fillRect(0, 0, tile, tile);
  ctx.fillRect(tile, tile, tile, tile);
  return { dataUrl: c.toDataURL("image/png"), tile };
}

function InfoDot({ text }) {
  return (
    <span style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
      <span
        className="infodot"
        tabIndex={0}
        style={{
          marginLeft: 8,
          height: 18,
          width: 18,
          borderRadius: 999,
          border: "1px solid #3a3a49",
          color: "#e5e7eb",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 12,
          lineHeight: "12px",
          cursor: "default",
          userSelect: "none",
        }}
        aria-label="info"
      >
        i
      </span>
      <span
        className="infotip"
        style={{
          position: "absolute",
          left: "50%",
          top: 24,
          transform: "translateX(-50%)",
          background: "#ffffff",
          color: "#000000",
          border: "1px solid #d4d4d8",
          borderRadius: 10,
          padding: "8px 10px",
          minWidth: 160,
          maxWidth: 240,
          fontSize: 12,
          lineHeight: 1.35,
          boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
          zIndex: 99999,
          whiteSpace: "normal",
          pointerEvents: "none",
        }}
      >
        {text}
      </span>
      <style>{`
        .infotip { display: none; }
        .infodot:hover + .infotip,
        .infodot:focus + .infotip { display: block; }
      `}</style>
    </span>
  );
}

function LabeledSlider({ label, help, value, setValue, min, max, step = 1, digits = 0 }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", color: "#e5e7eb" }}>
          <span>{label}</span>
          <InfoDot text={help} />
        </div>
        <div style={{ color: "#a1a1aa", fontVariantNumeric: "tabular-nums" }}>{fmt(value, digits)}</div>
      </div>
      <input
        type="range"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => setValue(parseFloat(e.target.value))}
        style={{ width: "100%" }}
      />
    </div>
  );
}

export default function OverlayTuner() {
  const [tab, setTab] = useState("rain");
  const [sizeStr, setSizeStr] = useState("1280x720");
  const [fps, setFps] = useState(30);
  const [duration, setDuration] = useState(8);
  const [seed, setSeed] = useState(12345);
  const [previewScale, setPreviewScale] = useState(1);
  const [showChecker, setShowChecker] = useState(true);
  const [exportBg, setExportBg] = useState("transparent");

  const [rain, setRain] = useState({
    density1080: 1200,
    angleDeg: 18,
    speed: 1750,
    speedJitter: 220,
    streakLen: 34,
    thickness: 1.2,
    minDropSize: 0.8,
    maxDropSize: 2.6,
    dropSize: 1.7,
    dropSizeJitter: 0.9,
    opacity: 0.42,
    opacityJitter: 0.12,
    blur: 0,
  });

  const [snow, setSnow] = useState({
    density1080: 650,
    fall: 190,
    wind: 0,
    drift: 70,
    wobble: 120,
    turbulence: 8,
    minFlakeSize: 1.2,
    maxFlakeSize: 5.5,
    flakeSize: 2.8,
    flakeSizeJitter: 1.1,
    glow: 2.6,
    opacity: 0.55,
    opacityJitter: 0.12,
    blur: 1.2,
  });

  const canvasRef = useRef(null);
  const rafRef = useRef(0);
  const blurRef = useRef(null);
  const exportBlurRef = useRef(null);
  const checkerRef = useRef(null);

  const stateRef = useRef({
    particles: [],
    w: 0,
    h: 0,
    mode: "rain",
    startTs: 0,
  });

  const size = useMemo(() => parseSize(sizeStr) || { w: 1280, h: 720 }, [sizeStr]);

  const checker = useMemo(() => {
    if (!checkerRef.current) checkerRef.current = makeCheckerDataUrl(24);
    return checkerRef.current;
  }, []);

  const densityCount = useMemo(() => {
    const areaScale = (size.w * size.h) / (1920 * 1080);
    const base = tab === "rain" ? rain.density1080 : snow.density1080;
    return Math.max(1, Math.floor(base * areaScale));
  }, [size.w, size.h, tab, rain.density1080, snow.density1080]);

  const paramsJson = useMemo(() => {
    const common = { mode: tab, size: `${size.w}x${size.h}`, fps, duration, seed };
    return JSON.stringify({ ...common, rain, snow }, null, 2);
  }, [tab, size.w, size.h, fps, duration, seed, rain, snow]);

  const pythonCmd = useMemo(() => {
    const common = `--duration ${duration} --fps ${fps} --size ${size.w}x${size.h}`;
    if (tab === "rain") {
      return `python3 procedural_overlay.py rain --out rain_alpha.webm ${common} --density ${rain.density1080} --angle ${rain.angleDeg} --speed ${rain.speed} --speed-jitter ${rain.speedJitter} --streak-len ${rain.streakLen} --drop-size ${rain.dropSize} --drop-size-jitter ${rain.dropSizeJitter} --thickness ${rain.thickness} --opacity ${rain.opacity} --opacity-jitter ${rain.opacityJitter} --blur ${rain.blur} --crf 20`;
    }
    return `python3 procedural_overlay.py snow --out snow_alpha.webm ${common} --density ${snow.density1080} --fall ${snow.fall} --wind ${snow.wind} --drift ${snow.drift} --wobble ${snow.wobble} --turbulence ${snow.turbulence} --flake-size ${snow.flakeSize} --flake-size-jitter ${snow.flakeSizeJitter} --glow ${snow.glow} --opacity ${snow.opacity} --opacity-jitter ${snow.opacityJitter} --blur ${snow.blur} --crf 20`;
  }, [tab, duration, fps, size.w, size.h, rain, snow]);

  function resetSimulation(mode) {
    const rng = makeRng(seed);
    const particles = [];
    const p = mode === "rain" ? rain : snow;
    for (let i = 0; i < densityCount; i++) {
      particles.push(
        mode === "rain" ? createRainParticle(rng, size.w, size.h, p) : createSnowParticle(rng, size.w, size.h, p)
      );
    }
    stateRef.current = {
      particles,
      w: size.w,
      h: size.h,
      mode,
      startTs: 0,
    };
  }

  useEffect(() => {
    resetSimulation(tab);
  }, [tab, size.w, size.h, densityCount, seed, rain, snow]);

  function renderRain(ctx, particles, p, t, w, h, T) {
    const margin = Math.max(40, p.streakLen * 2);
    const xMin = -margin;
    const xMax = w + margin;
    const yMin = -margin;
    const yMax = h + margin;

    const cycles = 2;
    const wAng = (2 * Math.PI * cycles) / Math.max(0.001, T);
    const gust = Math.sin(wAng * t) * (p.speedJitter * 0.12);

    ctx.lineCap = "round";

    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];

      const vx = a.vx + gust * 0.25;
      const vy = a.vy + gust * 0.05;

      const x = wrapRange(a.x0 + vx * t, xMin, xMax);
      const y = wrapRange(a.y0 + vy * t, yMin, yMax);

      const n = Math.hypot(vx, vy) + 1e-6;
      const ux = vx / n;
      const uy = vy / n;

      const L = p.streakLen * a.lenScale;
      const x2 = x - ux * L;
      const y2 = y - uy * L;

      const lw = Math.max(1, a.size * p.thickness * a.thickScale);

      const head = clamp(a.alpha * (0.9 + 0.35 * a.sparkle), 0, 1);
      const tail = clamp(a.alpha * 0.18, 0, 1);

      const hx = x - ux * (L * 0.35);
      const hy = y - uy * (L * 0.35);

      ctx.lineWidth = lw;
      ctx.strokeStyle = `rgba(255,255,255,${tail})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x2, y2);
      ctx.stroke();

      ctx.lineWidth = lw * 0.85;
      ctx.strokeStyle = `rgba(255,255,255,${head})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(hx, hy);
      ctx.stroke();

      const bead = Math.sin(a.phase0 + wAng * t) * 0.5 + 0.5;
      if (bead > 0.92) {
        ctx.fillStyle = `rgba(255,255,255,${head * 0.6})`;
        ctx.beginPath();
        ctx.arc(x + ux * 1.5, y + uy * 1.5, Math.max(0.6, lw * 0.45), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function renderSnow(ctx, particles, p, t, w, h, T) {
    const margin = 40;
    const xMin = -margin;
    const xMax = w + margin;
    const yMin = -margin;
    const yMax = h + margin;

    const cycles = Math.max(1, Math.round(p.turbulence));
    const wAng = (2 * Math.PI * cycles) / Math.max(0.001, T);

    for (let i = 0; i < particles.length; i++) {
      const a = particles[i];
      const wobble = Math.sin(a.phase0 + wAng * t) * p.wobble;

      const x = wrapRange(a.x0 + (a.vx * t + wobble), xMin, xMax);
      const y = wrapRange(a.y0 + a.vy * t, yMin, yMax);

      ctx.fillStyle = `rgba(255,255,255,${a.alpha})`;
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, a.size), 0, Math.PI * 2);
      ctx.fill();

      if (p.glow > 0) {
        ctx.fillStyle = `rgba(255,255,255,${a.alpha * 0.35})`;
        ctx.beginPath();
        ctx.arc(x, y, Math.max(1, a.size * p.glow), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = size.w;
    canvas.height = size.h;

    const ctx = canvas.getContext("2d", { alpha: true });

    const tick = (ts) => {
      const st = stateRef.current;
      if (!st.startTs) st.startTs = ts;

      const w = st.w;
      const h = st.h;
      const mode = st.mode;
      const particles = st.particles;

      const T = Math.max(0.2, duration);
      const t = mod((ts - st.startTs) / 1000, T);

      ctx.clearRect(0, 0, w, h);

      if (mode === "rain") {
        renderRain(ctx, particles, rain, t, w, h, T);
        if (rain.blur > 0) blurCanvasReuse(ctx, blurRef, w, h, rain.blur);
      } else {
        renderSnow(ctx, particles, snow, t, w, h, T);
        if (snow.blur > 0) blurCanvasReuse(ctx, blurRef, w, h, snow.blur);
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [tab, size.w, size.h, seed, rain, snow, duration]);

  async function exportWebm() {
    const w = size.w;
    const h = size.h;

    const outCanvas = document.createElement("canvas");
    outCanvas.width = w;
    outCanvas.height = h;
    const octx = outCanvas.getContext("2d", { alpha: true });

    const stream = outCanvas.captureStream(fps);
    const mimeCandidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    const mime = mimeCandidates.find((m) => MediaRecorder.isTypeSupported(m)) || "video/webm";

    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });

    const chunks = [];
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    };

    const mode = tab;
    const rng = makeRng(seed);
    const particles = [];
    const count = densityCount;
    const pr = rain;
    const ps = snow;

    for (let i = 0; i < count; i++) {
      particles.push(mode === "rain" ? createRainParticle(rng, w, h, pr) : createSnowParticle(rng, w, h, ps));
    }

    const totalFrames = Math.max(1, Math.floor(duration * fps));
    const T = Math.max(0.2, duration);

    const checkerImg = new Image();
    if (exportBg === "checker") checkerImg.src = checker.dataUrl;
    if (exportBg === "checker") {
      await new Promise((r) => {
        checkerImg.onload = r;
        checkerImg.onerror = r;
      });
    }

    const drawBg = () => {
      if (exportBg === "black") {
        octx.fillStyle = "black";
        octx.fillRect(0, 0, w, h);
        return;
      }
      if (exportBg === "checker" && checkerImg.complete && checkerImg.naturalWidth) {
        const tile = checker.tile;
        for (let y = 0; y < h; y += tile * 2) {
          for (let x = 0; x < w; x += tile * 2) {
            octx.drawImage(checkerImg, x, y);
          }
        }
      }
    };

    const renderFrameAt = (t) => {
      octx.clearRect(0, 0, w, h);
      drawBg();
      if (mode === "rain") {
        renderRain(octx, particles, pr, t, w, h, T);
        if (pr.blur > 0) blurCanvasReuse(octx, exportBlurRef, w, h, pr.blur);
      } else {
        renderSnow(octx, particles, ps, t, w, h, T);
        if (ps.blur > 0) blurCanvasReuse(octx, exportBlurRef, w, h, ps.blur);
      }
    };

    const waitNext = (targetMs) =>
      new Promise((resolve) => {
        const el = document.createElement("video");
        const hasRVFC = typeof el.requestVideoFrameCallback === "function";
        if (!hasRVFC) return setTimeout(resolve, targetMs);
        el.muted = true;
        el.playsInline = true;
        el.srcObject = stream;
        el.onloadedmetadata = () => {
          el.play().catch(() => {});
          el.requestVideoFrameCallback(() => {
            try {
              el.pause();
              el.srcObject = null;
            } catch {}
            resolve();
          });
        };
      });

    rec.start(250);

    for (let f = 0; f < totalFrames; f++) {
      const t = (f / totalFrames) * T;
      renderFrameAt(t);
      await waitNext(0);
    }

    rec.stop();

    const blob = await new Promise((resolve) => {
      rec.onstop = () => resolve(new Blob(chunks, { type: mime }));
    });

    downloadBlob(`${tab}_preview.webm`, blob);
  }

  const previewPct = clamp(previewScale, 0.25, 1);

  const checkerStyle = showChecker
    ? {
        backgroundImage: `url(${checker.dataUrl})`,
        backgroundRepeat: "repeat",
        backgroundSize: `${checker.tile * 2}px ${checker.tile * 2}px`,
      }
    : { background: "transparent" };

  const page = {
    width: "100vw",
    height: "100vh",
    background: "#050506",
    color: "#f3f4f6",
    margin: 0,
    padding: 0,
    overflowY: "auto",
    overflowX: "hidden",
    WebkitOverflowScrolling: "touch",
  };


  const container = {
    width: "100%",
    height: "100%",
    display: "flex",
    flexDirection: "column",
    gap: 14,
  };
  
  const top = {
    display: "flex",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
  };

  const card = {
    background: "rgba(18,18,24,.75)",
    border: "1px solid #262630",
    borderRadius: 16,
  };

  const pad = { padding: 14 };

  const grid = {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) 420px",
    gap: 14,
    alignItems: "start",
    flex: 1,
    minHeight: 0,
  };

  const btn = {
    background: "#1a1a22",
    border: "1px solid #262630",
    color: "#f3f4f6",
    padding: "9px 12px",
    borderRadius: 10,
    cursor: "pointer",
  };

  const btnPrimary = {
    background: "#e5e7eb",
    border: "1px solid #e5e7eb",
    color: "#0a0a0b",
    padding: "9px 12px",
    borderRadius: 10,
    cursor: "pointer",
    fontWeight: 600,
  };

  const pill = {
    background: "#0b0b10",
    border: "1px solid #262630",
    borderRadius: 12,
    padding: 10,
  };

  const input = {
    width: "100%",
    background: "#0b0b10",
    border: "1px solid #262630",
    color: "#f3f4f6",
    padding: "9px 10px",
    borderRadius: 10,
  };

  const select = {
    background: "#0b0b10",
    border: "1px solid #262630",
    color: "#ffffff",
    padding: "9px 10px",
    borderRadius: 10,
  };

  const tabBtn = (active) => ({
    ...btn,
    padding: "7px 10px",
    borderRadius: 10,
    background: active ? "#e5e7eb" : "#101018",
    color: active ? "#0a0a0b" : "#f3f4f6",
    border: active ? "1px solid #e5e7eb" : "1px solid #262630",
    fontWeight: 600,
  });

  const setMinMaxRain = (nextMin, nextMax) => {
    const minDropSize = clamp(nextMin, 0.5, 6);
    const maxDropSize = clamp(nextMax, 0.5, 8);
    const mn = Math.min(minDropSize, maxDropSize);
    const mx = Math.max(minDropSize, maxDropSize);
    const dropSize = (mn + mx) / 2;
    const dropSizeJitter = Math.max(0.01, (mx - mn) / 2);
    setRain((s) => ({ ...s, minDropSize: mn, maxDropSize: mx, dropSize, dropSizeJitter }));
  };

  const setMinMaxSnow = (nextMin, nextMax) => {
    const minFlakeSize = clamp(nextMin, 0.6, 10);
    const maxFlakeSize = clamp(nextMax, 0.6, 14);
    const mn = Math.min(minFlakeSize, maxFlakeSize);
    const mx = Math.max(minFlakeSize, maxFlakeSize);
    const flakeSize = (mn + mx) / 2;
    const flakeSizeJitter = Math.max(0.01, (mx - mn) / 2);
    setSnow((s) => ({ ...s, minFlakeSize: mn, maxFlakeSize: mx, flakeSize, flakeSizeJitter }));
  };

  return (
    <div style={page}>
      <div style={container}>
        <div style={top}>
          <div>
            <div style={{ fontSize: 26, fontWeight: 650, letterSpacing: 0.2 }}>Procedural Weather Tuner</div>
            <div style={{ marginTop: 6, color: "#a1a1aa", fontSize: 13 }}>
              Tweak Rain / Snow Live, Then Export Settings + a Preview Video
            </div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button style={btn} onClick={() => downloadText(`${tab}_settings.json`, paramsJson)}>
              Download Settings
            </button>
            <button style={btnPrimary} onClick={() => downloadText(`${tab}_generate.sh`, `${pythonCmd}
`)}>
              Download Generate Command
            </button>
          </div>
        </div>

        <div style={grid}>
          <div style={card}>
            <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button style={tabBtn(tab === "rain")} onClick={() => setTab("rain")}>
                    Rain
                  </button>
                  <button style={tabBtn(tab === "snow")} onClick={() => setTab("snow")}>
                    Snow
                  </button>
                </div>

                <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "center", color: "#d4d4d8", fontSize: 13 }}>
                    <input type="checkbox" checked={showChecker} onChange={(e) => setShowChecker(e.target.checked)} />
                    Checker
                  </label>

                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#a1a1aa", fontSize: 12 }}>Scale</span>
                    <input
                      type="range"
                      min={0.25}
                      max={1}
                      step={0.01}
                      value={previewScale}
                      onChange={(e) => setPreviewScale(parseFloat(e.target.value))}
                      style={{ width: 160 }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid #262630", background: "#000" }}>
                <div style={{ padding: 10 }}>
                  <div
                    style={{
                      width: "100%",
                      aspectRatio: `${size.w} / ${size.h}`,
                      maxHeight: "62vh",
                      margin: "0 auto",
                      position: "relative",
                      ...checkerStyle,
                    }}
                  >
                    <canvas
                      ref={canvasRef}
                      style={{ position: "absolute", inset: 0, width: "100%", height: "100%", display: "block" }}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                <button style={btn} onClick={() => resetSimulation(tab)}>
                  Reset Simulation
                </button>
                <button style={btnPrimary} onClick={exportWebm}>
                  Export Preview WebM
                </button>

                <div style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ color: "#a1a1aa", fontSize: 12 }}>Export Background</span>
                  <select style={select} value={exportBg} onChange={(e) => setExportBg(e.target.value)}>
                    <option value="transparent">Transparent</option>
                    <option value="black">Black</option>
                    <option value="checker">Checker</option>
                  </select>
                </div>
              </div>

              <div style={{ color: "#a1a1aa", fontSize: 12, lineHeight: 1.45 }}>
                Exported motion loops exactly (mathematically seamless) at the chosen duration. Preview export is browser-encoded;
                alpha support depends on your browser / codec. The downloaded generate command recreates the same look via your Python generator
                for reliable alpha.
              </div>

              <div style={{ marginTop: 6, color: "#d4d4d8", fontSize: 14, lineHeight: 1.55 }}>
                <div style={{ fontWeight: 650, color: "#e5e7eb" }}>How This Works</div>
                <p style={{ margin: "8px 0" }}>
                  This tool generates procedural rain or snow using deterministic math instead of random respawns. Every particle follows a looping motion path,
                  which guarantees that the animation ends exactly where it begins. That means you can loop the exported video forever with no visible seam.
                </p>
                <p style={{ margin: "8px 0" }}>
                  Controls on the right affect the simulation in real time. Density controls how many particles exist, size controls variation, and speed / wind parameters
                  define how particles move through space. The preview you see is the exact motion that will be exported.
                </p>

                <div style={{ fontWeight: 650, color: "#e5e7eb", marginTop: 10 }}>How To Export</div>
                <ol style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                  <li>Tweak the sliders until the rain or snow looks right.</li>
                  <li>Set your desired resolution, FPS, and loop duration.</li>
                  <li>
                    Click <b>Export Preview WebM</b> to download a short looping video.
                  </li>
                  <li>Enable looping in your video player or streaming software.</li>
                </ol>

                <div style={{ fontWeight: 650, color: "#e5e7eb", marginTop: 10 }}>Using This In OBS Or Livestreams</div>
                <p style={{ margin: "8px 0" }}>
                  Add the exported WebM as a Media Source in OBS. Enable looping and place it above your background or scene. If you need perfect transparency and maximum quality,
                  use the downloaded Python generate command to render the final version with FFmpeg.
                </p>

                <div style={{ fontWeight: 650, color: "#e5e7eb", marginTop: 10 }}>Other Uses</div>
                <p style={{ margin: "8px 0" }}>
                  These loops can be used in video editing, game overlays, website backgrounds, or ambient visuals for music streams. Because the motion is seamless,
                  short clips stay lightweight and performant no matter how long they repeat.
                </p>
              </div>
            </div>
          </div>

          <div style={{ ...card, height: "100%", overflowY: "auto" }}>
            <div style={{ ...pad, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }}>Size</div>
                  <input style={input} value={sizeStr} onChange={(e) => setSizeStr(e.target.value)} placeholder="1920x1080" />
                </div>
                <div>
                  <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }}>FPS</div>
                  <input style={input} type="number" value={fps} onChange={(e) => setFps(parseInt(e.target.value || "30", 10))} />
                </div>
                <div>
                  <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }}>Duration</div>
                  <input style={input} type="number" value={duration} onChange={(e) => setDuration(parseFloat(e.target.value || "8"))} />
                </div>
                <div>
                  <div style={{ color: "#a1a1aa", fontSize: 12, marginBottom: 6 }}>Seed</div>
                  <input style={input} type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value || "0", 10))} />
                </div>
              </div>

              <div style={pill}>
                <div style={{ color: "#71717a", fontSize: 12, marginBottom: 6 }}>Estimated Particle Count</div>
                <div style={{ fontSize: 18, fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{densityCount}</div>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {tab === "rain" ? (
                  <>
                    <LabeledSlider label="Density" help="How many raindrops exist at 1080p (auto-scales with resolution). Higher = heavier rain." value={rain.density1080} setValue={(v) => setRain((s) => ({ ...s, density1080: v }))} min={50} max={4000} step={10} />
                    <LabeledSlider label="Angle" help="Wind direction in degrees. 0 is straight down. Positive angles push rain to the right." value={rain.angleDeg} setValue={(v) => setRain((s) => ({ ...s, angleDeg: v }))} min={-45} max={45} step={1} />
                    <LabeledSlider label="Weight" help="Base fall speed (px/sec). Higher = heavier, faster rain streaks." value={rain.speed} setValue={(v) => setRain((s) => ({ ...s, speed: v }))} min={200} max={3200} step={10} />
                    <LabeledSlider label="Speed Jitter" help="Random variation in per-drop speed. Higher looks more natural/chaotic." value={rain.speedJitter} setValue={(v) => setRain((s) => ({ ...s, speedJitter: v }))} min={0} max={800} step={5} />
                    <LabeledSlider label="Streak Length" help="How long each rain streak is (px). Longer reads as heavier rain or longer exposure." value={rain.streakLen} setValue={(v) => setRain((s) => ({ ...s, streakLen: v }))} min={4} max={120} step={1} />
                    <LabeledSlider label="Thickness" help="Multiplier for streak thickness. Bigger = chunkier drops." value={rain.thickness} setValue={(v) => setRain((s) => ({ ...s, thickness: v }))} min={0.3} max={3} step={0.05} digits={2} />
                    <LabeledSlider label="Min Drop Size" help="Smallest droplet size allowed (px). Lower values add fine mist / light rain texture." value={rain.minDropSize} setValue={(v) => setMinMaxRain(v, rain.maxDropSize)} min={0.5} max={6} step={0.05} digits={2} />
                    <LabeledSlider label="Max Drop Size" help="Largest droplet size allowed (px). Higher values add thicker streaks for heavy rain." value={rain.maxDropSize} setValue={(v) => setMinMaxRain(rain.minDropSize, v)} min={0.5} max={8} step={0.05} digits={2} />
                    <LabeledSlider label="Opacity" help="Overall visibility of rain." value={rain.opacity} setValue={(v) => setRain((s) => ({ ...s, opacity: v }))} min={0.05} max={1} step={0.01} digits={2} />
                    <LabeledSlider label="Opacity Jitter" help="Random variation in drop opacity. Helps avoid uniform-looking rain." value={rain.opacityJitter} setValue={(v) => setRain((s) => ({ ...s, opacityJitter: v }))} min={0} max={0.6} step={0.01} digits={2} />
                    <LabeledSlider label="Blur" help="Post blur applied once per frame. Use small values for softness without smearing." value={rain.blur} setValue={(v) => setRain((s) => ({ ...s, blur: v }))} min={0} max={6} step={0.1} digits={1} />
                  </>
                ) : (
                  <>
                    <LabeledSlider label="Density" help="How many flakes exist at 1080p (auto-scales with resolution). Higher = heavier snowfall." value={snow.density1080} setValue={(v) => setSnow((s) => ({ ...s, density1080: v }))} min={50} max={2500} step={10} />
                    <LabeledSlider label="Fall Speed" help="Base gravity speed (px/sec). Higher = heavier, faster snow." value={snow.fall} setValue={(v) => setSnow((s) => ({ ...s, fall: v }))} min={20} max={900} step={5} />
                    <LabeledSlider label="Wind" help="Constant sideways wind (px/sec). Positive pushes flakes to the right, negative to the left." value={snow.wind} setValue={(v) => setSnow((s) => ({ ...s, wind: v }))} min={-400} max={400} step={5} />
                    <LabeledSlider label="Drift" help="Random sideways drift (px/sec) added around wind." value={snow.drift} setValue={(v) => setSnow((s) => ({ ...s, drift: v }))} min={0} max={350} step={5} />
                    <LabeledSlider label="Wobble" help="Side-to-side swaying. Higher = floatier flakes." value={snow.wobble} setValue={(v) => setSnow((s) => ({ ...s, wobble: v }))} min={0} max={320} step={5} />
                    <LabeledSlider label="Turbulence" help="How many wobble cycles happen per loop. Integer-ish values keep the loop perfect." value={snow.turbulence} setValue={(v) => setSnow((s) => ({ ...s, turbulence: v }))} min={1} max={30} step={1} digits={0} />
                    <LabeledSlider label="Min Flake Size" help="Smallest snowflake radius allowed (px). Lower values add fine, distant flakes." value={snow.minFlakeSize} setValue={(v) => setMinMaxSnow(v, snow.maxFlakeSize)} min={0.6} max={10} step={0.05} digits={2} />
                    <LabeledSlider label="Max Flake Size" help="Largest snowflake radius allowed (px). Higher values add big, close flakes." value={snow.maxFlakeSize} setValue={(v) => setMinMaxSnow(snow.minFlakeSize, v)} min={0.6} max={14} step={0.05} digits={2} />
                    <LabeledSlider label="Glow" help="Soft halo radius multiplier around each flake. 0 disables glow." value={snow.glow} setValue={(v) => setSnow((s) => ({ ...s, glow: v }))} min={0} max={6} step={0.05} digits={2} />
                    <LabeledSlider label="Opacity" help="Overall visibility of snow." value={snow.opacity} setValue={(v) => setSnow((s) => ({ ...s, opacity: v }))} min={0.05} max={1} step={0.01} digits={2} />
                    <LabeledSlider label="Opacity Jitter" help="Random variation in flake opacity. Helps avoid uniform-looking snow." value={snow.opacityJitter} setValue={(v) => setSnow((s) => ({ ...s, opacityJitter: v }))} min={0} max={0.6} step={0.01} digits={2} />
                    <LabeledSlider label="Blur" help="Post blur applied once per frame. Use small values for softness." value={snow.blur} setValue={(v) => setSnow((s) => ({ ...s, blur: v }))} min={0} max={6} step={0.1} digits={1} />
                  </>
                )}
              </div>

              <div style={pill}>
                <div style={{ color: "#71717a", fontSize: 12, marginBottom: 6 }}>Generate Command (Python)</div>
                <pre style={{ margin: 0, color: "#e5e7eb", fontSize: 12, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{pythonCmd}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
