"use client"

import * as React from "react"
import { ImageIcon, Loader2, Upload, X } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { AvatarCropDialog } from "@/components/shared/avatar-crop-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

type AvatarUploadProps = {
  value?: string
  onChange: (url: string) => void
}

export function AvatarUpload({ value, onChange }: AvatarUploadProps) {
  const utils = trpc.useUtils()
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [cropImageSrc, setCropImageSrc] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }
    setError(null)
    setCropImageSrc(URL.createObjectURL(file))
  }

  async function uploadCroppedImage(blob: Blob) {
    setIsUploading(true)
    setError(null)

    try {
      const signature = await utils.uploads.getSignature.fetch({ folder: "users/avatars" })

      const formData = new FormData()
      formData.append("file", blob, "avatar.jpg")
      formData.append("api_key", signature.apiKey)
      formData.append("timestamp", String(signature.timestamp))
      formData.append("signature", signature.signature)
      formData.append("folder", signature.folder)

      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`)
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            const response = JSON.parse(xhr.responseText) as { secure_url: string }
            resolve(response.secure_url)
          } else {
            reject(new Error("Upload failed"))
          }
        }
        xhr.onerror = () => reject(new Error("Upload failed"))
        xhr.send(formData)
      })

      onChange(url)
    } finally {
      setIsUploading(false)
    }
  }

  return (
    <div className="space-y-2">
      <div
        className={cn(
          "relative flex size-24 items-center justify-center overflow-hidden rounded-full border bg-muted transition-colors",
          isDragging && "border-primary",
          isUploading && "pointer-events-none opacity-70"
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setIsDragging(true)
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setIsDragging(false)
          handleFiles(e.dataTransfer.files)
        }}
      >
        {isUploading ? (
          <Loader2 className="text-muted-foreground size-6 animate-spin" />
        ) : value ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={value} alt="Profile" className="size-full object-cover" />
        ) : (
          <ImageIcon className="text-muted-foreground size-6" />
        )}
      </div>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={isUploading}
          onClick={() => inputRef.current?.click()}
        >
          <Upload className="size-3.5" />
          {value ? "Change photo" : "Upload photo"}
        </Button>
        {value && (
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={isUploading}
            onClick={() => onChange("")}
          >
            <X className="size-3.5" />
            <span className="sr-only">Remove photo</span>
          </Button>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ""
        }}
      />

      {error && <p className="text-destructive text-sm">{error}</p>}

      <AvatarCropDialog
        open={cropImageSrc !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (cropImageSrc) URL.revokeObjectURL(cropImageSrc)
            setCropImageSrc(null)
          }
        }}
        imageSrc={cropImageSrc}
        onSave={uploadCroppedImage}
      />
    </div>
  )
}
