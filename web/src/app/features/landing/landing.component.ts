import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  Output,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  ColorOption,
  SilhouetteOption,
  SizeOption,
  VirtualFitting,
} from './virtual-fitting.component';

/** Tienda de la red (una empresa suscrita a YouShop). */
export interface BoutiqueHouse {
  id: string;
  name: string;
  city: string;
  badge: string;
  description: string;
  skus: number;
  synchronized: boolean;
  sucursales: string;
  destacados: string[];
  established: string;
  /** Opcion del formulario "Reservar prueba" que corresponde a esta tienda. */
  tiendaReserva: string;
}

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, UpperCasePipe, VirtualFitting],
  styles: [`
    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(10px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .animate-fade-in {
      animation: fadeIn 0.25s cubic-bezier(0.16, 1, 0.3, 1) forwards;
    }
    .font-headline-lg, .font-headline-md, .font-headline-sm {
      font-family: 'Playfair Display', Georgia, serif;
    }
    .font-body-lg, .font-body-md, .font-body-sm {
      font-family: 'Plus Jakarta Sans', sans-serif;
    }
    :host .font-mono {
      font-family: 'JetBrains Mono', monospace;
    }
    :host ::-webkit-scrollbar {
      width: 8px;
      height: 8px;
    }
    :host ::-webkit-scrollbar-track {
      background: #121316;
    }
    :host ::-webkit-scrollbar-thumb {
      background: #2a2c33;
      border-radius: 9999px;
      border: 2px solid #121316;
    }
    :host ::-webkit-scrollbar-thumb:hover {
      background: #7a1c30;
    }
  `],
  template: `
  <div class="relative h-screen w-full overflow-y-auto overscroll-contain bg-[#121316] text-[#e3e2e6] antialiased selection:bg-[#7a1c30] selection:text-white">

  <!-- ================= TOP APP BAR (Curved Floating Capsule) ================= -->
  <header class="top-4 sticky z-40 px-4 md:px-8 max-w-7xl mx-auto pointer-events-none">
    <div class="pointer-events-auto bg-[#18191d]/90 backdrop-blur-xl border border-[#564243]/50 rounded-full px-6 md:px-8 py-3.5 flex justify-between items-center shadow-2xl transition-all duration-300">
      <!-- Brand & Umbrella Collective Pill -->
      <div class="flex items-center gap-4 md:gap-6">
        <button
          type="button"
          class="flex items-center gap-3 group cursor-pointer transition-all duration-300 hover:scale-105 text-left border-0 bg-transparent p-0"
          (click)="scrollToSection('umbrella')"
        >
          <span class="w-9 h-9 rounded-full bg-gradient-to-br from-[#9b1d3d] to-[#53101e] text-white flex items-center justify-center font-headline-md text-base font-bold tracking-tighter shadow-md shadow-[#7a1c30]/40 transition-all duration-700 group-hover:scale-105 group-hover:brightness-110">
            Y
          </span>
          <span class="flex flex-col">
            <span class="font-headline-md text-lg tracking-tight font-medium text-white transition-colors">
              <span class="text-[#ff8da1] font-medium transition-colors group-hover:text-[#ffb2ba]">You</span><span class="text-white font-medium">Shop</span>
              <span class="text-white font-light group-hover:text-[#ffb2ba] transition-colors ml-1">Collective</span>
            </span>
            <span class="text-[9px] tracking-[0.2em] uppercase text-[#ffb2bb]/80 font-mono -mt-1 group-hover:text-[#ffb2ba] transition-colors">
              Poleras Oversize & Jeans
            </span>
          </span>
        </button>

        <!-- Status Pill -->
        <div class="hidden xl:flex items-center gap-2 px-3.5 py-1 bg-[#121316] rounded-full border border-[#7a1c30]/40">
          <span class="w-2 h-2 rounded-full bg-[#ffb2bb] animate-pulse"></span>
          <span class="text-[10px] tracking-widest uppercase text-[#ffb2bb] font-semibold font-mono">
            19 TIENDAS EN BOLIVIA
          </span>
        </div>
      </div>

      <!-- Navigation Links -->
      <nav class="hidden md:flex items-center gap-6 lg:gap-8">
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('umbrella')"
        >
          Inicio
        </button>
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('boutiques')"
        >
          Tiendas
        </button>
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('boveda')"
        >
          Colección
        </button>
        <button
          type="button"
          class="text-[#ff8da1] text-xs uppercase tracking-widest font-semibold border-b border-[#ff8da1] pb-0.5 hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent"
          (click)="scrollToSection('probador-virtual')"
        >
          Probador 3D
        </button>
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('precios')"
        >
          Planes
        </button>
      </nav>

      <!-- Trailing Actions -->
      <div class="flex items-center gap-3">
        <button
          type="button"
          class="hidden sm:inline-flex items-center gap-2 px-4 py-2 text-[#e3e2e6] hover:text-[#ff8da1] text-xs uppercase tracking-widest rounded-full hover:bg-[#7a1c30]/20 hover:shadow-[0_0_15px_rgba(159,18,57,0.3)] transition-all duration-300 cursor-pointer border-0"
          (click)="enterLogin.emit()"
        >
          <span class="material-symbols-outlined text-sm text-[#ffb2ba]">lock</span>
          <span>Ingresar</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white text-xs uppercase tracking-widest rounded-full shadow-lg shadow-[#7a1c30]/30 hover:shadow-[0_0_25px_rgba(255,141,161,0.5)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border-0"
          (click)="openVipModal()"
        >
          Reservar Prueba
        </button>
      </div>
    </div>
  </header>

  <!-- ================= HERO SECTION (Curved Architectural Exhibition) ================= -->
  <section class="relative pt-8 pb-20 md:pt-16 md:pb-28 overflow-hidden" id="umbrella">
    <!-- Ambient Deep Wine Glows -->
    <div class="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[700px] h-[500px] bg-gradient-to-br from-[#7a1c30]/25 via-[#53101e]/20 to-transparent rounded-full blur-[120px] pointer-events-none -z-10"></div>
    <div class="absolute -top-24 right-10 w-96 h-96 bg-[#9b1d3d]/15 rounded-full blur-[100px] pointer-events-none -z-10"></div>

    <div class="relative max-w-7xl mx-auto px-6 md:px-8">
      <!-- Top Pill Badge -->
      <div class="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-8">
        <div class="px-4 py-1.5 bg-[#1f1f23] text-[#ffb2ba] border border-[#7a1c30]/60 rounded-full text-xs uppercase tracking-widest font-semibold flex items-center gap-2">
          <span class="w-1.5 h-1.5 rounded-full bg-[#ff8da1]"></span>
          <span>COLECCIÓN ESENCIAL // 2026</span>
        </div>
        <span class="text-xs text-[#a48b8c] uppercase tracking-widest font-mono">
          Poleras oversize y jeans unisex — 19 tiendas en Bolivia
        </span>
      </div>

      <!-- Main Title & Manifesto -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-end mb-14">
        <div class="lg:col-span-8">
          <div class="mb-4">
            <h1 class="font-headline-lg text-5xl sm:text-7xl lg:text-8xl tracking-tight leading-none font-normal mb-5 text-balance">
              <span class="text-[#ff8da1] font-medium">You</span><span class="text-white font-medium">Shop</span> <span class="text-white font-light">Collective</span>
            </h1>
            <h2 class="font-headline-md text-2xl sm:text-3xl text-[#dcc0c1] font-light tracking-wide leading-snug">
              Solo dos prendas: <span class="italic text-[#ffb2ba]">poleras oversize</span> y jeans
            </h2>
          </div>
        </div>
        <div class="lg:col-span-4">
          <p class="font-body-lg text-sm sm:text-base text-[#dcc0c1] leading-relaxed mb-6 font-light">
            Poleras oversize en blanco, negro, guinda y gris, y jeans rectos en negro o blanco. Toda la red comparte el mismo catálogo, el stock en línea y el probador 3D.
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="px-7 py-3.5 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border-0"
              (click)="scrollToSection('boutiques')"
            >
              Ver Tiendas
            </button>
            <button
              type="button"
              class="px-6 py-3.5 border border-[#564243] text-[#e3e2e6] rounded-full text-xs uppercase tracking-widest hover:bg-[#1f1f23] hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
              (click)="scrollToSection('probador-virtual')"
            >
              Probador 3D
            </button>
          </div>
        </div>
      </div>

      <!-- Hero Curved Showcase: Exhibition Image with organic oval overlays -->
      <div class="relative rounded-[3rem] p-3 md:p-4 bg-gradient-to-b from-[#24262d] via-[#1a1b20] to-[#121316] border border-[#564243]/60 shadow-2xl overflow-hidden">
        <button
          type="button"
          class="relative w-full text-left rounded-[2.5rem] overflow-hidden aspect-[16/9] md:aspect-[21/9] cursor-pointer group border-0 p-0 block bg-black"
          (click)="openLightbox('/landing/perchero-poleras.jpg', 'Colección Esencial 2026', 'Poleras oversize en blanco, negro, guinda y gris')"
        >
          <img
            alt="Perchero con cuatro poleras oversize: blanca, negra, guinda y gris"
            class="w-full h-full object-cover object-center filter brightness-95 contrast-105 group-hover:scale-105 transition-transform duration-700"
            src="/landing/perchero-poleras.jpg"
            referrerpolicy="no-referrer"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-[#121316] via-transparent to-[#121316]/40 pointer-events-none"></div>

          <!-- Floating Organic Capsule 1 (Left: Showroom Node) -->
          <div class="absolute bottom-6 left-6 md:bottom-8 md:left-8 bg-[#18191d]/85 backdrop-blur-md border border-[#7a1c30]/50 rounded-full px-5 py-3 flex items-center gap-4 shadow-xl">
            <div class="w-10 h-10 rounded-full bg-[#7a1c30] flex items-center justify-center text-[#ffb2ba]">
              <span class="material-symbols-outlined">gallery_thumbnail</span>
            </div>
            <div>
              <div class="text-[11px] font-mono uppercase tracking-widest text-[#ffb2ba]">PERCHERO CENTRAL // POLERAS OVERSIZE</div>
              <div class="font-headline-md text-sm text-white font-medium">Blanco · Negro · Guinda · Gris</div>
            </div>
          </div>

          <!-- Floating Organic Capsule 2 (Right: Unified Boutiques Tag) -->
          <div class="hidden sm:flex absolute top-6 right-6 md:top-8 md:right-8 bg-[#18191d]/85 backdrop-blur-md border border-white/10 rounded-full px-5 py-2.5 items-center gap-3 shadow-xl">
            <div class="flex -space-x-2">
              <span class="w-7 h-7 rounded-full bg-[#7a1c30] border border-[#18191d] flex items-center justify-center text-[10px] font-bold text-white">EQ</span>
              <span class="w-7 h-7 rounded-full bg-[#53101e] border border-[#18191d] flex items-center justify-center text-[10px] font-bold text-[#ffb2ba]">EP</span>
              <span class="w-7 h-7 rounded-full bg-[#292a2d] border border-[#18191d] flex items-center justify-center text-[10px] font-bold text-white">CC</span>
            </div>
            <span class="text-[11px] text-[#e3e2e6] tracking-wider uppercase font-semibold">19 Tiendas en Bolivia</span>
          </div>
        </button>
      </div>
    </div>
  </section>

  <!-- ================= RED DE TIENDAS ================= -->
  <section class="py-20 md:py-28 bg-[#16171b] border-y border-[#564243]/30 relative" id="boutiques">
    <div class="max-w-7xl mx-auto px-6 md:px-8">
      <div class="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#7a1c30]/30 border border-[#7a1c30]/50 text-[#ffb2ba] text-xs uppercase tracking-widest mb-3 font-semibold">
            <span class="material-symbols-outlined text-sm">hub</span>
            <span>RED DE TIENDAS</span>
          </div>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
            Nuestras Tiendas en Bolivia
          </h2>
        </div>
        <p class="font-body-md text-sm sm:text-base text-[#a48b8c] max-w-md font-light">
          De Equipetrol a El Prado y de Cala Cala a La Recoleta: cada tienda vende las mismas poleras oversize y jeans, con stock compartido en línea.
        </p>
      </div>

      <!-- Tarjetas de tiendas de la red -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        @for (house of boutiques(); track house.id) {
          <button
            type="button"
            class="p-8 rounded-[2.5rem] bg-[#1a1b20] border border-[#564243]/40 hover:border-[#7a1c30] transition-all group flex flex-col justify-between hover:-translate-y-1 shadow-lg cursor-pointer text-left w-full"
            (click)="openBoutiqueModal(house)"
          >
            <div>
              <div class="flex justify-between items-center mb-6">
                <span class="px-3.5 py-1 rounded-full bg-[#7a1c30]/20 text-[#ffb2bb] text-[11px] font-mono tracking-widest uppercase border border-[#7a1c30]/40">
                  {{ house.badge }}
                </span>
                <div class="w-10 h-10 rounded-full bg-[#121316] border border-[#564243] flex items-center justify-center text-white group-hover:bg-[#7a1c30] transition-colors">
                  <span class="material-symbols-outlined text-base">arrow_outward</span>
                </div>
              </div>
              <h3 class="font-headline-md text-2xl text-white mb-2 group-hover:text-[#ffb2ba] transition-colors">
                {{ house.name }}
              </h3>
              <p class="text-xs text-[#a48b8c] leading-relaxed mb-6 font-light">
                {{ house.description }}
              </p>
            </div>
            <div class="pt-4 border-t border-[#564243]/30 flex items-center justify-between text-xs text-[#dcc0c1]">
              <span class="font-mono">{{ house.skus }} SKUs en catálogo</span>
              <span class="text-[#ff8da1] font-semibold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-[#ff8da1]"></span> Sincronizado
              </span>
            </div>
          </button>
        }

        <!-- Sumar una tienda nueva (ocupa 2 columnas en lg) -->
        <div class="lg:col-span-2 p-8 rounded-[2.5rem] bg-gradient-to-r from-[#1a1b20] via-[#24171d] to-[#1a1b20] border border-[#7a1c30]/60 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-xl">
          <div class="max-w-md">
            <div class="flex items-center gap-2 mb-3">
              <span class="px-3 py-1 rounded-full bg-[#7a1c30] text-white text-[11px] font-mono tracking-widest uppercase">
                SUMÁ TU TIENDA
              </span>
              <span class="text-xs text-[#ffb2ba] uppercase tracking-wider font-semibold">
                Planes desde Free Lite (gratis)
              </span>
            </div>
            <h3 class="font-headline-md text-2xl text-white mb-2">
              ¿Tenés una Tienda de Ropa en Bolivia?
            </h3>
            <p class="text-xs text-[#a48b8c] leading-relaxed font-light">
              Vendé poleras oversize y jeans con el catálogo, el inventario en línea, la caja (POS) y el probador 3D de YouShop. Elegí el plan según tus sucursales.
            </p>
          </div>
          <button
            type="button"
            class="px-6 py-3.5 bg-white text-[#121316] rounded-full text-xs uppercase tracking-widest font-semibold hover:bg-[#ffb2ba] hover:shadow-[0_0_25px_rgba(255,178,186,0.6)] hover:scale-105 active:scale-95 transition-all duration-300 whitespace-nowrap shadow-md cursor-pointer border-0"
            (click)="openApplicationModal()"
          >
            Sumar mi Tienda
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= EDITORIAL CAMPAIGN & ARCHIVE SECTION ================= -->
  <section class="py-24 bg-[#121316] relative" id="boveda">
    <div class="max-w-7xl mx-auto px-6 md:px-8">
      <!-- Section Header -->
      <div class="flex flex-col md:flex-row md:items-end justify-between mb-16 pb-6 border-b border-[#564243]/40 gap-6">
        <div>
          <span class="text-xs font-mono uppercase tracking-[0.25em] text-[#ff8da1] block mb-2 font-semibold">
            COLECCIÓN ESENCIAL 2026
          </span>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
            Dos Prendas, Todas las Combinaciones
          </h2>
        </div>
        <p class="font-body-md text-sm sm:text-base text-[#a48b8c] max-w-md font-light">
          Polera oversize de algodón peinado de 240 g/m² con hombro caído y cuello acanalado, y jean de denim de 13 oz de corte recto. Todo combina con todo.
        </p>
      </div>

      <!-- Looks (izquierda) + detalle del cuello (derecha) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <!-- Izquierda: looks polera + jean -->
        <div class="lg:col-span-7 rounded-[3rem] p-3 bg-[#18191d] border border-[#564243]/50 shadow-2xl overflow-hidden group">
          <button
            type="button"
            class="relative w-full text-left rounded-[2.5rem] overflow-hidden aspect-[4/3] sm:aspect-[16/11] cursor-pointer border-0 p-0 block bg-black"
            (click)="openLightbox('/landing/looks-oversize.jpg', 'Looks 2026', 'Polera guinda + jean negro // Polera negra + jean blanco')"
          >
            <img
              alt="Dos looks: polera oversize guinda con jean negro y polera oversize negra con jean blanco"
              class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
              src="/landing/looks-oversize.jpg"
              referrerpolicy="no-referrer"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-[#121316] via-transparent to-transparent opacity-80 pointer-events-none"></div>

            <!-- Bottom Capsule Tag -->
            <div class="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3 bg-[#18191d]/85 backdrop-blur-md border border-[#7a1c30]/50 rounded-full px-5 py-3 pointer-events-none">
              <div>
                <span class="text-[10px] font-mono text-[#ffb2ba] uppercase tracking-widest block">LOOKS 2026</span>
                <span class="text-xs text-white font-medium">Polera Guinda + Jean Negro · Polera Negra + Jean Blanco</span>
              </div>
              <span class="px-3 py-1 bg-[#7a1c30] text-white text-[11px] rounded-full font-mono">6 PRENDAS</span>
            </div>
          </button>
        </div>

        <!-- Derecha: detalle del cuello + ficha -->
        <div class="lg:col-span-5 flex flex-col gap-6">
          <div class="rounded-[2.5rem] p-3 bg-[#18191d] border border-[#564243]/50 shadow-2xl overflow-hidden">
            <button
              type="button"
              class="relative w-full text-left rounded-[2rem] overflow-hidden aspect-[4/3] cursor-pointer group border-0 p-0 block bg-black"
              (click)="openLightbox('/landing/detalle-cuello.jpg', 'Cuello acanalado 1x1', 'Polera oversize guinda // Algodón peinado 240 g/m²')"
            >
              <img
                alt="Detalle del cuello redondo acanalado de una polera oversize guinda"
                class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                src="/landing/detalle-cuello.jpg"
                referrerpolicy="no-referrer"
              />
              <div class="absolute top-4 right-4 bg-[#121316]/90 backdrop-blur rounded-full px-4 py-1.5 border border-[#7a1c30]/60 text-[#ffb2ba] text-[11px] font-mono uppercase tracking-wider pointer-events-none">
                DETALLE // CUELLO 1X1
              </div>
            </button>
          </div>

          <!-- Organic Rounded Specs Panel -->
          <div class="rounded-[2.5rem] p-7 bg-[#1c1d22] border border-[#564243]/40 flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined text-[#ff8da1]">straighten</span>
                <h3 class="font-headline-md text-xl text-white">Corte Oversize Unisex</h3>
              </div>
              <p class="text-xs text-[#a48b8c] leading-relaxed mb-4 font-light">
                Hombro caído, cuerpo amplio y manga al codo: la misma polera le queda bien a cualquiera, y elegís la talla según qué tan suelta la querés. Los jeans son de tiro medio y pierna recta.
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-[#564243]/30 text-[11px]">
              <div class="flex items-center gap-2 text-[#dcc0c1]">
                <span class="w-2 h-2 rounded-full bg-[#ff8da1]"></span>
                <span>Algodón 240 g/m²</span>
              </div>
              <div class="flex items-center gap-2 text-[#dcc0c1]">
                <span class="w-2 h-2 rounded-full bg-[#ff8da1]"></span>
                <span>Denim 13 oz</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= DEDICATED 3D / AR VIRTUAL FITTING ROOM SECTION ================= -->
  <section class="py-24 bg-[#16171b] border-t border-[#564243]/30 relative overflow-hidden" id="probador-virtual">
    <!-- Wine / Burgundy Ambient Radiance -->
    <div class="absolute top-1/3 -left-32 w-96 h-96 bg-[#7a1c30]/20 rounded-full blur-[120px] pointer-events-none"></div>
    <div class="absolute bottom-10 right-0 w-96 h-96 bg-[#9b1d3d]/15 rounded-full blur-[100px] pointer-events-none"></div>

    <div class="relative max-w-7xl mx-auto px-6 md:px-8">
      <!-- Section Header -->
      <div class="flex flex-col lg:flex-row lg:items-end justify-between mb-14 pb-6 border-b border-[#564243]/40 gap-6">
        <div>
          <div class="flex flex-wrap items-center gap-3 mb-3">
            <span class="px-3.5 py-1 bg-[#7a1c30] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-md shadow-[#7a1c30]/40">
              PROBADOR 3D
            </span>
            <span class="flex items-center gap-2 text-xs text-[#ffb2bb] font-mono tracking-wider uppercase">
              <span class="w-2 h-2 rounded-full bg-[#ff8da1] animate-ping"></span>
              VISTA 360° ACTIVA
            </span>
          </div>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
            Probador Virtual de Poleras Oversize
          </h2>
        </div>
        <p class="font-body-md text-sm sm:text-base text-[#a48b8c] max-w-md font-light">
          Girá la polera 360°, cambiá entre blanco, negro, guinda y gris, probá las tallas y combinala con jean negro o blanco antes de comprarla o reservarla.
        </p>
      </div>

      <!-- Main 3D Showcase & Control Console Grid -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
        <!-- Left: 3D Garment Stage with Oval Organic Silhouette Framing -->
        <div class="lg:col-span-7 flex flex-col">
          <div class="relative flex-1 bg-[#121316] rounded-[3rem] border border-[#564243]/60 shadow-2xl overflow-hidden flex flex-col justify-between group">
            <!-- Capsule Top HUD -->
            <div class="relative z-20 flex items-center justify-between px-6 py-4 bg-[#18191d]/90 text-white backdrop-blur-md border-b border-[#564243]/40 rounded-t-[3rem]">
              <div class="flex items-center gap-3">
                <span class="w-2.5 h-2.5 rounded-full bg-[#ff8da1] animate-pulse"></span>
                <span class="text-xs uppercase tracking-widest font-mono font-semibold text-[#ffb2ba]">
                  PROBADOR 3D // POLERA OVERSIZE
                </span>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-3 py-1 rounded-full bg-[#22242a] text-[#e3e2e6] text-[11px] font-mono tracking-wider border border-white/5">
                  XYZ: {{ virtualFittingComponent?.coordinatesReadout() || '[0.00, +0.50, 2.60]' }}
                </span>
                <span class="text-[#ff8da1] text-xs uppercase tracking-widest font-mono hidden sm:inline">
                  FPS: 60.0
                </span>
              </div>
            </div>

            <!-- Center: Interactive WebGL Canvas Container -->
            <app-virtual-fitting></app-virtual-fitting>

            <!-- Bottom Capsule Bar -->
            <div class="relative z-20 flex flex-wrap items-center justify-between gap-3 px-6 py-3.5 bg-[#18191d]/90 text-white backdrop-blur-md border-t border-[#564243]/40 rounded-b-[3rem] text-xs">
              <div class="flex items-center gap-2 text-[#dcc0c1]">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">texture</span>
                <span>{{ activeFabricSpec() }}</span>
              </div>
              <span class="text-[#ffb2ba] font-mono font-semibold tracking-widest uppercase text-[10px]">
                WEBGL // VISTA 360°
              </span>
            </div>
          </div>
        </div>

        <!-- Right: Interactive Fitting Suite in Curved Pill Cards -->
        <div class="lg:col-span-5 flex flex-col justify-between gap-6">
          <div class="p-8 bg-[#18191d] rounded-[3rem] border border-[#564243]/60 shadow-xl flex flex-col justify-between flex-1">
            <div>
              <!-- Console Header -->
              <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/30">
                <div>
                  <span class="text-xs uppercase tracking-widest text-[#ff8da1] font-mono font-bold block mb-1">
                    ARMÁ TU LOOK
                  </span>
                  <h3 class="font-headline-md text-2xl text-white">Elegí tu Polera</h3>
                </div>
                <span class="px-3.5 py-1.5 bg-[#22242a] rounded-full border border-[#564243] text-xs text-[#ffb2ba] font-mono">
                  ESENCIAL-2026
                </span>
              </div>

              <!-- Silhouette Selector -->
              <div class="mb-6">
                <span class="block text-xs uppercase tracking-widest text-[#a48b8c] font-semibold mb-3">
                  Prenda
                </span>
                <div class="space-y-2.5">
                  @for (item of silhouettes; track item.id) {
                    <button
                      type="button"
                      class="w-full text-left px-5 py-3.5 rounded-full border transition-all cursor-pointer flex items-center justify-between"
                      [class]="selectedSilhouette().id === item.id
                        ? 'border-2 border-[#7a1c30] bg-[#22242a]'
                        : 'border border-[#564243]/60 bg-[#121316] text-[#a48b8c] hover:text-white hover:border-[#7a1c30]'"
                      (click)="selectSilhouette(item)"
                    >
                      <div>
                        <div class="text-xs font-bold text-white uppercase tracking-wider">{{ item.name }}</div>
                        <div class="text-[11px] text-[#a48b8c]">{{ item.description }}</div>
                      </div>
                      <span
                        class="material-symbols-outlined"
                        [class]="selectedSilhouette().id === item.id ? 'text-[#ff8da1]' : 'text-[#564243]'"
                      >
                        {{ selectedSilhouette().id === item.id ? 'check_circle' : 'radio_button_unchecked' }}
                      </span>
                    </button>
                  }
                </div>
              </div>

              <!-- Colores de la polera -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs uppercase tracking-widest text-[#a48b8c] font-semibold">
                    Color de la polera
                  </span>
                  <span class="text-xs uppercase tracking-wider text-[#ff8da1] font-mono font-bold">
                    {{ selectedColor().name }} ({{ selectedColor().hex }})
                  </span>
                </div>
                <div class="grid grid-cols-4 gap-2.5">
                  @for (c of colors; track c.id) {
                    <button
                      type="button"
                      class="flex flex-col items-center gap-1.5 p-2 rounded-2xl border transition-all cursor-pointer"
                      [class]="selectedColor().id === c.id
                        ? 'border-2 border-[#7a1c30] bg-[#22242a] shadow-md shadow-[#7a1c30]/30'
                        : 'border border-[#564243]/60 bg-[#121316] hover:border-[#7a1c30]'"
                      (click)="selectColor(c)"
                    >
                      <span
                        class="w-8 h-8 rounded-full border border-white/20 shadow-md flex items-center justify-center transition-transform hover:scale-110"
                        [style.background-color]="c.hex"
                      >
                        @if (selectedColor().id === c.id) {
                          <span class="material-symbols-outlined text-white text-xs">check</span>
                        }
                      </span>
                      <span
                        class="text-[9px] font-mono tracking-tighter truncate w-full text-center"
                        [class]="selectedColor().id === c.id ? 'text-white font-bold' : 'text-[#a48b8c]'"
                      >
                        {{ c.name.split(' ')[0] }}
                      </span>
                    </button>
                  }
                </div>
              </div>

              <!-- Tallas -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs uppercase tracking-widest text-[#a48b8c] font-semibold">
                    Talla
                  </span>
                  <button
                    type="button"
                    class="text-[11px] text-[#ff8da1] font-bold cursor-pointer hover:underline font-mono border-0 bg-transparent p-0"
                    (click)="showToast('Guía de tallas: S (pecho 96–100 cm), M (100–106), L (106–112), XL (112–120). Al ser oversize, si dudás elegí tu talla habitual.')"
                  >
                    Guía de tallas
                  </button>
                </div>
                <div class="grid grid-cols-4 gap-2.5">
                  @for (s of sizes; track s.id) {
                    <button
                      type="button"
                      class="px-4 py-2.5 rounded-full border text-center transition-all cursor-pointer"
                      [class]="selectedSize().id === s.id
                        ? 'border-2 border-[#7a1c30] bg-[#22242a] shadow-md'
                        : 'border border-[#564243]/60 bg-[#121316] hover:border-[#7a1c30]'"
                      (click)="selectSize(s)"
                    >
                      <span
                        class="font-headline-md text-sm font-bold"
                        [class]="selectedSize().id === s.id ? 'text-[#ff8da1]' : 'text-white'"
                      >
                        {{ s.code }}
                      </span>
                      <span
                        class="block text-[10px] uppercase tracking-wider"
                        [class]="selectedSize().id === s.id ? 'text-[#ffb2ba] font-bold' : 'text-[#a48b8c]'"
                      >
                        {{ s.label }}
                      </span>
                    </button>
                  }
                </div>
              </div>

              <!-- Ficha de la prenda -->
              <div class="p-5 bg-[#121316] rounded-3xl border border-[#564243]/50 mb-6">
                <div class="flex items-center justify-between mb-3 pb-2 border-b border-[#564243]/30">
                  <span class="text-[11px] font-mono uppercase tracking-widest text-[#ffb2ba] font-bold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-[#ff8da1]">straighten</span>
                    Ficha de la prenda
                  </span>
                  <span class="text-[10px] text-[#ff8da1] font-mono font-bold">100% ALGODÓN</span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Gramaje:</span>
                    <span class="font-semibold text-white font-mono">{{ selectedSilhouette().gramaje }}</span>
                  </div>
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Hombro:</span>
                    <span class="font-semibold text-white font-mono">{{ selectedSilhouette().hombro }}</span>
                  </div>
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Largo:</span>
                    <span class="font-semibold text-[#ffb2ba] font-mono">{{ selectedSilhouette().largo }}</span>
                  </div>
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Combina con:</span>
                    <span class="font-semibold text-[#ff8da1] font-mono">{{ selectedSilhouette().combinaCon }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Probador con camara (app movil) -->
            <button
              type="button"
              class="w-full py-4 px-6 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-3 shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_35px_rgba(255,141,161,0.6)] hover:brightness-110 active:scale-98 transition-all duration-300 cursor-pointer border-0"
              (click)="openArModal()"
            >
              <span class="material-symbols-outlined text-base">view_in_ar</span>
              <span>Probártela con la Cámara (App Móvil)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= PLANES ================= -->
  <section class="py-24 bg-[#121316] relative" id="precios">
    <div class="max-w-7xl mx-auto px-6 md:px-8">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#7a1c30]/20 text-[#ffb2ba] border border-[#7a1c30]/50 text-xs uppercase tracking-widest mb-3 font-semibold">
          <span>PLANES PARA TIENDAS</span>
        </div>
        <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
          Planes para Vender con YouShop
        </h2>
        <p class="font-body-md text-sm text-[#a48b8c] mt-3 font-light">
          Empezá gratis con Free Lite (1 sucursal) y subí de plan cuando abras más tiendas.
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        <!-- Tier 1 -->
        <div class="p-8 rounded-[3rem] bg-[#18191d] border border-[#564243]/50 flex flex-col justify-between hover:border-[#7a1c30] transition-colors shadow-lg">
          <div>
            <span class="text-[11px] font-mono text-[#a48b8c] uppercase tracking-widest block mb-2">PLAN</span>
            <h3 class="font-headline-md text-2xl text-white mb-2">Básico</h3>
            <p class="text-xs text-[#a48b8c] mb-6 font-light">Para tiendas con hasta 2 sucursales sincronizadas en la nube.</p>
            <div class="font-headline-lg text-4xl text-white mb-6">
              240 <span class="text-sm font-normal text-[#a48b8c]">Bs / mes</span>
            </div>
            <ul class="space-y-3.5 text-xs text-[#dcc0c1] mb-8 border-t border-[#564243]/30 pt-6">
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Hasta 2 sucursales y 5 usuarios
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Hasta 300 productos (talla y color)
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Inventario y ventas sincronizados en línea
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="w-full py-3.5 text-center border border-[#564243] text-white rounded-full text-xs uppercase tracking-widest hover:bg-[#22242a] hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
            (click)="openApplicationModal()"
          >
            Elegir Básico
          </button>
        </div>

        <!-- Plan destacado -->
        <div class="p-8 rounded-[3rem] bg-gradient-to-b from-[#25151b] via-[#1f161a] to-[#18191d] border-2 border-[#7a1c30] flex flex-col justify-between relative shadow-2xl shadow-[#7a1c30]/20">
          <div class="absolute -top-3.5 right-8 px-4 py-1 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white text-[10px] font-mono tracking-widest uppercase rounded-full shadow-md">
            MÁS ELEGIDO
          </div>
          <div>
            <span class="text-[11px] font-mono text-[#ffb2ba] uppercase tracking-widest block mb-2">PLAN</span>
            <h3 class="font-headline-md text-2xl text-white mb-2">Intermedio</h3>
            <p class="text-xs text-[#dcc0c1] mb-6 font-light">Para cadenas de hasta 5 sucursales que quieren reportes con IA.</p>
            <div class="font-headline-lg text-4xl text-white mb-6">
              680 <span class="text-sm font-normal text-[#a48b8c]">Bs / mes</span>
            </div>
            <ul class="space-y-3.5 text-xs text-white mb-8 border-t border-[#7a1c30]/40 pt-6">
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Hasta 5 sucursales y 15 usuarios
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Reportes consolidados con IA
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Hasta 2000 productos y modo sin conexión
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Probador 3D y app móvil para tus clientes
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="w-full py-3.5 text-center bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-[#7a1c30]/40 cursor-pointer border-0"
            (click)="openApplicationModal()"
          >
            Elegir Intermedio
          </button>
        </div>

        <!-- Tier 3 -->
        <div class="p-8 rounded-[3rem] bg-[#18191d] border border-[#564243]/50 flex flex-col justify-between hover:border-[#7a1c30] transition-colors shadow-lg">
          <div>
            <span class="text-[11px] font-mono text-[#a48b8c] uppercase tracking-widest block mb-2">PLAN</span>
            <h3 class="font-headline-md text-2xl text-white mb-2">Avanzado</h3>
            <p class="text-xs text-[#a48b8c] mb-6 font-light">Para cadenas grandes, sin topes de sucursales ni catálogo.</p>
            <div class="font-headline-lg text-4xl text-white mb-6">
              1500 <span class="text-sm font-normal text-[#a48b8c]">Bs / mes</span>
            </div>
            <ul class="space-y-3.5 text-xs text-[#dcc0c1] mb-8 border-t border-[#564243]/30 pt-6">
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Sucursales y usuarios ilimitados
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Catálogo ilimitado y reportes con IA
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Respaldos automáticos diarios
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="w-full py-3.5 text-center border border-[#564243] text-white rounded-full text-xs uppercase tracking-widest hover:bg-[#22242a] hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
            (click)="openApplicationModal()"
          >
            Elegir Avanzado
          </button>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= CURVED CALL TO ACTION ================= -->
  <section class="py-24 bg-[#16171b] relative overflow-hidden" id="demo">
    <div class="max-w-6xl mx-auto px-6 md:px-8">
      <div class="relative rounded-[3.5rem] bg-gradient-to-r from-[#2a131b] via-[#1a1b20] to-[#241219] border border-[#7a1c30]/70 p-10 sm:p-16 text-center shadow-2xl overflow-hidden">
        <!-- Glow ambient -->
        <div class="absolute -top-24 left-1/2 -translate-x-1/2 w-[500px] h-[300px] bg-[#9b1d3d]/30 rounded-full blur-[90px] pointer-events-none"></div>

        <div class="relative z-10 max-w-3xl mx-auto">
          <span class="px-4 py-1.5 bg-[#7a1c30] text-white rounded-full text-xs font-mono tracking-widest uppercase inline-block mb-6 shadow-md">
            EMPEZÁ HOY
          </span>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight leading-snug mb-6">
            Poleras Oversize y Jeans en Toda Bolivia
          </h2>
          <p class="font-body-lg text-sm sm:text-base text-[#dcc0c1] mb-10 leading-relaxed font-light">
            19 tiendas ya venden con YouShop: catálogo común, stock en línea, caja (POS), app móvil y probador 3D para que cada cliente elija color y talla.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              class="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border-0"
              (click)="openApplicationModal()"
            >
              Sumar mi Tienda
            </button>
            <button
              type="button"
              class="w-full sm:w-auto px-8 py-4 border border-[#564243] text-white rounded-full text-xs uppercase tracking-widest hover:bg-white/10 hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
              (click)="scrollToSection('probador-virtual')"
            >
              Explorar Probador 3D
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= FOOTER (Curved Capsule Silhouette) ================= -->
  <footer class="bg-[#121316] border-t border-[#564243]/30 py-12">
    <div class="max-w-7xl mx-auto px-6 md:px-8 flex flex-col md:flex-row justify-between items-center gap-6">
      <div class="flex flex-col items-center md:items-start gap-2">
        <div class="flex items-center gap-3">
          <div class="w-7 h-7 rounded-full bg-[#7a1c30] text-white flex items-center justify-center font-headline-md text-xs font-bold">
            Y
          </div>
          <span class="font-headline-md text-base text-white tracking-tight">YouShop Collective</span>
        </div>
        <p class="text-xs text-[#a48b8c] text-center md:text-left">
          © 2026 YouShop Collective · Poleras oversize y jeans unisex · Bolivia.
        </p>
      </div>
      <div class="flex flex-wrap justify-center md:justify-end gap-6 text-xs text-[#a48b8c] uppercase tracking-wider">
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="scrollToSection('umbrella')">Inicio</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="scrollToSection('boutiques')">Tiendas</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="scrollToSection('probador-virtual')">Probador 3D</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="enterLogin.emit()">Ingresar</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="openVipModal()">Reservar Prueba</button>
      </div>
    </div>
  </footer>

  <!-- ================= MODALS & OVERLAYS ================= -->

  <!-- 1. Reservar una prueba en tienda -->
  @if (isVipModalOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-lg bg-[#18191d] border border-[#7a1c30] rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block">
              PRUEBA EN TIENDA
            </span>
            <h3 class="font-headline-md text-2xl text-white">Reservar una Prueba en Tienda</h3>
          </div>
          <button
            type="button"
            class="w-8 h-8 rounded-full bg-[#22242a] text-[#a48b8c] hover:text-white flex items-center justify-center transition-colors cursor-pointer border-0"
            (click)="closeVipModal()"
            aria-label="Cerrar modal"
          >
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <form [formGroup]="vipBookingForm" (ngSubmit)="submitVipBooking()" class="space-y-4">
          <div>
            <label for="vipClientName" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Nombre Completo</label>
            <input
              id="vipClientName"
              type="text"
              formControlName="clientName"
              placeholder="Ej. Nicolás Revollo"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="vipEmail" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Correo Electrónico</label>
              <input
                id="vipEmail"
                type="email"
                formControlName="email"
                placeholder="tucorreo@gmail.com"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
            <div>
              <label for="vipPhone" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Teléfono Directo</label>
              <input
                id="vipPhone"
                type="tel"
                formControlName="phone"
                placeholder="+591 71234567"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label for="vipAtelierSelect" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Tienda</label>
            <select
              id="vipAtelierSelect"
              formControlName="atelier"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            >
              @for (tienda of tiendasReserva; track tienda) {
                <option [value]="tienda">{{ tienda }}</option>
              }
            </select>
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="vipDate" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Fecha</label>
              <input
                id="vipDate"
                type="date"
                formControlName="date"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
            <div>
              <label for="vipTime" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Hora</label>
              <input
                id="vipTime"
                type="time"
                formControlName="time"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label for="vipNotes" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">¿Qué te querés probar?</label>
            <textarea
              id="vipNotes"
              rows="2"
              formControlName="notes"
              placeholder="Ej. Polera oversize guinda talla L y jean negro 32"
              class="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            ></textarea>
          </div>

          <div class="pt-2 flex items-center justify-end gap-3">
            <button
              type="button"
              class="px-5 py-3 rounded-full border border-[#564243] text-xs uppercase tracking-widest text-[#a48b8c] hover:text-white cursor-pointer bg-transparent"
              (click)="closeVipModal()"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="px-7 py-3 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-lg shadow-[#7a1c30]/40 hover:brightness-110 cursor-pointer border-0"
            >
              Confirmar Reserva
            </button>
          </div>
        </form>
      </div>
    </div>
  }

  <!-- 2. Sumar una tienda -->
  @if (isApplicationModalOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-lg bg-[#18191d] border border-[#7a1c30]/70 rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block">
              SUMÁ TU TIENDA
            </span>
            <h3 class="font-headline-md text-2xl text-white">Quiero Vender con YouShop</h3>
          </div>
          <button
            type="button"
            class="w-8 h-8 rounded-full bg-[#22242a] text-[#a48b8c] hover:text-white flex items-center justify-center transition-colors cursor-pointer border-0"
            (click)="closeApplicationModal()"
            aria-label="Cerrar modal"
          >
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <form [formGroup]="applicationForm" (ngSubmit)="submitApplication()" class="space-y-4">
          <div>
            <label for="appBrandName" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Nombre de la tienda</label>
            <input
              id="appBrandName"
              type="text"
              formControlName="brandName"
              placeholder="Ej. Oversize Cala Cala"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="appDesigner" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Responsable</label>
              <input
                id="appDesigner"
                type="text"
                formControlName="designerName"
                placeholder="Ej. María Quispe"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
            <div>
              <label for="appCity" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Ciudad Sede</label>
              <input
                id="appCity"
                type="text"
                formControlName="city"
                placeholder="Cochabamba / Sucre / etc."
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label for="appPortfolio" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Instagram o web</label>
            <input
              id="appPortfolio"
              type="url"
              formControlName="portfolioUrl"
              placeholder="https://instagram.com/tu-tienda"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            />
          </div>

          <div>
            <label for="appCollectionType" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">¿Qué vas a vender?</label>
            <select
              id="appCollectionType"
              formControlName="collectionType"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            >
              <option value="Poleras oversize y jeans">Poleras oversize y jeans</option>
              <option value="Solo poleras oversize">Solo poleras oversize</option>
              <option value="Solo jeans">Solo jeans</option>
            </select>
          </div>

          <div>
            <label for="appMessage" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Comentarios</label>
            <textarea
              id="appMessage"
              rows="3"
              formControlName="message"
              placeholder="Cuántas sucursales tenés, qué plan te interesa..."
              class="w-full px-4 py-2.5 rounded-2xl bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            ></textarea>
          </div>

          <div class="pt-3 flex items-center justify-end gap-3">
            <button
              type="button"
              class="px-5 py-3 rounded-full border border-[#564243] text-xs uppercase tracking-widest text-[#a48b8c] hover:text-white cursor-pointer bg-transparent"
              (click)="closeApplicationModal()"
            >
              Cancelar
            </button>
            <button
              type="submit"
              class="px-7 py-3 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-lg shadow-[#7a1c30]/40 hover:brightness-110 cursor-pointer border-0"
            >
              Enviar Solicitud
            </button>
          </div>
        </form>
      </div>
    </div>
  }

  <!-- 3. Detalle de una tienda de la red -->
  @if (selectedBoutiqueModal(); as house) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-xl bg-[#18191d] border border-[#7a1c30] rounded-[2.5rem] p-8 shadow-2xl">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block">
              TIENDA DE LA RED
            </span>
            <h3 class="font-headline-md text-2xl text-white">{{ house.name }}</h3>
            <span class="text-xs text-[#a48b8c]">{{ house.city }} // En la red desde {{ house.established }}</span>
          </div>
          <button
            type="button"
            class="w-8 h-8 rounded-full bg-[#22242a] text-[#a48b8c] hover:text-white flex items-center justify-center transition-colors cursor-pointer border-0"
            (click)="closeBoutiqueModal()"
            aria-label="Cerrar modal"
          >
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <div class="space-y-4">
          <p class="text-sm text-[#dcc0c1] leading-relaxed">
            {{ house.description }}
          </p>

          <div class="p-4 bg-[#121316] rounded-2xl border border-[#564243]/50">
            <div class="text-xs font-mono uppercase text-[#ffb2ba] mb-2 font-bold">Sucursales</div>
            <div class="text-sm font-semibold text-white">{{ house.sucursales }}</div>
          </div>

          <div>
            <div class="text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-2">Lo más vendido</div>
            <div class="flex flex-wrap gap-2">
              @for (prenda of house.destacados; track prenda) {
                <span class="px-3 py-1 bg-[#22242a] text-[#ffb2ba] rounded-full text-xs font-mono border border-white/10">
                  {{ prenda }}
                </span>
              }
            </div>
          </div>

          <div class="flex items-center justify-between pt-4 border-t border-[#564243]/30">
            <div class="text-xs text-[#dcc0c1]">
              <span class="font-mono text-white font-bold">{{ house.skus }}</span> SKUs (talla y color) en catálogo
            </div>
            <button
              type="button"
              class="px-6 py-2.5 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold hover:brightness-110 cursor-pointer border-0"
              (click)="closeBoutiqueModal(); openVipModal(house.tiendaReserva)"
            >
              Reservar Prueba Aquí
            </button>
          </div>
        </div>
      </div>
    </div>
  }

  <!-- 4. Probador con camara (app movil) -->
  @if (isArModalOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-2xl bg-[#121316] border border-[#ff8da1]/60 rounded-[3rem] p-8 shadow-2xl overflow-hidden text-center">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#ff8da1] animate-ping"></span>
            <span class="text-xs font-mono uppercase tracking-widest text-[#ffb2ba] font-bold">
              PROBADOR CON CÁMARA // APP YOUSHOP
            </span>
          </div>
          <button
            type="button"
            class="w-8 h-8 rounded-full bg-[#22242a] text-[#a48b8c] hover:text-white flex items-center justify-center transition-colors cursor-pointer border-0"
            (click)="closeArModal()"
            aria-label="Cerrar modal"
          >
            <span class="material-symbols-outlined text-sm">close</span>
          </button>
        </div>

        <!-- Vista ilustrativa -->
        <div class="relative w-full h-72 rounded-3xl bg-gradient-to-b from-[#18191d] via-[#1f161a] to-[#0f1013] border border-[#7a1c30]/50 flex flex-col items-center justify-center overflow-hidden mb-6 p-6">
          <!-- Grilla decorativa -->
          <div class="absolute inset-0 bg-[radial-gradient(#7a1c30_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
          <div class="absolute w-48 h-48 border-2 border-dashed border-[#ff8da1]/70 rounded-full animate-spin" style="animation-duration: 25s;"></div>

          <div class="relative z-10 flex flex-col items-center gap-3">
            <div class="w-16 h-16 rounded-full bg-[#7a1c30]/30 border border-[#ff8da1] flex items-center justify-center text-[#ffb2ba] shadow-lg shadow-[#7a1c30]/50">
              <span class="material-symbols-outlined text-3xl">view_in_ar</span>
            </div>
            <div class="font-headline-md text-xl text-white">
              Probátela con la Cámara de tu Celular
            </div>
            <p class="text-xs text-[#dcc0c1] max-w-md">
              La app YouShop detecta tu cuerpo con la cámara y te muestra la polera oversize {{ selectedColor().name }} encima, en tiempo real, para que veas cómo te queda la talla {{ selectedSize().code }}.
            </p>
          </div>

          <div class="absolute bottom-4 left-6 text-[10px] font-mono text-[#ffb2ba]">
            DETECCIÓN DE POSE // ML KIT
          </div>
          <div class="absolute bottom-4 right-6 text-[10px] font-mono text-[#ff8da1]">
            COLOR: {{ selectedColor().name | uppercase }}
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-left">
            <div class="text-xs font-mono uppercase text-white font-bold">¿La querés probar en tu celular?</div>
            <div class="text-[11px] text-[#a48b8c]">Disponible en la app YouShop para Android (pestaña Probador).</div>
          </div>
          <button
            type="button"
            class="px-6 py-3 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold hover:brightness-110 shadow-lg cursor-pointer border-0"
            (click)="closeArModal()"
          >
            Entendido
          </button>
        </div>
      </div>
    </div>
  }

  <!-- 5. Lightbox Image Modal -->
  @if (isLightboxOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-lg" role="dialog" aria-modal="true">
      <button
        type="button"
        class="absolute inset-0 w-full h-full bg-transparent border-0 cursor-pointer"
        (click)="closeLightbox()"
        aria-label="Cerrar visor de imagen"
      ></button>
      <div class="relative z-10 max-w-4xl max-h-[90vh] flex flex-col items-center">
        <button
          type="button"
          class="absolute -top-12 right-0 w-9 h-9 rounded-full bg-[#22242a] text-white flex items-center justify-center hover:bg-[#7a1c30] transition-colors cursor-pointer border-0"
          (click)="closeLightbox()"
          aria-label="Cerrar visor"
        >
          <span class="material-symbols-outlined text-sm">close</span>
        </button>
        <img
          [src]="lightboxImage()?.url"
          [alt]="lightboxImage()?.title"
          class="max-w-full max-h-[75vh] object-contain rounded-3xl border border-[#7a1c30]/60 shadow-2xl"
          referrerpolicy="no-referrer"
        />
        <div class="mt-4 text-center">
          <h4 class="font-headline-md text-xl text-white">{{ lightboxImage()?.title }}</h4>
          <p class="text-xs text-[#a48b8c] font-mono mt-1">{{ lightboxImage()?.subtitle }}</p>
        </div>
      </div>
    </div>
  }

  <!-- Toast Feedback -->
  @if (toastMessage(); as msg) {
    <div class="fixed bottom-6 right-6 z-50 max-w-md px-6 py-3.5 bg-[#18191d] border-2 border-[#7a1c30] rounded-full text-white text-xs shadow-2xl flex items-center gap-3 animate-fade-in">
      <span class="w-2.5 h-2.5 rounded-full bg-[#ff8da1] shrink-0 animate-pulse"></span>
      <span class="flex-1 font-body-sm">{{ msg }}</span>
      <button type="button" class="text-[#a48b8c] hover:text-white border-0 bg-transparent cursor-pointer p-0" (click)="toastMessage.set(null)" aria-label="Cerrar notificación">
        <span class="material-symbols-outlined text-xs">close</span>
      </button>
    </div>
  }

  </div>
  `
})
export class LandingComponent {
  @Output() enterLogin = new EventEmitter<void>();

