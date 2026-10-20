import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"

/* ──────────────────────────────
   Garden Hero
   A dot-grid garden with a grass ground. Tap or click to grow a random,
   procedurally drawn dot plant (flowers, trees, ferns, cacti…) with a
   random height between Min and Max; 1 in 25 comes out golden. Hover
   pushes plants and grass so they sway. Drag a plant to move it; drop it
   at the left, right or bottom edge to remove it. On touch, hold a plant
   briefly to pick it up; a sideways swipe brushes plants and grass, and
   a vertical swipe scrolls the page. Flowering plants
   shed pollen while they sway, and small flocks of dot birds cross the
   sky now and then, scattering when the pointer comes close.
   Every action has a soft synthesized sound, tuned to one scale so it all
   sits together; it starts on the first click or tap, a dot speaker icon
   mutes it, and the choice is remembered.
   Plants are generated from a stored seed, so a saved garden comes back
   identical. Dots are blitted from cached stamps, the grid and soil are
   pre-rendered once, and the loop sleeps when nothing moves.
────────────────────────────── */

type PlantOn = "Ground" | "Anywhere"

interface Props {
    gridColor: string
    soilColor: string
    stemColor: string
    leafColor: string
    leafDarkColor: string
    trunkColor: string
    petalColors: string[]
    centerColor: string
    goldColor: string
    background: string
    textColor: string
    font: React.CSSProperties
    spacing: number
    gridDot: number
    plantDot: number
    minHeight: number
    maxHeight: number
    plantOn: PlantOn
    showGround: boolean
    groundHeight: number
    wind: number
    maxPlants: number
    persist: boolean
    showCounter: boolean
    pollen: boolean
    pollenColor: string
    birds: boolean
    birdColor: string
    birdRate: number
    sound: boolean
    volume: number
    startMuted: boolean
    showMute: boolean
    treeTap: TreeTap
    pollenSound: PollenSound
    ambient: boolean
    ambientVolume: number
}

/* Dot keys:
   p petal (per plant)  c flower centre  o dark centre  s stem  l leaf
   L dark leaf  b trunk  y sunflower petal  r mushroom cap  w white
   v lavender */
type Key = "p" | "c" | "o" | "s" | "l" | "L" | "b" | "y" | "r" | "w" | "v"

interface Dot {
    dx: number // columns from the base
    k: number // rows above the base
    key: Key
}

interface Shape {
    dots: Dot[]
    minDx: number
    maxDx: number
    top: number // highest k
}

const FIXED: Partial<Record<Key, string>> = {
    o: "#6B3F22",
    y: "#FFC83D",
    r: "#E5484D",
    w: "#F2EDE4",
    v: "#A98BFF",
}

const RARE_CHANCE = 1 / 25
const TAP_SLOP = 10
const HOLD_MS = 300
const DIE_MS = 450
const EDGE = 14 // px from the left/right/bottom edge that counts as "remove"
const STORE_KEY = "garden-hero-v2"
const POLLEN_MAX = 260

// Bird wing frames as [dx, dy] dot offsets (y down), cycled up → mid → down → mid
const BIRD_FRAMES: [number, number][][] = [
    [[-2, -2], [-1, -1], [0, 0], [1, -1], [2, -2]],
    [[-2, -1], [-1, -1], [0, 0], [1, -1], [2, -1]],
    [[-2, 1], [-1, 0], [0, 0], [1, 0], [2, 1]],
    [[-2, -1], [-1, -1], [0, 0], [1, -1], [2, -1]],
]
const FLOWER_KEYS = new Set(["p", "c", "y", "v"])

const DEFAULT_FONT = {
    fontFamily: '"Geist Pixel", monospace',
    fontSize: 13,
    fontWeight: 400,
    letterSpacing: 0,
    lineHeight: 1.2,
}

const DEFAULT_PETALS = ["#FF5A2F", "#FF8FB1", "#B48CFF", "#FFFFFF", "#FFD166"]

/* ── Procedural plants ───────────────────────── */

