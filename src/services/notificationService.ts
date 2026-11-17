import { NotificationEvent } from '../types/trading';

class NotificationService {
  private audioCtx: AudioContext | null = null;

  public async requestBrowserPermission(): Promise<NotificationPermission | 'unsupported'> {
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
        requireInteraction: event.category === 'SIGNAL_NEW',
      });
      setTimeout(() => notif.close(), 7500);
    } catch {
      // Ignore environments where browser notifications are restricted inside sandboxed frames
    }
  }

  /**
   * Plays a subtle, clean Web Audio API tone depending on signal category.
   */
  public playAlertSound(category: NotificationEvent['category']): void {
    if (typeof window === 'undefined') return;
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;

      if (!this.audioCtx) {
        this.audioCtx = new AudioContextClass();
      }
      if (this.audioCtx.state === 'suspended') {
        void this.audioCtx.resume();
      }

      const now = this.audioCtx.currentTime;
      const notes =
        category === 'SIGNAL_TP' || category === 'SIGNAL_REVERSAL_EXIT'
          ? [659.25, 880, 1046.5]
          : category === 'SIGNAL_SL'
            ? [349.23, 277.18]
            : category === 'SIGNAL_REVERSAL_WARN'
              ? [493.88, 440, 493.88]
              : category === 'SIGNAL_NEW'
                ? [523.25, 659.25, 783.99]
                : [587.33, 739.99];

      notes.forEach((freq, idx) => {
        if (!this.audioCtx) return;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.08, now + idx * 0.08 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.22);

        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.24);
      });
    } catch {
      // Audio playback blocked before user gesture
    }
  }
}

export const notificationService = new NotificationService();
