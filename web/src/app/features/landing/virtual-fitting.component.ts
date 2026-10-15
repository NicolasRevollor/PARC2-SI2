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

export interface SilhouetteOption {
  id: string;
  name: string;
  atelier: string;
  description: string;
  defaultFabric: string;
  tension: string;
  allowance: string;
  fluidity: string;
  vault: string;
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

      <!-- Floating Macro Lens Pill Top-Left -->
      <div class="absolute top-5 left-5 z-20 pointer-events-none flex flex-col gap-2">
        <div class="px-3.5 py-1.5 rounded-full bg-[#18191d]/90 backdrop-blur-md text-[#ffb2ba] font-mono text-[11px] uppercase tracking-wider border border-[#7a1c30]/60 shadow-lg flex items-center gap-2">
          <span class="w-2 h-2 rounded-full bg-[#ff8da1] animate-ping"></span>
          <span>LENTE MACRO 65MM // {{ activeColor().name | uppercase }}</span>
        </div>
        <div class="px-3 py-1 rounded-full bg-[#121316]/80 backdrop-blur text-white/90 font-mono text-[10px] tracking-wider border border-white/10 flex items-center gap-2">
          <span class="material-symbols-outlined text-[#ffb2ba] text-xs">photo_camera</span>
          <span>{{ cameraModeLabel() }}</span>
        </div>
      </div>

      <!-- Floating Camera Zoom Controls Pill (Top Right) -->
      <div class="absolute top-5 right-5 z-20 flex flex-col items-end gap-2">
        <div class="flex items-center gap-1 p-1.5 bg-[#18191d]/90 backdrop-blur-md rounded-full border border-[#564243]/50 shadow-xl">
          <button
            type="button"
            class="px-3 py-1 rounded-full text-[10px] font-mono transition-all"
            [class]="cameraMode() === 'general' ? 'bg-[#7a1c30] text-white font-bold' : 'text-white/80 hover:text-white hover:bg-[#7a1c30]/40'"
            (click)="setCameraPreset('general')"
            title="Vista General"
          >
            1.0x
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded-full text-[10px] font-mono transition-all"
            [class]="cameraMode() === 'lapel' ? 'bg-[#7a1c30] text-white font-bold' : 'text-[#ffb2ba] hover:text-white hover:bg-[#7a1c30]/40'"
            (click)="setCameraPreset('lapel')"
            title="Solapa"
          >
            Solapa (3.5x)
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded-full text-[10px] font-mono transition-all"
            [class]="cameraMode() === 'shoulder' ? 'bg-[#7a1c30] text-white font-bold' : 'text-white/80 hover:text-white hover:bg-[#7a1c30]/40'"
            (click)="setCameraPreset('shoulder')"
            title="Hombro"
          >
            Hombro (3.2x)
          </button>
          <button
            type="button"
            class="px-3 py-1 rounded-full text-[10px] font-mono transition-all"
            [class]="cameraMode() === 'button' ? 'bg-[#7a1c30] text-white font-bold' : 'text-[#ff8da1] hover:text-white hover:bg-[#7a1c30]/40'"
            (click)="setCameraPreset('button')"
            title="Botón"
          >
            Botón (4.5x)
          </button>
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

      <!-- Hint Capsule (Bottom Left) -->
      <div class="absolute bottom-5 left-5 z-20 pointer-events-none flex items-center gap-2 px-4 py-2 rounded-full bg-[#18191d]/90 text-white backdrop-blur border border-white/10 shadow-sm">
        <span class="material-symbols-outlined text-[#ffb2ba] text-sm">360</span>
        <span class="text-[11px] font-mono uppercase tracking-wider">Arrastre 360° // Rueda para zoom</span>
      </div>

