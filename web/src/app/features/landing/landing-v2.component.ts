import {
  ChangeDetectionStrategy,
  Component,
  EventEmitter,
  HostListener,
  Output,
  computed,
  signal,
} from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

type ProductCategory = 'todos' | 'poleras' | 'jeans';

interface StoreProduct {
  id: string;
  name: string;
  category: Exclude<ProductCategory, 'todos'>;
  color: string;
  description: string;
  image: string;
  backImage: string;
  swatch: string;
  badge?: string;
}

interface BoutiqueHouse {
  id: string;
  name: string;
  city: string;
  neighborhood: string;
  description: string;
  skus: number;
  sucursales: string;
  destacados: string[];
  established: string;
  tiendaReserva: string;
  tone: string;
}

interface BusinessPlan {
  name: string;
  price: string;
  description: string;
  features: string[];
  featured?: boolean;
}

interface LightboxImage {
  url: string;
  title: string;
  subtitle: string;
}

function localIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function futureDate(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localIsoDate(date);
}

@Component({
  selector: 'app-landing',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  templateUrl: './landing-v2.component.html',
  styleUrl: './landing-v2.component.css',
})
export class LandingComponent {
  @Output() enterLogin = new EventEmitter<void>();

  readonly menuOpen = signal(false);
  readonly navCompact = signal(false);
  readonly scrollProgress = signal(0);
  readonly productFilter = signal<ProductCategory>('todos');
  readonly selectedLookColor = signal<'blanca' | 'negra' | 'guinda' | 'gris'>('guinda');
  readonly selectedLookJean = signal<'negro' | 'blanco'>('negro');
  readonly selectedBoutiqueModal = signal<BoutiqueHouse | null>(null);
  readonly isVipModalOpen = signal(false);
  readonly isApplicationModalOpen = signal(false);
  readonly lightboxImage = signal<LightboxImage | null>(null);
  readonly toastMessage = signal<string | null>(null);
  readonly enviando = signal(false);

  readonly minBookingDate = localIsoDate(new Date());
  readonly defaultBookingDate = futureDate(2);

  readonly products: StoreProduct[] = [
    {
      id: 'polera-guinda',
      name: 'Oversize Guinda',
      category: 'poleras',
      color: 'Guinda',
      description: 'Algodón peinado · 240 g/m² · Hombro caído',
      image: '/productos/polera-oversize-guinda.jpg',
      backImage: '/productos/polera-oversize-guinda-espalda.jpg',
      swatch: '#7a233d',
      badge: 'Favorita',
    },
    {
      id: 'polera-blanca',
      name: 'Oversize Blanca',
      category: 'poleras',
      color: 'Blanco',
      description: 'Algodón peinado · 240 g/m² · Hombro caído',
      image: '/productos/polera-oversize-blanca.jpg',
      backImage: '/productos/polera-oversize-blanca-espalda.jpg',
      swatch: '#f4f1e9',
      badge: 'Esencial',
    },
    {
      id: 'polera-negra',
      name: 'Oversize Negra',
      category: 'poleras',
      color: 'Negro',
      description: 'Algodón peinado · 240 g/m² · Hombro caído',
      image: '/productos/polera-oversize-negra.jpg',
      backImage: '/productos/polera-oversize-negra-espalda.jpg',
      swatch: '#18181b',
    },
    {
      id: 'polera-gris',
      name: 'Oversize Gris',
      category: 'poleras',
      color: 'Gris',
      description: 'Algodón peinado · 240 g/m² · Hombro caído',
      image: '/productos/polera-oversize-gris.jpg',
      backImage: '/productos/polera-oversize-gris-espalda.jpg',
      swatch: '#a7a8ad',
    },
    {
      id: 'jean-negro',
      name: 'Jean Recto Negro',
      category: 'jeans',
      color: 'Negro',
      description: 'Denim 13 oz · Tiro medio · Pierna recta',
      image: '/productos/jeans-negro.jpg',
      backImage: '/productos/jeans-negro-espalda.jpg',
      swatch: '#25262b',
      badge: 'Combina con todo',
    },
    {
      id: 'jean-blanco',
      name: 'Jean Recto Blanco',
      category: 'jeans',
      color: 'Blanco',
      description: 'Denim 13 oz · Tiro medio · Pierna recta',
      image: '/productos/jeans-blanco.jpg',
      backImage: '/productos/jeans-blanco-espalda.jpg',
      swatch: '#efede6',
    },
  ];

