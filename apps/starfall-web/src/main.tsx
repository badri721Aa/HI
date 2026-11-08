import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import StarfallGame from '@/components/games/starfall/StarfallGame'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StarfallGame />
  </StrictMode>,
)
