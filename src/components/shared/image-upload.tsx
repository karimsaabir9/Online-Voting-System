"use client"

import * as React from "react"
import { ImageIcon, Loader2, Upload, X } from "lucide-react"

import { trpc } from "@/lib/trpc/client"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

type ImageUploadProps = {
  folder: "elections/banners" | "candidates/photos"
  value?: string
  onChange: (url: string) => void
}

export function ImageUpload({ folder, value, onChange }: ImageUploadProps) {
  const utils = trpc.useUtils()
  const [isDragging, setIsDragging] = React.useState(false)
  const [isUploading, setIsUploading] = React.useState(false)
  const [progress, setProgress] = React.useState(0)
  const [error, setError] = React.useState<string | null>(null)
  const inputRef = React.useRef<HTMLInputElement>(null)

  async function uploadFile(file: File) {
    setError(null)
    setIsUploading(true)
    setProgress(0)

    try {
      const signature = await utils.uploads.getSignature.fetch({ folder })

      const formData = new FormData()
      formData.append("file", file)
      formData.append("api_key", signature.apiKey)
      formData.append("timestamp", String(signature.timestamp))
      formData.append("signature", signature.signature)
      formData.append("folder", signature.folder)

      const url = await new Promise<string>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhr.open("POST", `https://api.cloudinary.com/v1_1/${signature.cloudName}/image/upload`)
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            setProgress(Math.round((event.loaded / event.total) * 100))
          }
        }
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
    } catch {
      setError("Could not upload image. Please try again.")
    } finally {
      setIsUploading(false)
    }
  }

  function handleFiles(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!file.type.startsWith("image/")) {
      setError("Please select an image file")
      return
    }
    void uploadFile(file)
  }

  return (
    <div className="space-y-2">
      {value ? (
        <div className="relative w-full max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={value}
            alt="Uploaded preview"
            className="aspect-video w-full rounded-lg border object-cover"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            className="absolute top-2 right-2"
            onClick={() => onChange("")}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div
          className={cn(
            "flex w-full max-w-xs flex-col items-center justify-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors",
            isDragging && "border-primary bg-muted",
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
            <>
              <Loader2 className="text-muted-foreground size-6 animate-spin" />
              <Progress value={progress} className="w-full" />
            </>
          ) : (
            <>
              <ImageIcon className="text-muted-foreground size-6" />
              <p className="text-muted-foreground text-xs">Drag and drop an image, or</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
              >
                <Upload className="size-3.5" />
                Browse
              </Button>
            </>
          )}
        </div>
      )}
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {error && <p className="text-destructive text-sm">{error}</p>}
    </div>
  )
}
