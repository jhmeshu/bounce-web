// OTT ringtone parser (port of sound.c) + WebAudio sine player
const TONE_FREQS = [0, 261.625, 277.175, 293.675, 311.125, 329.625, 349.225, 370, 392, 415.3, 440, 466.15, 493.883];
const TEMPO_CODE = [25,28,31,35,40,45,50,56,63,70,80,90,100,112,125,140,160,180,200,225,250,285,320,355,400,450,500,565,635,715,800,900];
interface Note { tone: number; length: number; scale: number; bpm: number; }
function getBits(buf: Uint8Array, st: { ptr: number; bit: number }, bits: number): number {
  if (st.ptr >= buf.length - 1) return 0;
  const holding = (buf[st.ptr] << 8) + buf[st.ptr + 1];
  const v = (holding >> (16 - (bits + st.bit))) & ((1 << bits) - 1);
  st.bit += bits;
  if (st.bit > 7) { st.bit -= 8; st.ptr++; }
  return v;
}
function parseOtt(buf: Uint8Array): Note[] {
  const st = { ptr: 0, bit: 0 };
  const notes: Note[] = [];
  let scale = 0, bpm = 120;
  getBits(buf, st, 8); getBits(buf, st, 8);
  getBits(buf, st, 7);
  const k0 = getBits(buf, st, 3);
  if (k0 !== 1 && k0 !== 2) return notes;
  const nameLen = getBits(buf, st, 4);
  for (let i = 0; i < nameLen; i++) getBits(buf, st, 8);
  let patterns = getBits(buf, st, 8);
  while (st.ptr < buf.length && patterns > 0) {
    getBits(buf, st, 3); getBits(buf, st, 2);
    getBits(buf, st, 4);
    let count = getBits(buf, st, 8);
    if (count > 100) count = 100;
    for (let x = 0; x < count; x++) {
      if (st.ptr >= buf.length) break;
      const k = getBits(buf, st, 3);
      if (k === 0) { getBits(buf, st, 2); }
      else if (k === 1) {
        const tone = getBits(buf, st, 4);
        const length = getBits(buf, st, 3);
        getBits(buf, st, 2);
        notes.push({ tone, length, scale, bpm });
      }
      else if (k === 2) { scale = getBits(buf, st, 2); if (scale > 0) scale--; }
      else if (k === 3) { getBits(buf, st, 2); }
      else if (k === 4) { const t = getBits(buf, st, 5); bpm = TEMPO_CODE[t] ?? 120; }
      else if (k === 5) { getBits(buf, st, 4); }
    }
    if (st.ptr >= buf.length) break;
    patterns--;
  }
  return notes;
}
function toneFreq(tone: number, scale: number): number {
  if (tone <= 0 || tone > 12) return 0;
  return TONE_FREQS[tone] * (1 << scale);
}
function toneDur(length: number, bpm: number): number {
  if (bpm <= 0) bpm = 120;
  if (length < 0 || length > 7) length = 2;
  return (60 / bpm) * (4 / (1 << length));
}

class OttVoice {
  notes: Note[] = [];
  constructor(public name: string) {}
  async load() {
    try {
      const r = await fetch(`./sounds/${this.name}`);
      if (!r.ok) return;
      const b = new Uint8Array(await r.arrayBuffer());
      this.notes = parseOtt(b);
    } catch { /* silent */ }
  }
}

let ctx: AudioContext | null = null;
function ac(): AudioContext | null {
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  } catch { return null; }
}
function playNotes(notes: Note[]) {
  const c = ac(); if (!c || notes.length === 0) return;
  if (c.state !== 'running') return;
  let t = c.currentTime + 0.01;
  for (const n of notes) {
    const f = toneFreq(n.tone, n.scale);
    const d = Math.min(1.2, Math.max(0.05, toneDur(n.length, n.bpm)));
    if (f > 0) {
      const o = c.createOscillator(); const g = c.createGain();
      o.type = 'sine'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
      g.gain.setValueAtTime(0.5, t + Math.max(0.012, d - 0.03));
      g.gain.exponentialRampToValueAtTime(0.0001, t + d);
      o.connect(g).connect(c.destination);
      o.start(t); o.stop(t + d + 0.02);
    }
    t += d;
  }
}

export const audio = {
  hoop: new OttVoice('up.ott'),
  pickup: new OttVoice('pickup.ott'),
  pop: new OttVoice('pop.ott'),
  async init() { await Promise.all([this.hoop.load(), this.pickup.load(), this.pop.load()]); },
  unlock() { if (ctx && ctx.state === 'running') return; ac(); },
  playHoop() { playNotes(this.hoop.notes.length ? this.hoop.notes : [{ tone: 8, length: 3, scale: 1, bpm: 300 }]); },
  playPickup() { playNotes(this.pickup.notes.length ? this.pickup.notes : [{ tone: 5, length: 3, scale: 1, bpm: 300 }]); },
  playPop() { playNotes(this.pop.notes.length ? this.pop.notes : [{ tone: 3, length: 2, scale: 0, bpm: 140 }]); },
};
