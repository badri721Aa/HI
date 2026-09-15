import { Nav } from '@/components/nav'
import { Hero } from '@/components/hero'
import { Gallery } from '@/components/gallery'
import { About } from '@/components/about'
import { Visit } from '@/components/visit'
import { Contact } from '@/components/contact'
import { Footer } from '@/components/footer'

export default function Page() {
  return (
    <>
      <Nav />
      <main>
        <Hero />
        <Gallery />
        <About />
        <Visit />
        <Contact />
      </main>
      <Footer />
    </>
  )
}
