import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-splash-screen',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="splash-wrap">
      <p class="loader"><span>{{ text }}</span></p>
    </div>
  `,
  styles: [`
    .splash-wrap {
      position: fixed;
      inset: 0;
      z-index: 9999;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #111827;
    }

    .loader {
      max-width: fit-content;
      color: rgb(242, 255, 240);
      font-size: 50px;
      position: relative;
      font-style: italic;
      font-weight: 700;
      margin: 0;
    }

    .loader span {
      animation: cut 2s infinite;
      transition: 1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .loader::after {
      position: absolute;
      content: "";
      width: 100%;
      height: 6px;
      border-radius: 4px;
      background-color: #ff828291;
      top: 0px;
      filter: blur(10px);
      animation: scan 2s infinite;
      left: 0;
      z-index: 0;
      transition: 1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    .loader::before {
      position: absolute;
      content: "";
      width: 100%;
      height: 5px;
      border-radius: 4px;
      background-color: #ff8282;
      top: 0px;
      animation: scan 2s infinite;
      left: 0;
      z-index: 1;
      filter: opacity(0.9);
      transition: 1s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    }

    @keyframes scan {
      0% { top: 0px; }
      25% { top: 54px; }
      50% { top: 0px; }
      75% { top: 54px; }
    }

    @keyframes cut {
      0% { clip-path: inset(0 0 0 0); }
      25% { clip-path: inset(100% 0 0 0); }
      50% { clip-path: inset(0 0 100% 0); }
      75% { clip-path: inset(0 0 0 0); }
    }
  `]
})
export class SplashScreenComponent {
  @Input() text = 'YouShop';
}
