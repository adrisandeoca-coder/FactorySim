import * as THREE from 'three';

/**
 * Enhanced operator animation system with procedural arm movements,
 * head tracking, and idle behaviors.
 */

type OperatorState = 'working' | 'idle' | 'waiting' | 'walking' | 'looking_around';

interface AnimatedOperator {
  nodeId: string;
  group: THREE.Group;
  figure: THREE.Object3D | null;
  head: THREE.Object3D | null;
  armL: THREE.Object3D | null;
  armR: THREE.Object3D | null;
  legL: THREE.Object3D | null;
  legR: THREE.Object3D | null;
  torso: THREE.Object3D | null;
  state: OperatorState;
  // Animation state
  actionTimer: number;
  actionPhase: number;
  breathPhase: number;
  lookTarget: THREE.Vector3 | null;
  lookTimer: number;
  // Idle behavior
  idleBehavior: 'shifting' | 'stretching' | 'checking_watch' | 'looking';
  idleTimer: number;
}

export class OperatorAnimationManager {
  private operators: Map<string, AnimatedOperator> = new Map();
  private tempVec = new THREE.Vector3();

  /**
   * Register an operator/humanoid figure for enhanced animation.
   */
  register(nodeId: string, group: THREE.Group) {
    let figure: THREE.Object3D | null = null;
    let head: THREE.Object3D | null = null;
    let armL: THREE.Object3D | null = null;
    let armR: THREE.Object3D | null = null;
    let legL: THREE.Object3D | null = null;
    let legR: THREE.Object3D | null = null;
    let torso: THREE.Object3D | null = null;

    group.traverse((child) => {
      switch (child.name) {
        case 'figure': figure = child; break;
        case 'head': head = child; break;
        case 'armLeft': armL = child; break;
        case 'armRight': armR = child; break;
        case 'legL': case 'legLeft': legL = child; break;
        case 'legR': case 'legRight': legR = child; break;
        case 'torso': case 'body': torso = child; break;
      }
    });

    this.operators.set(nodeId, {
      nodeId,
      group,
      figure,
      head,
      armL,
      armR,
      legL,
      legR,
      torso,
      state: 'idle',
      actionTimer: 0,
      actionPhase: Math.random() * Math.PI * 2,
      breathPhase: Math.random() * Math.PI * 2,
      lookTarget: null,
      lookTimer: 0,
      idleBehavior: 'shifting',
      idleTimer: 2 + Math.random() * 3,
    });
  }

  /**
   * Set operator state based on connected station's state.
   */
  setState(nodeId: string, stationState: string) {
    const op = this.operators.get(nodeId);
    if (!op) return;

    switch (stationState) {
      case 'processing':
        op.state = 'working';
        break;
      case 'starved':
      case 'blocked':
        op.state = 'waiting';
        break;
      default:
        op.state = 'idle';
        break;
    }
  }

  /**
   * Set a look target for head tracking.
   */
  setLookTarget(nodeId: string, target: THREE.Vector3 | null) {
    const op = this.operators.get(nodeId);
    if (op) {
      op.lookTarget = target;
      op.lookTimer = 2 + Math.random() * 2; // look for a few seconds
    }
  }

  /**
   * Update all operator animations. Call each frame.
   */
  update(dt: number, elapsed: number) {
    for (const op of this.operators.values()) {
      op.actionPhase += dt;
      op.breathPhase += dt * 0.8;

      // Breathing animation — subtle torso scale
      if (op.torso || op.figure) {
        const target = op.torso || op.figure!;
        const breathScale = 1 + Math.sin(op.breathPhase * 2) * 0.004;
        target.scale.y = breathScale;
      }

      // Head tracking
      this.updateHeadTracking(op, dt, elapsed);

      switch (op.state) {
        case 'working':
          this.animateWorking(op, dt, elapsed);
          break;
        case 'idle':
          this.animateIdle(op, dt, elapsed);
          break;
        case 'waiting':
          this.animateWaiting(op, dt, elapsed);
          break;
      }
    }
  }

  private updateHeadTracking(op: AnimatedOperator, dt: number, elapsed: number) {
    if (!op.head) return;

    if (op.lookTarget && op.lookTimer > 0) {
      op.lookTimer -= dt;

      // Calculate look direction
      this.tempVec.copy(op.lookTarget).sub(op.group.position);
      const targetYaw = Math.atan2(this.tempVec.x, this.tempVec.z) - op.group.rotation.y;
      const clampedYaw = Math.max(-0.8, Math.min(0.8, targetYaw));
      const targetPitch = Math.atan2(this.tempVec.y - 1.5, this.tempVec.length()) * 0.5;
      const clampedPitch = Math.max(-0.3, Math.min(0.3, targetPitch));

      op.head.rotation.y += (clampedYaw - op.head.rotation.y) * Math.min(1, dt * 3);
      op.head.rotation.x += (clampedPitch - op.head.rotation.x) * Math.min(1, dt * 3);
    } else {
      // Return to neutral with slight idle movement
      const idleLook = Math.sin(elapsed * 0.3 + op.actionPhase) * 0.15;
      op.head.rotation.y += (idleLook - op.head.rotation.y) * Math.min(1, dt * 2);
      op.head.rotation.x += (0 - op.head.rotation.x) * Math.min(1, dt * 2);
    }
  }

