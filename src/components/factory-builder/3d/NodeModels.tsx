/**
 * Procedural 3D models for each FactorySim node type.
 * Each model is a React Three Fiber component built from composed primitives
 * to create recognizable factory equipment silhouettes.
 *
 * Architecture note: To swap any model with a GLTF/GLB file later, replace
 * the component body with: const { scene } = useGLTF('/models/station.glb')
 * and return <primitive object={scene.clone()} />
 */
import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// ── Color palette matching 2D node colors ──
export const NODE_COLORS: Record<string, string> = {
  station: '#3b82f6',
  buffer: '#f59e0b',
  source: '#22c55e',
  sink: '#ef4444',
  conveyor: '#f59e0b',
  operator: '#8b5cf6',
  inspection: '#06b6d4',
  assembly: '#6366f1',
  splitter: '#14b8a6',
  merge: '#10b981',
  disassembly: '#f97316',
  palletize: '#d97706',
  depalletize: '#ca8a04',
  matchbuffer: '#a855f7',
};

const METAL = { roughness: 0.4, metalness: 0.3 };
const MATTE = { roughness: 0.7, metalness: 0.1 };

interface NodeModelProps {
  selected?: boolean;
  processing?: boolean;
  name?: string;
}

// ─────────────────────────────────────────────
// STATION — CNC-style machine with housing, control panel, and spindle
// ─────────────────────────────────────────────
export function StationModel({ selected, processing }: NodeModelProps) {
  const spindleRef = useRef<THREE.Mesh>(null);
  useFrame((_, dt) => {
    if (spindleRef.current && processing) {
      spindleRef.current.rotation.y += dt * 8;
    }
  });

  return (
    <group>
      {/* Base platform */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.6, 0.1, 1.2]} />
        <meshStandardMaterial color="#475569" {...METAL} />
      </mesh>

      {/* Main housing */}
      <mesh position={[0, 0.6, 0]} castShadow>
        <boxGeometry args={[1.4, 1.0, 1.0]} />
        <meshStandardMaterial color={selected ? '#60a5fa' : '#3b82f6'} {...METAL} />
      </mesh>

      {/* Top housing (tapered) */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[1.2, 0.2, 0.9]} />
        <meshStandardMaterial color="#2563eb" {...METAL} />
      </mesh>

      {/* Control panel (front face) */}
      <mesh position={[0, 0.7, 0.51]} castShadow>
        <boxGeometry args={[0.6, 0.4, 0.02]} />
        <meshStandardMaterial color="#1e293b" roughness={0.2} metalness={0.1} />
      </mesh>
      {/* Screen on panel */}
      <mesh position={[0, 0.75, 0.525]}>
        <boxGeometry args={[0.4, 0.2, 0.01]} />
        <meshStandardMaterial
          color={processing ? '#22c55e' : '#334155'}
          emissive={processing ? '#22c55e' : '#1e293b'}
          emissiveIntensity={processing ? 0.5 : 0.1}
        />
      </mesh>

      {/* Intake opening (left side) */}
      <mesh position={[-0.71, 0.5, 0]} castShadow>
        <boxGeometry args={[0.02, 0.35, 0.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.3} />
      </mesh>

      {/* Output opening (right side) */}
      <mesh position={[0.71, 0.5, 0]} castShadow>
        <boxGeometry args={[0.02, 0.35, 0.4]} />
        <meshStandardMaterial color="#1e293b" roughness={0.3} />
      </mesh>

      {/* Spindle / rotating tool */}
      <mesh ref={spindleRef} position={[0, 1.35, 0]} castShadow>
        <cylinderGeometry args={[0.06, 0.06, 0.3, 12]} />
        <meshStandardMaterial color="#94a3b8" {...METAL} metalness={0.6} />
      </mesh>
      <mesh position={[0, 1.52, 0]}>
        <cylinderGeometry args={[0.12, 0.08, 0.08, 12]} />
        <meshStandardMaterial color="#64748b" {...METAL} />
      </mesh>

      {/* Status light */}
      <mesh position={[0.55, 1.35, 0.35]}>
        <sphereGeometry args={[0.06, 12, 12]} />
        <meshStandardMaterial
          color={processing ? '#22c55e' : '#eab308'}
          emissive={processing ? '#22c55e' : '#eab308'}
          emissiveIntensity={processing ? 0.8 : 0.3}
        />
      </mesh>

      {/* Ventilation slits (back) */}
      {[0, 1, 2, 3].map(i => (
        <mesh key={i} position={[0, 0.4 + i * 0.2, -0.51]}>
          <boxGeometry args={[0.8, 0.04, 0.02]} />
          <meshStandardMaterial color="#1e3a5f" roughness={0.5} />
        </mesh>
      ))}

      {/* Selection ring */}
      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.2, 32]} />
          <meshBasicMaterial color="#3b82f6" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// BUFFER — Industrial rack shelving with visible item slots
