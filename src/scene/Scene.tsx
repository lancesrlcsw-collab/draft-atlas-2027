import { Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { CameraControls } from '@react-three/drei'
import { Bloom, EffectComposer, ToneMapping, Vignette } from '@react-three/postprocessing'
import { ToneMappingMode } from 'postprocessing'
import * as THREE from 'three'
import { useStore } from '../store'
import { FIELD, STAGE, buildLayouts, stageSlot } from '../lib/layout'
import { ZONE_COLOR, lensContext } from '../lib/lens'
import { SITE_MARK } from '../lib/format'
import { BG, STAGE_SIZE, backdropTexture, buildCrowd, buildRoof, buildStands, fieldTexture, floorLabel, gridTexture, pickMarkTexture, stageFloorTexture, stageRisers } from './arena'
import { PlayersLayer } from './playersLayer'

/** Shared handle so the camera rig can ask the layer where a player stands. */
export const layerRef: { current: PlayersLayer | null } = { current: null }
/** 0 while the draft stage is up, 1 once the room has turned over to the football field. */
const mix = { value: 0 }

function Arena() {
  const dpr = useThree((s) => s.viewport.dpr)
  const { grid, roof, stands, crowd } = useMemo(() => ({ grid: gridTexture(), roof: buildRoof(), stands: buildStands(), crowd: buildCrowd() }), [])
  const arrangement = useStore((s) => s.arrangement)
  useFrame((state, dt) => {
    mix.value += ((arrangement === 'field' ? 1 : 0) - mix.value) * (1 - Math.exp(-dt * 3.4))
    const u = (crowd.material as THREE.ShaderMaterial).uniforms
    u.uTime.value += dt
    u.uPixelRatio.value = dpr
    // Looking down from above the trusses (the phone's overhead view), the roof would cover the floor.
    const z = state.camera.position.z
    roof.visible = state.camera.position.y < 52 + 60 * (1 - (z / 172) ** 2) - 6
  })
  return (
    <group>
      {/* Blueprint floor to the horizon */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.06}>
        <planeGeometry args={[1400, 1400]} />
        <meshBasicMaterial map={grid} color="#a8e6cf" />
      </mesh>
      {/* Apron under both sets */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.03}>
        <planeGeometry args={[FIELD.length + 26, 108]} />
        <meshStandardMaterial color="#07160f" roughness={0.9} metalness={0.1} />
      </mesh>
      <primitive object={roof} />
      <primitive object={stands} />
      <primitive object={crowd} />
    </group>
  )
}

/** The football field, faded in when the class lines up by position. */
function FieldSet() {
  const gl = useThree((s) => s.gl)
  const board = useStore((s) => s.board)
  const field = useMemo(() => fieldTexture(gl.capabilities.getMaxAnisotropy()), [gl])
  const labels = useMemo(() => buildLayouts(board).fieldLabels.map((l) => ({ ...l, ...floorLabel(l.text) })), [board])
  const turf = useRef<THREE.MeshStandardMaterial>(null)
  const group = useRef<THREE.Group>(null)
  const labelMats = useRef<THREE.MeshBasicMaterial[]>([])
  useFrame(() => {
    const m = mix.value
    if (group.current) group.current.visible = m > 0.01
    if (turf.current) turf.current.opacity = m
    for (const mat of labelMats.current) if (mat) mat.opacity = m * 0.95
  })
  return (
    <group ref={group} visible={false}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.005}>
        <planeGeometry args={[FIELD.length, FIELD.width]} />
        <meshStandardMaterial ref={turf} map={field} emissiveMap={field} emissive="#ffffff" emissiveIntensity={0.42} roughness={0.95} metalness={0} transparent opacity={0} />
      </mesh>
      {labels.map((l, i) => (
        <mesh key={`${l.text}${l.x}${l.z}`} rotation-x={-Math.PI / 2} rotation-z={l.x < 0 ? -Math.PI / 2 : Math.PI / 2} position={[l.x, 0.03, l.z]}>
          <planeGeometry args={[2.4 * l.aspect, 2.4]} />
          <meshBasicMaterial ref={(m) => { if (m) labelMats.current[i] = m }} map={l.texture} transparent depthWrite={false} opacity={0} />
        </mesh>
      ))}
    </group>
  )
}

const RISER_WIDTH = 86

