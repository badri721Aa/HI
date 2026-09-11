import { Hero } from "@/components/hero"
import { QuickStart } from "@/components/quick-start"
import { FeaturesSection } from "@/components/features-section"
import { SecurityBadges } from "@/components/security-badges"
import { Faq } from "@/components/faq"

export default function Home() {
  return (
    <>
      <Hero />
      <QuickStart />
      <FeaturesSection />
      <SecurityBadges />
      <Faq />
    </>
  )
}