// ─────────────────────────────────────────────
export function BufferModel({ selected }: NodeModelProps & { capacity?: number }) {
  return (
    <group>
      {/* Frame uprights */}
      {[-0.5, 0.5].map(x => [-0.25, 0.25].map(z => (
        <mesh key={`${x}-${z}`} position={[x, 0.7, z]} castShadow>
          <boxGeometry args={[0.06, 1.4, 0.06]} />
          <meshStandardMaterial color="#94a3b8" {...METAL} />
        </mesh>
      )))}

      {/* Shelves (3 levels) */}
      {[0.15, 0.55, 0.95].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[1.1, 0.04, 0.55]} />
          <meshStandardMaterial color="#cbd5e1" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}

      {/* Items on shelves (small colored boxes) */}
      {[0.25, 0.65, 1.05].map((y, row) =>
        [-0.3, 0, 0.3].map((x, col) => (
          <mesh key={`${row}-${col}`} position={[x, y, 0]}>
            <boxGeometry args={[0.18, 0.15, 0.18]} />
            <meshStandardMaterial
              color={['#f59e0b', '#fb923c', '#fbbf24'][row]}
              roughness={0.6}
            />
          </mesh>
        ))
      )}

      {/* Top cross-beam */}
      <mesh position={[0, 1.4, 0]} castShadow>
        <boxGeometry args={[1.1, 0.05, 0.55]} />
        <meshStandardMaterial color="#94a3b8" {...METAL} />
      </mesh>

      {/* Label plate */}
      <mesh position={[0, 1.3, 0.28]}>
        <boxGeometry args={[0.5, 0.12, 0.01]} />
        <meshStandardMaterial color="#fef3c7" roughness={0.8} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.85, 0.95, 32]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// SOURCE — Hopper / funnel feeding into the line
// ─────────────────────────────────────────────
export function SourceModel({ selected }: NodeModelProps) {
  const arrowRef = useRef<THREE.Group>(null);
  useFrame(() => {
    if (arrowRef.current) {
      arrowRef.current.position.y = 0.9 + Math.sin(Date.now() * 0.004) * 0.08;
    }
  });

  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <cylinderGeometry args={[0.5, 0.6, 0.1, 16]} />
        <meshStandardMaterial color="#475569" {...METAL} />
      </mesh>

      {/* Hopper body (truncated cone) */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <cylinderGeometry args={[0.3, 0.6, 0.8, 16]} />
        <meshStandardMaterial color={selected ? '#4ade80' : '#22c55e'} {...METAL} />
      </mesh>

      {/* Hopper rim */}
      <mesh position={[0, 0.96, 0]} castShadow>
        <cylinderGeometry args={[0.62, 0.6, 0.04, 16]} />
        <meshStandardMaterial color="#16a34a" {...METAL} />
      </mesh>

      {/* Outlet tube at bottom */}
      <mesh position={[0, 0.08, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.15, 0.1, 12]} />
        <meshStandardMaterial color="#374151" roughness={0.4} metalness={0.5} />
      </mesh>

      {/* Animated down arrow (items entering) */}
      <group ref={arrowRef}>
        <mesh position={[0, 0.9, 0]}>
          <coneGeometry args={[0.12, 0.2, 8]} />
          <meshStandardMaterial
            color="#bbf7d0"
            emissive="#22c55e"
            emissiveIntensity={0.3}
            transparent
            opacity={0.8}
          />
        </mesh>
      </group>

      {/* Support legs */}
      {[0, 1, 2, 3].map(i => {
        const angle = (i / 4) * Math.PI * 2;
        return (
          <mesh key={i} position={[Math.cos(angle) * 0.45, 0.25, Math.sin(angle) * 0.45]} castShadow>
            <cylinderGeometry args={[0.03, 0.04, 0.5, 8]} />
            <meshStandardMaterial color="#64748b" {...METAL} />
          </mesh>
        );
      })}

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.8, 32]} />
          <meshBasicMaterial color="#22c55e" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// SINK — Collection bin / shipping container