/** The draft stage: tiered risers, a numbered mark for each of the 64 picks, and a backdrop. */
function StageSet() {
  const gl = useThree((s) => s.gl)
  const draft = useStore((s) => s.draft)
  const { floor, risers, marks, backdrop, labels } = useMemo(() => {
    const picks = draft?.order.picks || []
    return {
      floor: stageFloorTexture(gl.capabilities.getMaxAnisotropy()),
      risers: stageRisers(),
      marks: picks.map((k) => ({ pick: k, slot: stageSlot(k.pick), texture: pickMarkTexture(k, draft?.nflTeams[k.team]) })),
      backdrop: backdropTexture([SITE_MARK[0], SITE_MARK[1], `THE ${draft?.draftYear ?? ''} DRAFT CLASS`]),
      labels: [
        { text: 'ROUND 1', x: 0, y: 0, z: 20.3 },
        { text: 'ROUND 2', x: 0, y: 0, z: 1.9 },
        { text: `TRACKING BOARD · ${(draft?.picks ?? 64) + 1}–${draft?.boardSize ?? 150}`, x: 0, y: 0, z: -18.9 },
      ].map((l) => ({ ...l, ...floorLabel(l.text) })),
    }
  }, [gl, draft])
  const group = useRef<THREE.Group>(null)
  const riserRefs = useRef<(THREE.Group | null)[]>([])
  const markRefs = useRef<(THREE.Mesh | null)[]>([])
  const fade = useRef<THREE.Material[]>([])
  const keep = (m: THREE.Material | null) => { if (m && !fade.current.includes(m)) fade.current.push(m) }
  useFrame(() => {
    const up = 1 - mix.value
    if (group.current) group.current.visible = up > 0.01
    risers.forEach((r, i) => { const g = riserRefs.current[i]; if (g) g.scale.y = Math.max(0.0001, up) })
    marks.forEach((m, i) => { const mesh = markRefs.current[i]; if (mesh) mesh.position.y = m.slot.y * up + 0.05 })
    for (const m of fade.current) m.opacity = up * (m.userData.base ?? 1)
  })
  const centerZ = (STAGE_SIZE.front + STAGE_SIZE.back) / 2
  return (
    <group ref={group}>
      <mesh rotation-x={-Math.PI / 2} position={[0, 0.004, centerZ]}>
        <planeGeometry args={[STAGE_SIZE.width, STAGE_SIZE.front - STAGE_SIZE.back]} />
        <meshStandardMaterial ref={keep} map={floor} emissiveMap={floor} emissive="#ffffff" emissiveIntensity={0.5} roughness={0.9} transparent />
      </mesh>
      {risers.map((r, i) => (
        <group key={i} ref={(g) => { riserRefs.current[i] = g }}>
          {r.y > 0 && (
            <mesh position={[0, r.y / 2, r.z]}>
              <boxGeometry args={[RISER_WIDTH, r.y, r.depth]} />
              <meshStandardMaterial ref={keep} color="#0b1f18" roughness={0.85} metalness={0.15} transparent />
            </mesh>
          )}
          {/* A lit strip along the front lip of each step, in the color of its group. */}
          <mesh position={[0, r.y + 0.03, r.z + r.depth / 2 - 0.12]}>
            <boxGeometry args={[RISER_WIDTH, 0.06, 0.2]} />
            <meshBasicMaterial ref={keep} color={new THREE.Color(ZONE_COLOR[r.zone]).multiplyScalar(r.zone === 'round1' ? 1.5 : 1.1)} toneMapped={false} transparent />
          </mesh>
        </group>
      ))}
      {marks.map((m, i) => (
        <mesh key={m.pick.pick} ref={(mesh) => { markRefs.current[i] = mesh }} rotation-x={-Math.PI / 2} position={[m.slot.x, m.slot.y + 0.05, m.slot.z + 2.75]}>
          <planeGeometry args={[4.1, 4.1 * (132 / 288)]} />
          <meshBasicMaterial ref={keep} map={m.texture} transparent depthWrite={false} />
        </mesh>
      ))}
      {labels.map((l) => (
        <mesh key={l.text} rotation-x={-Math.PI / 2} position={[l.x, 0.04, l.z]}>
          <planeGeometry args={[2.3 * l.aspect, 2.3]} />
          <meshBasicMaterial ref={keep} map={l.texture} transparent depthWrite={false} />
        </mesh>
      ))}
      <mesh position={[0, STAGE.watchY + STAGE.watchRise * (STAGE.watchRows - 1) + 11.2, STAGE_SIZE.back - 1.5]}>
        <planeGeometry args={[52, 13]} />
        <meshBasicMaterial ref={keep} map={backdrop} transparent />
      </mesh>
    </group>
  )
}