      <!-- Live Telemetry Pill (Bottom Right) -->
      <div class="absolute bottom-5 right-5 z-20 pointer-events-none flex flex-col gap-2 items-end">
        <div class="px-3.5 py-1.5 rounded-full bg-[#18191d]/95 backdrop-blur text-white text-[11px] flex items-center gap-2 border border-[#7a1c30]/50 shadow-lg">
          <span class="w-2.5 h-2.5 rounded-full transition-colors duration-300" [style.background-color]="activeColor().hex"></span>
          <span class="font-bold tracking-wider font-mono text-[#ffb2ba]">
            {{ activeColor().name | uppercase }} // {{ activeSilhouette().atelier | uppercase }}
          </span>
        </div>
      </div>
    </div>
  `
})
export class VirtualFitting implements OnInit, OnDestroy {
  @ViewChild('canvasContainer', { static: true }) containerRef!: ElementRef<HTMLDivElement>;
  @ViewChild('renderCanvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  readonly activeSilhouette = signal<SilhouetteOption>({
    id: 'valmont',
    name: 'Blazer Ejecutivo Monolítico (Valmont)',
    atelier: 'Atelier Valmont',
    description: 'Solapa continua envolvente en guindo y carbón',
    defaultFabric: 'Caída Textil: Terciopelo Guindo 180s (380g/m²) // Mate Reforzado',
    tension: '0.42 N (Suave)',
    allowance: '+1.8 cm Confort',
    fluidity: '98.4% Natural Fluid',
    vault: 'Zúrich / Central',
  });

  readonly activeColor = signal<ColorOption>({
    id: 'wine',
    name: 'Guindo Imperial',
    hex: '#7a1c30',
    label: '#7a1c30',
  });

  readonly activeSize = signal<SizeOption>({
    id: 'classic',
    code: '02',
    label: 'Classic Arch',
    scaleX: 1.0,
    scaleY: 1.0,
    scaleZ: 1.0,
  });

  readonly cameraMode = signal<'general' | 'lapel' | 'shoulder' | 'button'>('general');
  readonly zoomMultiplier = signal<string>('1.0');
  readonly coordinatesReadout = signal<string>('[0.00, +1.05, 0.32]');

  readonly cameraModeLabel = computed(() => {
    switch (this.cameraMode()) {
      case 'general': return '1.0X VISTA GLOBAL';
      case 'lapel': return '3.5X MACRO SOLAPA & PESPUNTE';
      case 'shoulder': return '3.2X MACRO SISA & HOMBRO';
      case 'button': return '4.5X TRAMA & BOTÓN';
    }
  });

  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;
  private animFrameId: number | null = null;

  // 3D Objects
  private garmentGroup!: THREE.Group;
  private mannequinGroup!: THREE.Group;
  private fabricMaterial!: THREE.MeshPhysicalMaterial;
  private lapelMaterial!: THREE.MeshPhysicalMaterial;
  private buttonMaterial!: THREE.MeshStandardMaterial;
  private metalStandMaterial!: THREE.MeshStandardMaterial;

  // Camera state & damping
  private currentCamPos = new THREE.Vector3(0, 0.6, 2.7);
  private targetCamPos = new THREE.Vector3(0, 0.6, 2.7);
  private currentLookAt = new THREE.Vector3(0, 0.4, 0);
  private targetLookAt = new THREE.Vector3(0, 0.4, 0);

  // Interaction
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

    // Scene
    this.scene = new THREE.Scene();
    this.scene.background = null; // transparent canvas so gradient background shows through

    // Camera
    this.camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 50);
    this.camera.position.copy(this.currentCamPos);

    // Renderer
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
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Lighting
    this.setupLighting();

    // Procedural Textures & Materials
    this.setupMaterials();

    // Build Mannequin & Garment
    this.buildMannequinAndGarment();

    // Input handlers
    this.setupInteractions();

    // Start loop
    this.animate();

    // Handle Resize
    window.addEventListener('resize', this.onResize);
  }

  private setupLighting() {
    // Ambient soft studio light
    const ambient = new THREE.AmbientLight(0xffffff, 0.85);
    this.scene.add(ambient);

    // Key Light (Main soft shadow caster)
    const keyLight = new THREE.DirectionalLight(0xfff5f0, 2.2);
    keyLight.position.set(2.5, 4, 3);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 1024;
    keyLight.shadow.mapSize.height = 1024;
    keyLight.shadow.camera.near = 0.5;
    keyLight.shadow.camera.far = 10;
    keyLight.shadow.bias = -0.0005;
    this.scene.add(keyLight);

    // Rim / Backlight for striking luxury silhouette edge
    const rimLight = new THREE.DirectionalLight(0xff99aa, 1.8);
    rimLight.position.set(-3, 3, -2.5);
    this.scene.add(rimLight);

    // Deep Wine Accent Spot
    const wineAccentLight = new THREE.PointLight(0x9b1d3d, 2.5, 6);
    wineAccentLight.position.set(0, -0.5, 1.8);
    this.scene.add(wineAccentLight);

    // Soft ground contact plane
    const shadowGeo = new THREE.PlaneGeometry(4, 4);
    const shadowMat = new THREE.MeshBasicMaterial({
      color: 0x07080a,
      transparent: true,
      opacity: 0.65,
    });
    const shadowPlane = new THREE.Mesh(shadowGeo, shadowMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.y = -1.15;
    this.scene.add(shadowPlane);
  }

  private createFabricTexture(): THREE.CanvasTexture {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      // Base background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, 512, 512);

      // Procedural fine textile weave / twill pattern
      ctx.fillStyle = '#f0f0f0';
      for (let y = 0; y < 512; y += 4) {
        for (let x = 0; x < 512; x += 4) {
          if ((x + y) % 8 === 0) {
            ctx.fillRect(x, y, 3, 3);
          }
        }
      }

      // Delicate micro grain
      const imgData = ctx.getImageData(0, 0, 512, 512);
      const data = imgData.data;
      for (let i = 0; i < data.length; i += 4) {
        const noise = (Math.random() - 0.5) * 12;
        data[i] = Math.min(255, Math.max(0, data[i] + noise));
        data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
        data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
      }
      ctx.putImageData(imgData, 0, 0);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(12, 12);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  private setupMaterials() {
    const fabricTex = this.createFabricTexture();

    // Primary Garment Velvet / Wool PBR
    this.fabricMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(this.activeColor().hex),
      roughness: 0.75,
      metalness: 0.1,
      clearcoat: 0.15,
      clearcoatRoughness: 0.6,
      map: fabricTex,
      sheen: 0.6,
      sheenColor: new THREE.Color(0xff8da1),
      sheenRoughness: 0.5,
    });

    // Lapels & Accents (Silk satin or deep tonal contrast)
    this.lapelMaterial = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(0x18181b),
      roughness: 0.35,
      metalness: 0.25,
      clearcoat: 0.45,
      clearcoatRoughness: 0.2,
      sheen: 0.4,
      sheenColor: new THREE.Color(0x9b1d3d),
    });

    // Horn / Lacquered Buttons
    this.buttonMaterial = new THREE.MeshStandardMaterial({
      color: 0x111113,
      roughness: 0.2,
      metalness: 0.6,
    });

    // Luxury Atelier Stand (Brushed dark titanium / pewter)
    this.metalStandMaterial = new THREE.MeshStandardMaterial({
      color: 0x2e3036,
      roughness: 0.3,
      metalness: 0.85,
    });
  }

  private buildMannequinAndGarment() {
    this.mannequinGroup = new THREE.Group();
    this.garmentGroup = new THREE.Group();

    // 1. Mannequin Stand Base & Pole
    const baseGeo = new THREE.CylinderGeometry(0.35, 0.4, 0.05, 32);
    const baseMesh = new THREE.Mesh(baseGeo, this.metalStandMaterial);
    baseMesh.position.y = -1.12;
    baseMesh.receiveShadow = true;
    this.mannequinGroup.add(baseMesh);

    const poleGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.3, 16);
    const poleMesh = new THREE.Mesh(poleGeo, this.metalStandMaterial);
    poleMesh.position.y = -0.5;
    poleMesh.castShadow = true;
    this.mannequinGroup.add(poleMesh);

    // Torso Base (Tailor's dummy covered in dark charcoal linen)
    const dummyMat = new THREE.MeshStandardMaterial({
      color: 0x1d1e22,
      roughness: 0.9,
    });

    // Neck cap & finial
    const neckFinialGeo = new THREE.CylinderGeometry(0.06, 0.07, 0.14, 24);
    const neckFinial = new THREE.Mesh(neckFinialGeo, this.metalStandMaterial);
    neckFinial.position.y = 0.94;
    neckFinial.castShadow = true;
    this.mannequinGroup.add(neckFinial);

    // Dummy neck
    const neckGeo = new THREE.CylinderGeometry(0.07, 0.085, 0.25, 24);
    const neck = new THREE.Mesh(neckGeo, dummyMat);
    neck.position.y = 0.82;
    neck.castShadow = true;
    this.mannequinGroup.add(neck);

    // 2. Sculpted Architectural Blazer / Garment
    // Torso Main Shell
    const torsoGeo = new THREE.CylinderGeometry(0.24, 0.28, 0.85, 32, 8);
    // Apply soft organic tailoring taper
    const pos = torsoGeo.attributes['position'];
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      let x = pos.getX(i);
      let z = pos.getZ(i);

      // Chest expansion & waist nip
      if (y > 0.1) {
        x *= 1.35; // Broad structured chest
        z *= 0.95;
      } else if (y < -0.15) {
        x *= 1.25; // Hips fluid flare
        z *= 1.05;
      } else {
        x *= 1.15; // Tailored neutral waist
        z *= 0.9;
      }
      pos.setXYZ(i, x, y, z);
    }
    torsoGeo.computeVertexNormals();
    const torsoMesh = new THREE.Mesh(torsoGeo, this.fabricMaterial);
    torsoMesh.position.y = 0.35;
    torsoMesh.castShadow = true;
    torsoMesh.receiveShadow = true;
    this.garmentGroup.add(torsoMesh);

    // Shoulders with architectural drape
    const shoulderGeo = new THREE.CapsuleGeometry(0.12, 0.58, 16, 24);
    const shoulderMesh = new THREE.Mesh(shoulderGeo, this.fabricMaterial);
    shoulderMesh.rotation.z = Math.PI / 2;
    shoulderMesh.position.set(0, 0.68, 0);
    shoulderMesh.scale.set(1.15, 1.45, 1.0);
    shoulderMesh.castShadow = true;
    this.garmentGroup.add(shoulderMesh);

    // Left & Right Sleeves
    const sleeveGeo = new THREE.CylinderGeometry(0.1, 0.08, 0.72, 24);
    const leftSleeve = new THREE.Mesh(sleeveGeo, this.fabricMaterial);
    leftSleeve.position.set(0.44, 0.28, 0.02);
    leftSleeve.rotation.z = -0.18;
    leftSleeve.castShadow = true;
    this.garmentGroup.add(leftSleeve);

    const rightSleeve = new THREE.Mesh(sleeveGeo, this.fabricMaterial);
    rightSleeve.position.set(-0.44, 0.28, 0.02);
    rightSleeve.rotation.z = 0.18;
    rightSleeve.castShadow = true;
    this.garmentGroup.add(rightSleeve);

    // Lapels (Enveloping peak lapel sculpture in contrast satin/charcoal)
    const lapelLeftGeo = new THREE.BoxGeometry(0.14, 0.52, 0.05);
    const lapelLeft = new THREE.Mesh(lapelLeftGeo, this.lapelMaterial);
    lapelLeft.position.set(0.12, 0.52, 0.23);
    lapelLeft.rotation.set(-0.1, 0.15, -0.22);
    lapelLeft.castShadow = true;
    this.garmentGroup.add(lapelLeft);

    const lapelRightGeo = new THREE.BoxGeometry(0.14, 0.52, 0.05);
    const lapelRight = new THREE.Mesh(lapelRightGeo, this.lapelMaterial);
    lapelRight.position.set(-0.12, 0.52, 0.23);
    lapelRight.rotation.set(-0.1, -0.15, 0.22);
    lapelRight.castShadow = true;
    this.garmentGroup.add(lapelRight);

    // Front Chest Welt Pocket
    const pocketGeo = new THREE.BoxGeometry(0.12, 0.025, 0.02);
    const pocket = new THREE.Mesh(pocketGeo, this.lapelMaterial);
    pocket.position.set(0.16, 0.54, 0.25);
    pocket.rotation.z = 0.05;
    this.garmentGroup.add(pocket);

    // Bespoke Buttons & Detailed Thread Stitches
    const buttonGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.012, 24);
    const button1 = new THREE.Mesh(buttonGeo, this.buttonMaterial);
    button1.rotation.x = Math.PI / 2;
    button1.position.set(0, 0.32, 0.28);
    button1.castShadow = true;
    this.garmentGroup.add(button1);

    const button2 = new THREE.Mesh(buttonGeo, this.buttonMaterial);
    button2.rotation.x = Math.PI / 2;
    button2.position.set(0, 0.18, 0.29);
    button2.castShadow = true;
    this.garmentGroup.add(button2);

    // Buttonhole Pespunte detail (Subtle horizontal stitch)
    const stitchGeo = new THREE.BoxGeometry(0.045, 0.005, 0.01);
    const stitchMat = new THREE.MeshBasicMaterial({ color: 0xff8da1 });
    const stitch1 = new THREE.Mesh(stitchGeo, stitchMat);
    stitch1.position.set(0.04, 0.32, 0.28);
    this.garmentGroup.add(stitch1);

    // Assemble root
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

    window.addEventListener('pointermove', (e) => {
      if (!this.isPointerDown) return;
      const deltaX = e.clientX - this.prevPointerX;
      const deltaY = e.clientY - this.prevPointerY;
      this.prevPointerX = e.clientX;
      this.prevPointerY = e.clientY;

      this.targetRotY += deltaX * 0.008;
      this.targetRotX = Math.max(-0.4, Math.min(0.4, this.targetRotX + deltaY * 0.005));
    });

    window.addEventListener('pointerup', () => {
      this.isPointerDown = false;
    });

    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 1.08 : 0.92;
      this.targetCamPos.z = Math.max(0.7, Math.min(4.5, this.targetCamPos.z * zoomFactor));
      this.updateZoomMultiplier();
    }, { passive: false });
  }

  private cleanupListeners() {
    window.removeEventListener('resize', this.onResize);
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

    // Smooth rotational damping
    this.rotY = THREE.MathUtils.damp(this.rotY, this.targetRotY, 8, 0.016);
    this.rotX = THREE.MathUtils.damp(this.rotX, this.targetRotX, 8, 0.016);

    if (this.garmentGroup) {
      this.garmentGroup.rotation.y = this.rotY;
      this.garmentGroup.rotation.x = this.rotX;
    }
    if (this.mannequinGroup) {
      this.mannequinGroup.rotation.y = this.rotY;
      this.mannequinGroup.rotation.x = this.rotX;
    }

    // Auto gentle subtle drift when idle
    if (!this.isPointerDown) {
      this.targetRotY += 0.0012;
    }

    // Smooth camera damping
    this.currentCamPos.lerp(this.targetCamPos, 0.08);
    this.currentLookAt.lerp(this.targetLookAt, 0.08);
    this.camera.position.copy(this.currentCamPos);
    this.camera.lookAt(this.currentLookAt);

    // Update Telemetry coordinate readout
    const xStr = (this.currentCamPos.x >= 0 ? '+' : '') + this.currentCamPos.x.toFixed(2);
    const yStr = (this.currentCamPos.y >= 0 ? '+' : '') + this.currentCamPos.y.toFixed(2);
    const zStr = this.currentCamPos.z.toFixed(2);
    this.coordinatesReadout.set(`[${xStr}, ${yStr}, ${zStr}]`);

    this.renderer.render(this.scene, this.camera);
  };

  public setSilhouette(silhouette: SilhouetteOption) {
    this.activeSilhouette.set(silhouette);
    if (!this.garmentGroup) return;

    // Adjust geometry / silhouette styling
    if (silhouette.id === 'valmont') {
      this.garmentGroup.scale.set(1.0, 1.0, 1.0);
      this.lapelMaterial.color.set(0x18181b);
    } else if (silhouette.id === 'kuroda') {
      // Overcoat: longer drape, wider drop shoulder
      this.garmentGroup.scale.set(1.08, 1.25, 1.05);
      this.lapelMaterial.color.set(0x24262d);
    } else if (silhouette.id === 'ginza') {
      // Minimal formal: sharp structured cut
      this.garmentGroup.scale.set(0.96, 1.02, 0.94);
      this.lapelMaterial.color.set(this.activeColor().hex);
    }
  }

  public setFabricColor(color: ColorOption) {
    this.activeColor.set(color);
    if (this.fabricMaterial) {
      this.fabricMaterial.color.set(color.hex);
      if (color.id === 'wine' || color.id === 'deep-burgundy') {
        this.fabricMaterial.sheenColor.set(0xff8da1);
      } else if (color.id === 'ivory') {
        this.fabricMaterial.sheenColor.set(0xffffff);
      } else {
        this.fabricMaterial.sheenColor.set(0x666870);
      }
    }
  }

  public setSize(size: SizeOption) {
    this.activeSize.set(size);
    if (this.garmentGroup) {
      this.garmentGroup.scale.set(size.scaleX, size.scaleY, size.scaleZ);
    }
  }

  public setCameraPreset(mode: 'general' | 'lapel' | 'shoulder' | 'button') {
    this.cameraMode.set(mode);
    switch (mode) {
      case 'general':
        this.targetCamPos.set(0, 0.5, 2.6);
        this.targetLookAt.set(0, 0.35, 0);
        this.zoomMultiplier.set('1.0');
        break;
      case 'lapel':
        this.targetCamPos.set(0.12, 0.55, 0.85);
        this.targetLookAt.set(0.12, 0.52, 0.22);
        this.zoomMultiplier.set('3.5');
        break;
      case 'shoulder':
        this.targetCamPos.set(0.42, 0.65, 0.9);
        this.targetLookAt.set(0.38, 0.58, 0.05);
        this.zoomMultiplier.set('3.2');
        break;
      case 'button':
        this.targetCamPos.set(0.04, 0.32, 0.65);
        this.targetLookAt.set(0.0, 0.32, 0.28);
        this.zoomMultiplier.set('4.5');
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
