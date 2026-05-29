import { Injectable, signal } from '@angular/core';

export interface Toast {
  id: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  duration: number;
}

@Injectable({
  providedIn: 'root'
})
export class ToastService {
  private readonly toastsSignal = signal<Toast[]>([]);
  public readonly toasts = this.toastsSignal.asReadonly();

  public show(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info', duration = 3500): void {
    const id = crypto.randomUUID();
    const newToast: Toast = { id, message, type, duration };
    
    // Add to queue
    this.toastsSignal.update(prev => [...prev, newToast]);

    // Auto-dismiss
    setTimeout(() => {
      this.dismiss(id);
    }, duration);
  }

  public success(message: string, duration = 3500): void {
    this.show(message, 'success', duration);
  }

  public error(message: string, duration = 4000): void {
    this.show(message, 'error', duration);
  }

  public warning(message: string, duration = 3500): void {
    this.show(message, 'warning', duration);
  }

  public info(message: string, duration = 3000): void {
    this.show(message, 'info', duration);
  }

  public dismiss(id: string): void {
    this.toastsSignal.update(prev => prev.filter(t => t.id !== id));
  }
}