  @ViewChild(VirtualFitting) virtualFittingComponent?: VirtualFitting;

  // Tiendas de la red que se muestran en la landing (empresas reales del seed:
  // la operadora y las demo de las migraciones 016 y 020).
  readonly boutiques = signal<BoutiqueHouse[]>([
    {
      id: 'youshop',
      name: 'YouShop Collective',
      city: 'Santa Cruz · La Paz',
      badge: 'EQUIPETROL // EL PRADO',
      description:
        'La tienda insignia de la red: catálogo completo de poleras oversize y jeans en Equipetrol (Santa Cruz) y El Prado (La Paz).',
      skus: 26,
      synchronized: true,
      sucursales: 'Sucursal Central Equipetrol · Sucursal El Prado',
      destacados: ['Polera Oversize Negra', 'Jeans Negro', 'Polera Oversize Guinda'],
      established: '2024',
      tiendaReserva: 'YouShop Collective — Equipetrol (Santa Cruz)',
    },
    {
      id: 'moda-urbana',
      name: 'Moda Urbana La Paz',
      city: 'La Paz',
      badge: 'SOPOCACHI // CALACOTO',
      description:
        'Dos sucursales paceñas con el surtido completo: la polera oversize gris con jean negro es la combinación que más sale.',
      skus: 26,
      synchronized: true,
      sucursales: 'Moda Urbana Sopocachi · Moda Urbana Calacoto',
      destacados: ['Polera Oversize Gris', 'Jeans Negro', 'Polera Oversize Blanca'],
      established: '2025',
      tiendaReserva: 'Moda Urbana — Sopocachi (La Paz)',
    },
    {
      id: 'cala-cala',
      name: 'Cala Cala',
      city: 'Cochabamba',
      badge: 'COCHABAMBA // CALA CALA',
      description:
        'La primera tienda de la red en el valle: poleras oversize en los cuatro colores y jeans rectos en negro y blanco.',
      skus: 26,
      synchronized: true,
      sucursales: 'Cala Cala Av. América',
      destacados: ['Polera Oversize Blanca', 'Jeans Blanco', 'Polera Oversize Negra'],
      established: '2026',
      tiendaReserva: 'Cala Cala — Av. América (Cochabamba)',
    },
    {
      id: 'la-recoleta',
      name: 'La Recoleta',
      city: 'Sucre',
      badge: 'SUCRE // LA RECOLETA',
      description:
        'Tienda de la red en la Capital, a pasos del mirador: la polera oversize guinda es la favorita de sus clientes.',
      skus: 26,
      synchronized: true,
      sucursales: 'La Recoleta Centro',
      destacados: ['Polera Oversize Guinda', 'Jeans Negro', 'Polera Oversize Gris'],
      established: '2026',
      tiendaReserva: 'La Recoleta — Centro (Sucre)',
    },
  ]);

