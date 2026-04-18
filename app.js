
(() => {
  const $ = (id) => document.getElementById(id);

  const video = $("bg") || $("bgVideo") || document.querySelector("video");
  const music = $("bgm") || document.querySelector("audio");
  const canvas = $("uiCanvas");
  const ctx = canvas ? canvas.getContext("2d") : null;
  const cardsLayer = $("cardsLayer");
  const introFade = $("introFade");

  const cfg = Object.assign({
    fixedProgress: 80,
    introMs: 700,
    startDelayMs: 120,
    progressLerp: 0.18
  }, window.INSTALL_BAR_CONFIG || {});

  const data = window.INSTALL_BAR_DATA;
  if (!canvas || !ctx || !data) {
    console.error("Missing uiCanvas or INSTALL_BAR_DATA");
    return;
  }

  const atlas = new Image();
  atlas.src = data.atlas;

  const cards = [
    { el: $("cardAkiyama"), start: 0.0, end: 13.0 },
    { el: $("cardSaejima"), start: 15.5, end: 29.0 },
    { el: $("cardTanimura"), start: 31.0, end: 44.0 },
    { el: $("cardKiryu"), start: 45.0, end: 58.0 },
  ].filter(x => x.el);

  const FADE_IN = 1.35;
  const FADE_OUT = 1.65;

  let startedAt = 0;
  let introFinished = false;
  let currentProgress = 0;
  let targetProgress = Number(cfg.fixedProgress) || 83;
  let atlasReady = false;
  let musicStarted = false;

  function clamp(v, min, max) { return Math.min(max, Math.max(min, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
  function easeInOutSine(t) { return -(Math.cos(Math.PI * t) - 1) / 2; }

  function resizeCanvas() {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const w = window.innerWidth;
    const h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + "px";
    canvas.style.height = h + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;
  }

  function getCoverTransform() {
    const baseW = data.baseWidth;
    const baseH = data.baseHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const scale = Math.max(vw / baseW, vh / baseH);
    const ox = (vw - baseW * scale) * 0.5;
    const oy = (vh - baseH * scale) * 0.5;
    return { scale, ox, oy };
  }

  function drawCell(cellIndex, x, y, opts = {}) {
    const cell = data.cells[cellIndex];
    if (!cell || !atlasReady) return;
    const alpha = opts.alpha ?? 1;
    const scaleX = opts.scaleX ?? 1;
    const scaleY = opts.scaleY ?? 1;
    const rotation = opts.rotation ?? 0;
    const pivotX = opts.pivotX ?? 0;
    const pivotY = opts.pivotY ?? 0;
    const width = opts.width ?? cell.w;
    const height = opts.height ?? cell.h;

    const { scale, ox, oy } = getCoverTransform();
    const dx = ox + x * scale;
    const dy = oy + y * scale;
    const dw = width * scale * scaleX;
    const dh = height * scale * scaleY;

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(dx, dy);
    if (rotation) ctx.rotate(rotation);
    ctx.drawImage(
      atlas,
      cell.x, cell.y, cell.w, cell.h,
      -pivotX * scale * scaleX,
      -pivotY * scale * scaleY,
      dw, dh
    );
    ctx.restore();
  }

  function drawState(state, alphaMul = 1) {
    drawCell(state.cell, state.x, state.y, {
      alpha: (state.alpha ?? 1) * alphaMul,
      scaleX: state.scaleX ?? 1,
      scaleY: state.scaleY ?? 1,
      rotation: state.rotation ?? 0,
      pivotX: state.pivotX ?? 0,
      pivotY: state.pivotY ?? 0,
      width: state.width,
      height: state.height
    });
  }

  function drawIntro(now) {
    const elapsed = now - startedAt - cfg.startDelayMs;
    const t = clamp(elapsed / cfg.introMs, 0, 1);
    const frameFloat = t * (data.introFrames.length - 1);
    const frameIndex = Math.round(frameFloat);
    const frame = data.introFrames[frameIndex] || data.introFrames[data.introFrames.length - 1];
    for (const state of frame) drawState(state);
    if (t >= 1) introFinished = true;
  }

  function drawFill(progress) {
    const p = clamp(progress, 0, 100) / 100;

    // outer frame
    drawState(data.fill.outerLeft);
    drawState(data.fill.outerMid);
    drawState(data.fill.outerRight);
    drawState(data.fill.label);

    const fillStart = data.fill.fillStartX;
    const fillEnd = data.fill.fillEndX;
    const fillY = data.fill.fillY;
    const innerWidth = Math.max(0, (fillEnd - fillStart) * p);

    // left cap
    if (innerWidth > 0.1) {
      drawCell(4, fillStart, fillY, {
        alpha: 1,
        scaleX: 1,
        scaleY: data.fill.fillScaleY ?? 1,
        pivotX: 0,
        pivotY: 4,
        width: 6,
        height: 8
      });
    }

    // stretch middle
    const midW = Math.max(0, innerWidth - 6);
    if (midW > 0.1) {
      drawCell(5, fillStart + 6, fillY, {
        alpha: 1,
        scaleX: midW / 16,
        scaleY: data.fill.fillScaleY ?? 1,
        pivotX: 0,
        pivotY: 4,
        width: 16,
        height: 8
      });
    }

    // right cap
    if (innerWidth > 4) {
      drawCell(3, fillStart + innerWidth, fillY, {
        alpha: 1,
        scaleX: 1,
        scaleY: data.fill.fillScaleY ?? 1,
        pivotX: 6,
        pivotY: 4,
        width: 6,
        height: 8
      });
    }

    // digits
    const shown = Math.round(progress).toString();
    const digits = shown.padStart(2, "0");
    const hundreds = Math.floor(progress) >= 100 ? "1" : "";
    const tens = digits[0];
    const ones = digits[1];

    const digitStates = data.fill.digits;
    if (hundreds) {
      drawCell(data.digitCells[hundreds], digitStates.hundreds.x, digitStates.hundreds.y, {
        alpha: 1, pivotX: digitStates.hundreds.pivotX, pivotY: digitStates.hundreds.pivotY, width: 20, height: 28
      });
    }
    drawCell(data.digitCells[tens], digitStates.tens.x, digitStates.tens.y, {
      alpha: 1, pivotX: digitStates.tens.pivotX, pivotY: digitStates.tens.pivotY, width: 20, height: 28
    });
    drawCell(data.digitCells[ones], digitStates.ones.x, digitStates.ones.y, {
      alpha: 1, pivotX: digitStates.ones.pivotX, pivotY: digitStates.ones.pivotY, width: 20, height: 28
    });
    drawCell(data.digitCells["%"], digitStates.percent.x, digitStates.percent.y, {
      alpha: 1, pivotX: digitStates.percent.pivotX, pivotY: digitStates.percent.pivotY, width: 20, height: 28
    });
  }

  function setCardVisual(el, opacity) {
    const o = clamp(opacity, 0, 1);
    const eased = easeInOutSine(o);
    const translateY = (1 - eased) * 12;
    const scale = 0.985 + eased * 0.015;
    const blur = (1 - eased) * 8;
    el.style.opacity = String(eased);
    el.style.visibility = eased > 0.001 ? "visible" : "hidden";
    el.style.transform = `translateY(${translateY}px) scale(${scale})`;
    el.style.filter = `blur(${blur}px)`;
  }

  function cardOpacity(time, start, end) {
    if (time < start || time > end) return 0;
    if (time <= start + FADE_IN) {
      return easeOutCubic(clamp((time - start) / FADE_IN, 0, 1));
    }
    if (time >= end - FADE_OUT) {
      return easeInOutSine(clamp((end - time) / FADE_OUT, 0, 1));
    }
    return 1;
  }

  function updateCards(time) {
    for (const card of cards) {
      setCardVisual(card.el, cardOpacity(time, card.start, card.end));
    }
  }

  function initCards() {
    for (const card of cards) {
      card.el.style.opacity = "0";
      card.el.style.visibility = "hidden";
      card.el.style.transform = "translateY(12px) scale(0.985)";
      card.el.style.filter = "blur(8px)";
    }
  }

  async function tryPlay(el) {
    if (!el || !el.play) return false;
    try { await el.play(); return true; } catch { return false; }
  }

  async function startMusic() {
    if (!music || musicStarted) return;
    music.loop = true;
    music.volume = 1;
    const ok = await tryPlay(music);
    if (ok) { musicStarted = true; return; }
    const unlock = async () => {
      if (musicStarted) return;
      const played = await tryPlay(music);
      if (played) musicStarted = true;
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true, passive: true });
  }

  function hideFade() {
    const fade = introFade;
    if (!fade) return;
    fade.style.transition = "opacity 520ms ease";
    fade.style.opacity = "0";
    setTimeout(() => { fade.style.display = "none"; }, 700);
  }

  function render(now) {
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    if (!introFinished) drawIntro(now);
    else {
      currentProgress = lerp(currentProgress, targetProgress, cfg.progressLerp);
      if (Math.abs(currentProgress - targetProgress) < 0.01) currentProgress = targetProgress;
      drawFill(currentProgress);
    }

    const t = video ? (video.currentTime || 0) : 0;
    updateCards(t);

    requestAnimationFrame(render);
  }

  async function start() {
    resizeCanvas();
    initCards();
    startedAt = performance.now();
    if (video) {
      video.muted = true;
      await tryPlay(video);
    }
    hideFade();
    startMusic();
    requestAnimationFrame(render);
  }

  atlas.onload = () => { atlasReady = true; };
  atlas.onerror = () => console.error("Could not load atlas", data.atlas);

  window.addEventListener("resize", resizeCanvas);

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