function Players() {
  const board = useStore((s) => s.board)
  const draft = useStore((s) => s.draft)
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => {
    let live = true
    const fonts = ['800 64px "Saira Extra Condensed"', '700 64px "Saira Extra Condensed"', '600 44px "Saira Condensed"', '700 44px "Saira Condensed"']
    Promise.all(fonts.map((f) => document.fonts.load(f))).catch(() => {}).finally(() => { if (live) setFontsReady(true) })
    return () => { live = false }
  }, [])

  const layer = useMemo(() => {
    if (!board.length || !draft || !fontsReady) return null
    return new PlayersLayer(board, lensContext(board, draft.movement), buildLayouts(board))
  }, [board, draft, fontsReady])

  useEffect(() => {
    layerRef.current = layer
    return () => { layer?.dispose(); if (layerRef.current === layer) layerRef.current = null }
  }, [layer])

  const lens = useStore((s) => s.lens)
  const focus = useStore((s) => s.focus)
  const arrangement = useStore((s) => s.arrangement)
  const selected = useStore((s) => s.selected)
  const hovered = useStore((s) => s.hovered)
  const panel = useStore((s) => s.panel)
  useEffect(() => { layer?.set({ lens, focus, arrangement, selected, hovered, quiet: !!panel }) }, [layer, lens, focus, arrangement, selected, hovered, panel])

  useFrame((state, dt) => layer?.update(Math.min(dt, 0.05), state.camera as THREE.PerspectiveCamera, state.size.width, state.size.height))

  const hover = useStore((s) => s.hover)
  const select = useStore((s) => s.select)
  useEffect(() => { document.body.style.cursor = hovered ? 'pointer' : '' }, [hovered])
  if (!layer) return null
  return (
    <>
      <primitive object={layer.root} />
      <primitive
        object={layer.colliders}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => { e.stopPropagation(); hover(e.object.userData.id) }}
        onPointerOut={() => hover(null)}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation()
          if (e.delta > 8) return // a drag, not a click
          const node = layer.byId.get(e.object.userData.id)
          if (node) select(node.p.slug)
        }}
      />
    </>
  )
}

type V3 = readonly [number, number, number]
type View = { pos: V3; target: V3 }
const lookAt = (c: CameraControls, v: View, transition: boolean) => c.setLookAt(v.pos[0], v.pos[1], v.pos[2], v.target[0], v.target[1], v.target[2], transition)

const FOV = { landscape: 36, portrait: 58 }
const HOME: Record<'stage' | 'field', { landscape: View; portrait: View }> = {
  stage: { landscape: { pos: [0, 54, 104], target: [0, 3, -2.5] }, portrait: { pos: [-72, 150, -8], target: [-19, 0, -8.01] } },
  field: { landscape: { pos: [-2, 62, 104], target: [-1, 0, 5] }, portrait: { pos: [-40, 158, 0.01], target: [-2, 0, 0] } },
}
/** Closer views of one group on the stage. */
const FOCUS_VIEW: Record<string, View> = {
  round1: { pos: [0, 32, 94], target: [0, 1, 10] },
  round2: { pos: [0, 40, 76], target: [0, 4, -9] },
  watch: { pos: [0, 48, 52], target: [0, 9, -33] },
}

