import * as THREE from 'three'

export const ARENA_HALF = 22
const WALL_HEIGHT = 6

export interface Arena {
  group: THREE.Group
  /** Static AABB colliders: movement blockers and hitscan occluders. */
  solids: THREE.Box3[]
}

export interface SpawnPoint {
  pos: [number, number, number]
  yaw: number
}

export const SPAWNS: SpawnPoint[] = [
  { pos: [-18, 0, 18], yaw: Math.PI * 0.75 },
  { pos: [18, 0, 18], yaw: -Math.PI * 0.75 },
  { pos: [18, 0, -18], yaw: -Math.PI * 0.25 },
  { pos: [-18, 0, -18], yaw: Math.PI * 0.25 },
  { pos: [0, 0, 19], yaw: Math.PI },
  { pos: [0, 0, -19], yaw: 0 },
  { pos: [19, 0, 0], yaw: -Math.PI / 2 },
  { pos: [-19, 0, 0], yaw: Math.PI / 2 },
]

interface BoxSpec {
  x: number
  z: number
  w: number
  h: number
  d: number
  y?: number
  accent?: number
}

const COVER: BoxSpec[] = [
  { x: 0, z: 0, w: 4.4, h: 1.2, d: 4.4, accent: 0x38e1ff },
  { x: -10, z: -8, w: 3.2, h: 1.2, d: 3.2 },
  { x: 10, z: 8, w: 3.2, h: 1.2, d: 3.2 },
  { x: -6, z: 13, w: 2.2, h: 1.5, d: 5, accent: 0xff3ea5 },
  { x: 6, z: -13, w: 2.2, h: 1.5, d: 5, accent: 0xff3ea5 },
  { x: -14, z: 4, w: 2.4, h: 2.6, d: 2.4 },
  { x: 14, z: -4, w: 2.4, h: 2.6, d: 2.4 },
  { x: 4, z: 16, w: 4.4, h: 3.2, d: 2 },
  { x: -4, z: -16, w: 4.4, h: 3.2, d: 2 },
  { x: 16, z: 14, w: 3, h: 1, d: 3 },
  { x: -16, z: -14, w: 3, h: 1, d: 3 },
  { x: 11, z: 0, w: 1.4, h: 3.4, d: 7 },
  { x: -11, z: 0, w: 1.4, h: 3.4, d: 7 },
  { x: 0, z: 9, w: 7, h: 0.9, d: 1.6 },
  { x: 0, z: -9, w: 7, h: 0.9, d: 1.6 },
]

function neonEdges(size: THREE.Vector3, color: number): THREE.LineSegments {
  const geo = new THREE.EdgesGeometry(new THREE.BoxGeometry(size.x, size.y, size.z))
  const mat = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.75 })
  return new THREE.LineSegments(geo, mat)
}

export function buildArena(): Arena {
  const group = new THREE.Group()
  const solids: THREE.Box3[] = []
  const half = ARENA_HALF

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(half * 2, 1, half * 2),
    new THREE.MeshStandardMaterial({ color: 0x0a1120, roughness: 0.95, metalness: 0.15 }),
  )
  floor.position.y = -0.5
  floor.receiveShadow = true
  group.add(floor)

  const grid = new THREE.GridHelper(half * 2, half * 2, 0x2a7f9e, 0x14293a)
  grid.position.y = 0.004
  const gridMat = grid.material as THREE.LineBasicMaterial
  gridMat.transparent = true
  gridMat.opacity = 0.55
  group.add(grid)

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x141d2c, roughness: 0.85, metalness: 0.3 })
  const wallDefs: [number, number, number, number][] = [
    [0, -half - 0.5, half * 2 + 2, 1],
    [0, half + 0.5, half * 2 + 2, 1],
    [-half - 0.5, 0, 1, half * 2 + 2],
    [half + 0.5, 0, 1, half * 2 + 2],
  ]
  for (const [x, z, w, d] of wallDefs) {
    const wall = new THREE.Mesh(new THREE.BoxGeometry(w, WALL_HEIGHT, d), wallMat)
    wall.position.set(x, WALL_HEIGHT / 2, z)
    wall.receiveShadow = true
    wall.castShadow = true
    group.add(wall)
    solids.push(
      new THREE.Box3(
        new THREE.Vector3(x - w / 2, 0, z - d / 2),
        new THREE.Vector3(x + w / 2, WALL_HEIGHT, z + d / 2),
      ),
    )
  }

  // Neon trim along the top of each wall.
  const trimMat = new THREE.MeshBasicMaterial({ color: 0x2ee6ff })
  const trimDefs: [number, number, number, number][] = [
    [0, -half + 0.02, half * 2, 0.12],
    [0, half - 0.02, half * 2, 0.12],
    [-half + 0.02, 0, 0.12, half * 2],
    [half - 0.02, 0, 0.12, half * 2],
  ]
  for (const [x, z, w, d] of trimDefs) {
    const trim = new THREE.Mesh(new THREE.BoxGeometry(w, 0.12, d), trimMat)
    trim.position.set(x, WALL_HEIGHT - 0.15, z)
    group.add(trim)
  }

  const crateMat = new THREE.MeshStandardMaterial({ color: 0x1b2739, roughness: 0.65, metalness: 0.45 })

  for (const spec of COVER) {
    const baseY = spec.y ?? 0
    const geo = new THREE.BoxGeometry(spec.w, spec.h, spec.d)
    const mesh = new THREE.Mesh(geo, crateMat)
    mesh.position.set(spec.x, baseY + spec.h / 2, spec.z)
    mesh.castShadow = true
    mesh.receiveShadow = true
    group.add(mesh)

    const accent = spec.accent ?? 0x35506b
    const edges = neonEdges(new THREE.Vector3(spec.w, spec.h, spec.d), accent)
    edges.position.copy(mesh.position)
    group.add(edges)

    solids.push(
      new THREE.Box3(
        new THREE.Vector3(spec.x - spec.w / 2, baseY, spec.z - spec.d / 2),
        new THREE.Vector3(spec.x + spec.w / 2, baseY + spec.h, spec.z + spec.d / 2),
      ),
    )
  }

  return { group, solids }
}
