import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  signal,
} from '@angular/core';
import { UpperCasePipe } from '@angular/common';
import * as THREE from 'three';

/** Variante de la prenda en el probador: la polera sola o con un jean. */
export interface SilhouetteOption {
  id: string;
  name: string;
  linea: string;
  description: string;
  tela: string;
  gramaje: string;
  hombro: string;
  largo: string;
  combinaCon: string;
  /** Jean que acompaña a la polera en el maniquí (null = solo la polera). */
  jean: 'negro' | 'blanco' | null;
}

export interface ColorOption {
  id: string;
  name: string;
  hex: string;
  label: string;
}

export interface SizeOption {
  id: string;
  code: string;
  label: string;
  scaleX: number;
  scaleY: number;
  scaleZ: number;
}

type CameraMode = 'general' | 'cuello' | 'hombro' | 'ruedo';

const COLOR_JEAN: Record<'negro' | 'blanco', string> = {
  negro: '#2a2a2f',
  blanco: '#ece9e2',
};

@Component({
  selector: 'app-virtual-fitting',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [UpperCasePipe],
  template: `
    <div class="relative w-full h-[540px] bg-gradient-to-b from-[#0f1013] via-[#16171b] to-[#121316] flex items-center justify-center overflow-hidden select-none" #canvasContainer>
      <!-- Three.js Canvas -->
      <canvas #renderCanvas class="w-full h-full cursor-grab active:cursor-grabbing block"></canvas>

      <!-- Subtle Crosshair & Organic Overlay -->
      <div class="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div class="w-72 h-72 border border-dashed border-[#7a1c30]/40 rounded-full animate-spin" style="animation-duration: 45s;"></div>
        <div class="w-[420px] h-[420px] border border-white/5 rounded-full"></div>
      </div>

      <!-- Prenda y color activos (arriba a la izquierda) -->
      <div class="absolute top-5 left-5 z-20 pointer-events-none flex flex-col gap-2">
        <div class="px-3.5 py-1.5 rounded-full bg-[#18191d]/90 backdrop-blur-md text-[#ffb2ba] font-mono text-[11px] uppercase tracking-wider border border-[#7a1c30]/60 shadow-lg flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#ff8da1] animate-ping"></span>
          <span>POLERA OVERSIZE // {{ activeColor().name | uppercase }}</span>
        </div>
        <div class="px-3 py-1 rounded-full bg-[#121316]/80 backdrop-blur text-white/90 font-mono text-[10px] tracking-wider border border-white/10 flex items-center gap-2">
          <span class="material-symbols-outlined text-[#ffb2ba] text-xs">photo_camera</span>
          <span>{{ cameraModeLabel() }}</span>
        </div>
      </div>

      <!-- Vistas de cámara (arriba a la derecha) -->
      <div class="absolute top-5 right-5 z-20 flex flex-col items-end gap-2">
        <div class="flex items-center gap-1 p-1.5 bg-[#18191d]/90 backdrop-blur-md rounded-full border border-[#564243]/50 shadow-xl">
          @for (vista of vistas; track vista.id) {
            <button
              type="button"
              class="px-3 py-1 rounded-full text-[10px] font-mono transition-all"
              [class]="cameraMode() === vista.id ? 'bg-[#7a1c30] text-white font-bold' : 'text-white/80 hover:text-white hover:bg-[#7a1c30]/40'"
              (click)="setCameraPreset(vista.id)"
              [title]="vista.titulo"
            >
              {{ vista.etiqueta }}
            </button>
          }
        </div>

        <!-- Zoom Pod -->
        <div class="flex items-center gap-1.5 p-1 bg-[#18191d]/90 backdrop-blur rounded-full border border-white/10 shadow-lg">
          <button
            type="button"
            class="w-7 h-7 rounded-full bg-[#22242a] hover:bg-[#7a1c30] text-white flex items-center justify-center transition-all text-xs"
            (click)="zoomIn()"
            title="Acercar"
          >
            <span class="material-symbols-outlined text-xs">add</span>
          </button>
          <div class="px-2 font-mono text-[11px] text-[#ffb2ba] font-bold min-w-[3rem] text-center">
            {{ zoomMultiplier() }}x
          </div>
          <button
            type="button"
            class="w-7 h-7 rounded-full bg-[#22242a] hover:bg-[#7a1c30] text-white flex items-center justify-center transition-all text-xs"
            (click)="zoomOut()"
            title="Alejar"
          >
            <span class="material-symbols-outlined text-xs">remove</span>
          </button>
        </div>
      </div>

      <!-- Ayuda (abajo a la izquierda) -->
      <div class="absolute bottom-5 left-5 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full bg-[#18191d]/90 text-white backdrop-blur border border-white/10 shadow-sm">
        <span class="material-symbols-outlined text-[#ffb2ba] text-sm">360</span>
        <span class="text-[11px] font-mono uppercase tracking-wider">Arrastre 360° // Rueda para zoom</span>
      </div>

      <!-- Combinación activa (abajo a la derecha) -->
      <div class="absolute bottom-5 right-5 z-20 pointer-events-none flex flex-col gap-2 items-end">
        <div class="px-3.5 py-1.5 rounded-full bg-[#18191d]/95 backdrop-blur text-white text-[11px] flex items-center gap-2 border border-[#7a1c30]/50 shadow-lg">
          <span class="w-2.5 h-2.5 rounded-full border border-white/30 transition-colors duration-300" [style.background-color]="activeColor().hex"></span>
          <span class="font-bold tracking-wider font-mono text-[#ffb2ba]">
            {{ activeColor().name | uppercase }} // TALLA {{ activeSize().code }}{{ activeSilhouette().jean ? ' + JEAN ' + (activeSilhouette().jean | uppercase) : '' }}
          </span>
        </div>
      </div>
    </div>
  `
})
export class VirtualFitting implements OnInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly vistas: { id: CameraMode; etiqueta: string; titulo: string }[] = [
    { id: 'general', etiqueta: '1.0x', titulo: 'Vista general' },
    { id: 'cuello', etiqueta: 'Cuello (3.4x)', titulo: 'Cuello redondo acanalado' },
    { id: 'hombro', etiqueta: 'Hombro (3.0x)', titulo: 'Hombro caído' },
    { id: 'ruedo', etiqueta: 'Ruedo (2.6x)', titulo: 'Ruedo y largo' },
  ];

  readonly activeSilhouette = signal<SilhouetteOption>({
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
  });

  readonly activeColor = signal<ColorOption>({
    id: 'negro',
    name: 'Negro',
    hex: '#1d1d20',
    label: '#1d1d20',
  });

  readonly activeSize = signal<SizeOption>({
    id: 'm',
    code: 'M',
    label: 'Mediana',
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
  });

  readonly cameraMode = signal<CameraMode>('general');
  readonly zoomMultiplier = signal<string>('1.0');
  readonly coordinatesReadout = signal<string>('[0.00, +0.50, 2.60]');

  readonly cameraModeLabel = computed(() => {
    switch (this.cameraMode()) {
      case 'general': return '1.0X VISTA COMPLETA';
      case 'cuello': return '3.4X CUELLO ACANALADO 1X1';
      case 'hombro': return '3.0X HOMBRO CAÍDO & MANGA';
      case 'ruedo': return '2.6X RUEDO & LARGO';
    }
  });

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animFrameId: number | null = null;

  // Objetos 3D
  private garmentGroup!: THREE.Group;
  private teeGroup!: THREE.Group;
  private jeansGroup!: THREE.Group;
  private mannequinGroup!: THREE.Group;
  private poleMesh!: THREE.Mesh;
  private fabricMaterial!: THREE.MeshPhysicalMaterial;
  private ribMaterial!: THREE.MeshPhysicalMaterial;
  private denimMaterial!: THREE.MeshStandardMaterial;
  private denimSeamMaterial!: THREE.MeshStandardMaterial;
  private metalStandMaterial!: THREE.MeshStandardMaterial;

  // Camara (con amortiguacion)
  private currentCamPos = new THREE.Vector3(0, 0.5, 2.6);
  private targetCamPos = new THREE.Vector3(0, 0.5, 2.6);
  private currentLookAt = new THREE.Vector3(0, 0.2, 0);
  private targetLookAt = new THREE.Vector3(0, 0.2, 0);

  // Interaccion
  private isPointerDown = false;
  private prevPointerX = 0;
  private prevPointerY = 0;
  private rotY = 0;
  private rotX = 0;
  private targetRotY = 0;
  private targetRotX = 0;

  ngOnInit() {
    this.initThree();
  }

  ngOnDestroy() {
    if (this.animFrameId !== null) {
      cancelAnimationFrame(this.animFrameId);
    }
    this.cleanupListeners();
    if (this.renderer) {
      this.renderer.dispose();
    }
  }

  private initThree() {
    const canvas = this.canvasRef.nativeElement;
    const container = this.containerRef.nativeElement;
    const width = container.clientWidth || 640;
    const height = container.clientHeight || 540;

    this.scene = new THREE.Scene();
    this.scene.background = null; // canvas transparente: se ve el degradado de fondo

    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    this.camera.position.copy(this.currentCamPos);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.setupLighting();
    this.setupMaterials();
    this.buildMannequinAndGarment();
    this.setupInteractions();
    this.animate();

    window.addEventListener('resize', this.onResize);
  }

  private setupLighting() {
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.9));

    const keyLight = new THREE.DirectionalLight(0xfff8f2, 2.1);
    keyLight.position.set(2.5, 4, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Luz de contorno para recortar la silueta contra el fondo oscuro
    // (sobre todo con la polera negra).
    const rimLight = new THREE.DirectionalLight(0xffc7d0, 1.6);
    rimLight.position.set(-3, 3, -2.5);
    this.scene.add(rimLight);

    const fillLight = new THREE.PointLight(0x9b1d3d, 0.7, 6);
    fillLight.position.set(0, -0.5, 1.8);
    this.scene.add(fillLight);

    const shadowGeo = new THREE.PlaneGeometry(4, 4);
    const shadowMat = new THREE.MeshBasicMaterial({ color: 0x07080a, transparent: true, opacity: 0.65 });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.15;
    this.scene.add(shadowPlane);
  }

  /** Punto jersey: trama fina de algodon. */
  private createJerseyTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Trama muy sutil: con mas contraste la polera parecia de corderoy.
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 256, 256);
      ctx.fillStyle = '#f6f6f6';
      for (let x = 0; x < 256; x += 3) {
        for (let y = 0; y < 256; y += 4) {
          ctx.fillRect(x + ((y / 4) % 2), y, 1, 3);
        }
      }
      const img = ctx.getImageData(0, 0, 256, 256);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = (Math.random() - 0.5) * 8;
        img.data[i] = Math.min(255, Math.max(0, img.data[i] + n));
        img.data[i + 1] = Math.min(255, Math.max(0, img.data[i + 1] + n));
        img.data[i + 2] = Math.min(255, Math.max(0, img.data[i + 2] + n));
      }
      ctx.putImageData(img, 0, 0);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(10, 10);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  /** Denim: sarga diagonal 3x1. */
  private createDenimTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 128, 128);
      ctx.strokeStyle = '#d6d6d6';
      ctx.lineWidth = 2;
      for (let i = -128; i < 256; i += 6) {
        ctx.beginPath();
        ctx.moveTo(i, 0);
        ctx.lineTo(i + 128, 128);
        ctx.stroke();
      }
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(6, 10);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private setupMaterials() {
    const jersey = this.createJerseyTexture();

    this.fabricMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.activeColor().hex),
      roughness: 0.92,
      metalness: 0.0,
      map: jersey,
      sheen: 0.5,
      sheenColor: new THREE.Color(0x666870),
      sheenRoughness: 0.7,
      // Las mangas son tubos abiertos: sin DoubleSide se veria el hueco por dentro.
      side: THREE.DoubleSide,
    });

    // Cuello y ruedos acanalados: mismo color, un poco mas oscuros.
    this.ribMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.activeColor().hex).multiplyScalar(0.82),
      roughness: 0.95,
      map: jersey,
      side: THREE.DoubleSide,
    });

    this.denimMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLOR_JEAN.negro),
      roughness: 0.88,
      map: this.createDenimTexture(),
    });

    this.denimSeamMaterial = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLOR_JEAN.negro).multiplyScalar(0.7),
      roughness: 0.9,
      side: THREE.DoubleSide,
    });

    this.metalStandMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e3036,
      roughness: 0.3,
      metalness: 0.85,
    });
  }

  /** Malla con sombras activadas. */
  private malla(geo: THREE.BufferGeometry, mat: THREE.Material): THREE.Mesh {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private buildMannequinAndGarment() {
    this.mannequinGroup = new THREE.Group();
    this.garmentGroup = new THREE.Group();
    this.teeGroup = new THREE.Group();
    this.jeansGroup = new THREE.Group();

    // --- Maniqui: base, pie, cuello ------------------------------------
    const base = this.malla(new THREE.CylinderGeometry(0.35, 0.4, 0.05, 32), this.metalStandMaterial);
    base.position.y = -1.12;
    this.mannequinGroup.add(base);

    this.poleMesh = this.malla(new THREE.CylinderGeometry(0.025, 0.025, 1.1, 16), this.metalStandMaterial);
    this.poleMesh.position.y = -0.55;
    this.mannequinGroup.add(this.poleMesh);

    const dummyMat = new THREE.MeshStandardMaterial({ color: 0x1d1e22, roughness: 0.9 });
    const finial = this.malla(new THREE.CylinderGeometry(0.055, 0.065, 0.12, 24), this.metalStandMaterial);
    finial.position.y = 0.95;
    this.mannequinGroup.add(finial);
    const neck = this.malla(new THREE.CylinderGeometry(0.068, 0.08, 0.22, 24), dummyMat);
    neck.position.y = 0.84;
    this.mannequinGroup.add(neck);

    // --- Polera oversize -----------------------------------------------
    // Cuerpo: seccion casi rectangular (ancho y poco profundo), recto y sin
    // entalle; el ruedo abre apenas, como cae una polera oversize.
    const torsoGeo = new THREE.CylinderGeometry(0.3, 0.31, 0.8, 48, 12);
    const pos = torsoGeo.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      let y = pos.getY(i);
      const ang = Math.atan2(pos.getZ(i), pos.getX(i));
      const r = Math.hypot(pos.getX(i), pos.getZ(i));
      // Superelipse: esquinas redondeadas pero laterales casi rectos.
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      const k = 1 / Math.pow(Math.pow(Math.abs(cx), 4) + Math.pow(Math.abs(sz), 4), 0.25);
      const ancho = y < -0.3 ? 1.6 : 1.55;
      const x = r * cx * k * ancho;
      const z = r * sz * k * 0.78;
      // Hombro caido: el techo de la polera baja desde el cuello hacia los
      // costados (la costura del hombro cae sobre el brazo).
      if (y > 0.2) {
        const t = (y - 0.2) / 0.2;
        y -= 0.1 * t * Math.pow(Math.min(Math.abs(x) / 0.48, 1), 1.6);
      }
      pos.setXYZ(i, x, y, z);
    }
    torsoGeo.computeVertexNormals();
    const torso = this.malla(torsoGeo, this.fabricMaterial);
    torso.position.y = 0.33;
    this.teeGroup.add(torso);

    // Mangas anchas, al codo, inclinadas hacia abajo.
    // Cada manga cuelga de un "brazo" que gira desde el hombro: asi el
    // ruedo de la manga queda siempre perpendicular a ella.
    for (const lado of [1, -1]) {
      const brazo = new THREE.Group();
      brazo.position.set(lado * 0.455, 0.626, 0);
      brazo.rotation.z = lado * 0.62;

      const manga = this.malla(new THREE.CylinderGeometry(0.15, 0.135, 0.36, 28, 1, true), this.fabricMaterial);
      manga.position.y = -0.18;
      brazo.add(manga);

      const ruedoManga = this.malla(new THREE.TorusGeometry(0.137, 0.012, 10, 32), this.ribMaterial);
      ruedoManga.rotation.x = Math.PI / 2;
      ruedoManga.position.y = -0.36;
      brazo.add(ruedoManga);

      this.teeGroup.add(brazo);
    }

    // Cuello redondo acanalado, asentado en la abertura del cuello.
    const cuello = this.malla(new THREE.TorusGeometry(0.1, 0.022, 14, 48), this.ribMaterial);
    cuello.rotation.x = Math.PI / 2;
    cuello.position.set(0, 0.735, 0.0);
    cuello.scale.set(1.12, 1.0, 1.0);
    this.teeGroup.add(cuello);

    // Ruedo inferior (doble costura).
    const ruedoGeo = new THREE.CylinderGeometry(0.312, 0.312, 0.03, 40, 1, true);
    const rp = ruedoGeo.attributes['position'];
    for (let i = 0; i < rp.count; i++) {
      const ang = Math.atan2(rp.getZ(i), rp.getX(i));
      const cx = Math.cos(ang);
      const sz = Math.sin(ang);
      const k = 1 / Math.pow(Math.pow(Math.abs(cx), 4) + Math.pow(Math.abs(sz), 4), 0.25);
      rp.setXYZ(i, 0.312 * cx * k * 1.61, rp.getY(i), 0.312 * sz * k * 0.79);
    }
    ruedoGeo.computeVertexNormals();
    const ruedo = this.malla(ruedoGeo, this.ribMaterial);
    ruedo.position.y = -0.055;
    this.teeGroup.add(ruedo);

    // --- Jean recto ----------------------------------------------------
    const cadera = this.malla(new THREE.CylinderGeometry(0.22, 0.24, 0.22, 32), this.denimMaterial);
    cadera.scale.set(1.35, 1, 0.82);
    cadera.position.y = -0.1;
    this.jeansGroup.add(cadera);

    const pretina = this.malla(new THREE.CylinderGeometry(0.222, 0.222, 0.05, 32, 1, true), this.denimSeamMaterial);
    pretina.scale.set(1.35, 1, 0.82);
    pretina.position.y = 0.0;
    this.jeansGroup.add(pretina);

    for (const lado of [1, -1]) {
      const pierna = this.malla(new THREE.CylinderGeometry(0.125, 0.118, 0.94, 28), this.denimMaterial);
      pierna.position.set(lado * 0.135, -0.66, 0);
      this.jeansGroup.add(pierna);

      const ruedoPierna = this.malla(new THREE.TorusGeometry(0.118, 0.008, 8, 28), this.denimSeamMaterial);
      ruedoPierna.rotation.x = Math.PI / 2;
      ruedoPierna.position.set(lado * 0.135, -1.11, 0);
      this.jeansGroup.add(ruedoPierna);
    }
    this.jeansGroup.visible = false;

    this.garmentGroup.add(this.teeGroup);
    this.garmentGroup.add(this.jeansGroup);
    this.scene.add(this.mannequinGroup);
    this.scene.add(this.garmentGroup);
  }

  private setupInteractions() {
    const canvas = this.canvasRef.nativeElement;

    canvas.addEventListener('pointerdown', (e) => {
      this.isPointerDown = true;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;
    });

    window.addEventListener('pointermove', this.onPointerMove);
    window.addEventListener('pointerup', this.onPointerUp);

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.targetCamPos.z = Math.max(0.7, Math.min(4.5, this.targetCamPos.z * zoomFactor));
      this.updateZoomMultiplier();
    }, { passive: false });
  }

  private onPointerMove = (e: PointerEvent) => {
    if (!this.isPointerDown) return;
    const deltaX = e.clientX - this.prevPointerX;
    const deltaY = e.clientY - this.prevPointerY;
    this.prevPointerX = e.clientX;
    this.prevPointerY = e.clientY;
    this.targetRotY += deltaX * 0.008;
    this.targetRotX = Math.max(-0.4, Math.min(0.4, this.targetRotX + deltaY * 0.005));
  };

  private onPointerUp = () => {
    this.isPointerDown = false;
  };

  private cleanupListeners() {
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerup', this.onPointerUp);
  }

  private onResize = () => {
    if (!this.containerRef || !this.renderer || !this.camera) return;
    const width = this.containerRef.nativeElement.clientWidth;
    const height = this.containerRef.nativeElement.clientHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  };

  private animate = () => {
    this.animFrameId = requestAnimationFrame(this.animate);

    this.rotY = THREE.MathUtils.damp(this.rotY, this.targetRotY, 8, 0.016);
    this.rotX = THREE.MathUtils.damp(this.rotX, this.targetRotX, 8, 0.016);

    for (const grupo of [this.garmentGroup, this.mannequinGroup]) {
      if (grupo) {
        grupo.rotation.y = this.rotY;
        grupo.rotation.x = this.rotX;
      }
    }

    if (!this.isPointerDown) {
      this.targetRotY += 0.0012;
    }

    this.currentCamPos.lerp(this.targetCamPos, 0.08);
    this.currentLookAt.lerp(this.targetLookAt, 0.08);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentLookAt);

    const xStr = (this.currentCamPos.x >= 0 ? '+' : '') + this.currentCamPos.x.toFixed(2);
    const yStr = (this.currentCamPos.y >= 0 ? '+' : '') + this.currentCamPos.y.toFixed(2);
    const zStr = this.currentCamPos.z.toFixed(2);
    this.coordinatesReadout.set(`[${xStr}, ${yStr}, ${zStr}]`);

    this.renderer.render(this.scene, this.camera);
  };

  public setSilhouette(silhouette: SilhouetteOption) {
    this.activeSilhouette.set(silhouette);
    if (!this.jeansGroup) return;
    this.jeansGroup.visible = silhouette.jean !== null;
    // Con jean, las piernas llegan a la base y el pie del maniqui sobra.
    this.poleMesh.visible = silhouette.jean === null;
    if (silhouette.jean) {
      const hex = COLOR_JEAN[silhouette.jean];
      this.denimMaterial.color.set(hex);
      this.denimSeamMaterial.color.set(hex).multiplyScalar(silhouette.jean === 'negro' ? 0.7 : 0.85);
    }
  }

  public setFabricColor(color: ColorOption) {
    this.activeColor.set(color);
    if (!this.fabricMaterial) return;
    this.fabricMaterial.color.set(color.hex);
    this.ribMaterial.color.set(color.hex).multiplyScalar(color.id === 'blanco' ? 0.94 : 0.82);
    // El brillo del algodon depende del color: en el blanco casi no se nota,
    // en el negro y el guinda marca los pliegues.
    const sheen: Record<string, number> = { blanco: 0xffffff, negro: 0x55565c, guinda: 0xc4566f, gris: 0xc8c9cd };
    this.fabricMaterial.sheenColor.set(sheen[color.id] ?? 0x666870);
  }

  public setSize(size: SizeOption) {
    this.activeSize.set(size);
    if (this.teeGroup) {
      this.teeGroup.scale.set(size.scaleX, size.scaleY, size.scaleZ);
      // La polera crece desde el cuello: se compensa para que el cuello no
      // atraviese el maniqui al escalar.
      this.teeGroup.position.y = 0.79 * (1 - size.scaleY);
    }
  }

  public setCameraPreset(mode: CameraMode) {
    this.cameraMode.set(mode);
    switch (mode) {
      case 'general':
        this.targetCamPos.set(0, 0.5, 2.6);
        this.targetLookAt.set(0, 0.2, 0);
        this.zoomMultiplier.set('1.0');
        break;
      case 'cuello':
        this.targetCamPos.set(0.0, 1.12, 0.78);
        this.targetLookAt.set(0, 0.7, 0.0);
        this.zoomMultiplier.set('3.4');
        break;
      case 'hombro':
        this.targetCamPos.set(0.75, 0.8, 0.95);
        this.targetLookAt.set(0.5, 0.58, 0.0);
        this.zoomMultiplier.set('3.0');
        break;
      case 'ruedo':
        this.targetCamPos.set(0.1, 0.05, 1.05);
        this.targetLookAt.set(0, -0.05, 0.1);
        this.zoomMultiplier.set('2.6');
        break;
    }
  }

  public zoomIn() {
    this.targetCamPos.multiplyScalar(0.85);
    this.updateZoomMultiplier();
  }

  public zoomOut() {
    this.targetCamPos.multiplyScalar(1.15);
    this.updateZoomMultiplier();
  }

  private updateZoomMultiplier() {
    const currentDist = this.targetCamPos.length();
    const mult = Math.max(0.6, (2.6 / currentDist)).toFixed(1);
    this.zoomMultiplier.set(mult);
  }
}