const mulberry = (seed: number) => {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6d2b79f5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

class Canvas {
    m = new Map<string, Dot>()
    put(dx: number, k: number, key: Key) {
        dx = Math.round(dx)
        k = Math.round(k)
        if (k < 0) return
        this.m.set(dx + "," + k, { dx, k, key })
    }
    has(dx: number, k: number) {
        return this.m.has(Math.round(dx) + "," + Math.round(k))
    }
    done(): Shape {
        const dots = Array.from(this.m.values())
        let minDx = 0
        let maxDx = 0
        let top = 0
        for (const d of dots) {
            if (d.dx < minDx) minDx = d.dx
            if (d.dx > maxDx) maxDx = d.dx
            if (d.k > top) top = d.k
        }
        return { dots, minDx, maxDx, top }
    }
}

type Rand = () => number
const between = (R: Rand, a: number, b: number) => a + R() * (b - a)

// A gently bowed stem; returns the x of each row
function stem(cv: Canvas, H: number, R: Rand, wide = false) {
    const amp = between(R, -1, 1) * Math.min(2, H / 10)
    const xs: number[] = []
    for (let k = 0; k < H; k++) {
        const x = Math.round(amp * Math.sin((k / H) * Math.PI * 0.85))
        xs.push(x)
        cv.put(x, k, "s")
        if (wide) cv.put(x + 1, k, "L")
    }
    return xs
}

function leaf(cv: Canvas, x: number, k: number, dir: number, len: number) {
    for (let i = 1; i <= len; i++) {
        const y = k + Math.round(i * 0.55)
        cv.put(x + dir * i, y, "l")
        if (i > 1 && i < len) cv.put(x + dir * i, y - 1, "L")
    }
}

function leavesAlong(cv: Canvas, xs: number[], R: Rand, from: number, to: number, every: number, len: number) {
    let dir = R() < 0.5 ? -1 : 1
    for (let k = Math.round(xs.length * from); k < xs.length * to; k += every + Math.floor(R() * 2)) {
        leaf(cv, xs[k], k, dir, len + (R() < 0.4 ? 1 : 0))
        dir = -dir
    }
}

function head(cv: Canvas, cx: number, ck: number, rad: number, petals: number, inner: number, ring: Key, mid: Key, R: Rand) {
    for (let dy = -rad - 1; dy <= rad + 1; dy++) {
        for (let dx = -rad - 1; dx <= rad + 1; dx++) {
            const d = Math.hypot(dx, dy)
            if (d <= inner) cv.put(cx + dx, ck + dy, R() < 0.25 ? "o" : mid)
            else if (d <= rad + 0.45 && Math.cos(petals * Math.atan2(dy, dx)) > -0.25) cv.put(cx + dx, ck + dy, ring)
        }
    }
}

function daisy(H: number, R: Rand) {
    const cv = new Canvas()
    const rad = Math.max(2, Math.min(4, Math.round(H / 7)))
    const sh = Math.max(3, H - rad * 2)
    const xs = stem(cv, sh, R)
    leavesAlong(cv, xs, R, 0.15, 0.7, Math.max(3, Math.round(sh / 4)), 2)
    head(cv, xs[sh - 1], sh + rad - 1, rad, 8 + Math.floor(R() * 5), rad * 0.4 + 0.3, "p", "c", R)
    return cv.done()
}

function tulip(H: number, R: Rand) {
    const cv = new Canvas()
    const half = H >= 16 ? 3 : 2
    const cupH = half * 2 + 1
    const sh = Math.max(3, H - cupH)
    const xs = stem(cv, sh, R)
    // Two long blade leaves from the base
    const len = Math.round(sh * between(R, 0.4, 0.6))
    for (const dir of [-1, 1]) {
        for (let i = 0; i < len; i++) {
            const x = dir * Math.round(i * 0.3 + 1)
            cv.put(x, i, "l")
            if (i < len * 0.7) cv.put(x + dir, i, "L")
        }
    }
    const cx = xs[sh - 1]
    for (let j = 0; j < cupH - 1; j++) {
        const w = j === 0 ? half - 1 : half
        for (let dx = -w; dx <= w; dx++) cv.put(cx + dx, sh + j, Math.abs(dx) === w && j > 0 ? "p" : dx === 0 && j > 1 ? "c" : "p")
    }
    for (const dx of [-half, 0, half]) cv.put(cx + dx, sh + cupH - 1, "p")
    return cv.done()
}

function sunflower(H: number, R: Rand) {
    const cv = new Canvas()
    const rad = Math.max(3, Math.min(6, Math.round(H / 5)))
    const sh = Math.max(4, H - rad * 2)
    const xs = stem(cv, sh, R, true)
    let dir = R() < 0.5 ? -1 : 1
    for (let k = Math.round(sh * 0.2); k < sh * 0.8; k += Math.max(3, Math.round(sh / 4))) {
        leaf(cv, xs[k] + (dir > 0 ? 1 : 0), k, dir, 4)
        leaf(cv, xs[k] + (dir > 0 ? 1 : 0), k + 1, dir, 3)
        dir = -dir
    }
    const cx = xs[sh - 1]
    const ck = sh + rad - 1
    for (let dy = -rad - 1; dy <= rad + 1; dy++) {
        for (let dx = -rad - 1; dx <= rad + 1; dx++) {
            const d = Math.hypot(dx, dy)
            if (d <= rad * 0.55) cv.put(cx + dx, ck + dy, (dx + dy) % 2 === 0 ? "o" : "b")
            else if (d <= rad + 0.45 && Math.cos(16 * Math.atan2(dy, dx)) > -0.55) cv.put(cx + dx, ck + dy, "y")
        }
    }
    return cv.done()
}

function lavender(H: number, R: Rand) {
    const cv = new Canvas()
    const n = 2 + Math.floor(R() * 3)
    for (let i = 0; i < n; i++) {
        const a = (i - (n - 1) / 2) * 0.22 + between(R, -0.08, 0.08)
        const L = Math.round(H * between(R, 0.75, 1))
        for (let k = 0; k < L; k++) {
            const x = Math.round(Math.sin(a) * k * 0.9)
            if (k > L * 0.55) {
                cv.put(x, k, "v")
                if (k % 2 === 0) cv.put(x - 1, k, "v")
                else cv.put(x + 1, k, "v")
            } else cv.put(x, k, "s")
        }
    }
    for (const dir of [-1, 1]) for (let i = 0; i < 3; i++) cv.put(dir * (i + 1), i, i === 2 ? "L" : "l")
    return cv.done()
}

function mushrooms(H: number, R: Rand) {
    const cv = new Canvas()
    const n = 1 + Math.floor(R() * 3)
    for (let i = 0; i < n; i++) {
        const big = i === 0
        const hs = Math.max(2, Math.round(H * (big ? 0.55 : between(R, 0.25, 0.4))))
        const cr = Math.max(2, Math.min(6, Math.round(hs * 0.8)))
        const ox = big ? 0 : (i === 1 ? -1 : 1) * (cr + 3 + Math.floor(R() * 2))
        for (let k = 0; k < hs; k++) {
            cv.put(ox, k, "w")
            cv.put(ox + 1, k, "w")
        }
        const ch = Math.max(2, Math.round(cr * 0.8))
        for (let dy = 0; dy <= ch; dy++) {
            for (let dx = -cr; dx <= cr + 1; dx++) {
                const nx = (dx - 0.5) / (cr + 0.5)
                const ny = dy / (ch + 0.5)
                if (nx * nx + ny * ny > 1) continue
                cv.put(ox + dx, hs + dy, dy === 0 ? "o" : R() < 0.14 ? "w" : "r")
            }
        }
    }
    return cv.done()
}

function roundTree(H: number, R: Rand) {
    const cv = new Canvas()
    const th = Math.round(H * between(R, 0.35, 0.45))
    for (let k = 0; k <= th; k++) {
        cv.put(0, k, "b")
        cv.put(1, k, "b")
    }
    for (const dx of [-2, -1, 2, 3]) cv.put(dx, 0, "b")
    for (const dir of [-1, 1]) {
        const k0 = Math.round(th * between(R, 0.55, 0.8))
        for (let i = 1; i <= 3; i++) cv.put((dir > 0 ? 1 : 0) + dir * i, k0 + i, "b")
    }
    const cr = Math.max(3, (H - th) / 2 + 1)
    const ck = H - cr
    const blobs: [number, number, number][] = [[0.5, ck, cr * 0.8]]
    for (let i = 0; i < 5; i++) {
        blobs.push([0.5 + between(R, -0.7, 0.7) * cr, ck + between(R, -0.4, 0.4) * cr, cr * between(R, 0.45, 0.7)])
    }
    const span = Math.ceil(cr * 1.6)
    for (let k = Math.floor(ck - span); k <= H; k++) {
        for (let dx = -span; dx <= span + 1; dx++) {
            if (!blobs.some(([bx, by, br]) => Math.hypot(dx - bx, k - by) <= br)) continue
            const shade = (dx - 0.5) / cr - (k - ck) / cr + between(R, -0.4, 0.4)
            cv.put(dx, k, R() < 0.045 ? "p" : shade > 0.35 ? "L" : "l")
        }
    }
    return cv.done()
}

function pine(H: number, R: Rand) {
    const cv = new Canvas()
    const th = Math.max(2, Math.round(H * 0.14))
    for (let k = 0; k <= th + 2; k++) cv.put(0, k, "b")
    const tiers = 3 + Math.floor(R() * 3)
    const fh = H - th
    for (let i = 0; i < tiers; i++) {
        const kb = th + (i * fh) / (tiers + 0.5)
        const tierH = (fh / tiers) * 1.35
        const bw = fh * 0.36 * (1 - i / (tiers + 1))
        for (let j = 0; j <= tierH; j++) {
            const hw = Math.round(bw * (1 - j / tierH))
            const k = Math.round(kb + j)
            if (k > H) break
            for (let dx = -hw; dx <= hw; dx++) cv.put(dx, k, dx > 0 && R() < 0.65 ? "L" : "l")
        }
    }
    cv.put(0, H, "l")
    return cv.done()
}

function fern(H: number, R: Rand) {
    const cv = new Canvas()
    const n = 5 + Math.floor(R() * 3)
    cv.put(0, 0, "s")
    for (let i = 0; i < n; i++) {
        const a0 = -1.1 + (2.2 * i) / (n - 1) + between(R, -0.1, 0.1)
        const L = H * between(R, 0.6, 1) * (1 - Math.abs(a0) * 0.3)
        let a = a0 * 0.35
        let x = 0
        let y = 0
        for (let t = 0; t < L; t++) {
            a += a0 * 0.04
            x += Math.sin(a)
            y += Math.cos(a)
            cv.put(x, y, t < 2 ? "s" : "l")
            if (t > 1 && t % 2 === 0) {
                const len = Math.round((1 - t / L) * 2.5) + 1
                for (const side of [-1, 1]) {
                    for (let m = 1; m <= len; m++) {
                        cv.put(x + Math.cos(a) * m * side, y - Math.sin(a) * m * side + m * 0.3, m === len ? "l" : "L")
                    }
                }
            }
        }
    }
    return cv.done()
}

function cactus(H: number, R: Rand) {
    const cv = new Canvas()
    for (let k = 0; k < H; k++) {
        for (let dx = -1; dx <= 1; dx++) {
            if (k === H - 1 && dx !== 0) continue
            cv.put(dx, k, dx === 0 ? "s" : k % 2 ? "L" : "s")
        }
        if (k > 1 && R() < 0.12) cv.put(R() < 0.5 ? -2 : 2, k, "w")
    }
    const arms = 1 + Math.floor(R() * 2)
    let side = R() < 0.5 ? -1 : 1
    for (let i = 0; i < arms; i++) {
        const ka = Math.round(H * between(R, 0.28, 0.55))
        const out = 2 + Math.floor(R() * 2)
        for (let j = 1; j <= out; j++) {
            cv.put(side * (1 + j), ka, "s")
            cv.put(side * (1 + j), ka + 1, "L")
        }
        const up = Math.round(H * between(R, 0.2, 0.35))
        for (let j = 0; j <= up; j++) {
            cv.put(side * (1 + out), ka + j, "s")
            if (j < up) cv.put(side * (2 + out), ka + j, "L")
        }
        side = -side
    }
    if (R() < 0.6) {
        cv.put(-1, H, "p")
        cv.put(0, H, "c")
        cv.put(1, H, "p")
        cv.put(0, H + 1, "p")
    }
    return cv.done()
}

function bush(H: number, R: Rand) {
    const cv = new Canvas()
    const hw = Math.max(3, Math.round(H * 0.75))
    for (let k = 0; k <= H; k++) {
        for (let dx = -hw; dx <= hw; dx++) {
            const v = (dx / (hw + 0.5)) ** 2 + (k / (H + 0.5)) ** 2
            if (v > 1 - R() * 0.12) continue
            cv.put(dx, k, R() < 0.07 ? "p" : k < H * 0.35 || R() < 0.25 ? "L" : "l")
        }
    }
    return cv.done()
}

// heightScale shrinks naturally small plants within the min–max range
const KINDS: { make: (H: number, R: Rand) => Shape; heightScale: number }[] = [
    { make: daisy, heightScale: 1 },
    { make: tulip, heightScale: 1 },
    { make: sunflower, heightScale: 1 },
    { make: lavender, heightScale: 1 },
    { make: mushrooms, heightScale: 0.4 },
    { make: roundTree, heightScale: 1 },
    { make: pine, heightScale: 1 },
    { make: fern, heightScale: 0.7 },
    { make: cactus, heightScale: 0.8 },
    { make: bush, heightScale: 0.45 },
]

/* ── State ───────────────────────── */

interface Plant {
    type: number
    seed: number
    h: number // height in cells before heightScale
    c: number
    r: number
    fx: number // position as a share of the width (0–1), so a resize spreads plants out again
    fy: number // and of the height, for "Anywhere"
    rare: boolean
    petal: number
    shape: Shape
    H: number // height in cells the shape was built at
    born: number
    phase: number
    bend: number // px of lean at the top, spring driven
    vel: number
    diedAt: number
    flowers: number[] // indices of dots that shed pollen
    sprite: PlantSprite | null // the grown plant pre-drawn in horizontal bands
}

/* A grown plant is drawn once into a sprite of horizontal bands, a few px tall each.
   Each frame then blits one band per row group, shifted by the lean, instead of one
   stamp per dot: far fewer draws, which matters at small grid gaps. */
interface PlantSprite {
    key: string
    cv: HTMLCanvasElement
    per: number // grid rows per band
    nb: number // band count
    pad: number // css px of margin around the dots
    bandD: number // device px per band
}
const BAND_PX = 6

interface Pollen {
    x: number
    y: number
    vx: number
    vy: number
    born: number
    life: number
    color: string
    seed: number
}

interface Bird {
    x: number
    y: number
    vx: number
    vy: number
    phase: number
    flee: number
}

interface Saved {
    plants: { t: number; s: number; h: number; c: number; r: number; x?: number; y?: number; g: boolean; p: number }[]
    planted: number
    rare: number
}

const load = (key: string): Saved | null => {
    try {
        const raw = localStorage.getItem(key)
        return raw ? (JSON.parse(raw) as Saved) : null
    } catch {
        return null
    }
}

const save = (key: string, data: Saved) => {
    try {
        localStorage.setItem(key, JSON.stringify(data))
    } catch {}
}

/* ── Sound ──
   Every sound is synthesized live with Web Audio, so there are no files to
   download. Tuned to A♭ major pentatonic at 96 BPM: mellow e-piano notes over
   a soft sub, bass-drum thuds for sway, all through a warm low-pass and a
   touch of saturation. Nothing plays until the first click or tap; audio
   suspends while the hero is off-screen or the tab is hidden. */

type TreeTap = "Marimba" | "Floor Tom" | "Leaf Shaker" | "Wood Knock"
type PollenSound = "Breath" | "Celesta" | "Dewdrop" | "Glint"

const SCALE = [0, 2, 4, 7, 9] // A♭ B♭ C E♭ F
const BEAT = 60 / 96
const SIX = BEAT / 4 // one 16th note
const MAX_VOICES = 24 // room for a fast touch roll without dropping thuds
const TOUCH_STEP = 20 // px of finger travel per sway thud
const TOUCH_GAP = 14 // ms between touch thuds, at the least
const MUTE_KEY = "garden-hero-muted"
const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12)
const note = (deg: number, base = 56) => {
    const o = Math.floor(deg / 5)
    const i = ((deg % 5) + 5) % 5
    return midi(base + o * 12 + SCALE[i])
}
const rnd = (a: number, b: number) => a + Math.random() * (b - a)
const pick = <T,>(arr: T[]) => arr[Math.floor(Math.random() * arr.length)]

interface ToneOpts {
    freq: number
    to?: number
    type?: OscillatorType
    at?: number
    dur?: number
    gain?: number
    attack?: number
    slide?: number
    pan?: number
    echo?: boolean
    lp?: number
}
interface NoiseOpts {
    at?: number
    dur?: number
    gain?: number
    type?: BiquadFilterType
    freq?: number
    to?: number
    q?: number
    pan?: number
    attack?: number
}

