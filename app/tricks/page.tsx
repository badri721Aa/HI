'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// ── Types ────────────────────────────────────────────────────
interface Trick {
  title: string
  desc: string
}

interface Category {
  id: string
  category: string
  icon: string
  dot: string
  glow: string
  tricks: Trick[]
  // YouTube search query to embed related videos
  ytQuery: string
}

// ── Data ─────────────────────────────────────────────────────
const DATA: Category[] = [
  {
    id: 'classic',
    category: 'Classic Crib Sheets',
    icon: '📝',
    dot: 'bg-violet-500',
    glow: 'rgba(139,92,246,0.12)',
    ytQuery: 'how to make cheat sheet for exam',
    tricks: [
      { title: 'Micro-font notecard', desc: 'Print formulas at 4pt font on a white index card. Looks blank from 3 feet away — readable up close with the right angle.' },
      { title: 'Eraser bottom', desc: 'Write on the flat underside of a block eraser with a fine mechanical pencil. Flip it upside down between uses.' },
      { title: 'Ruler edge notes', desc: 'Write formulas along the 1mm-wide edge of a transparent ruler. Only visible when you tilt it.' },
      { title: 'Correction tape strip', desc: 'Apply white correction tape over old printed text, write new notes on top — appears as tape residue on the sheet.' },
      { title: 'Transparent tape cheat strip', desc: 'Write on tape in pencil, stick inside pencil case lid. Remove and pocket before handing anything in.' },
      { title: 'Folded-paper insert', desc: 'Fold a tiny sheet of paper into a square small enough to slide under the exam paper itself — check when re-reading answers.' },
      { title: 'Graph paper camouflage', desc: 'Write formulas in pencil on graph paper — the grid lines break up the text and disguise it as grid noise.' },
      { title: 'Pencil barrel wrap', desc: 'Cut a thin strip of paper, write notes in tiny print, wrap tightly around pencil barrel under a normal label sticker.' },
      { title: 'Tissue note', desc: 'Write on a paper tissue with a fine-tip pen. Crumple it — looks like normal pocket tissue. Uncrumple in lap.' },
      { title: 'Sticky label underside', desc: 'Write on the adhesive side of a sticker in reverse — peel back briefly to read, press back down.' },
      { title: 'Calculator case interior', desc: 'Tape a note strip inside the flip case of a calculator. Open case flat on the desk to reference.' },
      { title: 'Bottle label overlay', desc: 'Design a fake product label with formulas replacing ingredient text. Print it, wrap on a water bottle.' },
      { title: 'Fingernail writing', desc: 'Write tiny formulas on nails with a thin gel pen before clear topcoat — invisible once sealed.' },
      { title: 'Watch strap interior', desc: 'Tape a micro-strip to the inside band of your watch. Rotate wrist inward to read.' },
      { title: 'Glasses arm notes', desc: 'Wrap a thin strip of paper around the arm of glasses. Tilt head slightly to slide into view.' },
      { title: 'Double-sided tape layer', desc: 'Layer two sheets with double-sided tape — notes sandwiched between. Looks like one sheet from above.' },
      { title: 'UV ink pen', desc: 'Write notes with a UV-reactive pen. Invisible in normal light, readable under a UV keychain light hidden in your pocket.' },
      { title: 'Pencil lead groove', desc: 'Carve a shallow groove along the flat side of a pencil, write in the groove. Invisible unless you know it\'s there.' },
      { title: 'Inside gum wrapper', desc: 'Unwrap a stick of gum, write notes inside the foil lining, refold it back. Looks like a normal stick of gum.' },
      { title: 'Sock cuff writing', desc: 'Write on white sock cuff in fabric marker. Long trouser leg covers it — hike the leg up slightly under the desk.' },
      { title: 'Back of belt', desc: 'Write on the reverse side of a belt or inside the loop fold. Unbuckle slightly to reveal.' },
      { title: 'Staple hole pattern', desc: 'Use staple holes in the test cover sheet as a binary code — prearrange a code with a partner for MCQ letters.' },
      { title: 'Pencil case false bottom', desc: 'Line the bottom of a fabric pencil case with a stiff card. Notes sit under the card, below all the pens.' },
      { title: 'Ring inscription', desc: 'Engrave or tape a tiny strip inside a wide band ring. Natural jewelry motion to glance at.' },
      { title: 'Bookmark in allowed text', desc: 'If open-book exam, mark pages with color-coded tabs and pre-mark every key passage with pencil brackets so you can flip straight to it.' },
    ],
  },
  {
    id: 'digital',
    category: 'Digital & Device Methods',
    icon: '📱',
    dot: 'bg-blue-500',
    glow: 'rgba(59,130,246,0.12)',
    ytQuery: 'phone cheat exam method',
    tricks: [
      { title: 'Calculator app notes', desc: 'Most scientific calculators and apps let you store text in memory registers. Store formulas as numeric variables nobody checks.' },
      { title: 'Smartwatch notes', desc: 'Add notes to a smartwatch calendar or notes app before the exam. Glance at wrist naturally.' },
      { title: 'Earpiece + phone call', desc: 'Tiny single-ear Bluetooth earpiece hidden under hair or a collar. Partner reads answers via phone call from outside.' },
      { title: 'Screenshot notes', desc: 'Screenshot your notes into the camera roll, sorted into albums by topic. Phone on silent face-down, check in lap on the way out.' },
      { title: 'Dark mode text dump', desc: 'White text on white background in Notes app — invisible at a glance. Triple-tap to select and reveal.' },
      { title: 'Borrowed calculator with preset', desc: 'Use a physical graphing calculator where custom programs store text. Programs are rarely checked.' },
      { title: 'TI calculator notes program', desc: 'On a TI-84, write a BASIC program that just displays text. Name it something innocuous like "CONVERT". Scroll through it during the exam.' },
      { title: 'Phone in glasses case', desc: 'Phone sits open to a notes screenshot inside a hard glasses case on the desk. Open the case "to get your glasses cleaner".' },
      { title: 'Hidden earpiece relay', desc: 'Pin-sized magnetic earpiece sits in the ear canal, invisible. Standard earphones can drive it from a phone in a waistband pouch.' },
      { title: 'Fitness tracker notes', desc: 'Some Garmin/Fitbit devices allow custom text workouts. Add formulas as workout step descriptions — scroll naturally.' },
      { title: 'Screen brightness min', desc: 'Phone screen at minimum brightness in a shadowed pocket looks off from a distance. Pre-open your notes app, tap screen to wake while looking down.' },
      { title: 'Wireless earbud one side', desc: 'Single AirPod in the ear away from the invigilator\'s usual approach path. Long hair or a hoodie covers it.' },
      { title: 'Fake calculator skin', desc: 'Print a paper skin to go over an allowed calculator — the back of the skin has a cheat strip visible when you flip it.' },
      { title: 'Notes on phone background', desc: 'Set lock screen wallpaper to a screenshot of key formulas in small white text on a dark background — glances like a normal wallpaper.' },
    ],
  },
  {
    id: 'body',
    category: 'Body & Clothing',
    icon: '👕',
    dot: 'bg-amber-500',
    glow: 'rgba(245,158,11,0.12)',
    ytQuery: 'write on hand cheat exam',
    tricks: [
      { title: 'Wrist inner side', desc: 'Write on the inside of your wrist — covered by sleeve until needed. Use water-resistant ink for longevity.' },
      { title: 'Inside shirt collar', desc: 'Write key terms inside your collar with a laundry marker. Read by touching the neckline.' },
      { title: 'Thigh writing', desc: 'Write on upper thigh in pen. Shorts or skirt provides easy access by adjusting position in the seat.' },
      { title: 'Palm writing', desc: 'Write small equations on the palm in pencil — closed fist looks natural. Lick palm slightly to make ink reappear if faded.' },
      { title: 'Shoe inner sole', desc: 'Write on the paper inner sole — remove shoe casually, lift out the insert.' },
      { title: 'Under fingernails', desc: 'Tiny abbreviations pressed under the nail with a toothpick — invisible unless you know where to look.' },
      { title: 'Cuff inside', desc: 'Write key data along the inside of a long-sleeve cuff. Roll sleeve up slightly to expose when seated.' },
      { title: 'Hat inner band', desc: 'Write on the inner sweatband of a cap if hats are allowed. Tip the brim forward to check.' },
      { title: 'Forearm inside sleeve', desc: 'Write up the inner forearm, past the wrist. Long sleeves cover the whole thing; push sleeve back with opposite thumb to peek.' },
      { title: 'Knee notes', desc: 'Write on the knee. Shorts covered by a hoodie tied around the waist — untie it in your lap as a "cushion" and expose the knee underneath.' },
      { title: 'Nail undercoat formula', desc: 'Write tiny abbreviations with white nail pen, coat over with clear polish. Polish slightly magnifies the text; nails look plain.' },
      { title: 'Band-aid cover', desc: 'Write on the skin, cover with a flesh-colored band-aid. "Old cut" — peel the corner back to read.' },
      { title: 'Back of hand knuckle dots', desc: 'Dot-and-dash Morse-style marks on knuckles encode a short sequence. Looks like ink smudges from afar.' },
      { title: 'Rubber band wrist', desc: 'Write on the inside of a wide elastic rubber band worn on the wrist. Looks like a wristband.' },
      { title: 'Ink on foot arch', desc: 'Write on the high arch of the foot — won\'t rub off on the sock and invisible when shoe is on. Remove shoe under desk.' },
    ],
  },
  {
    id: 'social',
    category: 'Social Engineering',
    icon: '🤝',
    dot: 'bg-emerald-500',
    glow: 'rgba(34,197,94,0.12)',
    ytQuery: 'how students cheat on exams social method',
    tricks: [
      { title: 'Signal system with a partner', desc: 'Agree on a pre-test code: tapping pen twice = answer A, three times = B. Works over several desks.' },
      { title: 'Cough code', desc: 'Same idea — single cough, double cough, pause patterns for MCQ answers. Requires a planted accomplice nearby.' },
      { title: 'Bathroom relay', desc: 'Go to the bathroom during the exam. Partner waits near the door with an answer photo or note to hand off.' },
      { title: 'Dropped item pass', desc: '"Accidentally" drop a pen next to a partner\'s desk. Small folded note falls with it and stays on the floor.' },
      { title: 'Pre-test photo share', desc: 'Students who have an earlier sitting photograph the paper and share via group chat before the next session.' },
      { title: 'Tissue pass', desc: 'Write on a tissue, screw it up, toss it to a partner under the guise of passing a used tissue.' },
      { title: 'Seating map exploit', desc: 'Get the seating arrangement ahead of time. Arrange for two accomplices on either side of the strongest student — answers flow left and right.' },
      { title: 'Foot tap MCQ grid', desc: 'Expand on tap codes — left foot = row, right foot = column in a 5×5 letter grid. Can signal any word silently.' },
      { title: 'Pre-agreed answer sheet', desc: 'For a known question format, pre-fill a private key with your smartest partner before the exam. Both carry the same memorized sequence into the room.' },
      { title: 'Invigilator distraction', desc: 'One partner causes a minor disturbance — dropped items, a raised hand, a question — while another accesses their notes.' },
      { title: 'Mouthing answers', desc: 'MCQ letters mouthed clearly, facing a partner when the invigilator has their back. Exaggerated mouth shape for A/B/C/D is readable from 4 desks away.' },
      { title: 'Color-coded pen signal', desc: 'Writing with a blue pen = still on question. Switching to black = done. A partner timed on the same question knows to wait for you.' },
      { title: 'Desk number pre-plant', desc: 'If desks are numbered, plant a helper at adjacent desk numbers by submitting seat requests to the same session time.' },
    ],
  },
  {
    id: 'environment',
    category: 'Environment Exploitation',
    icon: '🏫',
    dot: 'bg-rose-500',
    glow: 'rgba(239,68,68,0.12)',
    ytQuery: 'cheat exam room setup trick',
    tricks: [
      { title: 'Pre-planted desk note', desc: 'Arrive early and tape a small strip under the desk or chair lip before invigilators sweep the room.' },
      { title: 'Book under desk', desc: 'In unsupervised in-class tests, a textbook stays on the shelf in the bag — foot pushes it open to the right page.' },
      { title: 'Seat row selection', desc: 'Choose seats near windows or in corners — invigilators naturally walk the aisles less frequently toward edges.' },
      { title: 'Water bottle label', desc: 'As above — a fake label with formulas. Place the bottle with the label facing your direction only.' },
      { title: 'Pencil case layout', desc: 'Arrange pencil case items so a specific orientation reveals a hidden strip inside the bottom of the case.' },
      { title: 'Coat pocket depth', desc: 'A long coat pocket holds a folded A4 sheet. Stand up to stretch, slip hand in pocket briefly.' },
      { title: 'False dropped pencil', desc: 'Drop a pencil near a stronger student\'s desk. "Retrieve" it slowly, reading their answer sheet from ground level.' },
      { title: 'Blind spot mapping', desc: 'In the first 3 minutes, track the invigilator\'s patrol path. They always have a turnaround point and a dead zone — exploit the dead zone.' },
      { title: 'Stacked paper trick', desc: 'Bring your own extra scratch paper that already has notes on one side. Offer it face-down — use the back for notes when the exam allows rough work.' },
      { title: 'Desk graffiti read', desc: 'Check desks before sitting — previous sitters sometimes leave useful formula graffiti in light pencil. Bring a pencil to add your own for the next person.' },
      { title: 'Edge seat + window reflection', desc: 'A window or glass door at the right angle can reflect the contents of your phone screen from a bag on the floor.' },
      { title: 'Bathroom note plant', desc: 'Before the exam, tape a strip inside a specific bathroom stall. Request the bathroom break, retrieve and read in the stall.' },
      { title: 'Pencil case zip compartment', desc: 'Larger pencil cases have a thin inner zip pocket. A folded strip fits perfectly — zero profile from outside.' },
    ],
  },
  {
    id: 'memory',
    category: 'Legal Edge Cases (Memory Tricks)',
    icon: '🧠',
    dot: 'bg-sky-500',
    glow: 'rgba(14,165,233,0.12)',
    ytQuery: 'memory palace memorize fast exam',
    tricks: [
      { title: 'Memory palace', desc: 'Assign each fact to a room in a familiar building. Walk through the building mentally during the exam to retrieve facts in order.' },
      { title: 'Acronym stacking', desc: 'Compress long lists into acronyms. ROYGBIV for the spectrum, SOHCAHTOA for trig. Make them absurd — absurd sticks.' },
      { title: 'Chunking', desc: 'Group numbers into 3–4 digit chunks the way you would a phone number. 314159265 → 314 · 159 · 265.' },
      { title: 'Last-minute dump', desc: 'The moment the exam starts, flip the paper and write every formula you memorised on the back cover or blank space before you forget anything.' },
      { title: 'Rhyme encoding', desc: 'Turn a formula into a ridiculous rhyme. "E equals MC squared, energy is not impaired." Recall the rhyme, extract the formula.' },
      { title: 'Story method', desc: 'Turn the steps of a process into a narrative. Characters do things in the right order — the story is easier to recall than the steps.' },
      { title: 'Finger counting system', desc: 'Assign specific values to fingers and knuckles. 10 data points per hand, 20 total. Tap fingers under the desk to count through.' },
      { title: 'Spaced repetition blitz', desc: 'Use Anki with 1-minute intervals the night before. Force the same cards 20+ times until the answer fires without thinking. Brute-force long-term memory into short-term.' },
      { title: 'Sleep encoding', desc: 'Review critical notes in the last 20 minutes before sleep — the brain consolidates information during the first sleep cycle. No screens after, just the notes.' },
      { title: 'Retrieval practice over re-reading', desc: 'Close the book, write everything you remember, then check. Each retrieval attempt is 3× more effective than re-reading the same content.' },
      { title: 'Interleaving subjects', desc: 'Switch topics every 20 minutes rather than blocking one topic all session. Forces the brain to re-retrieve context each switch, which deepens encoding.' },
      { title: 'First-letter keyword chain', desc: 'Take the first letter of each term in a list and construct a sentence. "Every Good Boy Does Fine" for EGBDF. Make the sentence offensive or absurd — it sticks harder.' },
      { title: 'Teach-back method', desc: 'Explain the topic out loud to an empty room as if teaching it. Any gap in your explanation is a gap in your understanding — find it before the exam does.' },
    ],
  },
  {
    id: 'online',
    category: 'Online & Remote Exam Hacks',
    icon: '💻',
    dot: 'bg-cyan-500',
    glow: 'rgba(6,182,212,0.12)',
    ytQuery: 'how to cheat online exam proctored',
    tricks: [
      { title: 'Second device off-camera', desc: 'Phone or tablet positioned just outside the webcam frame — lean slightly to reference it. Map the camera\'s blind spots in the first minute.' },
      { title: 'Virtual camera with notes overlay', desc: 'Use OBS Studio to pipe a virtual camera to the exam. Add a transparent text layer with notes — the proctor sees a "clean" feed.' },
      { title: 'Virtual machine trick', desc: 'Run the proctored exam inside a VM. The host OS stays fully accessible — alt-tab or hotkey to host is invisible to screen-share monitoring inside the VM.' },
      { title: 'Second monitor outside FOV', desc: 'Extend the desktop to a second screen not captured by screen-share software. Notes stay on the secondary display.' },
      { title: 'Browser inspect-element notes', desc: 'Open devtools before the proctored browser session starts. Notes pasted into a JS variable in the console are accessible without any new tab.' },
      { title: 'Printed notes on physical wall', desc: 'Pin printed notes on the wall just above or beside the monitor — outside the webcam FOV. Glance up naturally as if thinking.' },
      { title: 'Whiteboard behind laptop', desc: 'Small portable whiteboard directly behind the laptop screen, facing you. Proctor sees your face looking at the screen — you\'re reading the board.' },
      { title: 'Keyboard shortcut to minimize', desc: 'Set a hotkey to minimize the exam window and open a notes app instantly — useful for timed breaks or when the human proctor is away.' },
      { title: 'Accomplice in the room', desc: 'Another person sits off-camera and whispers answers. Works best with earphones already in for "exam audio".' },
      { title: 'Screen capture lag exploit', desc: 'Some AI proctors only capture screenshots every few seconds. Time your reference material to brief intervals between likely capture events.' },
      { title: 'Notes inside exam instructions', desc: 'Before the exam starts, the instructions page is usually not monitored. Screenshot notes onto a device, then navigate to instructions where you review them last.' },
      { title: 'Sticky notes on monitor bezel', desc: 'Physical sticky notes stuck to the monitor frame — the camera captures your face and screen but the bezel is in the dead zone.' },
    ],
  },
  {
    id: 'advanced',
    category: 'Advanced & Niche Techniques',
    icon: '⚡',
    dot: 'bg-fuchsia-500',
    glow: 'rgba(217,70,239,0.12)',
    ytQuery: 'advanced exam cheating techniques',
    tricks: [
      { title: 'Braille-style tactile marks', desc: 'Use a pin to emboss dot patterns on a blank card — readable by touch under the desk without looking down at all.' },
      { title: 'Microdot photography', desc: 'Photograph your notes, scale to 1mm square, print on glossy paper. Only readable under a loupe or magnifying glass concealed in a pocket.' },
      { title: 'Mirror glasses', desc: 'Small fishing mirror or dental mirror clipped to the inside of eyeglass frames — reflect content behind you without turning your head.' },
      { title: 'Lemon juice invisible ink', desc: 'Write notes with lemon juice, let dry. Invisible until exposed to mild heat from a lamp or body warmth on the page.' },
      { title: 'Embedded image steganography', desc: 'For take-home or open-resource exams: hide text in image pixel LSBs. Open the image in the exam, decode with a free online tool.' },
      { title: 'QR code cheat sheet', desc: 'Compress an entire formula sheet into a QR code — tiny enough to print on a fingernail sticker. Scan with phone in lap.' },
      { title: 'Reverse-writing on transfer paper', desc: 'Write notes in reverse on carbon paper. Lay it face down on blank paper — notes transfer legibly when pressed.' },
      { title: 'Pencil shaving wrap', desc: 'Extremely fine notes on a strip of rice paper, rolled around the pencil under the wooden barrel. Peel away the wood casing with a craft knife beforehand.' },
      { title: 'Vibration alert watch', desc: 'Program a watch to vibrate in patterns at timed intervals — external partner sends signals from a phone using a paired vibration motor in your pocket.' },
      { title: 'Magnifying contact lens', desc: 'Standard prescription contacts slightly magnify text. Write notes at 6pt font, readable only with your specific lens magnification.' },
      { title: 'Pre-written formula on answer sheet edge', desc: 'The answer sheet margins are rarely checked. Faint pencil formulas along the very edge of the paper are erased just before submission.' },
      { title: 'Newspaper or magazine plant', desc: 'Fold a tabloid to the relevant page (for arts/history exams), tuck it under a leg or inside a magazine sleeve laid on the floor beside your bag.' },
    ],
  },
]