  /** Opciones del formulario "Reservar prueba en tienda". */
  readonly tiendasReserva = [
    'YouShop Collective — Equipetrol (Santa Cruz)',
    'YouShop Collective — El Prado (La Paz)',
    'Moda Urbana — Sopocachi (La Paz)',
    'Moda Urbana — Calacoto (La Paz)',
    'Cala Cala — Av. América (Cochabamba)',
    'La Recoleta — Centro (Sucre)',
  ];

  // Prendas del probador 3D: la polera oversize sola o con un jean.
  readonly silhouettes: SilhouetteOption[] = [
    {
      id: 'polera',
      name: 'Polera Oversize',
      linea: 'Línea Oversize',
      description: 'Hombro caído, cuerpo amplio y largo a la cadera',
      tela: 'Algodón peinado 100% // Jersey 240 g/m² // Cuello acanalado 1x1',
      gramaje: '240 g/m²',
      hombro: '+8 cm caído',
      largo: '74 cm (talla M)',
      combinaCon: 'Jean negro o blanco',
      jean: null,
    },
    {
      id: 'polera-jean-negro',
      name: 'Polera Oversize + Jean Negro',
      linea: 'Look completo',
      description: 'Con jean recto negro de tiro medio',
      tela: 'Polera: algodón 240 g/m² // Jean: denim 13 oz, pierna recta',
      gramaje: '240 g/m² + 13 oz',
      hombro: '+8 cm caído',
      largo: 'Polera a la cadera',
      combinaCon: 'Cualquier color',
      jean: 'negro',
    },
    {
      id: 'polera-jean-blanco',
      name: 'Polera Oversize + Jean Blanco',
      linea: 'Look completo',
      description: 'Con jean recto blanco de tiro medio',
      tela: 'Polera: algodón 240 g/m² // Jean: denim 13 oz blanco, pierna recta',
      gramaje: '240 g/m² + 13 oz',
      hombro: '+8 cm caído',
      largo: 'Polera a la cadera',
      combinaCon: 'Negro, guinda o gris',
      jean: 'blanco',
    },
  ];

