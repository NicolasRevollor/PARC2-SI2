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

export interface BoutiqueHouse {
  id: string;
  name: string;
  city: string;
  specialty: string;
  badge: string;
  description: string;
  skus: number;
  synchronized: boolean;
  leadTailor: string;
  fabrics: string[];
  established: string;
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
              Maison Umbrella
            </span>
          </span>
        </button>

        <!-- Status Pill -->
        <div class="hidden xl:flex items-center gap-2 px-3.5 py-1 bg-[#121316] rounded-full border border-[#7a1c30]/40">
          <span class="w-2 h-2 rounded-full bg-[#ffb2bb] animate-pulse"></span>
          <span class="text-[10px] tracking-widest uppercase text-[#ffb2bb] font-semibold font-mono">
            5 ATELIERS UNIFICADOS
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
          La Maison
        </button>
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('boutiques')"
        >
          Red de Boutiques
        </button>
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('boveda')"
        >
          Bóveda & Curaduría
        </button>
        <button
          type="button"
          class="text-[#ff8da1] text-xs uppercase tracking-widest font-semibold border-b border-[#ff8da1] pb-0.5 hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent"
          (click)="scrollToSection('probador-virtual')"
        >
          Probador RA 3D
        </button>
        <button
          type="button"
          class="text-[#c9c6bf] text-xs uppercase tracking-widest hover:text-[#ff8da1] hover:drop-shadow-[0_0_8px_rgba(255,141,161,0.5)] transition-all duration-300 cursor-pointer bg-transparent border-0"
          (click)="scrollToSection('precios')"
        >
          Membresías
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
          <span>Acceso Atelier</span>
        </button>
        <button
          type="button"
          class="inline-flex items-center justify-center px-5 py-2.5 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white text-xs uppercase tracking-widest rounded-full shadow-lg shadow-[#7a1c30]/30 hover:shadow-[0_0_25px_rgba(255,141,161,0.5)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border-0"
          (click)="openVipModal()"
        >
          Agendar Cita VIP
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
          <span>MAISON UMBRELLA // EDICIÓN 2026</span>
        </div>
        <span class="text-xs text-[#a48b8c] uppercase tracking-widest font-mono">
          Consorcio Internacional de Moda Unisex & Alta Sastrería Neutra
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
              El Ecosistema Insignia de las <span class="italic text-[#ffb2ba]">Casas de Autor</span> Unisex
            </h2>
          </div>
        </div>
        <div class="lg:col-span-4">
          <p class="font-body-lg text-sm sm:text-base text-[#dcc0c1] leading-relaxed mb-6 font-light">
            YouShop Collective unifica las boutiques independientes más audaces del mundo. Una plataforma paraguas que coordina bóvedas de archivo compartido, patronaje neutro y probadores WebXR 3D.
          </p>
          <div class="flex flex-wrap items-center gap-3">
            <button
              type="button"
              class="px-7 py-3.5 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border-0"
              (click)="scrollToSection('boutiques')"
            >
              Explorar Casas Asociadas
            </button>
            <button
              type="button"
              class="px-6 py-3.5 border border-[#564243] text-[#e3e2e6] rounded-full text-xs uppercase tracking-widest hover:bg-[#1f1f23] hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
              (click)="scrollToSection('probador-virtual')"
            >
              Terminal RA 3D
            </button>
          </div>
        </div>
      </div>

      <!-- Hero Curved Showcase: Exhibition Image with organic oval overlays -->
      <div class="relative rounded-[3rem] p-3 md:p-4 bg-gradient-to-b from-[#24262d] via-[#1a1b20] to-[#121316] border border-[#564243]/60 shadow-2xl overflow-hidden">
        <button
          type="button"
          class="relative w-full text-left rounded-[2.5rem] overflow-hidden aspect-[16/9] md:aspect-[21/9] cursor-pointer group border-0 p-0 block bg-black"
          (click)="openLightbox('https://lh3.googleusercontent.com/aida-public/AB6AXuCC2ZeV-0lBV9mERL8Mksp7cFNYteXudr32YGuEidHNOj06Sc5oXX7iJgJ4Nlp9P0aEdnuKI3KokH6cJqH7BVaPWDVSzx87gvdWDYEIDvFNPuvZRKgAulbeFr_-Cs0QRa1Oh5ERZ7ouZ_NWFO9E5apW8wMfTF6Qpj2_yfLcsqPP5YcD_dbG01_FfIJxsRHm5zsOl444-XpGfdN8-TvJWXSnmp3uNjYiHFWdkmuY05SR4RFm2zf8CiCp', 'Exhibición Permanente YouShop Collective', 'Pabellón Central A-01 // Muestra Volumétrica de Vanguardia')"
        >
          <img
            alt="Editorial luxury fashion showroom exhibition with architectural curved podiums, mannequins displaying avant-garde tailored unisex garments"
            class="w-full h-full object-cover object-center filter brightness-95 contrast-105 group-hover:scale-105 transition-transform duration-700"
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuCC2ZeV-0lBV9mERL8Mksp7cFNYteXudr32YGuEidHNOj06Sc5oXX7iJgJ4Nlp9P0aEdnuKI3KokH6cJqH7BVaPWDVSzx87gvdWDYEIDvFNPuvZRKgAulbeFr_-Cs0QRa1Oh5ERZ7ouZ_NWFO9E5apW8wMfTF6Qpj2_yfLcsqPP5YcD_dbG01_FfIJxsRHm5zsOl444-XpGfdN8-TvJWXSnmp3uNjYiHFWdkmuY05SR4RFm2zf8CiCp"
            referrerpolicy="no-referrer"
          />
          <div class="absolute inset-0 bg-gradient-to-t from-[#121316] via-transparent to-[#121316]/40 pointer-events-none"></div>

