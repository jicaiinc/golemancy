import { useCallback, useRef, useState } from 'react'

export interface AudioRecorderState {
  isRecording: boolean
  durationMs: number
  analyser: AnalyserNode | null
  startRecording: () => Promise<void>
  stopRecording: () => Promise<Blob | null>
  cancelRecording: () => void
}

export function useAudioRecorder(): AudioRecorderState {
  const [isRecording, setIsRecording] = useState(false)
  const [durationMs, setDurationMs] = useState(0)
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const startTimeRef = useRef(0)
  const resolveStopRef = useRef<((blob: Blob) => void) | null>(null)

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      audioContextRef.current.close()
    }
    audioContextRef.current = null
    chunksRef.current = []
    resolveStopRef.current = null
    setAnalyser(null)
    setIsRecording(false)
    setDurationMs(0)
  }, [])

  const startRecording = useCallback(async () => {
    // Request microphone access — Electron handles macOS permission via IPC
    const electronAPI = (window as any).electronAPI
    if (electronAPI?.requestMicrophoneAccess) {
      const status = await electronAPI.requestMicrophoneAccess()
      if (status === 'denied') {
        throw new Error('Microphone access denied. Please enable it in System Settings.')
      }
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    streamRef.current = stream

    // Set up AudioContext + AnalyserNode for visualization
    const audioCtx = new AudioContext()
    audioContextRef.current = audioCtx
    const source = audioCtx.createMediaStreamSource(stream)
    const analyserNode = audioCtx.createAnalyser()
    analyserNode.fftSize = 256
    source.connect(analyserNode)
    setAnalyser(analyserNode)

    // Determine best mimeType
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : 'audio/webm'

    const recorder = new MediaRecorder(stream, { mimeType })
    mediaRecorderRef.current = recorder
    chunksRef.current = []

    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        chunksRef.current.push(e.data)
      }
    }

    recorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: recorder.mimeType })
      if (resolveStopRef.current) {
        resolveStopRef.current(blob)
        resolveStopRef.current = null
      }
    }

    recorder.start(100) // collect in 100ms chunks
    startTimeRef.current = Date.now()
    setIsRecording(true)
    setDurationMs(0)

    // Update duration every 100ms
    timerRef.current = setInterval(() => {
      setDurationMs(Date.now() - startTimeRef.current)
    }, 100)
  }, [])

  const stopRecording = useCallback(async (): Promise<Blob | null> => {
    const recorder = mediaRecorderRef.current
    if (!recorder || recorder.state === 'inactive') {
      cleanup()
      return null
    }

    return new Promise<Blob>((resolve) => {
      resolveStopRef.current = resolve
      recorder.stop()
    }).then((blob) => {
      // Stop timer and stream but keep the blob
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop())
        streamRef.current = null
      }
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        audioContextRef.current.close()
      }
      audioContextRef.current = null
      mediaRecorderRef.current = null
      setAnalyser(null)
      setIsRecording(false)
      return blob
    })
  }, [cleanup])

  const cancelRecording = useCallback(() => {
    cleanup()
  }, [cleanup])

  return {
    isRecording,
    durationMs,
    analyser,
    startRecording,
    stopRecording,
    cancelRecording,
  }
}