  readonly selectedSilhouette = signal<SilhouetteOption>(this.silhouettes[0]);

  // Los cuatro colores de la polera oversize (mismos tonos que las fotos del catalogo).
  readonly colors: ColorOption[] = [
    { id: 'blanco', name: 'Blanco', hex: '#f4f3ef', label: '#f4f3ef' },
    { id: 'negro', name: 'Negro', hex: '#1d1d20', label: '#1d1d20' },
    { id: 'guinda', name: 'Guinda', hex: '#6b1a2b', label: '#6b1a2b' },
    { id: 'gris', name: 'Gris', hex: '#9a9ca2', label: '#9a9ca2' },
  ];

  readonly selectedColor = signal<ColorOption>(this.colors[1]);

  readonly sizes: SizeOption[] = [
    { id: 's', code: 'S', label: 'Chica', scaleX: 0.93, scaleY: 0.97, scaleZ: 0.93 },
    { id: 'm', code: 'M', label: 'Mediana', scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0 },
    { id: 'l', code: 'L', label: 'Grande', scaleX: 1.07, scaleY: 1.03, scaleZ: 1.06 },
    { id: 'xl', code: 'XL', label: 'Extra', scaleX: 1.14, scaleY: 1.06, scaleZ: 1.12 },
  ];

