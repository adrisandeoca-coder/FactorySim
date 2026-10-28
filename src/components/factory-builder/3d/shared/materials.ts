import * as THREE from 'three';

export function mat(color: number, metalness: number, roughness: number, opts: Partial<THREE.MeshStandardMaterialParameters> = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, ...opts });
}

export const M = {
  // Painted sheet-metal enclosures (Visual Components / FlexSim look):
  // off-white panels, charcoal bases, satin finish — not dark chrome.
  bodyGray:     mat(0xe4e8ec, 0.15, 0.5),
  bodyDark:     mat(0x4d535b, 0.25, 0.55),
  chrome:       mat(0xc8d0d8, 0.85, 0.2),
  darkChrome:   mat(0x8a929c, 0.6, 0.3),
  rubber:       mat(0x26292d, 0.0, 0.9),
  yellow:       mat(0xf2c200, 0.1, 0.5),   // safety yellow (fences, guards)
  orange:       mat(0xf26b1d, 0.15, 0.45), // industrial-robot orange
  red:          mat(0xdd2222, 0.1, 0.5),
  green:        mat(0x00dd44, 0.1, 0.4, { emissive: 0x003311, emissiveIntensity: 0.5 }),
  blue:         mat(0x3b82f6, 0.2, 0.5),
  glass:        mat(0x88bbdd, 0.0, 0.05, { transparent: true, opacity: 0.18, side: THREE.DoubleSide }),
  screen:       mat(0x0a1520, 0.0, 0.9, { emissive: 0x003366, emissiveIntensity: 1.1 }),
  screenActive: mat(0x0a2030, 0.0, 0.9, { emissive: 0x004488, emissiveIntensity: 1.2 }),
  table:        mat(0xb9c0c8, 0.3, 0.45),
  floor:        mat(0x9aa3ad, 0.05, 0.95),
  statusGreen:  mat(0x00ff80, 0.1, 0.3, { emissive: 0x00ff80, emissiveIntensity: 1.2 }),
  statusYellow: mat(0xffcc00, 0.1, 0.3, { emissive: 0xffcc00, emissiveIntensity: 1.2 }),
  statusRed:    mat(0xff2222, 0.1, 0.3, { emissive: 0xff2222, emissiveIntensity: 1.2 }),
  statusOff:    mat(0x222222, 0.1, 0.6),
  conveyor:     mat(0x3a3f45, 0.1, 0.85),
  conveyorSlat: mat(0x9aa3ad, 0.55, 0.35),
  pallet:       mat(0x8B5E3C, 0.0, 0.9),
  cardboard:    mat(0xC4934A, 0.0, 0.95),
  granite:      mat(0x6b7178, 0.1, 0.8),
  skin:         mat(0xd4a574, 0.0, 0.8),
  vest:         mat(0xffe033, 0.0, 0.7),
  fabric:       mat(0x2a3a5a, 0.0, 0.85),
  safety:       mat(0xff6600, 0.0, 0.6),
  pipe:         mat(0x8a94a0, 0.5, 0.35),
  wire:         mat(0x333333, 0.3, 0.6),
};
