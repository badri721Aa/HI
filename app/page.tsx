import { Hero } from "@/components/hero"
import { QuickStart } from "@/components/quick-start"
import { FeaturesSection } from "@/components/features-section"
import { Faq } from "@/components/faq"

export default function Home() {
  return (
    <>
      <Hero />
      <QuickStart />
      <FeaturesSection />
      <Faq />
    </>
  )
}