          <!-- Floating Organic Capsule 1 (Left: Showroom Node) -->
          <div class="absolute bottom-6 left-6 md:bottom-8 md:left-8 bg-[#18191d]/85 backdrop-blur-md border border-[#7a1c30]/50 rounded-full px-5 py-3 flex items-center gap-4 shadow-xl">
            <div class="w-10 h-10 rounded-full bg-[#7a1c30] flex items-center justify-center text-[#ffb2ba]">
              <span class="material-symbols-outlined">gallery_thumbnail</span>
            </div>
            <div>
              <div class="text-[11px] font-mono uppercase tracking-widest text-[#ffb2ba]">ATELIER CENTRAL // PABELLÓN A-01</div>
              <div class="font-headline-md text-sm text-white font-medium">Exhibición Permanente YouShop Collective</div>
            </div>
          </div>

          <!-- Floating Organic Capsule 2 (Right: Unified Boutiques Tag) -->
          <div class="hidden sm:flex absolute top-6 right-6 md:top-8 md:right-8 bg-[#18191d]/85 backdrop-blur-md border border-white/10 rounded-full px-5 py-2.5 items-center gap-3 shadow-xl">
            <div class="flex -space-x-2">
              <span class="w-7 h-7 rounded-full bg-[#7a1c30] border border-[#18191d] flex items-center justify-center text-[10px] font-bold text-white">MV</span>
              <span class="w-7 h-7 rounded-full bg-[#53101e] border border-[#18191d] flex items-center justify-center text-[10px] font-bold text-[#ffb2ba]">KS</span>
              <span class="w-7 h-7 rounded-full bg-[#292a2d] border border-[#18191d] flex items-center justify-center text-[10px] font-bold text-white">AR</span>
            </div>
            <span class="text-[11px] text-[#e3e2e6] tracking-wider uppercase font-semibold">5 Boutiques Curadas</span>
          </div>
        </button>
      </div>
    </div>
  </section>

  <!-- ================= BRAND COLLECTIVE / MAISON UMBRELLA SHOWCASE ================= -->
  <section class="py-20 md:py-28 bg-[#16171b] border-y border-[#564243]/30 relative" id="boutiques">
    <div class="max-w-7xl mx-auto px-6 md:px-8">
      <div class="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
        <div>
          <div class="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-[#7a1c30]/30 border border-[#7a1c30]/50 text-[#ffb2ba] text-xs uppercase tracking-widest mb-3 font-semibold">
            <span class="material-symbols-outlined text-sm">hub</span>
            <span>LA RED UNIFICADA</span>
          </div>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
            Nuestra Red de Boutiques & Tiendas de Autor
          </h2>
        </div>
        <p class="font-body-md text-sm sm:text-base text-[#a48b8c] max-w-md font-light">
          Como marca paraguas, YouShop unifica bajo un solo techo tecnológico y curatorial a talleres independientes que redefinen la silueta neutra.
        </p>
      </div>