function createSound() {
    let ctx: AudioContext | null = null
    let master: GainNode | null = null
    let echoIn: GainNode | null = null
    let noiseBuf: AudioBuffer | null = null
    let voices = 0
    let volume = 0.35
    let muted = false
    let active = true
    let wantAmbient = false
    let ambientVol = 0.5
    let bed: { bus: GainNode; keep: OscillatorNode[]; timer: number } | null = null
    // Throttles for swipes and pollen
    let travelled = 0
    let lastSway = 0
    let lastMove = 0
    let fingerVel = 0
    let lastPollen = 0
    let lastTap = 0

    const playing = () => !!ctx && !muted && active

    const build = (c: AudioContext) => {
        master = c.createGain()
        master.gain.value = muted ? 0 : volume
        const tape = c.createBiquadFilter()
        tape.type = "lowpass"
        tape.frequency.value = 3600
        tape.Q.value = 0.5
        const warm = c.createWaveShaper()
        const curve = new Float32Array(1024)
        for (let i = 0; i < curve.length; i++) {
            const x = i / 511.5 - 1
            curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6)
        }
        warm.curve = curve
        const comp = c.createDynamicsCompressor()
        comp.threshold.value = -16
        comp.ratio.value = 4
        master.connect(tape).connect(warm).connect(comp).connect(c.destination)
        noiseBuf = c.createBuffer(1, c.sampleRate, c.sampleRate)
        const d = noiseBuf.getChannelData(0)
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
        // Short echo for the rare chime and some pollen
        echoIn = c.createGain()
        const delay = c.createDelay(1)
        delay.delayTime.value = 0.16
        const fb = c.createGain()
        fb.gain.value = 0.35
        const wet = c.createGain()
        wet.gain.value = 0.5
        echoIn.connect(delay)
        delay.connect(fb).connect(delay)
        delay.connect(wet).connect(master)
    }

    const out = (pan = 0, toEcho = false): AudioNode => {
        const c = ctx!
        const p: AudioNode = c.createStereoPanner ? c.createStereoPanner() : c.createGain()
        if ((p as StereoPannerNode).pan) (p as StereoPannerNode).pan.value = Math.max(-1, Math.min(1, pan))
        p.connect(master!)
        if (toEcho) p.connect(echoIn!)
        return p
    }

    const claim = (dur: number) => {
        if (voices >= MAX_VOICES) return false
        voices++
        setTimeout(() => voices--, dur * 1000 + 50)
        return true
    }

    const tone = (o: ToneOpts) => {
        const { freq, to, type = "sine", at = 0, dur = 0.2, gain = 0.2, attack = 0.005, slide = 0.05, pan = 0, echo = false, lp = 0 } = o
        if (!playing() || !claim(dur)) return
        const c = ctx!
        const t = c.currentTime + at
        const osc = c.createOscillator()
        const g = c.createGain()
        osc.type = type
        osc.frequency.setValueAtTime(freq, t)
        if (to) osc.frequency.exponentialRampToValueAtTime(to, t + slide)
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(gain, t + attack)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        if (lp) {
            const f = c.createBiquadFilter()
            f.type = "lowpass"
            f.frequency.value = lp
            f.Q.value = 0.6
            osc.connect(f).connect(g)
        } else osc.connect(g)
        g.connect(out(pan, echo))
        osc.start(t)
        osc.stop(t + dur + 0.02)
    }

    const noise = (o: NoiseOpts) => {
        const { at = 0, dur = 0.15, gain = 0.15, type = "bandpass", freq = 3000, to, q = 0.8, pan = 0, attack = 0.004 } = o
        if (!playing() || !claim(dur)) return
        const c = ctx!
        const t = c.currentTime + at
        const src = c.createBufferSource()
        src.buffer = noiseBuf
        src.playbackRate.value = rnd(0.8, 1.2)
        const f = c.createBiquadFilter()
        f.type = type
        f.Q.value = q
        f.frequency.setValueAtTime(freq, t)
        if (to) f.frequency.exponentialRampToValueAtTime(to, t + dur)
        const g = c.createGain()
        g.gain.setValueAtTime(0.0001, t)
        g.gain.exponentialRampToValueAtTime(gain, t + attack)
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
        src.connect(f).connect(g).connect(out(pan))
        src.start(t, Math.random() * 0.5)
        src.stop(t + dur + 0.02)
    }

    // Mellow e-piano voice: sine body plus a quiet octave partial, low-passed
    const keys = (f: number, o: { at?: number; dur?: number; gain?: number; pan?: number; echo?: boolean; lp?: number } = {}) => {
        const { at = 0, dur = 0.9, gain = 0.12, pan = 0, echo = false, lp = 1700 } = o
        tone({ freq: f, at, dur, gain, attack: 0.012, pan, echo, lp })
        tone({ freq: f * 2.003, at, dur: dur * 0.45, gain: gain * 0.22, attack: 0.008, pan, echo, lp })
    }
    // Round sub note one octave below
    const sub = (f: number, o: { at?: number; dur?: number; gain?: number } = {}) => {
        const { at = 0, dur = 0.5, gain = 0.16 } = o
        tone({ freq: f / 2, at, dur, gain, attack: 0.02, lp: 300 })
    }

    const S = {
        // Taller plants (h near 1) start lower; the rising notes land on 16ths
        spawn(h = Math.random()) {
            const deg = 5 - Math.round(h * 4)
            keys(note(deg), { dur: 1.1, gain: 0.13 })
            sub(note(deg), { dur: 0.7, gain: 0.17 })
            noise({ dur: 0.08, gain: 0.03, type: "lowpass", freq: 900 })
            ;[2, 4, 5].slice(0, pick([2, 3])).forEach((step, i) =>
                keys(note(deg + step), { at: SIX * (i + 1), dur: 0.6, gain: 0.055 })
            )
        },
        // A♭maj9 rolled up in 16ths over a low A♭
        rare() {
            ;[68, 72, 75, 79, 82].forEach((n, i) =>
                keys(midi(n), { at: i * SIX * 0.75, dur: 1.6, gain: 0.06, echo: true, lp: 2200, pan: (i - 2) * 0.2 })
            )
            sub(midi(56), { dur: 1.4, gain: 0.18 })
        },
        // Low leaf swoosh: a soft sub thump under low-passed noise grains
        rustle(intensity = 0.7, pan = 0) {
            tone({ freq: midi(39) * rnd(0.98, 1.02), to: midi(32), dur: 0.24, gain: 0.1 + intensity * 0.16, attack: 0.02, slide: 0.18, pan })
            const grains = 2 + Math.round(intensity * 3)
            for (let i = 0; i < grains; i++) {
                noise({ at: i * rnd(0.03, 0.06), dur: rnd(0.09, 0.16), gain: 0.07 + intensity * 0.11, type: "lowpass", freq: rnd(450, 950), q: rnd(0.5, 0.9), attack: 0.012, pan })
            }
            noise({ at: 0.02, dur: 0.1, gain: 0.02 + intensity * 0.02, freq: rnd(1300, 1800), q: 0.7, pan })
        },
        // Sway: a soft bass-drum thud that drops from ~150 Hz to A♭1, harder swings hit harder.
        // `quick` is a shorter, tighter hit so fast swipes stay crisp
        sway(intensity = 0.7, pan = 0, quick = false) {
            const v = 0.45 + intensity * 0.55
            if (quick) {
                tone({ freq: rnd(135, 160), to: midi(32), slide: 0.04, dur: 0.16, gain: 0.42 * v, attack: 0.002, lp: 900, pan: pan * 0.3 })
                noise({ dur: 0.01, gain: 0.05 * v, type: "lowpass", freq: 2200, attack: 0.001 })
                return
            }
            tone({ freq: rnd(140, 165), to: midi(32), slide: 0.055, dur: 0.38, gain: 0.5 * v, attack: 0.002, lp: 900, pan: pan * 0.3 })
            tone({ freq: midi(32), dur: 0.32, gain: 0.16 * v, attack: 0.01, lp: 200 })
            noise({ dur: 0.014, gain: 0.07 * v, type: "lowpass", freq: 2200, attack: 0.001 })
            noise({ at: 0.01, dur: 0.12, gain: 0.025 * v, type: "lowpass", freq: rnd(600, 900), q: 0.6, attack: 0.01, pan })
        },
        // Tree taps
        marimba() {
            const f = note(Math.floor(rnd(0, 5)))
            tone({ freq: f, dur: 0.55, gain: 0.22, attack: 0.002, lp: 2400 })
            tone({ freq: f * 4, dur: 0.07, gain: 0.05, attack: 0.001, lp: 3000 })
            tone({ freq: f / 2, dur: 0.3, gain: 0.08, attack: 0.004, lp: 300 })
            noise({ at: 0.01, dur: 0.1, gain: 0.02, type: "lowpass", freq: 800, attack: 0.01 })
        },
        tom() {
            tone({ freq: midi(51) * rnd(1.4, 1.55), to: midi(44), slide: 0.09, dur: 0.5, gain: 0.38, attack: 0.002, lp: 700 })
            tone({ freq: midi(44) * 1.5, dur: 0.12, gain: 0.05, attack: 0.002, lp: 900 })
            noise({ dur: 0.025, gain: 0.07, type: "lowpass", freq: 1500, attack: 0.001 })
            noise({ at: 0.015, dur: 0.14, gain: 0.025, type: "lowpass", freq: 700, attack: 0.01 })
        },
        shaker() {
            tone({ freq: midi(44), to: midi(32), slide: 0.06, dur: 0.22, gain: 0.16, attack: 0.003, lp: 400 })
            ;[0, SIX, SIX * 2].slice(0, pick([2, 3])).forEach((at, i) =>
                noise({ at, dur: rnd(0.05, 0.08), gain: i ? 0.06 : 0.09, freq: rnd(2200, 2900), q: 1.1, attack: 0.008, pan: rnd(-0.3, 0.3) })
            )
        },
        knock() {
            tone({ freq: midi(44), to: midi(32), dur: 0.2, gain: 0.3, slide: 0.12, lp: 600 })
            tone({ freq: midi(63), dur: 0.09, gain: 0.05, lp: 1200 })
            noise({ dur: 0.04, gain: 0.07, type: "lowpass", freq: 800 })
            S.rustle(0.5)
        },
        flower(kind: PollenSound) {
            S.rustle(0.45)
            noise({ at: 0.03, dur: 0.2, gain: 0.05, freq: 2400, to: 700, q: 0.6 })
            for (let i = 0; i < 3; i++) S.pollen(kind, rnd(-0.4, 0.4), SIX * (i + 1))
        },
        pollen(kind: PollenSound, pan = rnd(-0.5, 0.5), at = 0) {
            if (kind === "Celesta") {
                keys(note(Math.floor(rnd(10, 15))), { at, dur: rnd(0.4, 0.7), gain: 0.03, pan, lp: 2400 })
            } else if (kind === "Dewdrop") {
                const f = note(Math.floor(rnd(7, 12)))
                tone({ freq: f * 0.7, to: f, slide: 0.03, at, dur: rnd(0.16, 0.26), gain: 0.06, attack: 0.003, pan, echo: true, lp: 2000 })
                tone({ freq: f * 2.76, at, dur: 0.05, gain: 0.006, attack: 0.002, pan, lp: 3200 })
            } else if (kind === "Glint") {
                const f = note(Math.floor(rnd(9, 13)))
                tone({ freq: f * 0.75, to: f, slide: 0.025, at, dur: 0.1, gain: 0.04, attack: 0.002, pan, lp: 2200 })
                keys(f, { at: at + 0.012, dur: rnd(0.45, 0.65), gain: 0.026, pan, echo: true, lp: 2400 })
                tone({ freq: f * 2.76, at, dur: 0.04, gain: 0.004, attack: 0.002, pan, lp: 3200 })
            } else {
                // Breath: noise tuned tight to a note with a faint tone inside, like an airy flute
                const f = note(Math.floor(rnd(7, 12)))
                noise({ at, dur: rnd(0.35, 0.5), gain: 0.22, type: "bandpass", freq: f, q: 28, attack: 0.05, pan })
                tone({ freq: f, at: at + 0.02, dur: 0.4, gain: 0.014, attack: 0.06, pan, lp: 2000 })
            }
        },
        pickup() {
            keys(note(5), { dur: 0.3, gain: 0.08 })
            keys(note(7), { at: SIX / 2, dur: 0.35, gain: 0.08 })
            S.rustle(0.25)
        },
        drop() {
            tone({ freq: midi(44), to: midi(37), dur: 0.26, gain: 0.26, slide: 0.12, lp: 500 })
            noise({ dur: 0.08, gain: 0.05, type: "lowpass", freq: 600 })
        },
        // Four notes falling down the scale in 16ths, with a soft swoosh
        remove() {
            ;[9, 7, 5, 2].forEach((d, i) => keys(note(d), { at: i * SIX, dur: 0.5, gain: 0.07 * (1 - i * 0.18) }))
            noise({ dur: 0.45, gain: 0.04, type: "lowpass", freq: 1500, to: 300 })
        },
        chirp(at = 0, pan = 0, gain = 0.05) {
            const f = rnd(1500, 2100)
            tone({ freq: f, to: f * rnd(1.3, 1.45), at, dur: 0.08, gain, slide: 0.05, pan, lp: 3000 })
            tone({ freq: f * 1.4, to: f * 1.05, at: at + 0.085, dur: 0.07, gain: gain * 0.8, slide: 0.05, pan, lp: 3000 })
        },
        flock(pan: number) {
            S.chirp(0, pan, 0.035)
            if (Math.random() < 0.7) S.chirp(SIX * 2, pan * 0.8, 0.028)
        },
        scatter(pan: number) {
            if (!playing()) return
            const c = ctx!
            // Wing flutter: noise chopped quickly by a square-wave LFO
            if (claim(0.6)) {
                const t = c.currentTime
                const src = c.createBufferSource()
                src.buffer = noiseBuf
                src.loop = true
                const f = c.createBiquadFilter()
                f.type = "bandpass"
                f.frequency.value = 900
                f.Q.value = 0.8
                const g = c.createGain()
                g.gain.value = 0
                const lfo = c.createOscillator()
                lfo.type = "square"
                lfo.frequency.value = rnd(16, 22)
                const depth = c.createGain()
                depth.gain.value = 0.09
                const env = c.createGain()
                env.gain.setValueAtTime(1, t)
                env.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
                lfo.connect(depth).connect(g.gain)
                src.connect(f).connect(g).connect(env).connect(out(pan * 0.5))
                src.start(t)
                lfo.start(t)
                src.stop(t + 0.6)
                lfo.stop(t + 0.6)
            }
            const n = 3 + Math.floor(Math.random() * 3)
            for (let i = 0; i < n; i++) S.chirp(SIX * Math.floor(rnd(0, 4)) + rnd(0, 0.04), rnd(-0.8, 0.8), 0.045)
        },
    }

    // Ambient: a soft pad on bright major chords (A♭maj9 → D♭maj9♯11 → E♭add9 → D♭ over E♭),
    // four bars each, with gentle overlapping notes rolling up and down each chord in 8ths.
    // Mid-range and low-passed so it stays behind the interaction sounds.
    const PAD_CHORDS = [
        { root: 44, notes: [56, 60, 63, 67, 70] },
        { root: 49, notes: [53, 56, 60, 63, 67] },
        { root: 51, notes: [55, 58, 63, 65, 70] },
        { root: 51, notes: [53, 56, 61, 65, 68] },
    ]
    const PAD_LEN = BEAT * 16
    const ARP = [0, 1, 2, 3, 4, 3, 2, 1]

    // A note on the ambient bed: linear swell in, hold, linear fade out
    const swell = (dest: AudioNode, freq: number, t: number, dur: number, gain: number, type: OscillatorType, attack: number, release: number, pan = 0, detune = 0) => {
        const c = ctx!
        const o = c.createOscillator()
        const g = c.createGain()
        o.type = type
        o.frequency.value = freq
        o.detune.value = detune
        g.gain.setValueAtTime(0.0001, t)
        g.gain.linearRampToValueAtTime(gain, t + attack)
        g.gain.setValueAtTime(gain, t + Math.max(attack, dur - release))
        g.gain.linearRampToValueAtTime(0.0001, t + dur)
        const p: AudioNode = c.createStereoPanner ? c.createStereoPanner() : c.createGain()
        if ((p as StereoPannerNode).pan) (p as StereoPannerNode).pan.value = pan
        o.connect(g).connect(p).connect(dest)
        o.start(t)
        o.stop(t + dur + 0.05)
    }

    const startAmbient = () => {
        const c = ctx
        if (!c || bed) return
        const bus = c.createGain()
        bus.gain.value = 0
        bus.gain.setTargetAtTime(ambientVol, c.currentTime, 1.5)
        bus.connect(master!)
        const lp = c.createBiquadFilter()
        lp.type = "lowpass"
        lp.frequency.value = 800
        lp.Q.value = 0.7
        lp.connect(bus)
        // The filter breathes open and closed very slowly
        const lfo = c.createOscillator()
        lfo.frequency.value = 0.05
        const lg = c.createGain()
        lg.gain.value = 280
        lfo.connect(lg).connect(lp.frequency)
        lfo.start()
        let step = 0
        let next = c.currentTime + 0.1
        let arp = next
        let i = 0
        // Schedules ~1.2 s ahead. While the context is suspended its clock stops, so nothing piles up
        const pump = () => {
            if (!ctx) return
            const now = ctx.currentTime
            const until = now + 1.2
            if (next < now) {
                const skip = Math.ceil((now - next) / PAD_LEN) * PAD_LEN
                next += skip
                arp += skip
            }
            while (next < until) {
                const ch = PAD_CHORDS[step % 4]
                ch.notes.forEach((n, k) => {
                    for (const det of [-8, 0, 8]) swell(lp, midi(n), next, PAD_LEN + 3, 0.01, "sawtooth", 1.8, 3, (k - 2) * 0.18, det)
                })
                swell(bus, midi(ch.root), next, PAD_LEN + 3, 0.07, "triangle", 1.5, 3)
                step++
                next += PAD_LEN
            }
            while (arp < until) {
                const idx = step + Math.floor((arp - next) / PAD_LEN)
                const n = PAD_CHORDS[((idx % 4) + 4) % 4].notes[ARP[i % 8]]
                swell(lp, midi(n), arp, 0.9, 0.05, "triangle", 0.04, 0.8, rnd(-0.3, 0.3))
                swell(lp, midi(n), arp, 0.9, 0.03, "sine", 0.04, 0.8)
                i++
                arp += BEAT / 2
            }
        }
        pump()
        bed = { bus, keep: [lfo], timer: window.setInterval(pump, 200) }
    }
    const stopAmbient = () => {
        const b = bed
        if (!b || !ctx) return
        bed = null
        clearInterval(b.timer)
        b.bus.gain.cancelScheduledValues(ctx.currentTime)
        b.bus.gain.setTargetAtTime(0, ctx.currentTime, 0.6)
        setTimeout(() => {
            b.keep.forEach((o) => {
                try {
                    o.stop()
                } catch {}
            })
            b.bus.disconnect()
        }, 4000)
    }

    // Resume when we should be heard, suspend otherwise (saves battery off-screen)
    const sync = () => {
        if (!ctx) return
        if (master) master.gain.setTargetAtTime(muted ? 0 : volume, ctx.currentTime, 0.03)
        if (muted || !active) {
            if (ctx.state === "running") ctx.suspend().catch(() => {})
        } else if (ctx.state !== "running") ctx.resume().catch(() => {})
        if (wantAmbient && !muted) startAmbient()
        else stopAmbient()
    }

    return {
        // Call from a click or tap: browsers only allow audio after one
        unlock() {
            if (!ctx) {
                const AC = window.AudioContext || (window as any).webkitAudioContext
                if (!AC) return
                ctx = new AC() as AudioContext
                build(ctx)
            }
            sync()
        },
        setMuted(m: boolean) {
            muted = m
            sync()
        },
        setActive(a: boolean) {
            active = a
            sync()
        },
        setVolume(v: number) {
            volume = Math.max(0, Math.min(1, v))
            sync()
        },
        setAmbient(on: boolean, vol: number) {
            wantAmbient = on
            ambientVol = Math.max(0, Math.min(1, vol))
            if (bed && ctx) bed.bus.gain.setTargetAtTime(ambientVol, ctx.currentTime, 0.3)
            sync()
        },
        event(name: string, d: any, treeTap: TreeTap, pollen: PollenSound) {
            if (!playing()) return
            const now = performance.now()
            switch (name) {
                case "spawn":
                    S.spawn(d.h)
                    if (d.rare) setTimeout(S.rare, SIX * 4000)
                    break
                case "sway": {
                    const dx = Math.abs(d.dx || 0)
                    const gap = now - lastSway
                    if (d.touch) {
                        // Touch follows finger speed: one thud per TOUCH_STEP px, and the
                        // smoothed speed sets how hard it hits, so a slow drag ticks softly
                        // and a fast flick rolls loud and dense. A fresh swipe hits at once
                        const dt = Math.max(8, Math.min(100, now - lastMove))
                        lastMove = now
                        const v = dx / dt
                        fingerVel = gap > 250 ? v : fingerVel * 0.4 + v * 0.6
                        if (gap > 250) travelled = TOUCH_STEP
                        travelled += dx
                        if (travelled >= TOUCH_STEP && gap >= TOUCH_GAP) {
                            travelled = Math.min(travelled - TOUCH_STEP, TOUCH_STEP)
                            lastSway = now
                            S.sway(0.15 + Math.min(1, fingerVel / 1.2) * 0.85, d.pan, gap < 140)
                        }
                        break
                    }
                    // Mouse: a thud for every ~30px travelled so the drum keeps pace with
                    // the hand; at least 40 ms apart, and quick hits when they come fast
                    travelled += dx
                    if (travelled >= 30 && gap >= 40) {
                        travelled = Math.min(travelled - 30, 60)
                        lastSway = now
                        S.sway(0.3 + Math.min(1, dx / 25) * 0.7, d.pan, gap < 140)
                    }
                    break
                }
                case "tap":
                    lastTap = now
                    if (d.flower) S.flower(pollen)
                    else if (treeTap === "Floor Tom") S.tom()
                    else if (treeTap === "Leaf Shaker") S.shaker()
                    else if (treeTap === "Wood Knock") S.knock()
                    else S.marimba()
                    break
                case "pollen":
                    // Flower taps already carry their own pollen notes
                    if (now - lastTap > 400 && now - lastPollen > 250) {
                        lastPollen = now
                        S.pollen(pollen, d.pan)
                    }
                    break
                case "pickup":
                    S.pickup()
                    break
                case "drop":
                    S.drop()
                    break
                case "remove":
                    S.remove()
                    break
                case "flock":
                    S.flock(d.pan)
                    break
                case "scatter":
                    S.scatter(d.pan)
                    break
            }
        },
        close() {
            const c = ctx
            ctx = null
            if (bed) {
                clearInterval(bed.timer)
                bed = null
            }
            c?.close().catch(() => {})
        },
    }
}