  readonly selectedSize = signal<SizeOption>(this.sizes[1]);

  // Modals state
  readonly isVipModalOpen = signal(false);
  readonly isApplicationModalOpen = signal(false);
  readonly isArModalOpen = signal(false);
  readonly selectedBoutiqueModal = signal<BoutiqueHouse | null>(null);
  readonly isLightboxOpen = signal(false);
  readonly lightboxImage = signal<{ url: string; title: string; subtitle: string } | null>(null);

  // Toast feedback
  readonly toastMessage = signal<string | null>(null);

  // Forms
  readonly vipBookingForm = new FormGroup({
    clientName: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    phone: new FormControl(''),
    atelier: new FormControl(this.tiendasReserva[0], [Validators.required]),
    date: new FormControl('2026-10-24', [Validators.required]),
    time: new FormControl('16:00', [Validators.required]),
    notes: new FormControl(''),
  });

  readonly applicationForm = new FormGroup({
    brandName: new FormControl('', [Validators.required]),
    designerName: new FormControl('', [Validators.required]),
    city: new FormControl('', [Validators.required]),
    portfolioUrl: new FormControl(''),
    collectionType: new FormControl('Poleras oversize y jeans', [Validators.required]),
    message: new FormControl(''),
  });

  // Ficha de tela de la prenda elegida en el probador
  readonly activeFabricSpec = computed(() => {
    return this.selectedSilhouette().tela;
  });

