import { SiteHeader } from "@/components/site-header"
import PrismHeroDemo from "@/components/prism-hero-demo"
import { FeaturesSection } from "@/components/features-section"
import { SiteFooter } from "@/components/site-footer"

export default function Home() {
  return (
    <>
      <SiteHeader />
      <PrismHeroDemo />
      <FeaturesSection />
      <SiteFooter />
    </>
  )
}