const loadMuted = (fallback: boolean) => {
    try {
        const v = localStorage.getItem(MUTE_KEY)
        return v === "1" ? true : v === "0" ? false : fallback
    } catch {
        return fallback
    }
}

// Dot-style speaker on an 8×7 grid; waves when on, a cross when muted
const SPEAKER = [[0, 2], [0, 3], [0, 4], [1, 2], [1, 3], [1, 4], [2, 1], [2, 2], [2, 3], [2, 4], [2, 5], [3, 0], [3, 1], [3, 2], [3, 3], [3, 4], [3, 5], [3, 6]]
const WAVES = [[5, 2], [5, 3], [5, 4], [6, 1], [7, 2], [7, 3], [7, 4], [6, 5]]
const CROSS = [[5, 2], [7, 2], [6, 3], [5, 4], [7, 4]]

function MuteIcon({ muted, color }: { muted: boolean; color: string }) {
    const dots = SPEAKER.concat(muted ? CROSS : WAVES)
    return (
        <svg width="20" height="17.5" viewBox="0 0 20 17.5" aria-hidden="true" style={{ display: "block" }}>
            {dots.map(([x, y]) => (
                <circle key={x + "," + y} cx={1.25 + x * 2.5} cy={1.25 + y * 2.5} r={0.95} fill={color} />
            ))}
        </svg>
    )
}

