import { Injectable, PLATFORM_ID, inject, signal } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { SqliteLocalService } from './sqlite-local.service';

@Injectable({
  providedIn: 'root'
})
export class AudioService {
  private readonly platformId = inject(PLATFORM_ID);
  private readonly sqlite = inject(SqliteLocalService);
  private ctx: AudioContext | null = null;
  private muted = false;
  public readonly volume = signal<number>(0.5);
  private bgmInterval: any = null;
  private bgmTick = 0;
  private bgmPlaying = false;

  constructor() {
    this.loadSettings();
  }

  private async loadSettings(): Promise<void> {
    try {
      const muteRows = await this.sqlite.query(`SELECT value FROM user_config WHERE key = 'audio_mute';`);
      if (muteRows && muteRows.length > 0) {
        this.muted = muteRows[0].value === 'true';
      }

      const volRows = await this.sqlite.query(`SELECT value FROM user_config WHERE key = 'audio_volume';`);
      if (volRows && volRows.length > 0) {
        const val = parseFloat(volRows[0].value);
        if (!isNaN(val)) {
          this.volume.set(val);
        }
      }
    } catch (sqle) {
      console.error('Error cargando configuración de audio desde SQLite:', sqle);
    }
  }

  public setVolume(v: number): void {
    this.volume.set(v);
    this.sqlite.query(`INSERT OR REPLACE INTO user_config (key, value) VALUES ('audio_volume', ?);`, [v.toString()])
      .catch(sqle => console.error('Error al guardar volumen en SQLite:', sqle));
  }

  private initContext(): boolean {
    if (!isPlatformBrowser(this.platformId)) {
      return false;
    }
    
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    return !!this.ctx;
  }

  public toggleMute(): boolean {
    this.muted = !this.muted;
    this.sqlite.query(`INSERT OR REPLACE INTO user_config (key, value) VALUES ('audio_mute', ?);`, [this.muted ? 'true' : 'false'])
      .catch(sqle => console.error('Error al guardar mute en SQLite:', sqle));

    if (this.muted) {
      if (this.bgmInterval) {
        clearInterval(this.bgmInterval);
        this.bgmInterval = null;
      }
    } else {
      if (this.bgmPlaying && !this.bgmInterval) {
        this.bgmTick = 0;
        this.bgmInterval = setInterval(() => {
          this.tickBgm();
        }, 200);
      }
    }
    return this.muted;
  }

  public startBgm(): void {
    if (!isPlatformBrowser(this.platformId)) return;
    if (this.bgmPlaying) return;
    this.bgmPlaying = true;
    this.bgmTick = 0;

    if (this.muted) return;

    this.bgmInterval = setInterval(() => {
      this.tickBgm();
    }, 200);
  }

  public stopBgm(): void {
    this.bgmPlaying = false;
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  }

  private tickBgm(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const tick = this.bgmTick;
    this.bgmTick = (this.bgmTick + 1) % 32;

    // Rhythmic bassline (low volume triangle wave)
    if (tick % 2 === 0) {
      const bassStep = Math.floor(tick / 2) % 8;
      // C2, C2, Eb2, Eb2, F2, F2, G2, Bb1
      const bassNotes = [65.41, 65.41, 77.78, 77.78, 87.31, 87.31, 98.00, 58.27];
      const freq = bassNotes[bassStep];
      this.playTone(freq, 'triangle', 0.18, 0.02, 0.001);
    }

    // Melodic arpeggio (sine wave for soft chiptune vibe)
    if (tick % 4 === 0) {
      const melodyStep = Math.floor(tick / 4) % 8;
      // C4, Eb4, G4, C5, Bb4, G4, Eb4, D4
      const melodyNotes = [261.63, 311.13, 392.00, 523.25, 466.16, 392.00, 311.13, 293.66];
      const freq = melodyNotes[melodyStep];
      this.playTone(freq, 'sine', 0.35, 0.012, 0.001);
    }

    // Soft hi-hat tick (short decaying noise oscillator)
    if (tick % 4 === 2) {
      this.playNoiseTick(0.015, 0.005);
    }
  }

