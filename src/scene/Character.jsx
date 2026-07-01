import { Component, useEffect, useMemo, useRef } from 'react'
import { useGLTF, useAnimations } from '@react-three/drei'
import { LoopOnce } from 'three'
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js'

// Echtes (geriggtes) Charaktermodell mit eingebauten Animationsclips.
// Später leicht austauschbar: einfach die GLB-Datei ersetzen und ggf. die
// Clip-Namen unten anpassen. Skalierung/Höhe sind Konstanten zum Feintunen.

const MODEL_URL = '/models/character.glb'
const SCALE = 0.42 // Modellgröße -> ~Sitzhöhe (bei Bedarf anpassen)
const Y_OFFSET = 0 // Füße auf dem Boden (bei Bedarf anpassen)

// Pose -> Animationsclip. Idle = stehen, point = Anschuldigen-Geste, aim = zielen.
const CLIP_FOR = { idle: 'Idle', point: 'Wave', aim: 'Punch' }

useGLTF.preload(MODEL_URL)

export function CharacterModel({ pose = 'idle' }) {
  const group = useRef()
  const { scene, animations } = useGLTF(MODEL_URL)
  // Jede Figur braucht einen EIGENEN Skelett-Klon (sonst teilen sich die
  // Instanzen die Knochen und die Animationen brechen).
  const cloned = useMemo(() => cloneSkeleton(scene), [scene])
  const { actions, names } = useAnimations(animations, group)

  const wanted = CLIP_FOR[pose] || 'Idle'
  const clip = names.includes(wanted) ? wanted : names.includes('Idle') ? 'Idle' : names[0]

  useEffect(() => {
    const action = actions[clip]
    if (!action) return
    if (pose === 'idle') {
      // Idle NICHT wiederholen — auf einer ruhigen Pose einfrieren, damit der
      // Kopf nicht ständig wackelt.
      action.reset().play()
      action.time = 0.2
      action.paused = true
      return () => {}
    }
    // Gesten (zeigen/zielen) EINMAL abspielen und am Ende halten.
    action.setLoop(LoopOnce, 1)
    action.clampWhenFinished = true
    action.reset().fadeIn(0.2).play()
    return () => action.fadeOut(0.2)
  }, [clip, pose, actions])

  return (
    <group ref={group} position={[0, Y_OFFSET, 0]} scale={SCALE}>
      <primitive object={cloned} />
    </group>
  )
}

// Fängt Lade-/Parse-Fehler des Modells ab und zeigt stattdessen den Fallback
// (die einfache Platzhalterfigur), damit die Szene nie schwarz wird.
export class ModelBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
