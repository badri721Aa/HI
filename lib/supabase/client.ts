import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  return createBrowserClient(
    'https://gvxnzgogfaifmsdkingq.supabase.co',
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd2eG56Z29nZmFpZm1zZGtpbmdxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkxMTk4NjUsImV4cCI6MjEwNDY5NTg2NX0.JMCzgtIH3pRpApjgCTiK1t7CSdsK8G10gaU__p5kktw'
  )
}
