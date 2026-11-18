// Sound, synthesized live with WebAudio: no audio files, no network.
// The context starts on the first user gesture; every call is safe before that.

export function createAudio() {
  let ctx = null;
  let master = null;
  let musicGain = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenTimer = 0;
  let musicTimer = null;
  let musicStep = 0;
  let muted = false;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
      musicGain = ctx.createGain();
      musicGain.gain.value = 0.16;
      musicGain.connect(master);
      // Engine: a low sawtooth through a lowpass, pitch follows speed.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineFilter = ctx.createBiquadFilter();
      engineFilter.type = 'lowpass';
      engineFilter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(engineFilter);
      engineFilter.connect(engineGain);
      engineGain.connect(master);
      engineOsc.start();
      // Siren: a triangle wave that swings between two notes.
      sirenOsc = ctx.createOscillator();
      sirenOsc.type = 'triangle';
      sirenOsc.frequency.value = 720;
      sirenGain = ctx.createGain();
      sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain);
      sirenGain.connect(master);
      sirenOsc.start();
      return true;
    } catch {
      return false;
    }
  }

  function blip(freq, dur, type, vol, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, vol, filterFreq) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    src.start(t);
  }

  // A lazy bass-and-keys loop in A minor, scheduled a bar at a time.
  const BASS = [110, 110, 130.81, 98];
  const KEYS = [440, 523.25, 659.25, 523.25, 587.33, 659.25, 783.99, 659.25];
  function scheduleBar() {
    if (!ctx || muted) return;
    const stepDur = 0.24;
    const bass = BASS[Math.floor(musicStep / 8) % BASS.length];
    const note = KEYS[musicStep % KEYS.length];
    const t = ctx.currentTime;
    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = bass;
    const g1 = ctx.createGain();
    g1.gain.setValueAtTime(0.5, t);
    g1.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.8);
    o1.connect(g1);
    g1.connect(musicGain);
    o1.start(t);
    o1.stop(t + stepDur * 2);
    if (musicStep % 2 === 0) {
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = note;
      const g2 = ctx.createGain();
      g2.gain.setValueAtTime(0.22, t);
      g2.gain.exponentialRampToValueAtTime(0.001, t + stepDur * 1.4);
      o2.connect(g2);
      g2.connect(musicGain);
      o2.start(t);
      o2.stop(t + stepDur * 1.5);
    }
    musicStep += 1;
  }

  return {
    /** Call on any gesture; safe to call often. */
    unlock() {
      ensure();
    },
    setMuted(value) {
      muted = value;
      if (master) master.gain.value = value ? 0 : 0.5;
    },
    get muted() {
      return muted;
    },
    startMusic() {
      if (!ensure() || musicTimer) return;
      musicTimer = window.setInterval(scheduleBar, 240);
    },
    stopMusic() {
      if (musicTimer) {
        window.clearInterval(musicTimer);
        musicTimer = null;
      }
    },
    click() {
      blip(660, 0.08, 'sine', 0.25);
    },
    pickup() {
      blip(880, 0.09, 'sine', 0.3);
      blip(1320, 0.14, 'sine', 0.25, 0.07);
    },
    gunshot() {
      noise(0.12, 0.5, 2400);
      blip(120, 0.1, 'square', 0.3);
    },
    crash() {
      noise(0.25, 0.45, 900);
    },
    horn() {
      blip(392, 0.18, 'square', 0.18);
      blip(311, 0.18, 'square', 0.18);
    },
    doorSlam() {
      noise(0.08, 0.3, 500);
    },
    missionStart() {
      blip(523.25, 0.12, 'triangle', 0.3);
      blip(659.25, 0.12, 'triangle', 0.3, 0.1);
      blip(783.99, 0.2, 'triangle', 0.3, 0.2);
    },
    missionComplete() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => blip(f, 0.22, 'triangle', 0.3, i * 0.11));
    },
    missionFailed() {
      [392, 329.63, 261.63].forEach((f, i) => blip(f, 0.25, 'triangle', 0.28, i * 0.14));
    },
    busted() {
      [660, 550, 440].forEach((f, i) => blip(f, 0.3, 'sawtooth', 0.2, i * 0.2));
    },
    /** Continuous engine hum; speed01 is 0..1, active false silences it. */
    engine(speed01, active) {
      if (!ctx || !engineGain) return;
      const target = active ? 0.05 + speed01 * 0.09 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.08);
      engineOsc.frequency.setTargetAtTime(50 + speed01 * 140, ctx.currentTime, 0.05);
    },
    /** Siren wail; closeness 0..1 sets the volume. Call every frame. */
    siren(dt, closeness) {
      if (!ctx || !sirenGain) return;
      sirenTimer += dt;
      const twoTone = Math.sin(sirenTimer * Math.PI * 2 * 0.9) > 0 ? 720 : 960;
      sirenOsc.frequency.setTargetAtTime(twoTone, ctx.currentTime, 0.03);
      sirenGain.gain.setTargetAtTime(closeness * 0.08, ctx.currentTime, 0.1);
    },
  };
}