      <!-- Curated Oval Boutique Cards (5 Houses) -->
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
              <span class="font-mono">{{ house.skus }} Siluetas en Bóveda</span>
              <span class="text-[#ff8da1] font-semibold flex items-center gap-1">
                <span class="w-1.5 h-1.5 rounded-full bg-[#ff8da1]"></span> Sincronizado
              </span>
            </div>
          </button>
        }

        <!-- House 5: Open Call / Convocatoria (Spans 2 columns on lg) -->
        <div class="lg:col-span-2 p-8 rounded-[2.5rem] bg-gradient-to-r from-[#1a1b20] via-[#24171d] to-[#1a1b20] border border-[#7a1c30]/60 flex flex-col sm:flex-row justify-between items-center gap-6 shadow-xl">
          <div class="max-w-md">
            <div class="flex items-center gap-2 mb-3">
              <span class="px-3 py-1 rounded-full bg-[#7a1c30] text-white text-[11px] font-mono tracking-widest uppercase">
                NUEVA ADMISIÓN
              </span>
              <span class="text-xs text-[#ffb2ba] uppercase tracking-wider font-semibold">
                Atelier Equipe — Zúrich
              </span>
            </div>
            <h3 class="font-headline-md text-2xl text-white mb-2">
              Convocatoria Abierta para Diseñadores de Autor
            </h3>
            <p class="text-xs text-[#a48b8c] leading-relaxed font-light">
              ¿Dirige una marca de moda unisex independiente? Integre su catálogo a la bóveda paraguas de YouShop Collective con probador 3D y logística global.
            </p>
          </div>
          <button
            type="button"
            class="px-6 py-3.5 bg-white text-[#121316] rounded-full text-xs uppercase tracking-widest font-semibold hover:bg-[#ffb2ba] hover:shadow-[0_0_25px_rgba(255,178,186,0.6)] hover:scale-105 active:scale-95 transition-all duration-300 whitespace-nowrap shadow-md cursor-pointer border-0"
            (click)="openApplicationModal()"
          >
            Postular Atelier
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
            ARCHIVOS DE ALTA COSTURA COLECTIVA
          </span>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
            La Curaduría Volumétrica & Textil
          </h2>
        </div>
        <p class="font-body-md text-sm sm:text-base text-[#a48b8c] max-w-md font-light">
          La ropa unisex no renuncia al detalle. Unimos la calidez táctil de la lana y el terciopelo guindo con la precisión escultórica del patronaje neutro.
        </p>
      </div>

      <!-- Editorial 2-Column Split: Image 16 (Models Campaign) + Image 15 (Macro Tailoring Detail) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
        <!-- Left: Collective Models Campaign (Image 16) -->
        <div class="lg:col-span-7 rounded-[3rem] p-3 bg-[#18191d] border border-[#564243]/50 shadow-2xl overflow-hidden group">
          <button
            type="button"
            class="relative w-full text-left rounded-[2.5rem] overflow-hidden aspect-[4/3] sm:aspect-[16/11] cursor-pointer border-0 p-0 block bg-black"
            (click)="openLightbox('https://lh3.googleusercontent.com/aida-public/AB6AXuBbiRKjaDyWSZoBROeAQBD0I3BYmlW6DQCL8MBjdQVOUnwUh8Z8uudEUU9TYZZFp5L6m3dk8-pKpojyadxfpfhz9D__sU6gQXNW66Xlqj-ICfdr2PcJ0Pt9tMhzmheypV_jgcVUnTlvGoPh7WVzbq18IxPfaUIyViEbWZzs1TJTRBW7xbn03CoHZSTcUIca1yi3Mu8zJaKT4Ty47WBMQ7ZOnwrNO3Z-91pkvX3_fmwair6ko_SvhFek', 'Campaña Unisex 2026.4', 'Blazer Monolítico Borgoña & Traje Plomizo Kuroda')"
          >
            <img
              alt="Three unisex models posing together in architectural fluid clothing, oversized minimalist blazers, muted charcoal and deep burgundy palettes"
              class="w-full h-full object-cover object-top group-hover:scale-105 transition-transform duration-700"
              src="https://lh3.googleusercontent.com/aida-public/AB6AXuBbiRKjaDyWSZoBROeAQBD0I3BYmlW6DQCL8MBjdQVOUnwUh8Z8uudEUU9TYZZFp5L6m3dk8-pKpojyadxfpfhz9D__sU6gQXNW66Xlqj-ICfdr2PcJ0Pt9tMhzmheypV_jgcVUnTlvGoPh7WVzbq18IxPfaUIyViEbWZzs1TJTRBW7xbn03CoHZSTcUIca1yi3Mu8zJaKT4Ty47WBMQ7ZOnwrNO3Z-91pkvX3_fmwair6ko_SvhFek"
              referrerpolicy="no-referrer"
            />
            <div class="absolute inset-0 bg-gradient-to-t from-[#121316] via-transparent to-transparent opacity-80 pointer-events-none"></div>

            <!-- Bottom Capsule Tag -->
            <div class="absolute bottom-6 left-6 right-6 flex flex-wrap items-center justify-between gap-3 bg-[#18191d]/85 backdrop-blur-md border border-[#7a1c30]/50 rounded-full px-5 py-3 pointer-events-none">
              <div>
                <span class="text-[10px] font-mono text-[#ffb2ba] uppercase tracking-widest block">CAMPAÑA UNISEX 2026.4</span>
                <span class="text-xs text-white font-medium">Blazer Monolítico Borgoña & Traje Plomizo Kuroda</span>
              </div>
              <span class="px-3 py-1 bg-[#7a1c30] text-white text-[11px] rounded-full font-mono">3 PIEZAS ACTIVAS</span>
            </div>
          </button>
        </div>

        <!-- Right: Macro Sastrería Detail (Image 15) + High Couture Spec -->
        <div class="lg:col-span-5 flex flex-col gap-6">
          <div class="rounded-[2.5rem] p-3 bg-[#18191d] border border-[#564243]/50 shadow-2xl overflow-hidden">
            <button
              type="button"
              class="relative w-full text-left rounded-[2rem] overflow-hidden aspect-[4/3] cursor-pointer group border-0 p-0 block bg-black"
              (click)="openLightbox('https://lh3.googleusercontent.com/aida-public/AB6AXuAcX5QHtCSIHbr-Y0c_Tizw4ZpiLHwpTq1LEjAHMUu19iLUQmlNcSyLEaKJpbcjsmHfulWNtrA7ldm71WeRKhcXO7Ts4TW52_fI6NzKYF-DXOeLZEY5licUrt1QMSQons15p6QvUAiANBEGv0d_fuz99xR0Af8QWiPaa7_lHh70vMW4pK5Igcu9vjFBkVyO54tqHnA404soz3iULaFIjP40DMyS0P5l_Ztlccb1fxuAlxGTpLRl0tRt', 'Macro Sastrería 14 SPI', 'Terciopelo Guindo & Lana de Alta Densidad')"
            >
              <img
                alt="Close-up of luxury atelier bespoke tailored blazer draped on a curved organic dark lead stone pedestal, rich deep wine burgundy velvet and charcoal fabric textures"
                class="w-full h-full object-cover object-center group-hover:scale-105 transition-transform duration-700"
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuAcX5QHtCSIHbr-Y0c_Tizw4ZpiLHwpTq1LEjAHMUu19iLUQmlNcSyLEaKJpbcjsmHfulWNtrA7ldm71WeRKhcXO7Ts4TW52_fI6NzKYF-DXOeLZEY5licUrt1QMSQons15p6QvUAiANBEGv0d_fuz99xR0Af8QWiPaa7_lHh70vMW4pK5Igcu9vjFBkVyO54tqHnA404soz3iULaFIjP40DMyS0P5l_Ztlccb1fxuAlxGTpLRl0tRt"
                referrerpolicy="no-referrer"
              />
              <div class="absolute top-4 right-4 bg-[#121316]/90 backdrop-blur rounded-full px-4 py-1.5 border border-[#7a1c30]/60 text-[#ffb2ba] text-[11px] font-mono uppercase tracking-wider pointer-events-none">
                MACRO TEST // 14 SPI
              </div>
            </button>
          </div>

          <!-- Organic Rounded Specs Panel -->
          <div class="rounded-[2.5rem] p-7 bg-[#1c1d22] border border-[#564243]/40 flex flex-col justify-between">
            <div>
              <div class="flex items-center gap-2 mb-3">
                <span class="material-symbols-outlined text-[#ff8da1]">straighten</span>
                <h3 class="font-headline-md text-xl text-white">Patrón Neutro & Caída Escultórica</h3>
              </div>
              <p class="text-xs text-[#a48b8c] leading-relaxed mb-4 font-light">
                Despliegue de cortes fluidos adaptables a 3 tipos de fisonomías sin recurrir a encasillamientos de género binario. Terciopelo guindo imperial combinado con solapas de carbón mate.
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3 pt-3 border-t border-[#564243]/30 text-[11px]">
              <div class="flex items-center gap-2 text-[#dcc0c1]">
                <span class="w-2 h-2 rounded-full bg-[#ff8da1]"></span>
                <span>Lana 180s & Velour</span>
              </div>
              <div class="flex items-center gap-2 text-[#dcc0c1]">
                <span class="w-2 h-2 rounded-full bg-[#ff8da1]"></span>
                <span>Calibración 3D Submilimétrica</span>
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
              WEBXR & MOTOR 3D ATELIER
            </span>
            <span class="flex items-center gap-2 text-xs text-[#ffb2bb] font-mono tracking-wider uppercase">
              <span class="w-2 h-2 rounded-full bg-[#ff8da1] animate-ping"></span>
              MOTOR VOLUMÉTRICO ACTIVO
            </span>
          </div>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
            Probador Virtual 3D & Escaneo RA
          </h2>
        </div>
        <p class="font-body-md text-sm sm:text-base text-[#a48b8c] max-w-md font-light">
          Examine la silueta en 360°, la caída del terciopelo y la precisión de pespunte macro en guindo y plomizo antes de reservar la pieza en bóveda.
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
                  ESCANEO 3D // NODO ATELIER
                </span>
              </div>
              <div class="flex items-center gap-3">
                <span class="px-3 py-1 rounded-full bg-[#22242a] text-[#e3e2e6] text-[11px] font-mono tracking-wider border border-white/5">
                  XYZ: {{ virtualFittingComponent?.coordinatesReadout() || '[0.00, +1.05, 0.32]' }}
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
                MOTOR WEBGL 2.0 // HIGH PRECISION
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
                    CONSOLA COLECTIVA
                  </span>
                  <h3 class="font-headline-md text-2xl text-white">Parametrización Atelier</h3>
                </div>
                <span class="px-3.5 py-1.5 bg-[#22242a] rounded-full border border-[#564243] text-xs text-[#ffb2ba] font-mono">
                  COLLECTIVE-2026
                </span>
              </div>

              <!-- Silhouette Selector -->
              <div class="mb-6">
                <span class="block text-xs uppercase tracking-widest text-[#a48b8c] font-semibold mb-3">
                  Silueta de Autor Seleccionada
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

              <!-- Paleta Cromática Guindo & Plomizo -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs uppercase tracking-widest text-[#a48b8c] font-semibold">
                    Paleta Cromática Oficial
                  </span>
                  <span class="text-xs uppercase tracking-wider text-[#ff8da1] font-mono font-bold">
                    {{ selectedColor().name }} ({{ selectedColor().hex }})
                  </span>
                </div>
                <div class="grid grid-cols-5 gap-2.5">
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

              <!-- Tallas Volumétricas Neutras -->
              <div class="mb-6">
                <div class="flex items-center justify-between mb-3">
                  <span class="text-xs uppercase tracking-widest text-[#a48b8c] font-semibold">
                    Tallas Anatómicas Neutras
                  </span>
                  <button
                    type="button"
                    class="text-[11px] text-[#ff8da1] font-bold cursor-pointer hover:underline font-mono border-0 bg-transparent p-0"
                    (click)="showToast('Guía Biometría 3D: Patronaje adaptativo computacional para busto de 84 a 112 cm.')"
                  >
                    Biometría 3D
                  </button>
                </div>
                <div class="grid grid-cols-3 gap-2.5">
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

              <!-- Telemetría de Costura Box -->
              <div class="p-5 bg-[#121316] rounded-3xl border border-[#564243]/50 mb-6">
                <div class="flex items-center justify-between mb-3 pb-2 border-b border-[#564243]/30">
                  <span class="text-[11px] font-mono uppercase tracking-widest text-[#ffb2ba] font-bold flex items-center gap-1.5">
                    <span class="material-symbols-outlined text-sm text-[#ff8da1]">straighten</span>
                    Confección Submilimétrica
                  </span>
                  <span class="text-[10px] text-[#ff8da1] font-mono font-bold">14 SPI // OPTIMAL</span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Tensión de Hilo:</span>
                    <span class="font-semibold text-white font-mono">{{ selectedSilhouette().tension }}</span>
                  </div>
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Holgura Hombro:</span>
                    <span class="font-semibold text-white font-mono">{{ selectedSilhouette().allowance }}</span>
                  </div>
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Caída de Tejido:</span>
                    <span class="font-semibold text-[#ffb2ba] font-mono">{{ selectedSilhouette().fluidity }}</span>
                  </div>
                  <div>
                    <span class="text-[#a48b8c] block text-[10px]">Bóveda de Asignación:</span>
                    <span class="font-semibold text-[#ff8da1] font-mono">{{ selectedSilhouette().vault }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- AR Action Button (Curved Oval Pill) -->
            <button
              type="button"
              class="w-full py-4 px-6 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold flex items-center justify-center gap-3 shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_35px_rgba(255,141,161,0.6)] hover:brightness-110 active:scale-98 transition-all duration-300 cursor-pointer border-0"
              (click)="openArModal()"
            >
              <span class="material-symbols-outlined text-base">view_in_ar</span>
              <span>Lanzar Escaneo en Realidad Aumentada (WebXR)</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- ================= PRICING & ATELIER MEMBERSHIPS (Organic Pill Shaped Cards) ================= -->
  <section class="py-24 bg-[#121316] relative" id="precios">
    <div class="max-w-7xl mx-auto px-6 md:px-8">
      <div class="text-center max-w-2xl mx-auto mb-16">
        <div class="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-[#7a1c30]/20 text-[#ffb2ba] border border-[#7a1c30]/50 text-xs uppercase tracking-widest mb-3 font-semibold">
          <span>MEMBRESÍAS COLECTIVAS</span>
        </div>
        <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight">
          Alianzas de Despliegue & Infraestructura
        </h2>
        <p class="font-body-md text-sm text-[#a48b8c] mt-3 font-light">
          Integre su marca a la plataforma YouShop Collective y acceda a la bóveda central compartida y tecnología WebXR.
        </p>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-3 gap-8 items-stretch">
        <!-- Tier 1 -->
        <div class="p-8 rounded-[3rem] bg-[#18191d] border border-[#564243]/50 flex flex-col justify-between hover:border-[#7a1c30] transition-colors shadow-lg">
          <div>
            <span class="text-[11px] font-mono text-[#a48b8c] uppercase tracking-widest block mb-2">TIER EMERGENTE</span>
            <h3 class="font-headline-md text-2xl text-white mb-2">Boutique Afiliada</h3>
            <p class="text-xs text-[#a48b8c] mb-6 font-light">Para casas de autor con hasta 2 sedes y catálogo curado.</p>
            <div class="font-headline-lg text-4xl text-white mb-6">
              240 <span class="text-sm font-normal text-[#a48b8c]">Bs / mes</span>
            </div>
            <ul class="space-y-3.5 text-xs text-[#dcc0c1] mb-8 border-t border-[#564243]/30 pt-6">
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Hasta 500 SKUs compartidos
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Integración a catálogo YouShop Collective
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Sincronización en tiempo real de inventario
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="w-full py-3.5 text-center border border-[#564243] text-white rounded-full text-xs uppercase tracking-widest hover:bg-[#22242a] hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
            (click)="openApplicationModal()"
          >
            Postular Afiliación
          </button>
        </div>

        <!-- Tier 2 (Highlighted Guindo Imperial) -->
        <div class="p-8 rounded-[3rem] bg-gradient-to-b from-[#25151b] via-[#1f161a] to-[#18191d] border-2 border-[#7a1c30] flex flex-col justify-between relative shadow-2xl shadow-[#7a1c30]/20">
          <div class="absolute -top-3.5 right-8 px-4 py-1 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white text-[10px] font-mono tracking-widest uppercase rounded-full shadow-md">
            MÁS DESPLEGADO
          </div>
          <div>
            <span class="text-[11px] font-mono text-[#ffb2ba] uppercase tracking-widest block mb-2">TIER COLECTIVO</span>
            <h3 class="font-headline-md text-2xl text-white mb-2">Maison Colectiva</h3>
            <p class="text-xs text-[#dcc0c1] mb-6 font-light">Para boutiques con ventas internacionales y probador virtual.</p>
            <div class="font-headline-lg text-4xl text-white mb-6">
              680 <span class="text-sm font-normal text-[#a48b8c]">Bs / mes</span>
            </div>
            <ul class="space-y-3.5 text-xs text-white mb-8 border-t border-[#7a1c30]/40 pt-6">
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                SKUs ilimitados y variantes neutras
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Motor Probador Virtual RA 3D exclusivo
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Acceso a la Bóveda Central de Zúrich
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Sello de certificación YouShop Collective
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="w-full py-3.5 text-center bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 shadow-lg shadow-[#7a1c30]/40 cursor-pointer border-0"
            (click)="openVipModal('Maison Colectiva // Alianza Premium')"
          >
            Unirse a la Maison
          </button>
        </div>

        <!-- Tier 3 -->
        <div class="p-8 rounded-[3rem] bg-[#18191d] border border-[#564243]/50 flex flex-col justify-between hover:border-[#7a1c30] transition-colors shadow-lg">
          <div>
            <span class="text-[11px] font-mono text-[#a48b8c] uppercase tracking-widest block mb-2">TIER GLOBAL</span>
            <h3 class="font-headline-md text-2xl text-white mb-2">Bóveda Sovereign</h3>
            <p class="text-xs text-[#a48b8c] mb-6 font-light">Infraestructura privada y custodia física de colecciones de autor.</p>
            <div class="font-headline-lg text-4xl text-white mb-6">
              A Medida
            </div>
            <ul class="space-y-3.5 text-xs text-[#dcc0c1] mb-8 border-t border-[#564243]/30 pt-6">
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Nodo servidor propio en Ginebra o Tokio
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Modelado 3D dedicado de cada nueva colección
              </li>
              <li class="flex items-center gap-2.5">
                <span class="material-symbols-outlined text-[#ff8da1] text-sm">check</span>
                Atención ejecutiva VIP 24/7
              </li>
            </ul>
          </div>
          <button
            type="button"
            class="w-full py-3.5 text-center border border-[#564243] text-white rounded-full text-xs uppercase tracking-widest hover:bg-[#22242a] hover:border-[#ff8da1] hover:text-white hover:shadow-[0_0_20px_rgba(255,141,161,0.3)] transition-all duration-300 cursor-pointer bg-transparent"
            (click)="openVipModal('Bóveda Sovereign // Audiencia Exclusiva')"
          >
            Solicitar Audiencia VIP
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
            CONEXIÓN GLOBAL COLECTIVA
          </span>
          <h2 class="font-headline-lg text-3xl sm:text-5xl text-white tracking-tight leading-snug mb-6">
            Unifique el Futuro de su Firma bajo la Maison YouShop
          </h2>
          <p class="font-body-lg text-sm sm:text-base text-[#dcc0c1] mb-10 leading-relaxed font-light">
            Conectamos a las boutiques más vanguardistas con clientes selectos a través de realidad aumentada, bóveda compartida y gestión de stock sin fronteras de género.
          </p>
          <div class="flex flex-col sm:flex-row items-center justify-center gap-4">
            <button
              type="button"
              class="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold shadow-lg shadow-[#7a1c30]/40 hover:shadow-[0_0_30px_rgba(255,141,161,0.55)] hover:brightness-110 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer border-0"
              (click)="openApplicationModal()"
            >
              Iniciar Afiliación de Marca
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
          © 2026 YouShop Collective Inc. Maison Umbrella & Archivo de Moda Unisex.
        </p>
      </div>
      <div class="flex flex-wrap justify-center md:justify-end gap-6 text-xs text-[#a48b8c] uppercase tracking-wider">
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="scrollToSection('umbrella')">Manifiesto</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="scrollToSection('boutiques')">Red de Boutiques</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="scrollToSection('probador-virtual')">Terminal WebXR</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="enterLogin.emit()">Acceso Bóveda</button>
        <button type="button" class="hover:text-[#ff8da1] transition-colors cursor-pointer bg-transparent border-0" (click)="openVipModal()">Contacto VIP</button>
      </div>
    </div>
  </footer>

  <!-- ================= MODALS & OVERLAYS ================= -->

  <!-- 1. VIP Private Fitting Booking Modal -->
  @if (isVipModalOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-lg bg-[#18191d] border border-[#7a1c30] rounded-[2.5rem] p-8 shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block">
              CONCIERGE PRIVADO VIP
            </span>
            <h3 class="font-headline-md text-2xl text-white">Agendar Cita Privada & Fitting</h3>
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
              placeholder="Ej. Conde Nicolás de Montmirail"
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
                placeholder="cliente@haute.com"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
            <div>
              <label for="vipPhone" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Teléfono Directo</label>
              <input
                id="vipPhone"
                type="tel"
                formControlName="phone"
                placeholder="+33 1 42 68 00 00"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label for="vipAtelierSelect" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Atelier / Maison Solicitada</label>
            <select
              id="vipAtelierSelect"
              formControlName="atelier"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            >
              <option value="Maison Valmont (París)">Maison Valmont (París // Haute Couture)</option>
              <option value="Kuroda Studio (Tokio)">Kuroda Studio (Tokio // Vanguardia Textil)</option>
              <option value="Atelier Revuelto (Santa Cruz)">Atelier Revuelto (Santa Cruz // Atelier Andino)</option>
              <option value="Sartoria Ginza (Ginza)">Sartoria Ginza (Ginza // Minimalismo Formal)</option>
              <option value="Bóveda Central (Zúrich)">Bóveda Central (Zúrich // Selección Múltiple)</option>
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
            <label for="vipNotes" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Preferencias de Salón & Medidas</label>
            <textarea
              id="vipNotes"
              rows="2"
              formControlName="notes"
              placeholder="Acompañantes, copa de bienvenida, prendas específicas a probar..."
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
              Confirmar Audiencia VIP
            </button>
          </div>
        </form>
      </div>
    </div>
  }

  <!-- 2. Atelier Application Modal -->
  @if (isApplicationModalOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-lg bg-[#18191d] border border-[#7a1c30]/70 rounded-[2.5rem] p-8 shadow-2xl max-h-[90vh] overflow-y-auto">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block">
              CONVOCATORIA INTERNACIONAL
            </span>
            <h3 class="font-headline-md text-2xl text-white">Postular Atelier a YouShop</h3>
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
            <label for="appBrandName" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Nombre de la Firma / Marca</label>
            <input
              id="appBrandName"
              type="text"
              formControlName="brandName"
              placeholder="Ej. Atelier Equipe"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            />
          </div>

          <div class="grid grid-cols-2 gap-4">
            <div>
              <label for="appDesigner" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Diseñador Principal</label>
              <input
                id="appDesigner"
                type="text"
                formControlName="designerName"
                placeholder="Ej. Laurent Keller"
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
            <div>
              <label for="appCity" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Ciudad Sede</label>
              <input
                id="appCity"
                type="text"
                formControlName="city"
                placeholder="Zúrich / Milán / etc."
                class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label for="appPortfolio" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Lookbook Digital o Web</label>
            <input
              id="appPortfolio"
              type="url"
              formControlName="portfolioUrl"
              placeholder="https://su-atelier.com"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            />
          </div>

          <div>
            <label for="appCollectionType" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Línea de Patronaje</label>
            <select
              id="appCollectionType"
              formControlName="collectionType"
              class="w-full px-4 py-3 rounded-full bg-[#121316] border border-[#564243] text-white text-sm focus:border-[#7a1c30] focus:outline-none"
            >
              <option value="Unisex Haute Sastrerie">Unisex Haute Sastrerie (Sastrería neutra estructurada)</option>
              <option value="Drapé & Kimono Contemporáneo">Drapé & Kimono Contemporáneo</option>
              <option value="Denim & Textil Artesanal">Denim & Textil Artesanal de Edición Limitada</option>
              <option value="Prendas de Abrigo Arquitectónicas">Prendas de Abrigo Arquitectónicas</option>
            </select>
          </div>

          <div>
            <label for="appMessage" class="block text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-1">Manifiesto Textil / Comentarios</label>
            <textarea
              id="appMessage"
              rows="3"
              formControlName="message"
              placeholder="Describa su filosofía de patronaje y tiradas anuales..."
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
              Enviar Candidatura
            </button>
          </div>
        </form>
      </div>
    </div>
  }

  <!-- 3. Boutique Details Archival Modal -->
  @if (selectedBoutiqueModal(); as house) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-xl bg-[#18191d] border border-[#7a1c30] rounded-[2.5rem] p-8 shadow-2xl">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div>
            <span class="text-[10px] font-mono uppercase tracking-widest text-[#ff8da1] font-bold block">
              ARCHIVO DE CASA ASOCIADA
            </span>
            <h3 class="font-headline-md text-2xl text-white">{{ house.name }}</h3>
            <span class="text-xs text-[#a48b8c]">{{ house.city }} // Desde {{ house.established }}</span>
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
            <div class="text-xs font-mono uppercase text-[#ffb2ba] mb-2 font-bold">Dirección Creativa & Confección</div>
            <div class="text-sm font-semibold text-white">{{ house.leadTailor }}</div>
          </div>

          <div>
            <div class="text-xs uppercase tracking-wider text-[#a48b8c] font-semibold mb-2">Materiales Distintivos en Bóveda</div>
            <div class="flex flex-wrap gap-2">
              @for (fabric of house.fabrics; track fabric) {
                <span class="px-3 py-1 bg-[#22242a] text-[#ffb2ba] rounded-full text-xs font-mono border border-white/10">
                  {{ fabric }}
                </span>
              }
            </div>
          </div>

          <div class="flex items-center justify-between pt-4 border-t border-[#564243]/30">
            <div class="text-xs text-[#dcc0c1]">
              <span class="font-mono text-white font-bold">{{ house.skus }}</span> Siluetas sincronizadas en WebXR
            </div>
            <button
              type="button"
              class="px-6 py-2.5 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold hover:brightness-110 cursor-pointer border-0"
              (click)="closeBoutiqueModal(); openVipModal(house.name)"
            >
              Agendar en este Atelier
            </button>
          </div>
        </div>
      </div>
    </div>
  }

  <!-- 4. WebXR AR Modal Simulator -->
  @if (isArModalOpen()) {
    <div class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md" role="dialog" aria-modal="true">
      <div class="relative w-full max-w-2xl bg-[#121316] border border-[#ff8da1]/60 rounded-[3rem] p-8 shadow-2xl overflow-hidden text-center">
        <div class="flex items-center justify-between pb-4 mb-6 border-b border-[#564243]/40">
          <div class="flex items-center gap-2">
            <span class="w-3 h-3 rounded-full bg-[#ff8da1] animate-ping"></span>
            <span class="text-xs font-mono uppercase tracking-widest text-[#ffb2ba] font-bold">
              TERMINAL WEBXR // PROBADOR ESPACIAL 3D
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

        <!-- AR Screen Simulation -->
        <div class="relative w-full h-72 rounded-3xl bg-gradient-to-b from-[#18191d] via-[#1f161a] to-[#0f1013] border border-[#7a1c30]/50 flex flex-col items-center justify-center overflow-hidden mb-6 p-6">
          <!-- LiDAR Scanner Visual Grid -->
          <div class="absolute inset-0 bg-[radial-gradient(#7a1c30_1px,transparent_1px)] [background-size:16px_16px] opacity-40"></div>
          <div class="absolute w-48 h-48 border-2 border-dashed border-[#ff8da1]/70 rounded-full animate-spin" style="animation-duration: 25s;"></div>

          <div class="relative z-10 flex flex-col items-center gap-3">
            <div class="w-16 h-16 rounded-full bg-[#7a1c30]/30 border border-[#ff8da1] flex items-center justify-center text-[#ffb2ba] shadow-lg shadow-[#7a1c30]/50">
              <span class="material-symbols-outlined text-3xl">view_in_ar</span>
            </div>
            <div class="font-headline-md text-xl text-white">
              Escaneo Espacial Calibrado
            </div>
            <p class="text-xs text-[#dcc0c1] max-w-md">
              {{ selectedSilhouette().name }} proyectado en escala 1:1. Apunte la cámara de su dispositivo móvil a una superficie plana o active el sensor LiDAR.
            </p>
          </div>

          <div class="absolute bottom-4 left-6 text-[10px] font-mono text-[#ffb2ba]">
            LiDAR: LOCK 99.4% // ANCLAJE ESPACIAL OK
          </div>
          <div class="absolute bottom-4 right-6 text-[10px] font-mono text-[#ff8da1]">
            COLOR: {{ selectedColor().name | uppercase }}
          </div>
        </div>

        <div class="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div class="text-left">
            <div class="text-xs font-mono uppercase text-white font-bold">¿Desea escanear con su Smartphone?</div>
            <div class="text-[11px] text-[#a48b8c]">Compatible con Apple Vision Pro, iPhone LiDAR y Android ARCore.</div>
          </div>
          <button
            type="button"
            class="px-6 py-3 bg-gradient-to-r from-[#7a1c30] to-[#9b1d3d] text-white rounded-full text-xs uppercase tracking-widest font-semibold hover:brightness-110 shadow-lg cursor-pointer border-0"
            (click)="showToast('Enlace de sesión WebXR enviado a su dispositivo.'); closeArModal()"
          >
            Proyectar en Mi Dispositivo
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

  // Curated Houses
  readonly boutiques = signal<BoutiqueHouse[]>([
    {
      id: 'valmont',
      name: 'Maison Valmont',
      city: 'París',
      specialty: 'Haute Couture',
      badge: 'PARÍS // HAUTE COUTURE',
      description:
        'Especialistas en satén pesado, solapas fluidas y capas envolventes sin corte de género. Piezas numeradas de producción artesanal en París.',
      skus: 18,
      synchronized: true,
      leadTailor: 'Élise Delacroix & Jean-Marc Vidal',
      fabrics: ['Satén Duchesse 420g', 'Lana Merino 180s', 'Terciopelo Guindo'],
      established: '2019',
    },
    {
      id: 'kuroda',
      name: 'Kuroda Studio',
      city: 'Tokio',
      specialty: 'Vanguardia Textil',
      badge: 'TOKIO // VANGUARDIA TEXTIL',
      description:
        'Denim selvedge de 14.5oz, teñido vegetal y volúmenes kimono con costuras termo-selladas para clima templado e invierno.',
      skus: 24,
      synchronized: true,
      leadTailor: 'Kenji Kuroda',
      fabrics: ['Denim Selvedge 14.5oz', 'Lino Kurume', 'Algodón Orgánico Índigo'],
      established: '2016',
    },
    {
      id: 'revuelto',
      name: 'Atelier Revuelto',
      city: 'Santa Cruz',
      specialty: 'Atelier Andino',
      badge: 'SANTA CRUZ // ATELIER ANDINO',
      description:
        'Sastrería ejecutiva contemporánea en lanas ligeras, patronaje oversize relajado y tonos tierra minerales andinos.',
      skus: 32,
      synchronized: true,
      leadTailor: 'Mateo Revuelto & Sofía Banzer',
      fabrics: ['Lana de Vicuña y Alpaca', 'Algodón Pima', 'Lana Tropical Fina'],
      established: '2021',
    },
    {
      id: 'ginza',
      name: 'Sartoria Ginza',
      city: 'Ginza',
      specialty: 'Minimalismo Formal',
      badge: 'GINZA // MINIMALISMO FORMAL',
      description:
        'Estructuras geométricas puras con botones de cuerno y cierres magnéticos ocultos. Confección milimétrica para ejecutivos de vanguardia.',
      skus: 14,
      synchronized: true,
      leadTailor: 'Hiroshi Tanaka',
      fabrics: ['Lana Cruda Esculpida', 'Seda Habotai Mate', 'Cuerno de Búfalo'],
      established: '2018',
    },
  ]);

  // Silhouettes in 3D fitting console
  readonly silhouettes: SilhouetteOption[] = [
    {
      id: 'valmont',
      name: 'Blazer Ejecutivo Monolítico (Valmont)',
      atelier: 'Atelier Valmont',
      description: 'Solapa continua envolvente en guindo y carbón',
      defaultFabric: 'Caída Textil: Terciopelo Guindo 180s (380g/m²) // Mate Reforzado',
      tension: '0.42 N (Suave)',
      allowance: '+1.8 cm Confort',
      fluidity: '98.4% Natural Fluid',
      vault: 'Zúrich / Central',
    },
    {
      id: 'kuroda',
      name: 'Sobretodo Drapé Kuroda (Tokio)',
      atelier: 'Kuroda Studio',
      description: 'Largo 125cm, hombro sin costura rígida',
      defaultFabric: 'Caída Textil: Denim Selvedge & Lana Cardada 420g // Caída Rígida-Fluida',
      tension: '0.55 N (Firme)',
      allowance: '+3.2 cm Confort',
      fluidity: '94.2% Structured Flow',
      vault: 'Tokio / Nihonbashi',
    },
    {
      id: 'ginza',
      name: 'Traje Sartoria Ginza Minimal',
      atelier: 'Sartoria Ginza',
      description: 'Cierre magnético oculto y silueta recta',
      defaultFabric: 'Caída Textil: Lana Fina 160s & Cierres Magnéticos de Neodimio',
      tension: '0.38 N (Ultra Preciso)',
      allowance: '+1.2 cm Ajuste Arquitectónico',
      fluidity: '99.1% Geometric Balance',
      vault: 'Ginza / Flagship',
    },
  ];

  readonly selectedSilhouette = signal<SilhouetteOption>(this.silhouettes[0]);

  // Color Swatches
  readonly colors: ColorOption[] = [
    { id: 'wine', name: 'Guindo Imperial', hex: '#7a1c30', label: '#7a1c30' },
    { id: 'lead', name: 'Negro Plomizo', hex: '#18181b', label: '#18181b' },
    { id: 'deep-burgundy', name: 'Borgoña Profundo', hex: '#53101e', label: '#53101e' },
    { id: 'charcoal', name: 'Carbón Grafito', hex: '#2c2d33', label: '#2c2d33' },
    { id: 'ivory', name: 'Marfil Archivo', hex: '#d9d6d0', label: '#d9d6d0' },
  ];

  readonly selectedColor = signal<ColorOption>(this.colors[0]);

  // Sizes
  readonly sizes: SizeOption[] = [
    { id: 'slim', code: '01', label: 'Slim Fluid', scaleX: 0.92, scaleY: 1.02, scaleZ: 0.92 },
    { id: 'classic', code: '02', label: 'Classic Arch', scaleX: 1.0, scaleY: 1.0, scaleZ: 1.0 },
    { id: 'oversize', code: '03', label: 'Oversize', scaleX: 1.15, scaleY: 1.05, scaleZ: 1.12 },
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
    atelier: new FormControl('Maison Valmont (París)', [Validators.required]),
    date: new FormControl('2026-10-24', [Validators.required]),
    time: new FormControl('16:00', [Validators.required]),
    notes: new FormControl(''),
  });

  readonly applicationForm = new FormGroup({
    brandName: new FormControl('', [Validators.required]),
    designerName: new FormControl('', [Validators.required]),
    city: new FormControl('', [Validators.required]),
    portfolioUrl: new FormControl(''),
    collectionType: new FormControl('Unisex Haute Sastrerie', [Validators.required]),
    message: new FormControl(''),
  });

  // Telemetry details derived from active silhouette
  readonly activeFabricSpec = computed(() => {
    return this.selectedSilhouette().defaultFabric;
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
      this.showToast('Por favor complete los campos obligatorios para agendar su cita.');
      return;
    }
    const val = this.vipBookingForm.value;
    this.closeVipModal();
    this.showToast(
      `Cita VIP confirmada con ${val.atelier} para ${val.clientName} el ${val.date} a las ${val.time}. Recibirá confirmación en ${val.email}.`
    );
    this.vipBookingForm.reset({
      atelier: 'Maison Valmont (París)',
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
      this.showToast('Por favor complete los datos requeridos de su atelier.');
      return;
    }
    const brand = this.applicationForm.value.brandName;
    this.closeApplicationModal();
    this.showToast(
      `Dossier de postulación recibido para ${brand}. Nuestro comité curatorial se comunicará en menos de 48 horas.`
    );
    this.applicationForm.reset({
      collectionType: 'Unisex Haute Sastrerie',
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