// ─────────────────────────────────────────────
export function SinkModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Container base */}
      <mesh position={[0, 0.3, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.0, 0.6, 0.8]} />
        <meshStandardMaterial color={selected ? '#f87171' : '#ef4444'} {...METAL} />
      </mesh>

      {/* Open top rim */}
      {[[-0.5, 0], [0.5, 0], [0, -0.4], [0, 0.4]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.62, z]} castShadow>
          <boxGeometry args={[i < 2 ? 0.05 : 1.0, 0.05, i < 2 ? 0.85 : 0.05]} />
          <meshStandardMaterial color="#dc2626" {...METAL} />
        </mesh>
      ))}

      {/* Items inside (visible from top) */}
      {[-0.2, 0.15].map((x, i) => (
        <mesh key={i} position={[x, 0.45, i * 0.15 - 0.05]}>
          <boxGeometry args={[0.2, 0.15, 0.2]} />
          <meshStandardMaterial color={['#fbbf24', '#34d399'][i]} roughness={0.5} />
        </mesh>
      ))}

      {/* Down arrow symbol on front */}
      <mesh position={[0, 0.3, 0.41]}>
        <boxGeometry args={[0.06, 0.25, 0.01]} />
        <meshStandardMaterial color="#fecaca" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.2, 0.41]} rotation={[0, 0, Math.PI / 4]}>
        <boxGeometry args={[0.06, 0.15, 0.01]} />
        <meshStandardMaterial color="#fecaca" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.2, 0.41]} rotation={[0, 0, -Math.PI / 4]}>
        <boxGeometry args={[0.06, 0.15, 0.01]} />
        <meshStandardMaterial color="#fecaca" roughness={0.8} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.75, 0.85, 32]} />
          <meshBasicMaterial color="#ef4444" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// CONVEYOR — Belt with rollers, frame, and side guards
