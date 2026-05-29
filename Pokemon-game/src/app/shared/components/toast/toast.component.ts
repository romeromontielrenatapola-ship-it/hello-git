import { Component, inject } from '@angular/core';
import { ToastService } from '../../../core/services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  imports: [],
  template: `
    <div class="toast-container">
      @for (toast of toastService.toasts(); track toast.id) {
        <div class="toast-box glass-panel {{ toast.type }}" (click)="toastService.dismiss(toast.id)">
          <div class="toast-icon">
            @switch (toast.type) {
              @case ('success') { <span class="text-retro">OK</span> }
              @case ('error') { <span class="text-retro">ERR</span> }
              @case ('warning') { <span class="text-retro">WAR</span> }
              @case ('info') { <span class="text-retro">INF</span> }
            }
          </div>
          <div class="toast-message">{{ toast.message }}</div>
          <button class="toast-close" (click)="$event.stopPropagation(); toastService.dismiss(toast.id)">
            &times;
          </button>
        </div>
      }
    </div>
  `,
  styleUrl: './toast.component.css'
})
export class ToastComponent {
  public readonly toastService = inject(ToastService);
}
