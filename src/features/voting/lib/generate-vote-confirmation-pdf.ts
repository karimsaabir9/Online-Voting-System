import { jsPDF } from "jspdf"

export type VoteConfirmationData = {
  confirmationId: string
  candidateFullName: string
  candidatePhotoUrl: string | null
  politicalParty: string | null
  position: string | null
  electionTitle: string
  votedAt: Date
}

async function loadImageAsDataUrl(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    if (!response.ok) return null
    const blob = await response.blob()
    return await new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(reader.result as string)
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function generateVoteConfirmationPdf(data: VoteConfirmationData): Promise<void> {
  const doc = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = doc.internal.pageSize.getWidth()
  const marginX = 48
  const contentWidth = pageWidth - marginX * 2

  const primaryColor = "#4f46e5"
  const textColor = "#1f2937"
  const mutedColor = "#6b7280"
  const borderColor = "#e5e7eb"

  doc.setFillColor(primaryColor)
  doc.rect(0, 0, pageWidth, 96, "F")
  doc.setTextColor("#ffffff")
  doc.setFont("helvetica", "bold")
  doc.setFontSize(20)
  doc.text("Vote Confirmation", marginX, 48)
  doc.setFont("helvetica", "normal")
  doc.setFontSize(10)
  doc.text("Official confirmation of your recorded vote", marginX, 68)

  let cursorY = 140

  const photoSize = 96
  const photoDataUrl = data.candidatePhotoUrl
    ? await loadImageAsDataUrl(data.candidatePhotoUrl)
    : null

  const textStartX = photoDataUrl ? marginX + photoSize + 24 : marginX

  if (photoDataUrl) {
    try {
      doc.addImage(photoDataUrl, "JPEG", marginX, cursorY, photoSize, photoSize)
    } catch {
      // Ignore malformed/unsupported images and fall back to text-only layout
    }
  }

  doc.setTextColor(textColor)
  doc.setFont("helvetica", "bold")
  doc.setFontSize(18)
  doc.text(data.candidateFullName, textStartX, cursorY + 24)

  doc.setFont("helvetica", "normal")
  doc.setFontSize(11)
  doc.setTextColor(mutedColor)
  const subtitle = [data.politicalParty, data.position].filter(Boolean).join("  ·  ")
  if (subtitle) {
    doc.text(subtitle, textStartX, cursorY + 44)
  }

  cursorY += photoSize + 40

  doc.setDrawColor(borderColor)
  doc.line(marginX, cursorY, marginX + contentWidth, cursorY)
  cursorY += 32

  const rows: Array<[string, string]> = [
    ["Election", data.electionTitle],
    ["Position contested", data.position ?? "—"],
    ["Political party", data.politicalParty ?? "—"],
    [
      "Date & time cast",
      data.votedAt.toLocaleString(undefined, {
        dateStyle: "long",
        timeStyle: "short",
      }),
    ],
    ["Vote status", "Confirmed"],
    ["Vote confirmation ID", data.confirmationId],
  ]

  const labelWidth = 160
  for (const [label, value] of rows) {
    doc.setFont("helvetica", "bold")
    doc.setFontSize(10)
    doc.setTextColor(mutedColor)
    doc.text(label.toUpperCase(), marginX, cursorY)

    doc.setFont("helvetica", "normal")
    doc.setFontSize(12)
    doc.setTextColor(textColor)
    const lines = doc.splitTextToSize(value, contentWidth - labelWidth)
    doc.text(lines, marginX + labelWidth, cursorY)

    cursorY += 22 * Math.max(1, lines.length)
  }

  cursorY += 16
  doc.setDrawColor(borderColor)
  doc.line(marginX, cursorY, marginX + contentWidth, cursorY)
  cursorY += 24

  doc.setFont("helvetica", "italic")
  doc.setFontSize(9)
  doc.setTextColor(mutedColor)
  doc.text(
    "This confirms that your vote was successfully recorded. It does not reveal your",
    marginX,
    cursorY
  )
  doc.text(
    "candidate choice to any third party and is provided for your personal records only.",
    marginX,
    cursorY + 13
  )

  doc.setFontSize(8)
  doc.text(`Generated on ${new Date().toLocaleString()}`, marginX, cursorY + 34)

  const fileSafeName = data.candidateFullName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()
  doc.save(`vote-confirmation-${fileSafeName}-${data.confirmationId.slice(0, 8)}.pdf`)
}