function Rig() {
  const controls = useRef<CameraControls>(null)
  const { camera, size } = useThree()
  const portrait = size.width / size.height < 1.05
  const selected = useStore((s) => s.selected)
  const focus = useStore((s) => s.focus)
  const arrangement = useStore((s) => s.arrangement)
  const panel = useStore((s) => s.panel)
  const lens = useStore((s) => s.lens)
  const status = useStore((s) => s.status)
  const touring = useStore((s) => s.touring)
  const introDone = useStore((s) => s.introDone)
  const started = useRef(false)

  // Handy when tuning views from the browser console during development.
  useEffect(() => { if (import.meta.env.DEV) { (window as any).__cam = controls.current; (window as any).__layer = layerRef } })

  // Field of view follows the aspect ratio so the whole floor fits on a phone held upright.
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera
    cam.fov = portrait ? FOV.portrait : FOV.landscape
    cam.updateProjectionMatrix()
  }, [camera, portrait])

  // Opening move: drop from the roof to the front of the house.
  useEffect(() => {
    const c = controls.current
    if (!c || status !== 'ready' || started.current) return
    started.current = true
    const home = HOME[useStore.getState().arrangement][portrait ? 'portrait' : 'landscape']
    const deep = useStore.getState().selected || useStore.getState().panel
    if (deep) { useStore.getState().finishIntro(); return }
    if (portrait) c.setLookAt(-100, 270, -8, -19, 0, -8.01, false)
    else c.setLookAt(-26, 150, 110, 0, 0, 0, false)
    c.smoothTime = 1.15
    lookAt(c, home, true).then(() => { c.smoothTime = 0.42; useStore.getState().finishIntro(); useStore.getState().setTouring(!portrait) })
  }, [status, portrait])

  // Fly to the selection, the focused group, or back home.
  useEffect(() => {
    const c = controls.current
    if (!c || status !== 'ready') return
    const home = HOME[arrangement][portrait ? 'portrait' : 'landscape']
    const cam = camera as THREE.PerspectiveCamera
    let cancelled = false
    const go = () => {
      if (cancelled) return
      const layer = layerRef.current
      if (selected) {
        if (!layer) { setTimeout(go, 80); return }
        const node = layer.bySlug.get(selected)
        const t = layer.focusPoint(selected)
        if (!node || !t) return
        const dist = portrait ? 15 : 12.5
        // Stand in front of the player, a little to one side and above.
        const front = new THREE.Vector3(Math.cos(node.place.facing), 0, Math.sin(node.place.facing))
        const sideways = new THREE.Vector3(-front.z, 0, front.x)
        const pos = t.clone().addScaledVector(front, dist * 0.74).addScaledVector(sideways, dist * 0.5).add(new THREE.Vector3(0, dist * 0.3, 0))
        c.setLookAt(pos.x, pos.y, pos.z, t.x, t.y, t.z, true)
        // Slide the subject clear of the player file.
        const vh = 2 * dist * Math.tan(THREE.MathUtils.degToRad(cam.fov / 2))
        if (portrait) c.setFocalOffset(0, vh * 0.27, 0, true)
        else c.setFocalOffset(Math.min(0.5, 280 / size.width) * vh * cam.aspect * 0.5, vh * 0.03, 0, true)
        return
      }
      c.setFocalOffset(0, 0, 0, true)
      if (panel) {
        // Board panels: a slow high orbit behind the glass.
        c.setLookAt(-70, 62, 96, 0, 0, -6, true)
        return
      }
      if (arrangement === 'stage' && focus !== 'all' && FOCUS_VIEW[focus]) {
        const v = FOCUS_VIEW[focus]
        const k = portrait ? 1.9 : 1
        c.setLookAt(v.target[0] + (v.pos[0] - v.target[0]) * k, v.target[1] + (v.pos[1] - v.target[1]) * k, v.target[2] + (v.pos[2] - v.target[2]) * k, ...v.target, true)
        return
      }
      if (introDone) lookAt(c, home, true)
    }
    go()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, focus, arrangement, panel, portrait, status])

  // Lens changes move the columns under the selected player: keep the camera on him.
  useEffect(() => {
    const c = controls.current
    if (!c || !selected) return
    const id = setTimeout(() => {
      const t = layerRef.current?.focusPoint(selected)
      if (t) c.moveTo(t.x, t.y, t.z, true)
    }, 60)
    return () => clearTimeout(id)
  }, [lens, selected])

  useFrame((_, dt) => {
    const c = controls.current
    if (!c) return
    if (panel) c.azimuthAngle += dt * 0.035
    else if (touring && !selected) {
      // A slow sway across the front of the house rather than a full orbit, so the marks stay readable.
      c.azimuthAngle = Math.sin(performance.now() / 9000) * 0.07
    }
  })

  return (
    <CameraControls
      ref={controls}
      makeDefault
      minDistance={5}
      maxDistance={portrait ? 300 : 210}
      maxPolarAngle={Math.PI / 2 - 0.06}
      smoothTime={0.42}
      draggingSmoothTime={0.12}
      dollyToCursor={false}
      onStart={() => useStore.getState().setTouring(false)}
    />
  )
}

function Effects() {
  const size = useThree((s) => s.size)
  const small = size.width < 760
  return (
    <EffectComposer multisampling={small ? 0 : 4}>
      <Bloom mipmapBlur intensity={0.9} luminanceThreshold={1.0} luminanceSmoothing={0.25} radius={0.72} />
      <Vignette offset={0.28} darkness={0.78} />
      <ToneMapping mode={ToneMappingMode.ACES_FILMIC} />
    </EffectComposer>
  )
}

export function Scene() {
  return (
    <Canvas
      className="scene"
      flat
      dpr={[1, 1.75]}
      gl={{ antialias: false, powerPreference: 'high-performance', alpha: false }}
      camera={{ fov: 36, near: 0.5, far: 1600, position: [-26, 150, 110] }}
    >
      <color attach="background" args={[BG]} />
      <fogExp2 attach="fog" args={[BG, 0.0036]} />
      <hemisphereLight args={['#d6f5e8', '#0b1f18', 1.15]} />
      <directionalLight position={[40, 90, 60]} intensity={2.6} color="#ffffff" />
      <directionalLight position={[-70, 50, -80]} intensity={1.5} color="#6fe0b8" />
      <Suspense fallback={null}>
        <Arena />
        <StageSet />
        <FieldSet />
        <Players />
      </Suspense>
      <Rig />
      <Effects />
    </Canvas>
  )
}