  // Action methods
  selectSilhouette(silhouette: SilhouetteOption) {
    this.selectedSilhouette.set(silhouette);
    if (this.virtualFittingComponent) {
      this.virtualFittingComponent.setSilhouette(silhouette);
    }
  }

  selectColor(color: ColorOption) {
    this.selectedColor.set(color);
    if (this.virtualFittingComponent) {
      this.virtualFittingComponent.setFabricColor(color);
    }
  }

  selectSize(size: SizeOption) {
    this.selectedSize.set(size);
    if (this.virtualFittingComponent) {
      this.virtualFittingComponent.setSize(size);
    }
  }

  openVipModal(prefillAtelier?: string) {
    if (prefillAtelier) {
      this.vipBookingForm.patchValue({ atelier: prefillAtelier });
    }
    this.isVipModalOpen.set(true);
  }

  closeVipModal() {
    this.isVipModalOpen.set(false);
  }

  submitVipBooking() {
    if (this.vipBookingForm.invalid) {
      this.showToast('Completá tu nombre, correo, tienda, fecha y hora para reservar la prueba.');
      return;
    }
    const val = this.vipBookingForm.value;
    this.closeVipModal();
    this.showToast(
      `Listo, ${val.clientName}: te esperamos en ${val.atelier} el ${val.date} a las ${val.time}. Para apartar una prenda con anticipo, ingresá a la tienda en línea.`
    );
    this.vipBookingForm.reset({
      atelier: this.tiendasReserva[0],
      date: '2026-10-24',
      time: '16:00',
    });
  }

