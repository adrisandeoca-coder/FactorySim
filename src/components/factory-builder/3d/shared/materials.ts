import * as THREE from 'three';

export function mat(color: number, metalness: number, roughness: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...opts });
}

export const M = {
  bodyGray:     mat(0x3a4050, 0.6, 0.5),
  bodyDark:     mat(0x252830, 0.7, 0.45),
  chrome:       mat(0xc8d0d8, 0.95, 0.1),
  darkChrome:   mat(0x606878, 0.9, 0.2),
  rubber:       mat(0x1a1c20, 0.0, 0.9),
  yellow:       mat(0x997700, 0.3, 0.55),
  orange:       mat(0xf97316, 0.2, 0.5),
  red:          mat(0xdd2222, 0.1, 0.5),
  green:        mat(0x00dd44, 0.1, 0.4, { emissive: 0x003311, emissiveIntensity: 0.5 }),
  blue:         mat(0x3b82f6, 0.2, 0.5),
  glass:        mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  screen:       mat(0x0a1520, 0.0, 0.9, { emissive: 0x002244, emissiveIntensity: 0.8 }),
  screenActive: mat(0x0a2030, 0.0, 0.9, { emissive: 0x004488, emissiveIntensity: 1.2 }),
  table:        mat(0x4a5060, 0.75, 0.35),
  floor:        mat(0x141618, 0.1, 0.95),
  statusGreen:  mat(0x00ff80, 0.1, 0.3, { emissive: 0x00ff80, emissiveIntensity: 1.2 }),
  statusYellow: mat(0xffcc00, 0.1, 0.3, { emissive: 0xffcc00, emissiveIntensity: 1.2 }),
  statusRed:    mat(0xff2222, 0.1, 0.3, { emissive: 0xff2222, emissiveIntensity: 1.2 }),
  statusOff:    mat(0x222222, 0.1, 0.6),
  conveyor:     mat(0x1a1e22, 0.1, 0.9),
  conveyorSlat: mat(0x2a2e36, 0.4, 0.7),
  pallet:       mat(0x8B5E3C, 0.0, 0.9),
  cardboard:    mat(0xC4934A, 0.0, 0.95),
  granite:      mat(0x404040, 0.1, 0.8),
  skin:         mat(0xd4a574, 0.0, 0.8),
  vest:         mat(0xffe033, 0.0, 0.7),
  fabric:       mat(0x2a3a5a, 0.0, 0.85),
  safety:       mat(0xff6600, 0.0, 0.6),
  pipe:         mat(0x556070, 0.7, 0.3),
  wire:         mat(0x333333, 0.3, 0.6),
};