  readonly filteredProducts = computed(() => {
    const filter = this.productFilter();
    return filter === 'todos'
      ? this.products
      : this.products.filter((product) => product.category === filter);
  });

  readonly lookShirtImage = computed(
    () => `/productos/recorte/polera-oversize-${this.selectedLookColor()}.png`,
  );
  readonly lookJeanImage = computed(
    () => `/productos/recorte/jeans-${this.selectedLookJean()}.png`,
  );

  readonly boutiques = signal<BoutiqueHouse[]>([
    {
      id: 'youshop',
      name: 'YouShop Collective',
      city: 'Santa Cruz · La Paz',
      neighborhood: 'Equipetrol / El Prado',
      description: 'La tienda insignia de la red con la colección completa y stock conectado.',
      skus: 26,
      sucursales: 'Sucursal Central Equipetrol · Sucursal El Prado',
      destacados: ['Oversize Negra', 'Jean Negro', 'Oversize Guinda'],
      established: '2024',
      tiendaReserva: 'YouShop Collective — Equipetrol (Santa Cruz)',
      tone: 'cobalt',
    },
    {
      id: 'moda-urbana',
      name: 'Moda Urbana',
      city: 'La Paz',
      neighborhood: 'Sopocachi / Calacoto',
      description: 'Dos puntos paceños con el surtido completo de poleras y jeans.',
      skus: 26,
      sucursales: 'Moda Urbana Sopocachi · Moda Urbana Calacoto',
      destacados: ['Oversize Gris', 'Jean Negro', 'Oversize Blanca'],
      established: '2025',
      tiendaReserva: 'Moda Urbana — Sopocachi (La Paz)',
      tone: 'orange',
    },
    {
      id: 'cala-cala',
      name: 'Cala Cala',
      city: 'Cochabamba',
      neighborhood: 'Av. América',
      description: 'El punto de la red en el valle, con los cuatro colores y ambos jeans.',
      skus: 26,
      sucursales: 'Cala Cala Av. América',
      destacados: ['Oversize Blanca', 'Jean Blanco', 'Oversize Negra'],
      established: '2026',
      tiendaReserva: 'Cala Cala — Av. América (Cochabamba)',
      tone: 'lime',
    },
    {
      id: 'la-recoleta',
      name: 'La Recoleta',
      city: 'Sucre',
      neighborhood: 'Centro',
      description: 'La colección esencial cerca del mirador, con la guinda como favorita.',
      skus: 26,
      sucursales: 'La Recoleta Centro',
      destacados: ['Oversize Guinda', 'Jean Negro', 'Oversize Gris'],
      established: '2026',
      tiendaReserva: 'La Recoleta — Centro (Sucre)',
      tone: 'burgundy',
    },
  ]);

  readonly tiendasReserva = [
    'YouShop Collective — Equipetrol (Santa Cruz)',
    'YouShop Collective — El Prado (La Paz)',
    'Moda Urbana — Sopocachi (La Paz)',
    'Moda Urbana — Calacoto (La Paz)',
    'Cala Cala — Av. América (Cochabamba)',
    'La Recoleta — Centro (Sucre)',
  ];

  readonly plans: BusinessPlan[] = [
    {
      name: 'Básico',
      price: '240',
      description: 'Para tiendas con hasta 2 sucursales sincronizadas.',
      features: ['Hasta 5 usuarios', '300 productos', 'Inventario y ventas en línea'],
    },
    {
      name: 'Intermedio',
      price: '680',
      description: 'Para cadenas de hasta 5 sucursales que quieren crecer con datos.',
      features: ['Hasta 15 usuarios', 'Reportes con IA', 'Modo sin conexión'],
      featured: true,
    },
    {
      name: 'Avanzado',
      price: '1500',
      description: 'Para cadenas grandes, sin topes de sucursales ni catálogo.',
      features: ['Usuarios ilimitados', 'Catálogo ilimitado', 'Soporte prioritario'],
    },
  ];

