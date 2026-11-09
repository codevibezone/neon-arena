import * as THREE from 'three'

const PALETTE = [0x38e1ff, 0xff3ea5, 0x9b7bff, 0x4dff9b, 0xffb347, 0xff6b6b, 0x6bd5ff, 0xf0f06a]

export function colorForId(id: string): number {
  let hash = 0
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return PALETTE[hash % PALETTE.length]
}

export interface AvatarView {
  group: THREE.Group
  setMoving(moving: boolean): void
  setHp(hp: number): void
  update(dt: number): void
  dispose(): void
}

function makeTagSprite(name: string, color: number): { sprite: THREE.Sprite; redraw: (hp: number) => void } {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 72
  const ctx = canvas.getContext('2d')!
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }),
  )
  sprite.scale.set(1.9, 0.53, 1)

  const hex = `#${color.toString(16).padStart(6, '0')}`
  let lastHp = -1

  const redraw = (hp: number) => {
    if (hp === lastHp) return
    lastHp = hp
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.font = 'bold 30px ui-sans-serif, system-ui, sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = 'rgba(6, 10, 18, 0.72)'
    ctx.beginPath()
    ctx.roundRect(8, 4, 240, 40, 10)
    ctx.fill()
    ctx.fillStyle = hex
    ctx.fillText(name, 128, 25)

    const pct = Math.max(0, Math.min(1, hp / 100))
    ctx.fillStyle = 'rgba(6, 10, 18, 0.8)'
    ctx.beginPath()
    ctx.roundRect(24, 50, 208, 10, 5)
    ctx.fill()
    ctx.fillStyle = pct > 0.55 ? '#4dff9b' : pct > 0.25 ? '#ffb347' : '#ff5a74'
    ctx.beginPath()
    ctx.roundRect(24, 50, Math.max(2, 208 * pct), 10, 5)
    ctx.fill()
    texture.needsUpdate = true
  }

  redraw(100)
  return { sprite, redraw }
}

/**
 * Blocky low-poly soldier. Faces -Z so a player's yaw can be applied directly
 * (the same convention as the camera).
 */
export function createAvatar(name: string, color: number): AvatarView {
  const group = new THREE.Group()

  const bodyMat = new THREE.MeshStandardMaterial({ color: 0x25324a, roughness: 0.55, metalness: 0.55 })
  const accentMat = new THREE.MeshStandardMaterial({
    color,
    emissive: new THREE.Color(color),
    emissiveIntensity: 0.55,
    roughness: 0.4,
    metalness: 0.3,
  })

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.72, 0.42), bodyMat)
  torso.position.y = 1.16
  torso.castShadow = true
  group.add(torso)

  const chest = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.44), accentMat)
  chest.position.set(0, 1.32, 0)
  group.add(chest)

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.21, 16, 12), bodyMat)
  head.position.y = 1.72
  head.castShadow = true
  group.add(head)

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.1), accentMat)
  visor.position.set(0, 1.74, -0.17)
  group.add(visor)

  const legGeo = new THREE.BoxGeometry(0.2, 0.78, 0.24)
  const legL = new THREE.Mesh(legGeo, bodyMat)
  legL.position.set(-0.16, 0.4, 0)
  legL.castShadow = true
  const legR = new THREE.Mesh(legGeo, bodyMat)
  legR.position.set(0.16, 0.4, 0)
  legR.castShadow = true
  group.add(legL, legR)

  const armGeo = new THREE.BoxGeometry(0.16, 0.56, 0.18)
  const armL = new THREE.Mesh(armGeo, bodyMat)
  armL.position.set(-0.4, 1.18, -0.05)
  const armR = new THREE.Mesh(armGeo, bodyMat)
  armR.position.set(0.4, 1.18, -0.05)
  group.add(armL, armR)

  const gun = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.62), new THREE.MeshStandardMaterial({ color: 0x121a26, metalness: 0.8, roughness: 0.4 }))
  gun.position.set(0.3, 1.2, -0.42)
  group.add(gun)

  const { sprite, redraw } = makeTagSprite(name, color)
  sprite.position.y = 2.25
  group.add(sprite)

  let moving = false
  let walkT = 0

  return {
    group,
    setMoving(next: boolean) {
      moving = next
    },
    setHp(hp: number) {
      redraw(hp)
    },
    update(dt: number) {
      if (moving) {
        walkT += dt * 9
        const swing = Math.sin(walkT) * 0.55
        legL.rotation.x = swing
        legR.rotation.x = -swing
        armL.rotation.x = -swing * 0.7
        armR.rotation.x = swing * 0.7
        group.position.y += Math.sin(walkT * 2) * 0.0025
      } else {
        walkT = 0
        legL.rotation.x *= 0.85
        legR.rotation.x *= 0.85
        armL.rotation.x *= 0.85
        armR.rotation.x *= 0.85
      }
    },
    dispose() {
      group.traverse((obj) => {
        const mesh = obj as THREE.Mesh
        if (mesh.geometry) mesh.geometry.dispose()
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose())
        else mat?.dispose()
      })
      sprite.material.map?.dispose()
      sprite.material.dispose()
    },
  }
}