const STIFF = 55 // spring stiffness (1/s²)
const DAMP = 5 // spring damping (1/s)

export default function GardenHero(props: Partial<Props>) {
    const {
        gridColor = "rgba(255,255,255,0.08)",
        soilColor = "#7A5236",
        stemColor = "#5DBB63",
        leafColor = "#4CAF50",
        leafDarkColor = "#2E7D3A",
        trunkColor = "#8B5A3C",
        petalColors = DEFAULT_PETALS,
        centerColor = "#FFD166",
        goldColor = "#FFD700",
        background = "transparent",
        textColor = "rgba(255,255,255,0.55)",
        font = DEFAULT_FONT,
        spacing = 9,
        gridDot = 0.9,
        plantDot = 2.4,
        minHeight = 90,
        maxHeight = 280,
        plantOn = "Ground",
        showGround = true,
        groundHeight = 45,
        wind = 1,
        maxPlants = 30,
        persist = true,
        showCounter = true,
        pollen = true,
        pollenColor = "#FFE9A8",
        birds = true,
        birdColor = "rgba(255,255,255,0.75)",
        birdRate = 4,
        sound = true,
        volume = 0.35,
        startMuted = false,
        showMute = true,
        treeTap = "Marimba",
        pollenSound = "Breath",
        ambient = false,
        ambientVolume = 0.5,
    } = props

    const wrapRef = React.useRef<HTMLDivElement>(null)
    const canvasRef = React.useRef<HTMLCanvasElement>(null)
    const isCanvas = RenderTarget.current() === RenderTarget.canvas
    const [hud, setHud] = React.useState("")

    const live = {
        gridColor, soilColor, stemColor, leafColor, leafDarkColor, trunkColor, petalColors,
        centerColor, goldColor, gridDot, plantDot, minHeight, maxHeight, wind, maxPlants, persist,
        pollen, pollenColor, birds, birdColor, birdRate, treeTap, pollenSound,
    }
    const cfg = React.useRef(live)
    cfg.current = live

    // One sound engine per garden; none in the Framer editor
    const soundRef = React.useRef<ReturnType<typeof createSound> | null>(null)
    const [muted, setMuted] = React.useState(startMuted)
    React.useEffect(() => {
        if (isCanvas || !sound) return
        const eng = createSound()
        const m = loadMuted(startMuted)
        eng.setMuted(m)
        setMuted(m)
        soundRef.current = eng
        return () => {
            eng.close()
            soundRef.current = null
        }
    }, [isCanvas, sound, startMuted])
    React.useEffect(() => {
        soundRef.current?.setVolume(volume)
    }, [isCanvas, sound, startMuted, volume])
    React.useEffect(() => {
        soundRef.current?.setAmbient(ambient, ambientVolume)
    }, [isCanvas, sound, startMuted, ambient, ambientVolume])

    const toggleMute = () => {
        const eng = soundRef.current
        if (!eng) return
        const m = !muted
        eng.setMuted(m)
        if (!m) eng.unlock()
        setMuted(m)
        try {
            localStorage.setItem(MUTE_KEY, m ? "1" : "0")
        } catch {}
    }

    React.useEffect(() => {
        const wrap = wrapRef.current
        const canvas = canvasRef.current
        if (!wrap || !canvas) return
        const ctx = canvas.getContext("2d")
        if (!ctx) return

        const reduceMotion =
            typeof matchMedia !== "undefined" &&
            matchMedia("(prefers-reduced-motion: reduce)").matches
        const coarse =
            typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches
        const onGround = plantOn === "Ground"
        // Each garden on a site saves on its own. Gardens are told apart by their height
        // range, grid gap and placement, so two instances with different settings never
        // load each other's plants.
        const storeKey = `${STORE_KEY}:${minHeight}-${maxHeight}-${spacing}-${plantOn}`

        let w = 0
        let h = 0
        let dpr = 1
        let s = 9
        let cols = 1
        let rows = 1
        let ox = 0
        let oy = 0
        let groundTop = 1 // first soil row (rows when there is no ground)
        let baseRow = 0 // where ground plants and grass blades stand
        let plants: Plant[] = []
        let planted = 0
        let rareFound = 0
        let visible = true
        let raf = 0
        let lastT = 0
        let pollenList: Pollen[] = []
        let birdList: Bird[] = []
        let nextBirdAt = performance.now() + 2500
        let birdTimer = 0

        // Grass blades, one per column
        let bladeH = new Uint8Array(0)
        let bladeTone = new Uint8Array(0)
        let bladeBend = new Float32Array(0)
        let bladeVel = new Float32Array(0)

        // Pre-rendered grid + soil
        const bg = document.createElement("canvas")
        let bgKey = ""

        // Cached dot stamps, one per colour
        const STAMP = 32
        const stamps = new Map<string, HTMLCanvasElement>()
        const stamp = (color: string) => {
            let st = stamps.get(color)
            if (!st) {
                st = document.createElement("canvas")
                st.width = st.height = STAMP
                const g = st.getContext("2d")!
                g.fillStyle = color
                g.beginPath()
                g.arc(STAMP / 2, STAMP / 2, STAMP / 2 - 0.5, 0, Math.PI * 2)
                g.fill()
                stamps.set(color, st)
            }
            return st
        }
        const dot = (color: string, x: number, y: number, r: number) => {
            if (r <= 0.05) return
            ctx.drawImage(stamp(color), x - r, y - r, r * 2, r * 2)
        }

        // Drag / press state
        let drag: Plant | null = null
        let dragX = 0
        let dragY = 0
        let grabDX = 0
        let grabDY = 0
        let downId = -1
        let downX = 0
        let downY = 0
        let downPlant: Plant | null = null
        let holdTimer = 0
        let moved = false
        let lastPX = -1
        let lastPY = -1

        const hint = coarse ? "Tap to plant · Hold to move" : "Click to plant · Drag to move"
        let hudText = ""
        const setHudOnce = (t: string) => {
            if (t !== hudText) {
                hudText = t
                setHud(t)
            }
        }
        const updateHud = (removing = false) => {
            if (drag) setHudOnce(removing ? "Release to remove" : "Drop at the edge to remove")
            else if (planted === 0) setHudOnce(hint)
            else setHudOnce(`${planted} planted` + (rareFound ? ` · ${rareFound} rare found` : "") + ` · ${hint}`)
        }

        const persistNow = () => {
            if (!cfg.current.persist) return
            save(storeKey, {
                plants: plants
                    .filter((p) => !p.diedAt)
                    .map((p) => ({ t: p.type, s: p.seed, h: p.h, c: p.c, r: p.r, x: p.fx, y: p.fy, g: p.rare, p: p.petal })),
                planted,
                rare: rareFound,
            })
        }

        const fit = (p: Plant) => {
            const sh = p.shape
            p.c = Math.min(Math.max(p.c, -sh.minDx), Math.max(-sh.minDx, cols - 1 - sh.maxDx))
            p.r = onGround ? baseRow : Math.min(Math.max(p.r, sh.top), rows - 1)
        }
        // Framer can mount the component before it has a size; a share worked out from
        // that would put every plant in the middle, so shares are only taken once sized
        const sized = () => cols > 8 && rows > 8
        // Put a plant on a cell and remember where that sits as a share of the garden
        const place = (p: Plant, c: number, r: number) => {
            p.c = c
            p.r = r
            fit(p)
            if (!sized()) return
            p.fx = p.c / (cols - 1)
            p.fy = p.r / (rows - 1)
        }
        // Move a plant to its shares of the current grid
        const toShare = (p: Plant) => {
            p.c = Math.round(p.fx * (cols - 1))
            p.r = Math.round(p.fy * (rows - 1))
            fit(p)
        }

        const heightFor = (type: number, hCells: number) => {
            const limit = Math.max(4, (onGround ? baseRow : rows) - 2)
            return Math.max(4, Math.min(limit, Math.round(hCells * KINDS[type].heightScale)))
        }
        const setShape = (p: Plant, H: number) => {
            p.H = H
            p.shape = KINDS[p.type].make(H, mulberry(p.seed))
            p.sprite = null
            p.flowers = []
            p.shape.dots.forEach((d, n) => {
                if (FLOWER_KEYS.has(d.key)) p.flowers.push(n)
            })
        }

        // Keep a height inside Min–Max Height. Saved plants from other settings get a height
        // in range picked from their seed, so they come back the same each time.
        const inRange = (hCells: number, seed: number) => {
            const c = cfg.current
            const lo = Math.round(Math.min(c.minHeight, c.maxHeight) / s)
            const hi = Math.round(Math.max(c.minHeight, c.maxHeight) / s)
            if (hCells >= lo && hCells <= hi) return hCells
            return Math.round(lo + (((seed >>> 0) % 1000) / 1000) * (hi - lo))
        }

        const makePlant = (type: number, seed: number, hCells: number, c: number, r: number, born: number): Plant => {
            const kind = KINDS[type]
            hCells = inRange(hCells, seed)
            const H = heightFor(type, hCells)
            const p: Plant = {
                type, seed, h: hCells, c, r, fx: 0.5, fy: 1,
                rare: false,
                petal: seed % 997,
                shape: kind.make(H, mulberry(seed)),
                H,
                born,
                phase: (seed % 628) / 100,
                bend: 0,
                vel: 0,
                diedAt: 0,
                flowers: [],
                sprite: null,
            }
            p.shape.dots.forEach((d, n) => {
                if (FLOWER_KEYS.has(d.key)) p.flowers.push(n)
            })
            place(p, c, r)
            return p
        }

        const randomHeight = () => {
            const c = cfg.current
            const lo = Math.min(c.minHeight, c.maxHeight)
            const hi = Math.max(c.minHeight, c.maxHeight)
            return Math.round(between(Math.random, lo, hi) / s)
        }

        const emit = (name: string, data: any = {}) => {
            const c = cfg.current
            soundRef.current?.event(name, data, c.treeTap, c.pollenSound)
        }
        const panAt = (x: number) => Math.max(-1, Math.min(1, (x / Math.max(1, w)) * 2 - 1))

        const spawn = (c: number, r: number) => {
            const now = performance.now()
            const p = makePlant(
                Math.floor(Math.random() * KINDS.length),
                (Math.random() * 2 ** 31) | 0,
                randomHeight(),
                c, r, now
            )
            p.rare = Math.random() < RARE_CHANCE
            plants.push(p)
            planted++
            if (p.rare) rareFound++
            emit("spawn", {
                h: Math.min(1, ((p.shape.top + 1) * s) / Math.max(1, cfg.current.maxHeight)),
                rare: p.rare,
                pan: panAt(ox + c * s),
            })
            const alive = plants.filter((q) => !q.diedAt)
            if (alive.length > cfg.current.maxPlants) alive[0].diedAt = now
            persistNow()
            updateHud()
            start()
        }

        const buildBg = () => {
            const c = cfg.current
            bgKey = `${c.gridColor}|${c.soilColor}|${c.gridDot}|${c.plantDot}`
            bg.width = canvas.width
            bg.height = canvas.height
            const g = bg.getContext("2d")!
            g.setTransform(dpr, 0, 0, dpr, 0, 0)
            g.clearRect(0, 0, w, h)
            g.fillStyle = c.gridColor
            g.beginPath()
            for (let r = 0; r < Math.min(rows, groundTop); r++) {
                for (let q = 0; q < cols; q++) {
                    const x = ox + q * s
                    const y = oy + r * s
                    g.moveTo(x + c.gridDot, y)
                    g.arc(x, y, c.gridDot, 0, Math.PI * 2)
                }
            }
            g.fill()
            if (groundTop < rows) {
                const R = mulberry(7)
                g.fillStyle = c.soilColor
                for (let r = groundTop; r < rows; r++) {
                    for (let q = 0; q < cols; q++) {
                        g.globalAlpha = 0.35 + R() * 0.5
                        g.beginPath()
                        g.arc(ox + q * s, oy + r * s, c.plantDot * between(R, 0.6, 0.9), 0, Math.PI * 2)
                        g.fill()
                    }
                }
                g.globalAlpha = 1
            }
        }

        const layout = () => {
            const rect = wrap.getBoundingClientRect()
            w = rect.width
            h = rect.height
            dpr = Math.min(window.devicePixelRatio || 1, 2)
            canvas.width = Math.max(1, Math.round(w * dpr))
            canvas.height = Math.max(1, Math.round(h * dpr))
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
            s = Math.max(2, spacing)
            cols = Math.max(1, Math.floor(w / s))
            rows = Math.max(2, Math.floor(h / s))
            ox = (w - (cols - 1) * s) / 2
            oy = (h - (rows - 1) * s) / 2
            const soil = showGround ? Math.max(1, Math.round(groundHeight / s)) : 0
            groundTop = rows - soil
            baseRow = showGround ? groundTop - 1 : rows - 1

            bladeH = new Uint8Array(showGround ? cols : 0)
            bladeTone = new Uint8Array(bladeH.length)
            bladeBend = new Float32Array(bladeH.length)
            bladeVel = new Float32Array(bladeH.length)
            for (let q = 0; q < bladeH.length; q++) {
                const R = mulberry(q * 7919 + 13)
                bladeH[q] = 1 + Math.floor(R() * 4)
                bladeTone[q] = R() < 0.06 ? 3 : Math.floor(R() * 3)
            }
            // Scale positions with the new size instead of piling plants against an edge.
            // A plant built while the garden was too short to fit it grows to its full height.
            for (const p of plants) {
                const H = heightFor(p.type, p.h)
                if (H > p.H) setShape(p, H)
                toShare(p)
            }
            buildBg()
        }

        const cellAt = (x: number, y: number) => ({
            c: Math.round((x - ox) / s),
            r: Math.round((y - oy) / s),
        })

        const basePos = (p: Plant) =>
            p === drag ? { x: dragX, y: dragY } : { x: ox + p.c * s, y: oy + p.r * s }

        const inBox = (p: Plant, x: number, y: number) => {
            const b = basePos(p)
            const sh = p.shape
            return (
                x >= b.x + (sh.minDx - 0.5) * s &&
                x <= b.x + (sh.maxDx + 0.5) * s &&
                y >= b.y - (sh.top + 0.5) * s &&
                y <= b.y + 0.5 * s
            )
        }

        const hitTest = (x: number, y: number): Plant | null => {
            const order = plants.filter((p) => !p.diedAt).sort((a, b) => b.r - a.r || b.born - a.born)
            for (const p of order) if (inBox(p, x, y)) return p
            return null
        }

        const inRemoveZone = (x: number, y: number) => x < EDGE || x > w - EDGE || y > h - EDGE

        const colors = () => {
            const c = cfg.current
            return {
                c: c.centerColor, s: c.stemColor, l: c.leafColor, L: c.leafDarkColor, b: c.trunkColor,
                ...FIXED,
            } as Record<string, string>
        }

        const buildSprite = (p: Plant, pal: Record<string, string>, petal: string, key: string): PlantSprite => {
            const sh = p.shape
            const r = cfg.current.plantDot
            const per = Math.max(1, Math.ceil(BAND_PX / s))
            const nb = Math.ceil((sh.top + 1) / per)
            const pad = Math.ceil(r) + 1
            const bandD = Math.ceil(((per - 1) * s + pad * 2) * dpr)
            const cv = document.createElement("canvas")
            cv.width = Math.max(1, Math.ceil(((sh.maxDx - sh.minDx) * s + pad * 2) * dpr))
            cv.height = Math.max(1, bandD * nb)
            const g = cv.getContext("2d")!
            const rd = r * dpr
            for (const d of sh.dots) {
                const band = Math.floor(d.k / per)
                const x = (pad + (d.dx - sh.minDx) * s) * dpr
                const y = band * bandD + (pad + (per - 1 - (d.k - band * per)) * s) * dpr
                g.drawImage(stamp(d.key === "p" ? petal : pal[d.key]), x - rd, y - rd, rd * 2, rd * 2)
            }
            return { key, cv, per, nb, pad, bandD }
        }

        // Advance springs; returns true while anything is still moving
        const physics = (dt: number) => {
            let moving = false
            const step = Math.min(dt, 0.05)
            for (const p of plants) {
                const a = -STIFF * p.bend - DAMP * p.vel
                p.vel += a * step
                p.bend += p.vel * step
                const cap = (p.shape.top + 1) * s * 0.3
                if (p.bend > cap) p.bend = cap
                if (p.bend < -cap) p.bend = -cap
                if (Math.abs(p.bend) > 0.05 || Math.abs(p.vel) > 0.5) moving = true
                else p.bend = p.vel = 0
            }
            for (let q = 0; q < bladeBend.length; q++) {
                const a = -STIFF * 1.6 * bladeBend[q] - DAMP * bladeVel[q]
                bladeVel[q] += a * step
                bladeBend[q] += bladeVel[q] * step
                if (Math.abs(bladeBend[q]) > 0.05 || Math.abs(bladeVel[q]) > 0.5) moving = true
                else bladeBend[q] = bladeVel[q] = 0
            }
            return moving
        }

        const spawnFlock = () => {
            const dir = Math.random() < 0.5 ? 1 : -1
            const n = 1 + Math.floor(Math.random() * 5)
            const skyBottom = Math.max(70, h * 0.4)
            const y0 = between(Math.random, 48, skyBottom)
            const speed = between(Math.random, 45, 80)
            for (let i = 0; i < n; i++) {
                // Loose V formation trailing the leader
                const back = i * between(Math.random, 14, 22)
                const side = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * between(Math.random, 8, 12)
                birdList.push({
                    x: dir > 0 ? -30 - back : w + 30 + back,
                    y: y0 + side,
                    vx: dir * speed * between(Math.random, 0.95, 1.05),
                    vy: 0,
                    phase: Math.random() * 4,
                    flee: 0,
                })
            }
            emit("flock", { pan: dir > 0 ? -0.7 : 0.7 })
        }

        // Birds near the pointer take off upward and away
        const scare = (x: number, y: number) => {
            let fresh = 0
            for (const b of birdList) {
                if (Math.hypot(b.x - x, b.y - y) > 80) continue
                if (b.flee <= 0) fresh++
                b.flee = 1
                b.vy = -between(Math.random, 70, 130)
                b.vx += (b.x >= x ? 1 : -1) * 50
            }
            if (fresh) emit("scatter", { pan: panAt(x) })
        }

        const emitPollen = (x: number, y: number, push: number, color: string) => {
            if (pollenList.length >= POLLEN_MAX) return
            emit("pollen", { pan: panAt(x) })
            pollenList.push({
                x, y,
                vx: push * 0.12 + between(Math.random, -8, 8),
                vy: -between(Math.random, 8, 26),
                born: performance.now(),
                life: between(Math.random, 2500, 4500),
                color,
                seed: Math.random() * 10,
            })
        }

        const draw = (now: number, dt = 0) => {
            const c = cfg.current
            const pal = colors()
            const petals = c.petalColors.length ? c.petalColors : DEFAULT_PETALS
            let busy = false

            if (bgKey !== `${c.gridColor}|${c.soilColor}|${c.gridDot}|${c.plantDot}`) buildBg()
            ctx.setTransform(1, 0, 0, 1, 0, 0)
            ctx.clearRect(0, 0, canvas.width, canvas.height)
            ctx.drawImage(bg, 0, 0)
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

            const windOn = !reduceMotion && c.wind > 0
            const spriteKey = [s, dpr, c.plantDot, c.stemColor, c.leafColor, c.leafDarkColor, c.trunkColor, c.centerColor].join("|")
            const order = plants.slice().sort((a, b) => {
                if (a === drag) return 1
                if (b === drag) return -1
                return a.r - b.r || a.born - b.born
            })

            const drawPlant = (p: Plant) => {
                const sh = p.shape
                const H = sh.top + 1
                const b = basePos(p)
                // Growth time follows the plant's height in px, so small grid gaps don't slow it down
                const grow = reduceMotion ? 1 : Math.min(1, (now - p.born) / (700 + H * s * 2.8))
                if (grow < 1) busy = true
                let alpha = 1
                if (p.diedAt) {
                    alpha = 1 - (now - p.diedAt) / DIE_MS
                    busy = true
                    if (alpha <= 0) return
                }
                if (p === drag && inRemoveZone(dragX + grabDX, dragY + grabDY)) alpha = 0.35
                const breeze = windOn ? c.wind * 2 * Math.sin(now / 1100 + p.phase) : 0
                const lean = p.bend + breeze
                const r = c.plantDot * (p === drag ? 1.12 : 1)
                const petal = petals[p.petal % petals.length]

                // Swaying flowers shed pollen from random blooms
                const sway = Math.abs(p.vel)
                if (c.pollen && !reduceMotion && grow >= 1 && !p.diedAt && p.flowers.length && sway > 30) {
                    for (let e = sway * dt * 0.06; e > 0; e--) {
                        if (Math.random() >= e) continue
                        const d = sh.dots[p.flowers[Math.floor(Math.random() * p.flowers.length)]]
                        const t = d.k / H
                        emitPollen(
                            b.x + d.dx * s + lean * Math.pow(t, 1.6),
                            b.y - d.k * s,
                            p.vel,
                            p.rare ? c.goldColor : c.pollenColor
                        )
                    }
                }

                // Grown, ordinary plants blit their banded sprite; growing, rare (twinkling)
                // and dragged (enlarged) plants are drawn dot by dot
                if (grow >= 1 && !p.rare && p !== drag) {
                    const key = spriteKey + "|" + petal
                    if (!p.sprite || p.sprite.key !== key) p.sprite = buildSprite(p, pal, petal, key)
                    const sp = p.sprite
                    const wCss = sp.cv.width / dpr
                    const hCss = sp.bandD / dpr
                    ctx.globalAlpha = alpha
                    for (let i = 0; i < sp.nb; i++) {
                        const km = i * sp.per + (sp.per - 1) / 2
                        const x = b.x + sh.minDx * s - sp.pad + lean * Math.pow(km / H, 1.6)
                        const y = b.y - (i * sp.per + sp.per - 1) * s - sp.pad
                        ctx.drawImage(sp.cv, 0, i * sp.bandD, sp.cv.width, sp.bandD, x, y, wCss, hCss)
                    }
                    ctx.globalAlpha = 1
                    return
                }

                for (let n = 0; n < sh.dots.length; n++) {
                    const d = sh.dots[n]
                    const scale = Math.min(1, Math.max(0, grow * H - d.k))
                    if (scale <= 0) continue
                    const t = d.k / H
                    const x = b.x + d.dx * s + lean * Math.pow(t, 1.6)
                    const y = b.y - d.k * s
                    const col = p.rare ? c.goldColor : d.key === "p" ? petal : pal[d.key]
                    ctx.globalAlpha = p.rare ? alpha * (0.7 + 0.3 * Math.sin(now / 260 + n * 1.7)) : alpha
                    dot(col, x, y, r * scale)
                }
                if (p.rare && !reduceMotion) busy = true
                ctx.globalAlpha = 1
            }

            for (const p of order) if (p !== drag) drawPlant(p)

            // Birds
            if (c.birds && !reduceMotion) {
                if (now >= nextBirdAt) {
                    spawnFlock()
                    nextBirdAt = now + (60000 / Math.max(0.5, c.birdRate)) * between(Math.random, 0.6, 1.4)
                }
                const bs = s * 0.75
                const br = c.plantDot * 0.8
                for (const b of birdList) {
                    b.x += b.vx * dt
                    b.y += b.vy * dt + Math.sin(now / 600 + b.phase) * 4 * dt
                    if (b.flee > 0) {
                        b.vy -= 60 * dt
                        b.flee -= dt * 0.4
                    } else b.vy *= 0.98
                    const rate = b.flee > 0 ? 14 : 6
                    const frame = BIRD_FRAMES[Math.floor((now / 1000) * rate + b.phase) % 4]
                    const flip = b.vx < 0 ? -1 : 1
                    for (const [fx, fy] of frame) dot(c.birdColor, b.x + fx * bs * flip, b.y + fy * bs, br)
                }
                birdList = birdList.filter((b) => b.x > -120 && b.x < w + 120 && b.y > -60)
                if (birdList.length) busy = true
            } else birdList = []

            // Grass blades in front of plant bases
            if (bladeH.length) {
                const tones = [c.leafColor, c.leafDarkColor, c.stemColor]
                for (let q = 0; q < bladeH.length; q++) {
                    const bh = bladeH[q]
                    const x0 = ox + q * s
                    const breeze = windOn ? c.wind * 0.9 * Math.sin(now / 800 + q * 0.35) : 0
                    const lean = bladeBend[q] + breeze
                    for (let j = 0; j < bh; j++) {
                        const t = (j + 1) / bh
                        const flower = bladeTone[q] === 3 && j === bh - 1
                        const col = flower ? petals[q % petals.length] : tones[(bladeTone[q] + j) % 3]
                        dot(col, x0 + lean * t * t, oy + (baseRow - j) * s, c.plantDot * (j === bh - 1 ? 0.8 : 0.9))
                    }
                }
            }

            if (drag) {
                drawPlant(drag)
                busy = true
            }

            // Pollen drifts up and away, wobbling, and fades
            if (pollenList.length) {
                const pr = c.plantDot * 0.45
                const drift = windOn ? c.wind * 6 : 0
                for (const q of pollenList) {
                    q.vx *= 1 - dt * 0.6
                    q.vy -= 4 * dt
                    q.x += (q.vx + drift + Math.sin(now / 400 + q.seed) * 10) * dt
                    q.y += q.vy * dt
                    const age = (now - q.born) / q.life
                    ctx.globalAlpha = Math.max(0, Math.min(1, age * 6, (1 - age) * 2)) * 0.9
                    dot(q.color, q.x, q.y, pr)
                }
                ctx.globalAlpha = 1
                pollenList = pollenList.filter((q) => now - q.born < q.life && q.y > -10 && q.x > -10 && q.x < w + 10)
                busy = true
            }

            const before = plants.length
            plants = plants.filter((p) => !p.diedAt || now - p.diedAt < DIE_MS)
            if (plants.length !== before) persistNow()

            if (windOn && (plants.length || bladeH.length)) busy = true
            return busy
        }

        const loop = (t: number) => {
            raf = 0
            if (!visible) return
            const dt = lastT ? (t - lastT) / 1000 : 0
            lastT = t
            const moving = physics(dt)
            const busy = draw(t, Math.min(dt, 0.05))
            if (moving || busy) raf = requestAnimationFrame(loop)
            else {
                lastT = 0
                // Asleep: wake up for the next flock
                if (cfg.current.birds && !reduceMotion) {
                    birdTimer = window.setTimeout(start, Math.max(0, nextBirdAt - t))
                }
            }
        }

        const start = () => {
            if (birdTimer) {
                clearTimeout(birdTimer)
                birdTimer = 0
            }
            if (!raf && !isCanvas && visible) raf = requestAnimationFrame(loop)
        }

        const local = (e: PointerEvent) => {
            const rect = canvas.getBoundingClientRect()
            return { x: e.clientX - rect.left, y: e.clientY - rect.top }
        }

        const pickUp = (p: Plant, x: number, y: number, pointerId: number) => {
            const b = basePos(p)
            drag = p
            grabDX = x - b.x
            grabDY = y - b.y
            dragX = b.x
            dragY = b.y
            try {
                canvas.setPointerCapture(pointerId)
            } catch {}
            emit("pickup", { pan: panAt(b.x) })
            updateHud()
            start()
        }

        // Push plants and grass under a moving pointer, in its direction
        const brush = (x: number, y: number, vx: number, touch = false) => {
            if (reduceMotion) return
            const push = Math.max(-260, Math.min(260, vx * 9)) || (Math.random() < 0.5 ? -40 : 40)
            let touched = false
            for (const p of plants) {
                if (p.diedAt || p === drag || !inBox(p, x, y)) continue
                p.vel += push * 0.5
                touched = true
            }
            if (bladeH.length) {
                const grassTop = oy + (baseRow - 4) * s
                if (y >= grassTop) {
                    const q0 = Math.round((x - ox) / s)
                    for (let q = q0 - 2; q <= q0 + 2; q++) {
                        if (q < 0 || q >= bladeH.length) continue
                        bladeVel[q] += push * (1 - Math.abs(q - q0) / 3) * 0.35
                        touched = true
                    }
                }
            }
            if (touched) {
                emit("sway", { dx: vx, pan: panAt(x), touch })
                start()
            }
        }

        const onDown = (e: PointerEvent) => {
            if (downId !== -1) return
            soundRef.current?.unlock()
            const { x, y } = local(e)
            scare(x, y)
            lastPX = x
            lastPY = y
            downId = e.pointerId
            downX = x
            downY = y
            moved = false
            downPlant = hitTest(x, y)
            if (downPlant && e.pointerType === "touch") {
                const p = downPlant
                const id = e.pointerId
                holdTimer = window.setTimeout(() => {
                    holdTimer = 0
                    if (!moved && downId === id) {
                        p.vel += 120
                        pickUp(p, downX, downY, id)
                    }
                }, HOLD_MS)
            }
        }

        const onMove = (e: PointerEvent) => {
            const { x, y } = local(e)
            const vx = lastPX < 0 ? 0 : x - lastPX
            lastPX = x
            lastPY = y
            if (e.pointerId === downId) {
                if (Math.hypot(x - downX, y - downY) > TAP_SLOP) moved = true
                if (!drag && moved && downPlant && e.pointerType !== "touch") {
                    pickUp(downPlant, downX, downY, e.pointerId)
                }
                if (drag) {
                    const prev = dragX
                    dragX = x - grabDX
                    dragY = y - grabDY
                    // The held plant trails behind the motion
                    drag.vel -= (dragX - prev) * 6
                    updateHud(inRemoveZone(x, y))
                    return
                }
            }
            // Mouse/pen brush on hover; a finger brushes while it swipes
            // sideways (vertical swipes are left to the page to scroll)
            const touching = e.pointerType === "touch" && e.pointerId === downId && moved
            if (e.pointerType !== "touch" || touching) {
                brush(x, y, vx, e.pointerType === "touch")
                if (birdList.length) scare(x, y)
            }
        }

        const endPress = () => {
            downId = -1
            downPlant = null
            if (holdTimer) {
                clearTimeout(holdTimer)
                holdTimer = 0
            }
        }

        const onUp = (e: PointerEvent) => {
            if (e.pointerId !== downId) return
            // Touch only counts as a gesture for audio on release
            soundRef.current?.unlock()
            const { x, y } = local(e)
            if (drag) {
                const p = drag
                drag = null
                if (inRemoveZone(x, y)) {
                    p.diedAt = performance.now()
                    emit("remove", { pan: panAt(x) })
                } else {
                    emit("drop", { pan: panAt(x) })
                    const cell = cellAt(x - grabDX, y - grabDY)
                    place(p, cell.c, cell.r)
                    p.vel += 90
                }
                persistNow()
                updateHud()
                start()
            } else if (!moved) {
                if (downPlant) {
                    downPlant.vel += 160 * (Math.random() < 0.5 ? -1 : 1)
                    emit("tap", { flower: downPlant.flowers.length > 0, pan: panAt(x) })
                    start()
                } else {
                    const cell = cellAt(x, y)
                    spawn(cell.c, cell.r)
                }
            }
            endPress()
        }

        const onCancel = () => {
            if (drag) {
                drag = null
                updateHud()
                start()
            }
            endPress()
        }

        const onLeave = () => {
            lastPX = lastPY = -1
        }

        const onTouchMove = (e: TouchEvent) => {
            if (drag) e.preventDefault()
        }
        const onContextMenu = (e: Event) => e.preventDefault()

        layout()

        // Restore the saved garden, or start with a few plants. Either way the ground shows
        // first, then every plant grows in at the same moment.
        const now = performance.now()
        const intro = now + 500
        const saved = cfg.current.persist ? load(storeKey) : null
        if (saved && Array.isArray(saved.plants)) {
            plants = saved.plants
                .filter((q) => q && q.t >= 0 && q.t < KINDS.length)
                .map((q) => {
                    const p = makePlant(q.t, q.s | 0, q.h | 0, q.c | 0, q.r | 0, intro)
                    p.rare = !!q.g
                    p.petal = q.p | 0
                    // Saves from before shares were kept fall back to their cell
                    if (typeof q.x === "number" && typeof q.y === "number") {
                        p.fx = Math.min(1, Math.max(0, q.x))
                        p.fy = Math.min(1, Math.max(0, q.y))
                        toShare(p)
                    }
                    return p
                })
            // An earlier version could save every plant in the middle; spread those out again
            if (plants.length > 2 && plants.every((p) => Math.abs(p.fx - 0.5) < 0.001)) {
                plants.forEach((p, n) => {
                    p.fx = (n + 0.5) / plants.length
                    toShare(p)
                })
            }
            planted = saved.planted | 0
            rareFound = saved.rare | 0
        } else {
            const starters = [5, 0, 7, 2, 1]
            starters.forEach((t, n) => {
                const p = makePlant(t, (Math.random() * 2 ** 31) | 0, randomHeight(), 0, baseRow, intro)
                // Spread by share, so this works even before the garden has its size
                p.fx = Math.min(1, Math.max(0, (n + 0.5) / starters.length + between(Math.random, -0.02, 0.02)))
                const lift = Math.random() * 0.25
                p.fy = sized() ? Math.max(0, baseRow / (rows - 1) - lift) : 0.9 - lift
                toShare(p)
                plants.push(p)
            })
        }
        updateHud()

        if (isCanvas) {
            draw(now + 60000)
            return
        }

        const ro =
            typeof ResizeObserver !== "undefined"
                ? new ResizeObserver(() => {
                      layout()
                      if (!raf) draw(performance.now())
                  })
                : null
        ro?.observe(wrap)

        const io =
            typeof IntersectionObserver !== "undefined"
                ? new IntersectionObserver(([entry]) => {
                      visible = entry.isIntersecting
                      soundRef.current?.setActive(visible)
                      if (visible) start()
                  })
                : null
        io?.observe(wrap)

        const onVisibility = () => {
            visible = !document.hidden
            soundRef.current?.setActive(visible)
            if (visible) start()
        }
        document.addEventListener("visibilitychange", onVisibility)

        canvas.addEventListener("pointerdown", onDown)
        canvas.addEventListener("pointermove", onMove)
        canvas.addEventListener("pointerup", onUp)
        canvas.addEventListener("pointercancel", onCancel)
        canvas.addEventListener("pointerleave", onLeave)
        canvas.addEventListener("touchmove", onTouchMove, { passive: false })
        canvas.addEventListener("contextmenu", onContextMenu)

        draw(performance.now())
        start()

        return () => {
            persistNow()
            cancelAnimationFrame(raf)
            if (holdTimer) clearTimeout(holdTimer)
            if (birdTimer) clearTimeout(birdTimer)
            ro?.disconnect()
            io?.disconnect()
            document.removeEventListener("visibilitychange", onVisibility)
            canvas.removeEventListener("pointerdown", onDown)
            canvas.removeEventListener("pointermove", onMove)
            canvas.removeEventListener("pointerup", onUp)
            canvas.removeEventListener("pointercancel", onCancel)
            canvas.removeEventListener("pointerleave", onLeave)
            canvas.removeEventListener("touchmove", onTouchMove)
            canvas.removeEventListener("contextmenu", onContextMenu)
        }
    }, [isCanvas, spacing, plantOn, showGround, groundHeight, minHeight, maxHeight])

    return (
        <div
            ref={wrapRef}
            style={{
                position: "relative",
                width: "100%",
                height: "100%",
                overflow: "hidden",
                background,
                // No blue tap flash or text selection on phones
                WebkitTapHighlightColor: "transparent",
                userSelect: "none",
                WebkitUserSelect: "none",
                outline: "none",
            }}
        >
            <canvas
                ref={canvasRef}
                style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    display: "block",
                    // Vertical swipes scroll the page; sideways swipes brush the garden
                    touchAction: "pan-y pinch-zoom",
                    userSelect: "none",
                    WebkitUserSelect: "none",
                    WebkitTouchCallout: "none",
                    WebkitTapHighlightColor: "transparent",
                    outline: "none",
                    cursor: "pointer",
                }}
            />
            {showCounter && (
                <div
                    aria-live="polite"
                    style={{
                        position: "absolute",
                        left: 0,
                        right: 0,
                        top: 16,
                        textAlign: "center",
                        pointerEvents: "none",
                        userSelect: "none",
                        color: textColor,
                        ...font,
                    }}
                >
                    {hud}
                </div>
            )}
            {sound && showMute && !isCanvas && (
                <button
                    type="button"
                    onClick={toggleMute}
                    aria-label={muted ? "Turn sound on" : "Mute sound"}
                    aria-pressed={muted}
                    title={muted ? "Sound off" : "Sound on"}
                    style={{
                        position: "absolute",
                        top: 8,
                        right: 8,
                        padding: 8,
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        opacity: muted ? 0.6 : 1,
                        touchAction: "manipulation",
                        WebkitTapHighlightColor: "transparent",
                    }}
                >
                    <MuteIcon muted={muted} color={textColor} />
                </button>
            )}
        </div>
    )
}