  readonly vipBookingForm = new FormGroup({
    clientName: new FormControl('', [Validators.required]),
    email: new FormControl('', [Validators.required, Validators.email]),
    phone: new FormControl(''),
    atelier: new FormControl(this.tiendasReserva[0], [Validators.required]),
    date: new FormControl(this.defaultBookingDate, [Validators.required]),
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

  onLandingScroll(event: Event): void {
    const target = event.target as HTMLElement;
    const max = Math.max(target.scrollHeight - target.clientHeight, 1);
    this.scrollProgress.set(Math.min(100, Math.max(0, (target.scrollTop / max) * 100)));
    this.navCompact.set(target.scrollTop > 56);
  }

  toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  scrollToSection(id: string): void {
    this.menuOpen.set(false);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  setProductFilter(filter: ProductCategory): void {
    this.productFilter.set(filter);
  }

  selectLookColor(color: 'blanca' | 'negra' | 'guinda' | 'gris'): void {
    this.selectedLookColor.set(color);
  }

  selectLookJean(color: 'negro' | 'blanco'): void {
    this.selectedLookJean.set(color);
  }

  openVipModal(prefillAtelier?: string): void {
    if (prefillAtelier) this.vipBookingForm.patchValue({ atelier: prefillAtelier });
    this.closeAllOverlays();
    this.isVipModalOpen.set(true);
  }

  openApplicationModal(): void {
    this.closeAllOverlays();
    this.isApplicationModalOpen.set(true);
  }

  openBoutiqueModal(house: BoutiqueHouse): void {
    this.closeAllOverlays();
    this.selectedBoutiqueModal.set(house);
  }

  openLightbox(url: string, title: string, subtitle: string): void {
    this.closeAllOverlays();
    this.lightboxImage.set({ url, title, subtitle });
  }

  closeAllOverlays(): void {
    this.isVipModalOpen.set(false);
    this.isApplicationModalOpen.set(false);
    this.selectedBoutiqueModal.set(null);
    this.lightboxImage.set(null);
  }

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.menuOpen.set(false);
    this.closeAllOverlays();
  }

  submitVipBooking(): void {
    if (this.vipBookingForm.invalid) {
      this.vipBookingForm.markAllAsTouched();
      this.showToast('Completa tu nombre, correo, tienda, fecha y hora para reservar.');
      return;
    }
    if (this.enviando()) return;

    const value = this.vipBookingForm.getRawValue();
    this.enviando.set(true);
    window.setTimeout(() => {
      this.enviando.set(false);
      this.closeAllOverlays();
      this.showToast(
        `Listo, ${value.clientName}. Te esperamos en ${value.atelier} el ${value.date} a las ${value.time}.`,
      );
      this.vipBookingForm.reset({
        atelier: this.tiendasReserva[0],
        date: this.defaultBookingDate,
        time: '16:00',
      });
    }, 700);
  }

  submitApplication(): void {
    if (this.applicationForm.invalid) {
      this.applicationForm.markAllAsTouched();
      this.showToast('Completa el nombre de la tienda, responsable y ciudad.');
      return;
    }
    if (this.enviando()) return;

    const brand = this.applicationForm.getRawValue().brandName;
    this.enviando.set(true);
    window.setTimeout(() => {
      this.enviando.set(false);
      this.closeAllOverlays();
      this.showToast(`Gracias, ${brand}. El equipo de YouShop revisará tu solicitud.`);
      this.applicationForm.reset({ collectionType: 'Poleras oversize y jeans' });
    }, 700);
  }

  showToast(message: string): void {
    this.toastMessage.set(message);
    window.setTimeout(() => this.toastMessage.set(null), 5000);
  }
}