  private animateWorking(op: AnimatedOperator, _dt: number, elapsed: number) {
    const t = elapsed + op.actionPhase;

    // Arms: active reaching/working motion
    if (op.armL) {
      op.armL.rotation.x += (-0.6 + Math.sin(t * 2.0) * 0.2 - op.armL.rotation.x) * 0.1;
      op.armL.rotation.z += (Math.sin(t * 1.5) * 0.1 - op.armL.rotation.z) * 0.08;
    }
    if (op.armR) {
      op.armR.rotation.x += (-0.5 + Math.cos(t * 2.2) * 0.25 - op.armR.rotation.x) * 0.1;
      op.armR.rotation.z += (Math.cos(t * 1.3) * -0.1 - op.armR.rotation.z) * 0.08;
    }

    // Legs: slight weight shifting
    if (op.legL) {
      op.legL.rotation.x = Math.sin(t * 0.5) * 0.03;
    }
    if (op.legR) {
      op.legR.rotation.x = Math.cos(t * 0.5) * 0.03;
    }

    // Body: lean forward slightly when working
    if (op.figure) {
      op.figure.rotation.x += (0.05 - op.figure.rotation.x) * 0.05;
      op.figure.rotation.y = Math.sin(t * 1.0) * 0.02;
    }
  }

  private animateIdle(op: AnimatedOperator, dt: number, elapsed: number) {
    const t = elapsed + op.actionPhase;

    // Cycle through idle behaviors
    op.idleTimer -= dt;
    if (op.idleTimer <= 0) {
      const behaviors: AnimatedOperator['idleBehavior'][] = ['shifting', 'stretching', 'checking_watch', 'looking'];
      op.idleBehavior = behaviors[Math.floor(Math.random() * behaviors.length)];
      op.idleTimer = 3 + Math.random() * 5;
    }

    switch (op.idleBehavior) {
      case 'shifting':
        // Weight shift side to side
        if (op.figure) {
          op.figure.rotation.y = Math.sin(t * 0.4) * 0.06;
          op.figure.rotation.x += (0 - op.figure.rotation.x) * 0.05;
        }
        if (op.armL) op.armL.rotation.x += (-0.1 - op.armL.rotation.x) * 0.05;
        if (op.armR) op.armR.rotation.x += (-0.1 - op.armR.rotation.x) * 0.05;
        break;

      case 'stretching':
        // Arms raise briefly
        if (op.armL) {
          const stretch = Math.sin(t * 0.6) * 0.5 - 0.3;
          op.armL.rotation.x += (stretch - op.armL.rotation.x) * 0.04;
        }
        if (op.armR) {
          const stretch = Math.sin(t * 0.6 + 0.3) * 0.5 - 0.3;
          op.armR.rotation.x += (stretch - op.armR.rotation.x) * 0.04;
        }
        if (op.figure) {
          op.figure.rotation.x += (-0.05 - op.figure.rotation.x) * 0.03;
        }
        break;

      case 'checking_watch':
        // Left arm raised to look at wrist
        if (op.armL) {
          op.armL.rotation.x += (-0.8 - op.armL.rotation.x) * 0.05;
          op.armL.rotation.z += (0.3 - op.armL.rotation.z) * 0.05;
        }
        if (op.armR) {
          op.armR.rotation.x += (-0.1 - op.armR.rotation.x) * 0.05;
        }
        // Head looks down at wrist
        if (op.head) {
          op.head.rotation.x += (0.3 - op.head.rotation.x) * 0.04;
          op.head.rotation.y += (-0.3 - op.head.rotation.y) * 0.04;
        }
        break;

      case 'looking':
        // Head turns to look around
        if (op.figure) {
          op.figure.rotation.y = Math.sin(t * 0.2) * 0.1;
        }
        if (op.armL) op.armL.rotation.x += (-0.15 - op.armL.rotation.x) * 0.03;
        if (op.armR) op.armR.rotation.x += (-0.15 - op.armR.rotation.x) * 0.03;
        break;
    }
  }

  private animateWaiting(op: AnimatedOperator, _dt: number, elapsed: number) {
    const t = elapsed + op.actionPhase;

    // Crossed arms / hands on hips pose
    if (op.armL) {
      op.armL.rotation.x += (-0.4 - op.armL.rotation.x) * 0.05;
      op.armL.rotation.z += (0.2 - op.armL.rotation.z) * 0.05;
    }
    if (op.armR) {
      op.armR.rotation.x += (-0.4 - op.armR.rotation.x) * 0.05;
      op.armR.rotation.z += (-0.2 - op.armR.rotation.z) * 0.05;
    }

    // Impatient foot tap
    if (op.legR) {
      op.legR.rotation.x = Math.max(0, Math.sin(t * 4) * 0.08);
    }

    // Slight lean back
    if (op.figure) {
      op.figure.rotation.x += (-0.03 - op.figure.rotation.x) * 0.03;
      op.figure.rotation.y = Math.sin(t * 0.3) * 0.04;
    }
  }

  remove(nodeId: string) {
    this.operators.delete(nodeId);
  }

  dispose() {
    this.operators.clear();
  }
}
