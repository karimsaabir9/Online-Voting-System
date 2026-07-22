import { redirect } from "next/navigation"

import { getServerSession } from "@/server/auth/get-session"
import { LandingHeader } from "@/features/landing/components/landing-header"
import { HeroSection } from "@/features/landing/components/hero-section"
import { FeaturesSection } from "@/features/landing/components/features-section"
import { HowItWorksSection } from "@/features/landing/components/how-it-works-section"
import { SecuritySection } from "@/features/landing/components/security-section"
import { BenefitsSection } from "@/features/landing/components/benefits-section"
import { FaqSection } from "@/features/landing/components/faq-section"
import { CtaSection } from "@/features/landing/components/cta-section"
import { LandingFooter } from "@/features/landing/components/landing-footer"

export default async function Home() {
  const session = await getServerSession()

  if (session && session.user.status === "active") {
    redirect(
      session.user.role === "admin" ? "/admin/dashboard" : "/voter/dashboard"
    )
  }

  return (
    <div className="flex flex-1 flex-col">
      <LandingHeader />
      <main className="flex-1">
        <HeroSection />
        <FeaturesSection />
        <HowItWorksSection />
        <SecuritySection />
        <BenefitsSection />
        <FaqSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  )
}
