import type { Metadata } from 'next'
import StarfallGame from '@/components/games/starfall/StarfallGame'

export const metadata: Metadata = {
  title: 'Starfall Isle — Alhekma Arcade',
  description: 'A third-person island adventure. Find the seven fallen star shards and relight the Beacon.',
}

export default function StarfallPage() {
  return <StarfallGame />
}
