/* Крошечный WebAudio-синтезатор "Вардлокур": тагельхарпа, бурдон, военный барабан,
   ветряной дрон и боевые блипы. Всё процедурно — без аудиофайлов. */

class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private windGain: GainNode | null = null;
  private echoIn: GainNode | null = null;
  private musicTimer: number | null = null;
  private hornTimer: number | null = null;
  private musicStep = 0;
  private nextNoteT = 0;
  private intensity = 0;
  muted = false;
  started = false;

  static SCALE = [0, 3, 5, 7, 10, 12, 15, 17].map((s) => 110 * Math.pow(2, s / 12));
  static DRONE_BARS = [55, 55, 65.4, 49];
  static PHRASE_A = [0, -1, 2, -1, 3, -1, 4, -1, 3, -1, 2, -1, 1, -1, 0, -1];
  static PHRASE_B = [4, -1, 5, 4, 3, -1, 2, -1, 3, 4, 5, -1, 7, -1, 5, 4];

  init() {
    if (this.ctx) { this.ctx.resume().catch(() => {}); return; }
    try {
      const AC = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      this.startAmbient();
      this.started = true;
    } catch { /* беззвучный режим */ }
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.master && this.ctx) {
      this.master.gain.setTargetAtTime(this.muted ? 0 : 0.5, this.ctx.currentTime, 0.05);
    }
    return this.muted;
  }

  private startAmbient() {
    if (!this.ctx || !this.master) return;
    const ctx = this.ctx;
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const wind = ctx.createBufferSource();
    wind.buffer = buf; wind.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass"; bp.frequency.value = 320; bp.Q.value = 0.6;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0.05;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
    const lfoG = ctx.createGain(); lfoG.gain.value = 120;
    lfo.connect(lfoG); lfoG.connect(bp.frequency);
    wind.connect(bp); bp.connect(this.windGain); this.windGain.connect(this.master);
    wind.start(); lfo.start();

    const droneGain = ctx.createGain(); droneGain.gain.value = 0.02;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 170;
    [55, 82.4, 110.3].forEach((f, i) => {
      const o = ctx.createOscillator();
      o.type = "sawtooth"; o.frequency.value = f; o.detune.value = i * 6 - 6;
      const g = ctx.createGain(); g.gain.value = i === 2 ? 0.3 : 1;
      o.connect(g); g.connect(lp); o.start();
    });
    lp.connect(droneGain); droneGain.connect(this.master);

    const horn = () => {
      this.tone(72 + Math.random() * 20, 2.4, "sawtooth", 0.04, -14, 0.5);
      this.hornTimer = window.setTimeout(horn, 24000 + Math.random() * 26000);
    };
    this.hornTimer = window.setTimeout(horn, 10000);
  }

  startMusic() {
    if (!this.ctx || this.musicTimer !== null) return;
    this.echoIn = this.ctx.createGain(); this.echoIn.gain.value = 1;
    const echo = this.ctx.createDelay(1); echo.delayTime.value = 0.31;
    const fb = this.ctx.createGain(); fb.gain.value = 0.34;
    const wet = this.ctx.createGain(); wet.gain.value = 0.2;
    this.echoIn.connect(echo); echo.connect(fb); fb.connect(echo); echo.connect(wet); wet.connect(this.master!);
    this.nextNoteT = this.ctx.currentTime + 0.2;
    this.musicTimer = window.setInterval(() => this.scheduleMusic(), 110);
  }

  setIntensity(v: number) { this.intensity = v; }
  setFog(on: boolean) {
    if (this.windGain && this.ctx) {
      this.windGain.gain.setTargetAtTime(on ? 0.16 : 0.05, this.ctx.currentTime, 1.2);
    }
  }

  private scheduleMusic() {
    if (!this.ctx) return;
    const stepDur = 60 / 66 / 2;
    while (this.nextNoteT < this.ctx.currentTime + 0.45) {
      this.playStep(this.musicStep, this.nextNoteT, stepDur);
      this.nextNoteT += stepDur;
      this.musicStep = (this.musicStep + 1) % 64;
    }
  }

  private playStep(step: number, t: number, stepDur: number) {
    const ctx = this.ctx!;
    const heavy = this.intensity > 0;
    if (step % 16 === 0) {
      const f = AudioEngine.DRONE_BARS[Math.floor(step / 16) % 4];
      const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f;
      const o2 = ctx.createOscillator(); o2.type = "sine"; o2.frequency.value = f / 2;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = heavy ? 320 : 210;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.045, t + 0.4);
      g.gain.setValueAtTime(0.045, t + stepDur * 14);
      g.gain.linearRampToValueAtTime(0.0001, t + stepDur * 16);
      o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(this.master!);
      o.start(t); o2.start(t); o.stop(t + stepDur * 16.2); o2.stop(t + stepDur * 16.2);
    }
    const drumSteps = heavy ? [0, 4, 8, 12] : [0, 8];
    if (drumSteps.includes(step % 16)) {
      const o = ctx.createOscillator(); o.type = "sine";
      o.frequency.setValueAtTime(92, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 0.22);
      const g = ctx.createGain();
      g.gain.setValueAtTime(heavy ? 0.15 : 0.1, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g); g.connect(this.master!);
      o.start(t); o.stop(t + 0.32);
    }
    if (heavy && step % 2 === 1) this.noiseAt(t, 0.05, 0.02, 5200, "highpass");
    const inB = step >= 32;
    const phrase = inB ? AudioEngine.PHRASE_B : AudioEngine.PHRASE_A;
    const idx = phrase[step % 16];
    if (idx >= 0) {
      if (heavy && Math.random() < 0.45) return;
      const f = AudioEngine.SCALE[idx] * 2;
      this.bowedNote(f, t, stepDur * 2.6);
      if (Math.random() < 0.22) this.bowedNote(f / 2, t + stepDur, stepDur * 2);
    }
  }

  private bowedNote(f: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator(); o.type = "sawtooth"; o.frequency.value = f; o.detune.value = -5;
    const o2 = ctx.createOscillator(); o2.type = "sawtooth"; o2.frequency.value = f; o2.detune.value = 6;
    const vib = ctx.createOscillator(); vib.frequency.value = 5.2;
    const vibG = ctx.createGain(); vibG.gain.value = 3.5;
    vib.connect(vibG); vibG.connect(o.frequency); vibG.connect(o2.frequency);
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 1050; lp.Q.value = 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.04, t + Math.min(0.09, dur * 0.2));
    g.gain.setValueAtTime(0.036, t + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g);
    g.connect(this.master!);
    if (this.echoIn) g.connect(this.echoIn);
    o.start(t); o2.start(t); vib.start(t);
    o.stop(t + dur + 0.1); o2.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
  }

  private noiseAt(t: number, dur: number, vol: number, freq: number, type: BiquadFilterType) {
    if (!this.ctx || !this.master) return;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource(); src.buffer = buf;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0, attack = 0.005) {
    if (!this.ctx || !this.master) return;
    const t0 = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.master);
    o.start(t0); o.stop(t0 + dur + 0.05);
  }

  private noise(dur: number, vol: number, freq: number, type: BiquadFilterType = "bandpass", q = 1) {
    if (!this.ctx || !this.master) return;
    this.noiseAt(this.ctx.currentTime, dur, vol, freq, type);
  }

  private arp(freqs: number[], step: number, dur: number, type: OscillatorType, vol: number) {
    freqs.forEach((f, i) => window.setTimeout(() => this.tone(f, dur, type, vol), i * step * 1000));
  }

  swing() { this.noise(0.12, 0.22, 1900, "bandpass", 0.8); }
  hit() { this.tone(210, 0.09, "square", 0.26, -90); this.noise(0.05, 0.14, 900); }
  kill() { this.tone(150, 0.16, "square", 0.3, -100); this.noise(0.14, 0.2, 500, "lowpass"); }
  clang() { this.tone(1250, 0.14, "triangle", 0.2, -700); this.noise(0.08, 0.12, 2600, "highpass"); }
  hurt() { this.tone(170, 0.22, "sawtooth", 0.32, -70); this.noise(0.12, 0.16, 300, "lowpass"); }
  pickup() { this.arp([523, 659, 784], 0.06, 0.12, "square", 0.14); }
  rune() { this.arp([392, 494, 587, 784], 0.09, 0.5, "triangle", 0.2); this.tone(1568, 0.7, "sine", 0.06); }
  chest() { this.arp([330, 392, 523], 0.07, 0.16, "square", 0.16); }
  chime() { this.arp([880, 1174], 0.08, 0.4, "sine", 0.14); }
  horn() { this.tone(98, 1.4, "sawtooth", 0.22, -18, 0.08); this.tone(147, 1.2, "sawtooth", 0.14, -22, 0.1); }
  freeze() { this.tone(1500, 0.3, "sine", 0.18, -1000); this.noise(0.2, 0.1, 4200, "highpass"); }
  arrow() { this.noise(0.09, 0.18, 3200, "highpass", 0.7); }
  throwAxe() { this.noise(0.16, 0.2, 1400, "bandpass", 0.6); this.tone(300, 0.16, "triangle", 0.1, 200); }
  splash() { this.tone(140, 0.2, "sine", 0.16, -60); this.noise(0.15, 0.1, 800, "lowpass"); }
  door() { this.tone(88, 0.5, "square", 0.22, 40, 0.03); this.noise(0.3, 0.1, 240, "lowpass"); }
  locked() { this.tone(180, 0.1, "square", 0.2, -40); this.tone(140, 0.14, "square", 0.2, -30); }
  heal() { this.arp([523, 659, 880], 0.07, 0.3, "sine", 0.16); }
  quest() { this.arp([392, 523, 659], 0.1, 0.3, "triangle", 0.18); }
  death() { this.arp([220, 174, 146, 110, 82], 0.16, 0.5, "sawtooth", 0.2); }
  bossDie() {
    this.tone(70, 2.2, "sawtooth", 0.3, -30, 0.05);
    this.noise(1.6, 0.28, 500, "lowpass");
    this.arp([196, 261, 329, 392, 523], 0.14, 0.7, "triangle", 0.18);
  }
  victory() { this.arp([262, 330, 392, 523, 659, 784], 0.14, 0.7, "triangle", 0.2); }
  uiClick() { this.tone(660, 0.05, "square", 0.12); }
  step() { this.noise(0.03, 0.045, 700, "lowpass"); }
}

export const audio = new AudioEngine();
