"use client"

import * as React from "react"
import Cropper, { type Area } from "react-easy-crop"
import { Loader2, ZoomIn, ZoomOut } from "lucide-react"

import { getCroppedImageBlob } from "@/lib/crop-image"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Slider } from "@/components/ui/slider"

type AvatarCropDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  imageSrc: string | null
  onSave: (blob: Blob) => Promise<void>
}

export function AvatarCropDialog({
  open,
  onOpenChange,
  imageSrc,
  onSave,
}: AvatarCropDialogProps) {
  const [crop, setCrop] = React.useState({ x: 0, y: 0 })
  const [zoom, setZoom] = React.useState(1)
  const [croppedAreaPixels, setCroppedAreaPixels] = React.useState<Area | null>(null)
  const [previewUrl, setPreviewUrl] = React.useState<string | null>(null)
  const [isSaving, setIsSaving] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const previewTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  React.useEffect(() => {
    if (open) return

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
      previewTimeoutRef.current = null
    }
    setCrop({ x: 0, y: 0 })
    setZoom(1)
    setCroppedAreaPixels(null)
    setError(null)
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current)
      return null
    })
  }, [open])

  React.useEffect(() => {
    return () => {
      if (previewTimeoutRef.current) clearTimeout(previewTimeoutRef.current)
    }
  }, [])

  function handleCropComplete(_area: Area, areaPixels: Area) {
    setCroppedAreaPixels(areaPixels)

    if (!imageSrc) return

    if (previewTimeoutRef.current) {
      clearTimeout(previewTimeoutRef.current)
    }
    previewTimeoutRef.current = setTimeout(() => {
      getCroppedImageBlob(imageSrc, areaPixels, 128)
        .then((blob) => {
          setPreviewUrl((current) => {
            if (current) URL.revokeObjectURL(current)
            return URL.createObjectURL(blob)
          })
        })
        .catch(() => {
          // Live preview is best-effort; Save surfaces real errors instead.
        })
    }, 100)
  }

  async function handleSave() {
    if (!imageSrc || !croppedAreaPixels) return

    setIsSaving(true)
    setError(null)

    try {
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels)
      await onSave(blob)
      onOpenChange(false)
    } catch {
      setError("Could not save photo. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !isSaving && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust profile photo</DialogTitle>
          <DialogDescription>
            Drag to reposition, and use the slider to zoom in or out.
          </DialogDescription>
        </DialogHeader>

        {imageSrc && (
          <div className="flex flex-col items-center gap-4">
            <div className="relative aspect-square w-full max-w-80 overflow-hidden rounded-lg bg-muted">
              <Cropper
                image={imageSrc}
                crop={crop}
                zoom={zoom}
                aspect={1}
                cropShape="round"
                showGrid={false}
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={handleCropComplete}
              />
            </div>

            <div className="flex w-full max-w-80 items-center gap-3">
              <ZoomOut className="text-muted-foreground size-4 shrink-0" />
              <Slider
                value={zoom}
                onValueChange={setZoom}
                min={1}
                max={3}
                step={0.01}
                thumbLabel="Zoom"
              />
              <ZoomIn className="text-muted-foreground size-4 shrink-0" />
            </div>

            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-xs">Preview</span>
              <div className="size-16 overflow-hidden rounded-full border bg-background">
                {previewUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Profile photo preview"
                    className="size-full object-cover"
                  />
                )}
              </div>
            </div>

            {error && <p className="text-destructive text-sm">{error}</p>}
          </div>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={isSaving}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" disabled={isSaving || !croppedAreaPixels} onClick={handleSave}>
            {isSaving && <Loader2 className="size-4 animate-spin" />}
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
