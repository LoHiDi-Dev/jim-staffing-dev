import type { PointerEvent as ReactPointerEvent } from 'react'
import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'

export type SignaturePadHandle = {
  clear: () => void
  isEmpty: () => boolean
  toDataURL: () => string
}

type Props = {
  className?: string
  height?: number
}

export const SignaturePad = forwardRef<SignaturePadHandle, Props>(({ className = '', height = 120 }: Props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const last = useRef<{ x: number; y: number } | null>(null)
  const [hasInk, setHasInk] = useState(false)

  const resizeForDpr = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
    const rect = canvas.getBoundingClientRect()
    const w = Math.max(1, Math.floor(rect.width))
    const h = Math.max(1, Math.floor(rect.height))
    const nextW = Math.floor(w * dpr)
    const nextH = Math.floor(h * dpr)
    if (canvas.width === nextW && canvas.height === nextH) return
    canvas.width = nextW
    canvas.height = nextH
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }

  const clear = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
  }

  const toDataURL = () => {
    const canvas = canvasRef.current
    if (!canvas) return ''
    return canvas.toDataURL('image/png')
  }

  useImperativeHandle(ref, () => ({ clear, isEmpty: () => !hasInk, toDataURL }), [hasInk])

  useEffect(() => {
    resizeForDpr()
    const onResize = () => resizeForDpr()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const getPoint = (e: PointerEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    resizeForDpr()
    drawing.current = true
    ;(e.target as HTMLCanvasElement).setPointerCapture(e.pointerId)
    last.current = getPoint(e.nativeEvent)
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const p = getPoint(e.nativeEvent)
    const prev = last.current
    if (prev) {
      ctx.beginPath()
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      setHasInk(true)
    }
    last.current = p
  }

  const endStroke = () => {
    drawing.current = false
    last.current = null
  }

  return (
    <div className={`relative ${className}`}>
      <canvas
        ref={canvasRef}
        className="w-full rounded-xl border border-slate-200 bg-white touch-none"
        style={{ height }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endStroke}
        onPointerCancel={endStroke}
      />
      {!hasInk ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm font-semibold text-slate-400">Sign here</div>
      ) : null}
    </div>
  )
})

SignaturePad.displayName = 'SignaturePad'