// ─────────────────────────────────────────────
export function ConveyorModel({ selected }: NodeModelProps) {
  const rollersRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (rollersRef.current) {
      rollersRef.current.children.forEach(child => {
        (child as THREE.Mesh).rotation.z += dt * 3;
      });
    }
  });

  return (
    <group>
      {/* Frame */}
      <mesh position={[0, 0.25, 0]} castShadow>
        <boxGeometry args={[2.0, 0.08, 0.7]} />
        <meshStandardMaterial color="#64748b" {...METAL} />
      </mesh>

      {/* Side rails */}
      {[-0.38, 0.38].map((z, i) => (
        <mesh key={i} position={[0, 0.35, z]} castShadow>
          <boxGeometry args={[2.0, 0.14, 0.04]} />
          <meshStandardMaterial color="#94a3b8" {...METAL} />
        </mesh>
      ))}

      {/* Rollers */}
      <group ref={rollersRef}>
        {Array.from({ length: 8 }, (_, i) => (
          <mesh key={i} position={[-0.85 + i * 0.25, 0.3, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <cylinderGeometry args={[0.04, 0.04, 0.65, 10]} />
            <meshStandardMaterial color="#78838f" roughness={0.3} metalness={0.5} />
          </mesh>
        ))}
      </group>

      {/* Belt surface */}
      <mesh position={[0, 0.35, 0]}>
        <boxGeometry args={[1.9, 0.02, 0.6]} />
        <meshStandardMaterial
          color={selected ? '#fbbf24' : '#f59e0b'}
          roughness={0.6}
          transparent
          opacity={0.3}
        />
      </mesh>

      {/* Legs */}
      {[-0.8, 0.8].map(x => [-0.25, 0.25].map(z => (
        <mesh key={`${x}-${z}`} position={[x, 0.1, z]} castShadow>
          <cylinderGeometry args={[0.03, 0.04, 0.2, 8]} />
          <meshStandardMaterial color="#475569" {...METAL} />
        </mesh>
      )))}

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.1, 1.2, 32]} />
          <meshBasicMaterial color="#f59e0b" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// ASSEMBLY — Wide machine with multiple input ports and robotic arm
// ─────────────────────────────────────────────
export function AssemblyModel({ selected, processing }: NodeModelProps) {
  const armRef = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (armRef.current && processing) {
      armRef.current.rotation.y += dt * 2;
    }
  });

  return (
    <group>
      {/* Wide base */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[1.8, 0.1, 1.4]} />
        <meshStandardMaterial color="#475569" {...METAL} />
      </mesh>

      {/* Main body */}
      <mesh position={[0, 0.55, 0]} castShadow>
        <boxGeometry args={[1.6, 0.9, 1.2]} />
        <meshStandardMaterial color={selected ? '#818cf8' : '#6366f1'} {...METAL} />
      </mesh>

      {/* Input ports (left side - 2 inputs) */}
      {[-0.25, 0.25].map((z, i) => (
        <group key={i}>
          <mesh position={[-0.81, 0.45, z]} castShadow>
            <boxGeometry args={[0.02, 0.3, 0.3]} />
            <meshStandardMaterial color="#312e81" roughness={0.3} />
          </mesh>
          <mesh position={[-0.85, 0.45, z]}>
            <coneGeometry args={[0.1, 0.15, 8]} />
            <meshStandardMaterial color="#a5b4fc" emissive="#6366f1" emissiveIntensity={0.2} />
          </mesh>
        </group>
      ))}

      {/* Output port (right side) */}
      <mesh position={[0.81, 0.45, 0]} castShadow>
        <boxGeometry args={[0.02, 0.35, 0.4]} />
        <meshStandardMaterial color="#312e81" roughness={0.3} />
      </mesh>

      {/* Robotic arm on top */}
      <group ref={armRef} position={[0, 1.05, 0]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.08, 0.1, 0.15, 12]} />
          <meshStandardMaterial color="#64748b" {...METAL} metalness={0.6} />
        </mesh>
        <mesh position={[0.3, 0.1, 0]} castShadow>
          <boxGeometry args={[0.5, 0.06, 0.06]} />
          <meshStandardMaterial color="#94a3b8" {...METAL} metalness={0.5} />
        </mesh>
        {/* Gripper */}
        <mesh position={[0.55, 0.05, 0]} castShadow>
          <boxGeometry args={[0.06, 0.12, 0.1]} />
          <meshStandardMaterial color="#475569" {...METAL} />
        </mesh>
      </group>

      {/* "+" symbol on front */}
      <mesh position={[0, 0.55, 0.61]}>
        <boxGeometry args={[0.25, 0.04, 0.01]} />
        <meshStandardMaterial color="#c7d2fe" roughness={0.8} />
      </mesh>
      <mesh position={[0, 0.55, 0.61]}>
        <boxGeometry args={[0.04, 0.25, 0.01]} />
        <meshStandardMaterial color="#c7d2fe" roughness={0.8} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[1.15, 1.25, 32]} />
          <meshBasicMaterial color="#6366f1" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// INSPECTION — Quality check station with scanning arch
