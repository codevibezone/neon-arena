/** Keyboard + mouse state for the local player. Pointer lock lives here. */
export class Input {
  readonly keys = new Set<string>()
  locked = false
  firing = false

  private dx = 0
  private dy = 0
  private pressed = new Set<string>()
  private readonly canvas: HTMLCanvasElement
  private readonly container: HTMLElement
  private readonly onLockChange: (locked: boolean) => void
  private readonly onGesture: () => void

  constructor(
    container: HTMLElement,
    canvas: HTMLCanvasElement,
    onLockChange: (locked: boolean) => void,
    onGesture: () => void,
  ) {
    this.container = container
    this.canvas = canvas
    this.onLockChange = onLockChange
    this.onGesture = onGesture

    window.addEventListener('keydown', this.keyDown)
    window.addEventListener('keyup', this.keyUp)
    window.addEventListener('blur', this.blur)
    document.addEventListener('mousemove', this.mouseMove)
    document.addEventListener('mousedown', this.mouseDown)
    document.addEventListener('mouseup', this.mouseUp)
    document.addEventListener('contextmenu', this.preventContext)
    document.addEventListener('pointerlockchange', this.handleLockChange)
    document.addEventListener('pointerlockerror', this.handleLockError)
    container.addEventListener('click', this.click)
  }

  private preventContext = (e: Event) => {
    if (this.locked) e.preventDefault()
  }

  private handleLockError = () => {
    this.locked = false
    this.onLockChange(false)
  }

  private keyDown = (e: KeyboardEvent) => {
    if (e.code === 'Tab' || (e.code === 'Space' && this.locked)) e.preventDefault()
    if (!e.repeat) this.pressed.add(e.code)
    this.keys.add(e.code)
  }

  private keyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code)
  }

  private blur = () => {
    this.keys.clear()
    this.firing = false
  }

  private mouseMove = (e: MouseEvent) => {
    if (!this.locked) return
    this.dx += e.movementX
    this.dy += e.movementY
  }

  private mouseDown = (e: MouseEvent) => {
    if (!this.locked || e.button !== 0) return
    this.firing = true
  }

  private mouseUp = (e: MouseEvent) => {
    if (e.button === 0) this.firing = false
  }

  private click = () => {
    this.onGesture()
    if (!this.locked) this.requestLock()
  }

  private handleLockChange = () => {
    this.locked = document.pointerLockElement === this.canvas
    if (!this.locked) this.firing = false
    this.onLockChange(this.locked)
  }

  requestLock() {
    if (this.locked) return
    try {
      const result = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined
      if (result && typeof result.catch === 'function') result.catch(() => {})
    } catch {
      /* browser refused; the overlay stays up so the player can retry */
    }
  }

  /** Returns the accumulated look delta and clears it. */
  consumeLook(): [number, number] {
    const out: [number, number] = [this.dx, this.dy]
    this.dx = 0
    this.dy = 0
    return out
  }

  takePressed(code: string): boolean {
    return this.pressed.delete(code)
  }

  clearPressed() {
    this.pressed.clear()
  }

  isDown(code: string) {
    return this.keys.has(code)
  }

  dispose() {
    window.removeEventListener('keydown', this.keyDown)
    window.removeEventListener('keyup', this.keyUp)
    window.removeEventListener('blur', this.blur)
    document.removeEventListener('mousemove', this.mouseMove)
    document.removeEventListener('mousedown', this.mouseDown)
    document.removeEventListener('mouseup', this.mouseUp)
    document.removeEventListener('contextmenu', this.preventContext)
    document.removeEventListener('pointerlockchange', this.handleLockChange)
    document.removeEventListener('pointerlockerror', this.handleLockError)
    this.container.removeEventListener('click', this.click)
    if (document.pointerLockElement === this.canvas) document.exitPointerLock()
  }
}