GardenHero.displayName = "Garden Hero"

addPropertyControls(GardenHero, {
    plantOn: {
        type: ControlType.Enum,
        title: "Plant On",
        options: ["Ground", "Anywhere"],
        defaultValue: "Ground",
        displaySegmentedControl: true,
    },
    minHeight: { type: ControlType.Number, title: "Min Height", min: 30, max: 800, step: 5, unit: "px", defaultValue: 90 },
    maxHeight: { type: ControlType.Number, title: "Max Height", min: 30, max: 800, step: 5, unit: "px", defaultValue: 280 },
    showGround: { type: ControlType.Boolean, title: "Ground", defaultValue: true },
    groundHeight: {
        type: ControlType.Number,
        title: "Ground Height",
        min: 10,
        max: 200,
        step: 1,
        unit: "px",
        defaultValue: 45,
        hidden: (p) => !p.showGround,
    },
    soilColor: { type: ControlType.Color, title: "Soil", defaultValue: "#7A5236", hidden: (p) => !p.showGround },
    gridColor: { type: ControlType.Color, title: "Grid", defaultValue: "rgba(255,255,255,0.08)" },
    petalColors: {
        type: ControlType.Array,
        title: "Petals",
        control: { type: ControlType.Color },
        defaultValue: DEFAULT_PETALS,
    },
    centerColor: { type: ControlType.Color, title: "Centre", defaultValue: "#FFD166" },
    stemColor: { type: ControlType.Color, title: "Stem", defaultValue: "#5DBB63" },
    leafColor: { type: ControlType.Color, title: "Leaf", defaultValue: "#4CAF50" },
    leafDarkColor: { type: ControlType.Color, title: "Leaf Shade", defaultValue: "#2E7D3A" },
    trunkColor: { type: ControlType.Color, title: "Trunk", defaultValue: "#8B5A3C" },
    goldColor: { type: ControlType.Color, title: "Rare", defaultValue: "#FFD700" },
    background: { type: ControlType.Color, title: "Background", defaultValue: "transparent" },
    spacing: { type: ControlType.Number, title: "Grid Gap", min: 2, max: 30, step: 1, unit: "px", defaultValue: 9 },
    gridDot: { type: ControlType.Number, title: "Grid Dot", min: 0.3, max: 3, step: 0.1, defaultValue: 0.9 },
    plantDot: { type: ControlType.Number, title: "Plant Dot", min: 0.5, max: 8, step: 0.1, defaultValue: 2.4 },
    wind: { type: ControlType.Number, title: "Wind", min: 0, max: 4, step: 0.5, defaultValue: 1 },
    maxPlants: { type: ControlType.Number, title: "Max Plants", min: 5, max: 80, step: 1, defaultValue: 30 },
    persist: { type: ControlType.Boolean, title: "Remember", defaultValue: true },
    pollen: { type: ControlType.Boolean, title: "Pollen", defaultValue: true },
    pollenColor: {
        type: ControlType.Color,
        title: "Pollen Color",
        defaultValue: "#FFE9A8",
        hidden: (p) => !p.pollen,
    },
    birds: { type: ControlType.Boolean, title: "Birds", defaultValue: true },
    birdColor: {
        type: ControlType.Color,
        title: "Bird Color",
        defaultValue: "rgba(255,255,255,0.75)",
        hidden: (p) => !p.birds,
    },
    birdRate: {
        type: ControlType.Number,
        title: "Flocks / min",
        min: 0.5,
        max: 20,
        step: 0.5,
        defaultValue: 4,
        hidden: (p) => !p.birds,
    },
    showCounter: { type: ControlType.Boolean, title: "Counter", defaultValue: true },
    font: {
        type: ControlType.Font,
        title: "Font",
        controls: "extended",
        defaultFontType: "monospace",
        defaultValue: DEFAULT_FONT,
        hidden: (p) => !p.showCounter,
    },
    textColor: {
        type: ControlType.Color,
        title: "Text",
        defaultValue: "rgba(255,255,255,0.55)",
        // Also colours the mute icon
        hidden: (p) => !p.showCounter && !(p.sound && p.showMute),
    },
    sound: { type: ControlType.Boolean, title: "Sound", defaultValue: true },
    volume: {
        type: ControlType.Number,
        title: "Volume",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.35,
        hidden: (p) => !p.sound,
    },
    startMuted: { type: ControlType.Boolean, title: "Start Muted", defaultValue: false, hidden: (p) => !p.sound },
    showMute: { type: ControlType.Boolean, title: "Mute Icon", defaultValue: true, hidden: (p) => !p.sound },
    treeTap: {
        type: ControlType.Enum,
        title: "Tree Tap",
        options: ["Marimba", "Floor Tom", "Leaf Shaker", "Wood Knock"],
        defaultValue: "Marimba",
        hidden: (p) => !p.sound,
    },
    pollenSound: {
        type: ControlType.Enum,
        title: "Pollen Sound",
        options: ["Breath", "Celesta", "Dewdrop", "Glint"],
        defaultValue: "Breath",
        hidden: (p) => !p.sound,
    },
    ambient: { type: ControlType.Boolean, title: "Ambient", defaultValue: false, hidden: (p) => !p.sound },
    ambientVolume: {
        type: ControlType.Number,
        title: "Ambient Volume",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.5,
        hidden: (p) => !p.sound || !p.ambient,
    },
})
