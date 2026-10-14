import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NotificationService } from '../../core/services/notification.service';

@Component({
  selector: 'app-toast-container',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="fixed bottom-6 right-6 z-50 flex flex-col space-y-2 pointer-events-none max-w-sm w-full">
      <div
        *ngFor="let toast of notificationService.toasts()"
        class="pointer-events-auto p-4 rounded-xl border shadow-lg bg-white transition-all duration-200 flex items-start space-x-3"
        [ngClass]="{
          'border-emerald-200 text-emerald-950': toast.type === 'success',
          'border-amber-200 text-amber-950': toast.type === 'warning',
          'border-rose-200 text-rose-950': toast.type === 'error',
          'border-gray-200 text-gray-900': toast.type === 'info'
        }"
      >
        <span
          class="material-symbols-outlined text-[20px] shrink-0 mt-0.5"
          [ngClass]="{
            'text-emerald-600': toast.type === 'success',
            'text-amber-600': toast.type === 'warning',
            'text-rose-600': toast.type === 'error',
            'text-indigo-600': toast.type === 'info'
          }"
        >
          {{
            toast.type === 'success' ? 'check_circle' :
            toast.type === 'warning' ? 'warning' :
            toast.type === 'error' ? 'error' : 'info'
          }}
        </span>

        <div class="flex-1 min-w-0">
          <p class="text-xs font-bold leading-tight">
            {{ toast.title }}
          </p>
          <p class="text-xs text-gray-500 mt-0.5 leading-snug">
            {{ toast.message }}
          </p>
        </div>

        <button
          (click)="notificationService.remove(toast.id)"
          class="text-gray-400 hover:text-gray-700 p-1 -mr-1 -mt-1 transition-colors"
        >
          <span class="material-symbols-outlined text-[16px]">close</span>
        </button>
      </div>
    </div>
  `
})
export class ToastContainerComponent {
  constructor(public notificationService: NotificationService) {}
}
