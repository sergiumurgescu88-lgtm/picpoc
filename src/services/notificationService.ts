import { NotificationEvent } from '../types/trading';

class NotificationService {
  private audioCtx: AudioContext | null = null;
  private unlockedByGesture = false;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlock = () => {
        this.unlockedByGesture = true;
        this.ensureAudioContextResumed();
        window.removeEventListener('pointerdown', unlock, true);
        window.removeEventListener('keydown', unlock, true);
        window.removeEventListener('touchstart', unlock, true);
      };

      window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
      window.addEventListener('keydown', unlock, { capture: true, passive: true });
      window.addEventListener('touchstart', unlock, { capture: true, passive: true });
    }
  }

  private ensureAudioContextResumed(): AudioContext | null {
    if (typeof window === 'undefined' || !this.unlockedByGesture) {
      return null;
    }
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return null;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume().catch(() => {});
      }
      return this.audioCtx;
    } catch {
      return null;
    }
  }

  public async requestBrowserPermission(): Promise<NotificationPermission | 'unsupported'> {
    this.unlockedByGesture = true;
    this.ensureAudioContextResumed();

    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    if (Notification.permission === 'granted') return 'granted';
    if (Notification.permission === 'denied') return 'denied';
    try {
      return await Notification.requestPermission();
    } catch {
      return Notification.permission;
    }
  }

  public getPermissionStatus(): NotificationPermission | 'unsupported' {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      return 'unsupported';
    }
    return Notification.permission;
  }

  public sendBrowserNotification(event: NotificationEvent): void {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (Notification.permission !== 'granted') return;

    try {
      const notif = new Notification(event.title, {
        body: event.message,
        tag: event.id,
        requireInteraction:
          event.category === 'SIGNAL_NEW' ||
          event.category === 'SIGNAL_TP' ||
          event.category === 'SIGNAL_BREAKEVEN',
      });
      setTimeout(() => notif.close(), 7500);
    } catch {
      // Ignore environments where browser notifications are restricted inside sandboxed frames
    }
  }

  /**
   * Plays a subtle Web Audio API tone only after a valid user gesture has unlocked audio,
   * strictly respecting Chrome's Web Audio autoplay policy without console warnings.
   */
  public playAlertSound(category: NotificationEvent['category']): void {
    const ctx = this.ensureAudioContextResumed();
    if (!ctx || ctx.state !== 'running') {
      return;
    }

    try {
      const now = ctx.currentTime;
      const notes =
        category === 'SIGNAL_TP' ||
        category === 'SIGNAL_REVERSAL_EXIT' ||
        category === 'SIGNAL_BREAKEVEN'
          ? [659.25, 880, 1046.5]
          : category === 'SIGNAL_SL'
            ? [349.23, 277.18]
            : category === 'SIGNAL_REVERSAL_WARN'
              ? [493.88, 440, 493.88]
              : category === 'SIGNAL_NEW'
                ? [523.25, 659.25, 783.99]
                : [587.33, 739.99];

      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.09, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.22);

        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.24);
      });
    } catch {
      // Ignore transient audio graph errors
    }
  }
}

export const notificationService = new NotificationService();
