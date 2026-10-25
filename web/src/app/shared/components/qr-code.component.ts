import { Component, Input, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Código QR dibujado en SVG a partir de la matriz de módulos que calcula el
 * backend (`GET /api/returns/{id}/qr`): no hace falta una librería de QR.
 */
@Component({
  selector: 'app-qr-code',
  standalone: true,
  imports: [CommonModule],
  template: `
    <svg *ngIf="lado > 0" [attr.viewBox]="'0 0 ' + (lado + 8) + ' ' + (lado + 8)" [attr.width]="tamano" [attr.height]="tamano"
         shape-rendering="crispEdges" role="img" [attr.aria-label]="'Código QR ' + (texto || '')">
      <rect [attr.width]="lado + 8" [attr.height]="lado + 8" fill="#ffffff"></rect>
      <path [attr.d]="ruta" fill="#000000"></path>
    </svg>
  `,
})
export class QrCodeComponent implements OnChanges {
  @Input() modulos: string[] = [];
  @Input() tamano = 160;
  @Input() texto: string | null = null;

  lado = 0;
  ruta = '';

  ngOnChanges(): void {
    this.lado = this.modulos.length;
    let ruta = '';
    this.modulos.forEach((fila, y) => {
      for (let x = 0; x < fila.length; x++) {
        if (fila[x] === '1') ruta += `M${x + 4} ${y + 4}h1v1h-1z`;
      }
    });
    this.ruta = ruta;
  }
}