// ─────────────────────────────────────────────
export function InspectionModel({ selected, processing }: NodeModelProps) {
  const scanRef = useRef<THREE.Mesh>(null);
  useFrame(() => {
    if (scanRef.current && processing) {
      scanRef.current.material = scanRef.current.material as THREE.MeshStandardMaterial;
      (scanRef.current.material as THREE.MeshStandardMaterial).emissiveIntensity =
        0.3 + Math.sin(Date.now() * 0.01) * 0.4;
    }
  });

  return (
    <group>
      {/* Base plate with conveyor section */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[1.2, 0.1, 1.0]} />
        <meshStandardMaterial color="#475569" {...METAL} />
      </mesh>

      {/* Scanning arch - left pillar */}
      <mesh position={[-0.45, 0.55, 0]} castShadow>
        <boxGeometry args={[0.1, 1.0, 0.15]} />
        <meshStandardMaterial color={selected ? '#22d3ee' : '#06b6d4'} {...METAL} />
      </mesh>

      {/* Scanning arch - right pillar */}
      <mesh position={[0.45, 0.55, 0]} castShadow>
        <boxGeometry args={[0.1, 1.0, 0.15]} />
        <meshStandardMaterial color={selected ? '#22d3ee' : '#06b6d4'} {...METAL} />
      </mesh>

      {/* Scanning arch - top beam */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <boxGeometry args={[1.0, 0.1, 0.15]} />
        <meshStandardMaterial color="#0891b2" {...METAL} />
      </mesh>

      {/* Scan beam (glowing line) */}
      <mesh ref={scanRef} position={[0, 0.55, 0]}>
        <boxGeometry args={[0.8, 0.01, 0.01]} />
        <meshStandardMaterial
          color="#67e8f9"
          emissive="#06b6d4"
          emissiveIntensity={processing ? 0.8 : 0.1}
          transparent
          opacity={0.8}
        />
      </mesh>

      {/* Camera/sensor on top */}
      <mesh position={[0, 1.15, 0]} castShadow>
        <boxGeometry args={[0.15, 0.1, 0.15]} />
        <meshStandardMaterial color="#1e293b" roughness={0.2} />
      </mesh>
      <mesh position={[0, 1.15, 0.09]}>
        <cylinderGeometry args={[0.04, 0.04, 0.03, 12]} />
        <meshStandardMaterial
          color="#22d3ee"
          emissive="#06b6d4"
          emissiveIntensity={0.4}
          rotation-x={Math.PI / 2}
        />
      </mesh>

      {/* Checkmark symbol */}
      <mesh position={[-0.08, 0.6, 0.5]} rotation={[0, 0, -0.3]}>
        <boxGeometry args={[0.15, 0.03, 0.01]} />
        <meshStandardMaterial color="#a5f3fc" roughness={0.8} />
      </mesh>
      <mesh position={[0.08, 0.65, 0.5]} rotation={[0, 0, 0.5]}>
        <boxGeometry args={[0.25, 0.03, 0.01]} />
        <meshStandardMaterial color="#a5f3fc" roughness={0.8} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.8, 0.9, 32]} />
          <meshBasicMaterial color="#06b6d4" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// OPERATOR — Human figure silhouette with hard hat
// ─────────────────────────────────────────────
export function OperatorModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Body (torso) */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.2, 0.25, 0.6, 12]} />
        <meshStandardMaterial color={selected ? '#a78bfa' : '#8b5cf6'} {...MATTE} />
      </mesh>

      {/* Head */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshStandardMaterial color="#fcd34d" {...MATTE} />
      </mesh>

      {/* Hard hat */}
      <mesh position={[0, 1.05, 0]} castShadow>
        <cylinderGeometry args={[0.18, 0.16, 0.08, 16]} />
        <meshStandardMaterial color="#eab308" roughness={0.4} />
      </mesh>
      <mesh position={[0, 1.02, 0]} castShadow>
        <cylinderGeometry args={[0.22, 0.22, 0.03, 16]} />
        <meshStandardMaterial color="#ca8a04" roughness={0.4} />
      </mesh>

      {/* Arms */}
      {[-1, 1].map(side => (
        <mesh key={side} position={[side * 0.3, 0.5, 0]} rotation={[0, 0, side * 0.3]} castShadow>
          <cylinderGeometry args={[0.05, 0.05, 0.4, 8]} />
          <meshStandardMaterial color="#7c3aed" {...MATTE} />
        </mesh>
      ))}

      {/* Legs */}
      {[-0.1, 0.1].map((x, i) => (
        <mesh key={i} position={[x, 0.12, 0]} castShadow>
          <cylinderGeometry args={[0.06, 0.07, 0.24, 8]} />
          <meshStandardMaterial color="#4c1d95" {...MATTE} />
        </mesh>
      ))}

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.45, 0.55, 32]} />
          <meshBasicMaterial color="#8b5cf6" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// SPLITTER — Y-shaped junction with routing arrows
