'use client'

import { useEffect } from 'react'

export function PanicHide() {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.shiftKey && e.key === 'Tab') {
        e.preventDefault()
        const el = document.getElementById('panic-overlay')
        if (el) {
          el.style.display = el.style.display === 'none' ? 'block' : 'none'
        }
      }
      if (e.key === 'Escape') {
        const el = document.getElementById('panic-overlay')
        if (el) el.style.display = 'none'
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div
      id="panic-overlay"
      style={{ display: 'none' }}
      className="fixed inset-0 z-[9999] bg-white overflow-auto"
    >
      {/* Fake Google Classroom */}
      <div style={{ fontFamily: 'Google Sans, Roboto, Arial, sans-serif', minHeight: '100vh', background: '#fff' }}>
        {/* Top bar */}
        <div style={{ background: '#fff', borderBottom: '1px solid #e0e0e0', padding: '0 16px', height: 64, display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
              <rect width="40" height="40" rx="6" fill="#0F9D58"/>
              <text x="20" y="27" textAnchor="middle" fill="white" fontSize="18" fontWeight="700">C</text>
            </svg>
            <span style={{ fontSize: 22, color: '#202124', fontWeight: 400 }}>Classroom</span>
          </div>
          <div style={{ flex: 1 }} />
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#4285F4', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 14, fontWeight: 600 }}>S</div>
        </div>
        {/* Classes */}
        <div style={{ maxWidth: 1200, margin: '32px auto', padding: '0 24px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))', gap: 24 }}>
            {[
              { name: 'Mathematics 11', teacher: 'Mr. Al-Hassan', color: '#1565C0', section: 'Period 3' },
              { name: 'English Literature', teacher: 'Ms. Thompson', color: '#6A1B9A', section: 'Period 1' },
              { name: 'Physics', teacher: 'Mr. Sharma', color: '#00695C', section: 'Period 5' },
              { name: 'Computer Science', teacher: 'Mrs. Al-Rashid', color: '#E65100', section: 'Period 2' },
              { name: 'Chemistry', teacher: 'Mr. Patel', color: '#37474F', section: 'Period 4' },
              { name: 'Arabic Language', teacher: 'Ms. Mahmoud', color: '#880E4F', section: 'Period 6' },
            ].map((cls, i) => (
              <div key={i} style={{ borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.12),0 1px 2px rgba(0,0,0,0.24)', cursor: 'pointer' }}>
                <div style={{ background: cls.color, padding: '20px 16px 40px', position: 'relative' }}>
                  <div style={{ color: 'white', fontSize: 20, fontWeight: 500 }}>{cls.name}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14, marginTop: 4 }}>{cls.section}</div>
                  <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 14 }}>{cls.teacher}</div>
                </div>
                <div style={{ background: '#fff', padding: '12px 16px', borderTop: '1px solid #e0e0e0', display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="18" height="18" fill="#5f6368" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 14.5v-9l6 4.5-6 4.5z"/></svg>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                    <svg width="18" height="18" fill="#5f6368" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
