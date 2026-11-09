import * as THREE from 'three'

const REST = new THREE.Vector3(0.24, -0.2, -0.46)

/** First-person rifle. Lives as a child of the camera. */
export class WeaponView {
  readonly group = new THREE.Group()
  readonly muzzle = new THREE.Object3D()

  private readonly flash: THREE.Mesh
  private readonly flashLight: THREE.PointLight
  private recoil = 0
  private bobT = 0
  private flashT = 0
  private sway = new THREE.Vector2()

  constructor() {
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x151d2a, roughness: 0.5, metalness: 0.7 })
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0x38e1ff,
      emissive: new THREE.Color(0x38e1ff),
      emissiveIntensity: 1.2,
      roughness: 0.3,
    })

    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.5), bodyMat)
    receiver.position.set(0, 0, -0.1)
    this.group.add(receiver)

    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.44, 8), bodyMat)
    barrel.rotation.x = Math.PI / 2
    barrel.position.set(0, 0.01, -0.55)
    this.group.add(barrel)

    const handguard = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.085, 0.3), bodyMat)
    handguard.position.set(0, 0, -0.42)
    this.group.add(handguard)

    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.22, 0.11), bodyMat)
    mag.position.set(0, -0.14, -0.02)
    mag.rotation.x = 0.16
    this.group.add(mag)

    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.18, 0.09), bodyMat)
    grip.position.set(0, -0.11, 0.16)
    grip.rotation.x = -0.22
    this.group.add(grip)

    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.22), bodyMat)
    stock.position.set(0, -0.01, 0.26)
    this.group.add(stock)

    const sightBase = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.16), bodyMat)
    sightBase.position.set(0, 0.09, -0.16)
    this.group.add(sightBase)

    const dot = new THREE.Mesh(new THREE.SphereGeometry(0.012, 8, 8), trimMat)
    dot.position.set(0, 0.105, -0.24)
    this.group.add(dot)

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.014, 0.34), trimMat)
    rail.position.set(0, 0.072, -0.44)
    this.group.add(rail)

    this.muzzle.position.set(0, 0.01, -0.78)

    this.flash = new THREE.Mesh(
      new THREE.SphereGeometry(0.085, 8, 8),
      new THREE.MeshBasicMaterial({ color: 0xffe6a3, transparent: true, opacity: 0.95 }),
    )
    this.flash.scale.set(1, 1, 1.8)
    this.flash.visible = false
    this.muzzle.add(this.flash)

    this.flashLight = new THREE.PointLight(0xffd48a, 0, 8, 2)
    this.muzzle.add(this.flashLight)

    this.group.add(this.muzzle)
    this.group.position.copy(REST)
  }

  kick() {
    this.recoil = Math.min(this.recoil + 1, 2.6)
    this.flashT = 0.05
  }

  update(dt: number, moveSpeed: number, grounded: boolean, lookDx: number, lookDy: number) {
    this.recoil = Math.max(0, this.recoil - dt * 7.5)
    this.flashT = Math.max(0, this.flashT - dt)
    this.flash.visible = this.flashT > 0
    this.flashLight.intensity = this.flashT > 0 ? 6 : 0

    const speedFactor = Math.min(1, moveSpeed / 8)
    this.bobT += dt * (4 + speedFactor * 9)
    const bobX = Math.sin(this.bobT) * 0.012 * speedFactor
    const bobY = Math.abs(Math.cos(this.bobT)) * 0.014 * speedFactor

    this.sway.x += (-lookDx * 0.00018 - this.sway.x) * Math.min(1, dt * 10)
    this.sway.y += (-lookDy * 0.00018 - this.sway.y) * Math.min(1, dt * 10)

    const recoilKick = this.recoil * 0.035
    this.group.position.set(
      REST.x + bobX + this.sway.x,
      REST.y + bobY + this.sway.y - (grounded ? 0 : 0.03),
      REST.z + recoilKick,
    )
    this.group.rotation.set(recoilKick * 1.6, this.sway.x * 3, 0)
  }

  getMuzzleWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.muzzle.getWorldPosition(target)
  }
}