// ─────────────────────────────────────────────
export function SplitterModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Center hub */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.35, 0.4, 0.5, 6]} />
        <meshStandardMaterial color={selected ? '#2dd4bf' : '#14b8a6'} {...METAL} />
      </mesh>

      {/* Input channel (left) */}
      <mesh position={[-0.6, 0.35, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.3]} />
        <meshStandardMaterial color="#0d9488" {...METAL} />
      </mesh>

      {/* Output channel top-right */}
      <mesh position={[0.4, 0.35, -0.35]} rotation={[0, -0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.3]} />
        <meshStandardMaterial color="#0d9488" {...METAL} />
      </mesh>

      {/* Output channel bottom-right */}
      <mesh position={[0.4, 0.35, 0.35]} rotation={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.3]} />
        <meshStandardMaterial color="#0d9488" {...METAL} />
      </mesh>

      {/* Diverter mechanism on top */}
      <mesh position={[0, 0.7, 0]} castShadow>
        <coneGeometry args={[0.15, 0.2, 3]} />
        <meshStandardMaterial color="#5eead4" {...METAL} />
      </mesh>

      {/* Fork symbol arrows */}
      <mesh position={[0.15, 0.65, 0]} rotation={[0, 0, -Math.PI / 6]}>
        <boxGeometry args={[0.3, 0.02, 0.02]} />
        <meshStandardMaterial color="#ccfbf1" roughness={0.8} />
      </mesh>
      <mesh position={[0.15, 0.65, 0]} rotation={[0, 0, Math.PI / 6]}>
        <boxGeometry args={[0.3, 0.02, 0.02]} />
        <meshStandardMaterial color="#ccfbf1" roughness={0.8} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.65, 0.75, 32]} />
          <meshBasicMaterial color="#14b8a6" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// MERGE — Funnel-shaped merge junction
// ─────────────────────────────────────────────
export function MergeModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Center body (inverted splitter) */}
      <mesh position={[0, 0.4, 0]} castShadow>
        <cylinderGeometry args={[0.4, 0.35, 0.5, 6]} />
        <meshStandardMaterial color={selected ? '#34d399' : '#10b981'} {...METAL} />
      </mesh>

      {/* Input channels (two from left) */}
      <mesh position={[-0.4, 0.35, -0.35]} rotation={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.3]} />
        <meshStandardMaterial color="#059669" {...METAL} />
      </mesh>
      <mesh position={[-0.4, 0.35, 0.35]} rotation={[0, -0.5, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.3]} />
        <meshStandardMaterial color="#059669" {...METAL} />
      </mesh>

      {/* Output channel (right) */}
      <mesh position={[0.6, 0.35, 0]} castShadow>
        <boxGeometry args={[0.5, 0.2, 0.3]} />
        <meshStandardMaterial color="#059669" {...METAL} />
      </mesh>

      {/* Merge arrow on top */}
      <mesh position={[0, 0.7, 0]} rotation={[0, 0, Math.PI]}>
        <coneGeometry args={[0.15, 0.2, 3]} />
        <meshStandardMaterial color="#6ee7b7" {...METAL} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.65, 0.75, 32]} />
          <meshBasicMaterial color="#10b981" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// DISASSEMBLY — Machine that breaks items apart
