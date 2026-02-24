import { useRef, useEffect } from 'react'

interface VoiceWaveformProps {
  analyser: AnalyserNode | null
  isActive: boolean
  className?: string
}

/** Pixels per sample column */
const COL_WIDTH = 2
/** Gap between columns */
const COL_GAP = 1
/** Canvas pixel height */
const CANVAS_HEIGHT = 36
/** Only push a new sample every N animation frames (~60fps / 4 ≈ 15 samples/sec) */
const SAMPLE_EVERY_N_FRAMES = 4

export function VoiceWaveform({ analyser, isActive, className = '' }: VoiceWaveformProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const animFrameRef = useRef<number>(0)
  /** Rolling buffer of amplitude values (0–1), newest at the end */
  const historyRef = useRef<number[]>([])
  /** Frame counter for throttling sample push rate */
  const frameCountRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !analyser || !isActive) {
      historyRef.current = []
      frameCountRef.current = 0
      return
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Measure actual available width from the container
    const rect = canvas.getBoundingClientRect()
    const canvasWidth = Math.floor(rect.width) || 400
    const historyLength = Math.floor(canvasWidth / (COL_WIDTH + COL_GAP))

    // Pre-fill history with silence
    historyRef.current = new Array(historyLength).fill(0)

    const dpr = window.devicePixelRatio || 1
    canvas.width = canvasWidth * dpr
    canvas.height = CANVAS_HEIGHT * dpr
    ctx.scale(dpr, dpr)

    const timeDomainData = new Uint8Array(analyser.fftSize)

    const style = getComputedStyle(canvas)
    const color = style.getPropertyValue('--color-text-secondary').trim() || '#aaaaaa'

    function draw() {
      if (!ctx || !analyser) return

      analyser.getByteTimeDomainData(timeDomainData)

      // Compute RMS amplitude (0–1)
      let sumSq = 0
      for (let i = 0; i < timeDomainData.length; i++) {
        const v = (timeDomainData[i] - 128) / 128
        sumSq += v * v
      }
      const rms = Math.sqrt(sumSq / timeDomainData.length)
      const amplitude = Math.min(1, rms * 3)

      // Throttle: only push a new sample every N frames
      frameCountRef.current++
      if (frameCountRef.current >= SAMPLE_EVERY_N_FRAMES) {
        frameCountRef.current = 0
        const history = historyRef.current
        history.push(amplitude)
        if (history.length > historyLength) {
          history.shift()
        }
      }

      // Draw
      ctx.clearRect(0, 0, canvasWidth, CANVAS_HEIGHT)
      const midY = CANVAS_HEIGHT / 2
      const history = historyRef.current

      ctx.fillStyle = color

      for (let i = 0; i < history.length; i++) {
        const amp = history[i]
        const halfH = Math.max(1, amp * (CANVAS_HEIGHT / 2 - 2))
        const x = i * (COL_WIDTH + COL_GAP)
        ctx.fillRect(x, midY - halfH, COL_WIDTH, halfH * 2)
      }

      animFrameRef.current = requestAnimationFrame(draw)
    }

    draw()

    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [analyser, isActive])

  return (
    <canvas
      ref={canvasRef}
      className={`block w-full ${className}`}
      style={{ height: CANVAS_HEIGHT }}
    />
  )
}