// ── YouTube search embed helper ───────────────────────────────
function ytSearchUrl(query: string) {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
}

// Opens through the proxy
function openProxy(url: string) {
  window.open(`/proxy#${encodeURIComponent(url)}`, '_blank')
}

// ── Main ─────────────────────────────────────────────────────
export default function TricksPage() {
  const [open, setOpen] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [ytOpen, setYtOpen] = useState<string | null>(null)

  const filtered = DATA.map(cat => ({
    ...cat,
    tricks: search
      ? cat.tricks.filter(t =>
          t.title.toLowerCase().includes(search.toLowerCase()) ||
          t.desc.toLowerCase().includes(search.toLowerCase()),
        )
      : cat.tricks,
  })).filter(cat => cat.tricks.length > 0)

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* YouTube modal */}
      <AnimatePresence>
        {ytOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.88)' }}
            onClick={() => setYtOpen(null)}
          >
            <motion.div
              initial={{ scale: 0.94, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 20 }}
              onClick={e => e.stopPropagation()}
              className="w-full max-w-3xl rounded-2xl overflow-hidden border border-white/[0.08] shadow-2xl"
            >
              <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed?listType=search&list=${encodeURIComponent(ytOpen)}&autoplay=1`}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                />
              </div>
              <div className="bg-zinc-900 px-4 py-3 flex items-center justify-between">
                <span className="text-xs text-zinc-500">Search: &quot;{ytOpen}&quot;</span>
                <div className="flex items-center gap-3">
                  <a
                    href={ytSearchUrl(ytOpen)}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-violet-400 hover:text-violet-300 transition-colors"
                  >
                    Open on YouTube ↗
                  </a>
                  <button onClick={() => setYtOpen(null)} className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors">✕ Close</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Hero */}
      <div className="border-b border-white/[0.04] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[400px] rounded-full"
            style={{ background: 'radial-gradient(ellipse, rgba(139,92,246,0.07) 0%, transparent 70%)' }} />
        </div>
        <div className="relative mx-auto max-w-4xl px-6 pt-20 pb-12">
          <div className="mb-4 flex items-center gap-2">
            <span className="h-px w-5 bg-zinc-700" />
            <span className="font-mono text-[10px] tracking-[0.2em] text-zinc-500 uppercase">Exam Tricks · {DATA.reduce((a, c) => a + c.tricks.length, 0)} methods</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight md:text-5xl mb-4">
            Cheating<br />
            <span className="text-zinc-500">Encyclopedia</span>
          </h1>
          <p className="text-zinc-400 max-w-md leading-relaxed mb-8">
            Every method catalogued by category — with YouTube video guides for each. Click any method to expand, or watch the videos.
          </p>

          {/* Search */}
          <div className="flex items-center gap-3 max-w-md rounded-xl border border-white/[0.08] bg-zinc-900/60 px-4 py-2.5"
            style={{ backdropFilter: 'blur(8px)' }}>
            <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" className="text-zinc-600 flex-shrink-0">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
            </svg>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search tricks…"
              className="flex-1 bg-transparent text-sm text-zinc-300 placeholder:text-zinc-600 focus:outline-none"
            />
            {search && (
              <button onClick={() => setSearch('')} className="text-zinc-600 hover:text-zinc-400 transition-colors text-xs">✕</button>
            )}
          </div>
        </div>
      </div>

      {/* Categories */}
      <div className="mx-auto max-w-4xl px-6 py-10 space-y-4">
        {filtered.map(cat => (
          <div key={cat.id}>
            {/* Category header */}
            <button
              onClick={() => setOpen(open === cat.id ? null : cat.id)}
              className="w-full text-left flex items-center gap-4 px-5 py-4 rounded-2xl border border-white/[0.06] bg-zinc-950/60 hover:border-white/[0.12] transition-all group"
              style={{ backdropFilter: 'blur(8px)' }}
            >
              <span className="text-xl leading-none">{cat.icon}</span>
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`w-1.5 h-1.5 rounded-full ${cat.dot}`} />
                  <h2 className="font-semibold text-zinc-200 group-hover:text-zinc-100 transition-colors">{cat.category}</h2>
                </div>
                <p className="text-xs text-zinc-600">{cat.tricks.length} methods</p>
              </div>

              {/* YouTube button */}
              <button
                onClick={e => { e.stopPropagation(); setYtOpen(cat.ytQuery) }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600/10 border border-red-500/20 text-red-400 hover:bg-red-600/20 transition-all text-xs font-medium"
              >
                <svg width="10" height="10" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M5.5 3.5L12.5 8 5.5 12.5V3.5z"/>
                </svg>
                Videos
              </button>

              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
                className={`text-zinc-600 transition-transform duration-200 ${open === cat.id ? 'rotate-180' : ''}`}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7"/>
              </svg>
            </button>

            {/* Tricks list */}
            <AnimatePresence>
              {open === cat.id && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <div className="mt-1 rounded-2xl border border-white/[0.05] bg-zinc-900/40 overflow-hidden">
                    {/* Pinned video row */}
                    <div className="border-b border-white/[0.04] px-5 py-3 flex items-center gap-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded bg-red-600/90 flex items-center justify-center">
                          <svg width="8" height="10" fill="white" viewBox="0 0 10 12"><path d="M1 1l8 5-8 5V1z"/></svg>
                        </div>
                        <span className="text-xs text-zinc-400">YouTube guides for &quot;{cat.ytQuery}&quot;</span>
                      </div>
                      <button
                        onClick={() => setYtOpen(cat.ytQuery)}
                        className="ml-auto text-xs text-red-400 hover:text-red-300 transition-colors"
                      >
                        Watch →
                      </button>
                    </div>

                    {/* Tricks */}
                    <div className="divide-y divide-white/[0.03]">
                      {cat.tricks.map((trick, i) => (
                        <motion.div
                          key={i}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.03, duration: 0.2 }}
                          className="flex items-start gap-4 px-5 py-4 hover:bg-white/[0.02] transition-colors"
                        >
                          <span className="flex-shrink-0 w-5 h-5 rounded bg-zinc-800 flex items-center justify-center font-mono text-[9px] text-zinc-600 mt-px">
                            {i + 1}
                          </span>
                          <div>
                            <p className="text-sm font-medium text-zinc-300 mb-0.5">{trick.title}</p>
                            <p className="text-xs text-zinc-500 leading-relaxed">{trick.desc}</p>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="text-center py-20 text-zinc-700">
            <p className="text-sm">No tricks match &quot;{search}&quot;</p>
          </div>
        )}
      </div>
    </div>
  )
}