// ─────────────────────────────────────────────
export function DisassemblyModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Base */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[1.4, 0.1, 1.0]} />
        <meshStandardMaterial color="#475569" {...METAL} />
      </mesh>

      {/* Main body */}
      <mesh position={[0, 0.5, 0]} castShadow>
        <boxGeometry args={[1.2, 0.8, 0.9]} />
        <meshStandardMaterial color={selected ? '#fb923c' : '#f97316'} {...METAL} />
      </mesh>

      {/* Cutting/splitting mechanism on top */}
      <mesh position={[0, 0.95, 0]} castShadow>
        <boxGeometry args={[0.8, 0.08, 0.08]} />
        <meshStandardMaterial color="#94a3b8" metalness={0.7} roughness={0.2} />
      </mesh>

      {/* Single input (left) */}
      <mesh position={[-0.61, 0.45, 0]} castShadow>
        <boxGeometry args={[0.02, 0.35, 0.4]} />
        <meshStandardMaterial color="#7c2d12" roughness={0.3} />
      </mesh>

      {/* Multiple outputs (right) */}
      {[-0.2, 0.2].map((z, i) => (
        <mesh key={i} position={[0.61, 0.45, z]} castShadow>
          <boxGeometry args={[0.02, 0.25, 0.25]} />
          <meshStandardMaterial color="#7c2d12" roughness={0.3} />
        </mesh>
      ))}

      {/* Minus symbol on front */}
      <mesh position={[0, 0.5, 0.46]}>
        <boxGeometry args={[0.3, 0.04, 0.01]} />
        <meshStandardMaterial color="#fed7aa" roughness={0.8} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.9, 1.0, 32]} />
          <meshBasicMaterial color="#f97316" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// PALLETIZE — Elevated platform with stacking area
// ─────────────────────────────────────────────
export function PalletizeModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Pallet base */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.1, 1.0]} />
        <meshStandardMaterial color="#92400e" roughness={0.8} />
      </mesh>
      {/* Pallet slats */}
      {[-0.35, 0, 0.35].map((z, i) => (
        <mesh key={i} position={[0, 0.02, z]}>
          <boxGeometry args={[1.1, 0.04, 0.2]} />
          <meshStandardMaterial color="#a16207" roughness={0.9} />
        </mesh>
      ))}

      {/* Stacked items on pallet */}
      {[0, 1].map(row =>
        [-0.25, 0.25].map((x, col) => (
          <mesh key={`${row}-${col}`} position={[x, 0.22 + row * 0.2, 0]} castShadow>
            <boxGeometry args={[0.35, 0.18, 0.5]} />
            <meshStandardMaterial
              color={row === 0 ? '#d97706' : '#b45309'}
              roughness={0.6}
            />
          </mesh>
        ))
      )}

      {/* Wrapping guides (vertical posts) */}
      {[[-0.55, -0.45], [-0.55, 0.45], [0.55, -0.45], [0.55, 0.45]].map(([x, z], i) => (
        <mesh key={i} position={[x, 0.45, z]} castShadow>
          <cylinderGeometry args={[0.025, 0.025, 0.8, 8]} />
          <meshStandardMaterial color="#78716c" {...METAL} />
        </mesh>
      ))}

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.85, 0.95, 32]} />
          <meshBasicMaterial color="#d97706" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// DEPALLETIZE — Elevated platform with items being removed