  private playNoiseTick(duration: number, volume: number): void {
    if (this.muted || !this.initContext() || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(10000, now);
    osc.frequency.exponentialRampToValueAtTime(1000, now + duration);
    gainNode.gain.setValueAtTime(volume * this.volume(), now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.0001 * this.volume()), now + duration);
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  public isMuted(): boolean {
    return this.muted;
  }

  private playTone(
    frequency: number,
    type: OscillatorType,
    duration: number,
    gainStart: number,
    gainEnd: number,
    freqEnd?: number
  ): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(frequency, this.ctx.currentTime);

    if (freqEnd !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(freqEnd, this.ctx.currentTime + duration);
    }

    gainNode.gain.setValueAtTime(gainStart * this.volume(), this.ctx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, gainEnd * this.volume()), this.ctx.currentTime + duration);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + duration);
  }

  public playClick(): void {
    this.playTone(800, 'square', 0.05, 0.05, 0.001, 100);
  }

  public playDrawCard(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(1200, now + 0.12);

    gainNode.gain.setValueAtTime(0.1 * this.volume(), now);
    gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, 0.01 * this.volume()), now + 0.12);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.12);
  }

  public playDamage(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    
    // Sawtooth hit
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(250, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.22);
    gainNode.gain.setValueAtTime(0.15 * this.volume(), now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), now + 0.22);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    osc.start();
    osc.stop(now + 0.22);

    // High crunch sound using short square decay
    setTimeout(() => {
      this.playTone(180, 'triangle', 0.1, 0.1, 0.001, 40);
    }, 30);
  }

  public playHeal(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 arpeggio

    notes.forEach((freq, index) => {
      const time = now + index * 0.05;
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, time);

      gainNode.gain.setValueAtTime(0.08 * this.volume(), time);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), time + 0.15);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + 0.15);
    });
  }

  public playEnergyAttach(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(900, now + 0.2);

    gainNode.gain.setValueAtTime(0.08 * this.volume(), now);
    gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, 0.01 * this.volume()), now + 0.2);

    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);

    osc.start();
    osc.stop(now + 0.2);
  }

  public playLevelUp(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    // Triumphant theme: C5 -> G5 -> C6
    const notes = [523.25, 783.99, 1046.50];
    const timings = [0, 0.08, 0.16];
    const durations = [0.1, 0.1, 0.35];

    notes.forEach((freq, idx) => {
      const time = now + timings[idx];
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);

      gainNode.gain.setValueAtTime(0.07 * this.volume(), time);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), time + durations[idx]);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + durations[idx]);
    });
  }

  public playVictory(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    // Standard retro fanfare: C5, E5, G5, C6 (long)
    const notes = [523.25, 659.25, 783.99, 1046.50, 783.99, 1046.50];
    const timings = [0, 0.08, 0.16, 0.24, 0.36, 0.48];
    const durations = [0.08, 0.08, 0.08, 0.12, 0.12, 0.5];

    notes.forEach((freq, idx) => {
      const time = now + timings[idx];
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, time);

      gainNode.gain.setValueAtTime(0.06 * this.volume(), time);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), time + durations[idx]);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + durations[idx]);
    });
  }

  public playDefeat(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;

    const now = this.ctx.currentTime;
    // Sad falling fanfare: G4 -> E4 -> B3
    const notes = [392.00, 329.63, 246.94];
    const timings = [0, 0.18, 0.36];
    const durations = [0.15, 0.15, 0.6];

    notes.forEach((freq, idx) => {
      const time = now + timings[idx];
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);

      gainNode.gain.setValueAtTime(0.08 * this.volume(), time);
      gainNode.gain.linearRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), time + durations[idx]);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + durations[idx]);
    });
  }

  public playPackTear(): void {
    if (this.muted || !this.initContext() || !this.ctx) return;
    
    // Noise burst for tearing paper/foil
    const now = this.ctx.currentTime;
    const duration = 0.3;
    const osc = this.ctx.createOscillator();
    const gainNode = this.ctx.createGain();
    
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(8000, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + duration);
    
    gainNode.gain.setValueAtTime(0.15 * this.volume(), now);
    gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), now + duration);
    
    osc.connect(gainNode);
    gainNode.connect(this.ctx.destination);
    
    osc.start(now);
    osc.stop(now + duration);
  }

  public playReveal(rarity: string): void {
    if (this.muted || !this.initContext() || !this.ctx) return;
    
    const now = this.ctx.currentTime;
    let notes: number[] = [];
    let timings: number[] = [];
    let durations: number[] = [];
    let type: OscillatorType = 'sine';

    switch (rarity) {
      case 'legendary':
        // Epic crescendo fanfare
        notes = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98];
        timings = [0, 0.1, 0.2, 0.3, 0.4, 0.5];
        durations = [0.1, 0.1, 0.1, 0.1, 0.1, 0.6];
        type = 'square';
        break;
      case 'epic':
      case 'ultra-rare':
        // High pitched mysterious chime
        notes = [880.00, 1108.73, 1318.51];
        timings = [0, 0.15, 0.3];
        durations = [0.2, 0.2, 0.4];
        type = 'triangle';
        break;
      case 'rare':
        // Double ping
        notes = [587.33, 880.00];
        timings = [0, 0.12];
        durations = [0.15, 0.3];
        type = 'sine';
        break;
      default:
        // Common single soft blip
        notes = [440];
        timings = [0];
        durations = [0.2];
        type = 'sine';
        break;
    }

    notes.forEach((freq, idx) => {
      const time = now + timings[idx];
      const osc = this.ctx!.createOscillator();
      const gainNode = this.ctx!.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, time);

      gainNode.gain.setValueAtTime(0.08 * this.volume(), time);
      gainNode.gain.exponentialRampToValueAtTime(Math.max(0.0001, 0.001 * this.volume()), time + durations[idx]);

      osc.connect(gainNode);
      gainNode.connect(this.ctx!.destination);

      osc.start(time);
      osc.stop(time + durations[idx]);
    });
  }
}