  openApplicationModal() {
    this.isApplicationModalOpen.set(true);
  }

  closeApplicationModal() {
    this.isApplicationModalOpen.set(false);
  }

  submitApplication() {
    if (this.applicationForm.invalid) {
      this.showToast('Completá el nombre de la tienda, el responsable y la ciudad.');
      return;
    }
    const brand = this.applicationForm.value.brandName;
    this.closeApplicationModal();
    this.showToast(
      `Gracias, ${brand}. Un administrador de la plataforma revisará tu solicitud y te contactará para darte de alta.`
    );
    this.applicationForm.reset({
      collectionType: 'Poleras oversize y jeans',
    });
  }

  openBoutiqueModal(house: BoutiqueHouse) {
    this.selectedBoutiqueModal.set(house);
  }

  closeBoutiqueModal() {
    this.selectedBoutiqueModal.set(null);
  }

  openArModal() {
    this.isArModalOpen.set(true);
  }

  closeArModal() {
    this.isArModalOpen.set(false);
  }

  openLightbox(url: string, title: string, subtitle: string) {
    this.lightboxImage.set({ url, title, subtitle });
    this.isLightboxOpen.set(true);
  }

  closeLightbox() {
    this.isLightboxOpen.set(false);
    this.lightboxImage.set(null);
  }

  showToast(message: string) {
    this.toastMessage.set(message);
    setTimeout(() => {
      this.toastMessage.set(null);
    }, 5500);
  }

  scrollToSection(id: string) {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
    }
  }
}