// ─────────────────────────────────────────────
export function DepalletizeModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Pallet base */}
      <mesh position={[0, 0.05, 0]} castShadow receiveShadow>
        <boxGeometry args={[1.2, 0.1, 1.0]} />
        <meshStandardMaterial color="#92400e" roughness={0.8} />
      </mesh>

      {/* Fewer items (partially unloaded) */}
      <mesh position={[-0.2, 0.2, 0]} castShadow>
        <boxGeometry args={[0.35, 0.18, 0.5]} />
        <meshStandardMaterial color="#ca8a04" roughness={0.6} />
      </mesh>

      {/* Item floating up (being removed) */}
      <mesh position={[0.25, 0.5, 0]} castShadow>
        <boxGeometry args={[0.3, 0.15, 0.4]} />
        <meshStandardMaterial color="#eab308" roughness={0.5} transparent opacity={0.7} />
      </mesh>

      {/* Lifting mechanism (overhead) */}
      <mesh position={[0, 0.85, 0]} castShadow>
        <boxGeometry args={[1.0, 0.06, 0.06]} />
        <meshStandardMaterial color="#64748b" {...METAL} />
      </mesh>
      {/* Vertical supports */}
      {[-0.5, 0.5].map((x, i) => (
        <mesh key={i} position={[x, 0.5, 0]} castShadow>
          <boxGeometry args={[0.05, 0.7, 0.05]} />
          <meshStandardMaterial color="#94a3b8" {...METAL} />
        </mesh>
      ))}

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.85, 0.95, 32]} />
          <meshBasicMaterial color="#ca8a04" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// MATCH BUFFER — Special buffer with pairing indicators
// ─────────────────────────────────────────────
export function MatchBufferModel({ selected }: NodeModelProps) {
  return (
    <group>
      {/* Frame (similar to buffer but with matching indicator) */}
      {[-0.45, 0.45].map(x => [-0.2, 0.2].map(z => (
        <mesh key={`${x}-${z}`} position={[x, 0.6, z]} castShadow>
          <boxGeometry args={[0.05, 1.2, 0.05]} />
          <meshStandardMaterial color="#7e22ce" {...METAL} />
        </mesh>
      )))}

      {/* Shelves */}
      {[0.15, 0.5, 0.85].map((y, i) => (
        <mesh key={i} position={[0, y, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.95, 0.04, 0.45]} />
          <meshStandardMaterial color="#d8b4fe" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}

      {/* Paired items (color-matched pairs) */}
      {[0.25, 0.6].map((y, row) =>
        [-0.2, 0.2].map((x, col) => (
          <mesh key={`${row}-${col}`} position={[x, y, 0]}>
            <boxGeometry args={[0.15, 0.12, 0.15]} />
            <meshStandardMaterial
              color={col === 0 ? '#c084fc' : '#e879f9'}
              roughness={0.6}
            />
          </mesh>
        ))
      )}

      {/* Match indicator (linked circles on front) */}
      <mesh position={[-0.12, 0.95, 0.23]}>
        <torusGeometry args={[0.06, 0.015, 8, 16]} />
        <meshStandardMaterial color="#e9d5ff" roughness={0.5} />
      </mesh>
      <mesh position={[0.12, 0.95, 0.23]}>
        <torusGeometry args={[0.06, 0.015, 8, 16]} />
        <meshStandardMaterial color="#e9d5ff" roughness={0.5} />
      </mesh>

      {/* Top beam */}
      <mesh position={[0, 1.2, 0]} castShadow>
        <boxGeometry args={[0.95, 0.04, 0.45]} />
        <meshStandardMaterial color="#7e22ce" {...METAL} />
      </mesh>

      {selected && (
        <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry args={[0.7, 0.8, 32]} />
          <meshBasicMaterial color="#a855f7" transparent opacity={0.6} />
        </mesh>
      )}
    </group>
  );
}

// ─────────────────────────────────────────────
// MODEL REGISTRY — maps node type string to component
// ─────────────────────────────────────────────
export const NODE_MODEL_MAP: Record<string, React.FC<NodeModelProps>> = {
  station: StationModel,
  buffer: BufferModel,
  source: SourceModel,
  sink: SinkModel,
  conveyor: ConveyorModel,
  operator: OperatorModel,
  inspection: InspectionModel,
  assembly: AssemblyModel,
  splitter: SplitterModel,
  merge: MergeModel,
  disassembly: DisassemblyModel,
  palletize: PalletizeModel,
  depalletize: DepalletizeModel,
  matchbuffer: MatchBufferModel,
};
