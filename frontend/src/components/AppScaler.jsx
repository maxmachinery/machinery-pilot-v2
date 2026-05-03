import { useState, useEffect } from 'react'

const DESIGN_WIDTH = 1920

export default function AppScaler({ children }) {
  const [scale, setScale] = useState(1)

  useEffect(() => {
    function update() {
      const newScale = Math.min(1, window.innerWidth / DESIGN_WIDTH)
      setScale(newScale)
    }
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [])

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
    }}>
      <div style={{
        width: `${DESIGN_WIDTH}px`,
        height: `${100 / scale}vh`,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}>
        {children}
      </div>
    </div>
  )
}
