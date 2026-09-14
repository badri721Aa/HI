'use client'

import { useState, useMemo } from 'react'

type Trick = { title: string; desc: string }
type Category = { category: string; emoji: string; tricks: Trick[] }

const data: Category[] = [
  {
    category: 'Classic Crib Sheets',
    emoji: '📝',
    tricks: [
      { title: 'Micro-font notecard', desc: 'Print formulas at 4pt font on a white index card. Looks blank from 3 feet.' },
      { title: 'Eraser bottom', desc: 'Write on the flat underside of a block eraser with a fine mechanical pencil.' },
      { title: 'Ruler edge notes', desc: 'Write formulas along the 1mm-wide edge of a transparent ruler.' },
      { title: 'Correction tape strip', desc: 'Apply white correction tape over old notes, write new notes on top — appears as tape residue.' },
      { title: 'Water-based ink', desc: 'Write on your palm with water-based ink — invisible until you lick your hand slightly.' },
      { title: 'Transparent tape cheat strip', desc: 'Write on tape in pencil, stick inside pencil case lid. Remove before handing in.' },
      { title: 'Folded-paper insert', desc: 'Fold a tiny sheet of paper into a square small enough to hide under exam paper.' },
      { title: 'Graph paper camouflage', desc: 'Write formulas in pencil on graph paper — the grid lines disguise the text.' },
      { title: 'Pencil barrel wrap', desc: 'Cut a thin strip of paper, write notes in tiny print, wrap tightly around pencil barrel.' },
      { title: 'Tissue note', desc: 'Write on a paper tissue with a fine-tip pen. Crumple it — looks like normal pocket tissue.' },
      { title: 'Sticky label underside', desc: 'Write on the adhesive side of a sticker — peel back briefly to read.' },
      { title: 'Calculator case interior', desc: 'Tape a note strip inside the flip case of a calculator — check before rules were enforced.' },
      { title: 'Bottle label overlay', desc: 'Print fake labels for water bottles with formulas replacing ingredient text.' },
      { title: 'Shoelace encoding', desc: 'Tie knots in different positions on a lace — each pattern encodes a number or letter.' },
      { title: 'Fingernail writing', desc: 'Write tiny formulas on nails with a thin pen before clear coat — invisible once dry.' },
      { title: 'Wrist inner side', desc: 'Write on the inside of your wrist — covered by sleeve until needed.' },
      { title: 'Inside shirt collar', desc: 'Write key terms inside your collar with laundry pen. Read by touching shirt neck.' },
      { title: 'Watch strap interior', desc: 'Tape a micro-strip to the inside band of your watch.' },
      { title: 'Belt buckle back', desc: 'Tape a folded note behind a large belt buckle.' },
      { title: 'Sock ankle strip', desc: 'Tape a folded strip of paper to your ankle — inaccessible during patdown.' },
      { title: 'Sandal sole insert', desc: 'Slip a thin paper strip into the flat space between sole layers.' },
      { title: 'Pen cap notes', desc: 'Write inside a hollow pen cap, squint to read by angling it toward light.' },
      { title: 'Multi-layer eraser', desc: 'Slice a large eraser in half, write notes between layers, press together.' },
      { title: 'Staple hole encoding', desc: 'Encode binary data using hole punches — map patterns to letters.' },
      { title: 'Highlighter cap', desc: 'Write on the inside rim of a highlighter cap in pencil.' },
      { title: 'Paper fold blind spot', desc: 'Fold exam booklet so the fold hides a small note tucked underneath the cover.' },
      { title: 'Lip liner writing', desc: 'Write on the underside of a lip liner cap with a thin sharpie.' },
      { title: 'Credit card back', desc: 'Write in pencil in the signature strip area. Looks like normal wear marks.' },
      { title: 'Mint tin lid interior', desc: 'Tape a thin note strip to the inside of a mint tin lid.' },
      { title: 'Coin stacking code', desc: 'Stack coins in left-hand — each coin count position encodes an answer number.' },
    ],
  },
  {
    category: 'Tech & Digital Methods',
    emoji: '📱',
    tricks: [
      { title: 'Smart watch text', desc: 'Pre-load key formulas into a note app on a smartwatch. Quick glance reads them.' },
      { title: 'Phone in pocket glance', desc: 'Set phone to max brightness, white text on black — bathroom break to check.' },
      { title: 'Earbud concealment', desc: 'Wear a flesh-toned earbud in the ear facing away from invigilators. Pair to phone.' },
      { title: 'Bone conduction audio', desc: 'Bone conduction earphones sit outside the ear canal — nearly invisible from across a room.' },
      { title: 'Bluetooth glasses', desc: 'Commercial smart glasses with tiny embedded speaker in frame arm.' },
      { title: 'Screen mirroring', desc: 'Mirror phone to smartwatch — watch shows exactly what the phone screen shows.' },
      { title: 'Text-to-speech notes', desc: 'Record voice memo reading key formulas slowly. Play on hidden earpiece.' },
      { title: 'Camera pen', desc: 'Spy camera shaped as a pen — photograph question sheet to send to someone outside.' },
      { title: 'Photo in screenshot folder', desc: 'Screenshot textbook pages onto phone. Swipe up in bathroom break.' },
      { title: 'Invisible ink UV app', desc: 'Write notes with UV-reactive ink, use phone UV light app to reveal.' },
      { title: 'QR code tattoo temporary', desc: 'Print QR code sticker on wrist, scan with phone for full formula sheet.' },
      { title: 'Morse code tapping app', desc: 'Accomplice outside sends Morse via vibration — tap patterns decode letters.' },
      { title: 'Vibration pattern signaling', desc: 'Pre-agree: 1 buzz = A, 2 = B etc. Accomplice outside texts coded answer numbers.' },
      { title: 'Encrypted note in calculator', desc: 'Store notes as variable values in a programmable calculator.' },
      { title: 'Program shortcuts in calc', desc: 'Program TI-84 with formulas stored as programs — opens as data table, looks routine.' },
      { title: 'Fake dictionary app', desc: 'App that looks like a dictionary but contains your notes when a specific word is searched.' },
      { title: 'Screensaver formula', desc: 'Set phone screensaver to a formula image. Peek at locked screen — no unlock needed.' },
      { title: 'Steganography image', desc: 'Hide text inside a normal-looking photo. View with steg decoder app.' },
      { title: 'Cloud sync notes', desc: 'Write notes in Google Keep. Access on any device with internet in a permitted break.' },
      { title: 'SMS pre-programmed', desc: 'Draft texts with full answer set. Open drafts folder in bathroom.' },
      { title: 'Accelerometer tap code', desc: 'Tap desk in rhythm, accomplice reads taps via vibration sensor app on shared table.' },
      { title: 'Laser pointer grid', desc: 'Accomplice outside points laser at answer grid on wall — you read reflected dot position.' },
      { title: 'Photo OCR pipeline', desc: 'Photograph question, send to outside contact, they OCR + solve + send answer back.' },
      { title: 'Voice-activated watch', desc: 'Subvocalize question, watch mic picks up, paired phone reads notes back via earpiece.' },
      { title: 'Smart ring tap', desc: 'Smart ring taps wrist in vibration codes for multi-choice options.' },
      { title: 'Haptic alphabet shirt', desc: 'Haptic patch vest with Braille-encoded vibrations for each letter — feeling-based reading.' },
      { title: 'Hidden display glasses', desc: 'AR glasses with transparent display — notes appear overlaid on the desk.' },
      { title: 'Phone under leg', desc: 'Phone flat on seat between legs, text notes on screen visible on downward glance.' },
      { title: 'Invisible screen filter', desc: 'Privacy screen filter on phone — screen appears black from any angle except directly ahead.' },
      { title: 'Pre-committed answers', desc: 'For known exam formats, pre-compute likely answers and audio-record them in sequence.' },
    ],
  },
  {
    category: 'Collaboration & Signaling',
    emoji: '🤝',
    tricks: [
      { title: 'Pencil position code', desc: 'A=pencil flat, B=pencil vertical, C=eraser up — partner reads from adjacent seat.' },
      { title: 'Cough code', desc: 'Pre-agree: 1 cough=A, 2 coughs=B. Pause + 3 signals answer number.' },
      { title: 'Knuckle tapping', desc: 'Tap desk with knuckles: position on table surface encodes option A/B/C/D.' },
      { title: 'Foot shuffle under desk', desc: 'Left foot forward = A, right foot = B, both = C, neither = D.' },
      { title: 'Hair touch code', desc: 'Touch different parts of hair: temple=A, top=B, ear=C, none=D.' },
      { title: 'Pen spin signal', desc: 'Clockwise spin = A, counter = B, vertical balance = C, drop = D.' },
      { title: 'Shirt collar pull', desc: 'Partners in adjacent rows: collar touch = answer 1, no touch = answer 2.' },
      { title: 'Book corner angle', desc: 'Angle exam booklet: parallel = A, slight left = B, slight right = C, perpendicular = D.' },
      { title: 'Glasses removal timing', desc: 'Remove glasses at specific minute = confirmed answer for that question number.' },
      { title: 'Water bottle position', desc: 'Bottle label facing front = A, left = B, right = C, away = D.' },
      { title: 'Stretch arm code', desc: 'Left arm stretch = signal for answer A, right = B, both = C.' },
      { title: 'Pre-agreed seating', desc: 'Arrange seating so strong student sits where answer sheet is most visible.' },
      { title: 'Bathroom excuse relay', desc: 'Leave exam, text answers to outside contact, they compile and send back.' },
      { title: 'Window reflection', desc: 'Angle paper so answer sheet reflects in window glass for partner behind.' },
      { title: 'Mirror watch face', desc: 'Partner shows answer on palm to watch face mirror reflection visible to you.' },
      { title: 'Lip reading system', desc: 'Pre-drill mouthing A/B/C/D silently — partner reads lips across row.' },
      { title: 'Desk scratch code', desc: 'Scratch desk surface edge lightly: number of scratches = answer option.' },
      { title: 'Eraser drop signal', desc: 'Drop eraser at specific time = question X answer is D. Pre-agreed mapping.' },
      { title: 'Page flip timing', desc: 'Flip exam page at coordinated time: simultaneously = signal confirmed.' },
      { title: 'Eye blink morse', desc: 'Partner counts blinks: deliberate slow blinks encode letters in Morse.' },
      { title: 'Chair creak', desc: 'Lean back on chair to creak: number of creaks = answer number in sequence.' },
      { title: 'Finger position counting', desc: 'Hold pencil in fist — number of visible fingers = answer option.' },
      { title: 'Collar button open/close', desc: 'Shirt button state changes encode binary sequence for multi-choice answers.' },
      { title: 'Leg cross direction', desc: 'Left leg over right = A, right over left = B, uncrossed = C, ankles = D.' },
      { title: 'Breath timing signal', desc: 'Deliberate audible exhale at Q-number = flag that answer is opposite of obvious.' },
      { title: 'Paper orientation', desc: 'Rotate scratch paper: upright = correct, 90° = second option, 180° = third.' },
      { title: 'Eraser brand signal', desc: 'Place pink eraser visible = answer A, put face down = B, remove = C.' },
      { title: 'Ruler placement', desc: 'Ruler below paper = A, above = B, left = C, right = D.' },
      { title: 'Phone on vibrate mass text', desc: 'Group chat: strongest student finishes early, texts answers in batch from bathroom.' },
      { title: 'Timed answer photo', desc: 'Pre-agreed: at minute 45, fastest finisher photographs first page, drops in agreed bathroom bin.' },
    ],
  },
  {
    category: 'Memory & Encoding Tricks',
    emoji: '🧠',
    tricks: [
      { title: 'Method of loci', desc: 'Place each fact at a location in your imagined house. Walk the house mentally during exam.' },
      { title: 'Acronym compression', desc: 'First letter of each term = new word. PEMDAS, ROYGBIV — make your own for any list.' },
      { title: 'Rhyme scheme', desc: 'Set formulas to a rhythm or rhyme. "I before E except after C" is the template.' },
      { title: 'Story encoding', desc: 'Link disparate facts into a single absurd narrative. Vivid scenes stick.' },
      { title: 'Major system numbers', desc: 'Map digits to consonant sounds. 0=S, 1=T, 2=N etc. Convert numbers to words.' },
      { title: 'Peg system', desc: 'One=bun, two=shoe, three=tree. Hang each fact on its peg via vivid image.' },
      { title: 'Chunking', desc: 'Break long strings into 3-4 item chunks. Phone numbers are the template. Apply to any sequence.' },
      { title: 'Color association', desc: 'Assign a color to each category. Mentally sort all facts by color when recalling.' },
      { title: 'Spatial encoding', desc: 'Imagine each fact written at a specific height in the room. Higher = higher in number sequence.' },
      { title: 'Emotional tagging', desc: 'Force an emotional reaction to each fact when memorizing. Disgust, humor, shock — any strong emotion embeds it deeper.' },
      { title: 'Body encoding', desc: 'Assign body parts as memory pegs: head=fact 1, shoulders=fact 2, knees=fact 3.' },
      { title: 'Alphabet peg', desc: 'A=ace, B=bee, C=sea... Associate fact with that image for each letter-keyed list.' },
      { title: 'Backwards recall', desc: 'Practice reciting from the end of a list. Reversal breaks dependency on sequential order.' },
      { title: 'Interleaved study', desc: 'Mix subjects during study: biology, then math, then history. Forces harder retrieval = deeper trace.' },
      { title: 'Self-testing beats re-reading', desc: 'Close the book after 5 minutes and write everything you remember. Retrieval practice encodes 2x deeper.' },
      { title: 'Spaced repetition', desc: 'Review at 1 day, 3 days, 1 week, 2 weeks intervals. Forgetting curve exploited.' },
      { title: 'Sleep consolidation', desc: 'Study hardest material 30 minutes before sleep. Hippocampal replay during sleep cements it.' },
      { title: 'Teaching-back method', desc: 'Explain a concept aloud to an imaginary student. Gaps in explanation reveal gaps in memory.' },
      { title: 'Multisensory input', desc: 'Read, write, say aloud, and draw a diagram of the same fact. 4 encoding channels = stronger trace.' },
      { title: 'Catchy first-word list', desc: 'Sequence facts by first word: Angry, Bears, Can, Damage, Every — sentence is the list.' },
      { title: 'Number-shape peg', desc: '1=pole, 2=swan, 3=handcuffs, 4=flag, 5=hook... visualize facts as modifications of the shape.' },
      { title: 'Dramatic exaggeration', desc: 'Make the image absurdly large, violent, or funny. Mundane images disappear; extreme ones persist.' },
      { title: 'Motion + image', desc: "Add motion to memory images: the atom doesn't sit still, it spins and collides." },
      { title: 'Sound effect tagging', desc: 'Hear a specific sound when you think of each concept. Ring = correct, buzz = wrong.' },
      { title: 'Synesthetic encoding', desc: 'Assign tastes, textures, temperatures to abstract terms. Krebs cycle = metallic, cold.' },
      { title: 'Chunked formula cards', desc: 'One formula per index card. Sort into correct/uncertain/unknown pile daily.' },
      { title: 'Dual-language labeling', desc: 'Label memory items in two languages. Forces two separate retrieval paths to same fact.' },
      { title: 'Re-encoding degraded memory', desc: 'When a fact blurs, reconstruct it entirely from first principles rather than trying to recover the trace.' },
      { title: 'Numerical pattern recognition', desc: 'Many constants have geometric ratios. Pi ≈ 22/7. e ≈ 2.718. Notice the pattern, not the digit string.' },
      { title: 'Constraint elimination', desc: 'Memorize what a fact is NOT. Fewer wrong options + one right one = faster recall under pressure.' },
    ],
  },
  {
    category: 'Multiple Choice Tactics',
    emoji: '🎯',
    tricks: [
      { title: 'Process of elimination', desc: 'Remove the two most obviously wrong options first. Reduces a 4-choice to a 50/50.' },
      { title: 'Longest answer rule', desc: 'Test writers pad correct answers with qualifications. The longest, most specific answer is often right.' },
      { title: 'Absolute word flag', desc: '"Always," "never," "all," "none" — these are almost always wrong. Correct answers hedge.' },
      { title: 'Hedge word flag', desc: '"Usually," "often," "may," "can" — these signal correct answers. Reality is nuanced.' },
      { title: 'All-of-the-above detection', desc: 'If two options are clearly true, "all of the above" is almost certainly the answer.' },
      { title: 'None-of-the-above default', desc: 'Use when two options seem completely wrong but the others seem only partially right.' },
      { title: 'Grammatical consistency', desc: 'The correct answer completes the stem sentence grammatically. Mismatches signal wrong answers.' },
      { title: 'Identical answer pair', desc: 'Two answers that say the same thing cannot both be correct — eliminate both or flag the third.' },
      { title: 'Middle value selection', desc: 'For numerical answers, the median of all provided values is correct more often than chance.' },
      { title: 'Content clue scanning', desc: 'Read all questions before starting — later questions often contain vocabulary that answers earlier ones.' },
      { title: 'First instinct is usually right', desc: 'Research shows changed answers are wrong 2x more often than unchanged ones. Override only with solid reason.' },
      { title: 'K-patterning', desc: 'True/True/False/False distributions appear in carefully written test keys. Spot a run and guess the break.' },
      { title: 'Distractor analysis', desc: 'Wrong answers are designed to catch common mistakes. Think about what common mistake leads to each wrong option.' },
      { title: 'Test maker psychology', desc: 'Trick questions cluster at 60-75% mark. If an answer seems too obvious at that point, doubt it.' },
      { title: 'Specific detail = true', desc: 'False answers tend to be vague; true answers often have specific numbers, names, or dates.' },
      { title: 'Reverse engineering from answer', desc: 'Plug each answer choice back into the question stem. One fits cleanly.' },
      { title: 'Definition stem match', desc: 'Match vocabulary in the stem to vocabulary in one specific answer — definition questions are self-referential.' },
      { title: 'Out-of-scope elimination', desc: 'Any answer referencing a topic outside this chapter/unit is almost certainly wrong.' },
      { title: 'Number rounding tells', desc: 'Computed answers that are clean round numbers are usually planted distractors. Real answers are messy.' },
      { title: 'Two-pass method', desc: 'Answer every question you know instantly. Flag unknowns. Return to flagged ones with remaining time.' },
      { title: 'Skip and return', desc: 'Time-pressure distorts judgment. Move on, answer other questions, then return — context from later questions often unlocks earlier ones.' },
      { title: 'Eliminate by source', desc: 'Identify which textbook chapter each distractor belongs to. Wrong-chapter answers are eliminated instantly.' },
      { title: 'Partial knowledge scoring', desc: 'Even with 50% knowledge, correct elimination gets you to 67-75% correct. Partial knowledge is not zero score.' },
      { title: 'Negative framing inversion', desc: '"Which is NOT" — reframe as "which three ARE" and mark the three, then flip.' },
      { title: 'Qualifier count', desc: 'Count qualifiers in each answer (a, often, may, some). More qualifiers = more likely correct in most subject areas.' },
      { title: 'Recency bias awareness', desc: 'Do not pick the answer you read most recently just because it is fresh. Systematic elimination beats familiarity.' },
      { title: 'Stem keyword underline', desc: 'Physically underline the key term in the stem. Forces attention to the actual question, not the assumed question.' },
      { title: 'Unit check on math MCQ', desc: 'The answer with matching units to the question is correct. Wrong units = wrong answer instantly.' },
      { title: 'Magnitude sanity check', desc: 'Is this answer physically plausible? Velocity of light as 50 km/h fails instantly.' },
      { title: 'Trick question late-question clustering', desc: 'In teacher-written tests, trick questions cluster near question 8-12 of a 15-question set. Slow down there.' },
    ],
  },
  {
    category: 'Essay & Long Answer Strategy',
    emoji: '✍️',
    tricks: [
      { title: 'PEEL paragraph structure', desc: 'Point, Evidence, Explain, Link. Every paragraph hits all four. Markers tick boxes mechanically.' },
      { title: 'Keyword saturation', desc: 'Use the exact terminology from the marking rubric. Marker has a list — match it verbatim.' },
      { title: 'Restate the question', desc: 'First sentence of every answer restates the question as a statement. Signals you actually answered it.' },
      { title: 'Pre-write skeleton', desc: 'Spend 3 minutes writing bullet outline before prose. Prose flows from structure, not from searching mid-sentence.' },
      { title: 'Strong first sentence', desc: 'Make a direct, assertive claim in sentence one. Markers form impressions fast.' },
      { title: 'Counter-argument inclusion', desc: 'Include and then rebut one opposing view. Shows analytical depth — grade differentiator.' },
      { title: 'Quantify everything possible', desc: '"Many studies" → "over 30 studies since 2010." Numbers signal research depth even if estimated.' },
      { title: 'Named examples', desc: 'Generic claims score less. Name a specific person, case, date, or location. Specificity reads as knowledge.' },
      { title: 'Conclusion echoes intro', desc: 'Final paragraph uses same keyword structure as intro, but in past tense. Signals completed argument arc.' },
      { title: 'Write to the maximum', desc: 'All else equal, longer answers score higher. Fill every line. Markers rarely penalize length.' },
      { title: 'Hedge on weak points', desc: '"Evidence suggests" not "this proves." Hedged claims are harder to mark wrong.' },
      { title: 'Signposting language', desc: '"Firstly... Furthermore... However... In conclusion..." — navigational markers make structure visible.' },
      { title: 'Cause-effect framing', desc: 'Frame every claim as cause → effect. "X occurred because Y, leading to Z." Causal chains read as analysis.' },
      { title: 'Active voice throughout', desc: 'Passive voice signals uncertainty. "The government implemented" not "policy was implemented by."' },
      { title: 'Argument ladder', desc: 'Each paragraph adds one rung of complexity: definition → example → application → implication → critique.' },
      { title: 'Synonym rotation', desc: 'Rotate three synonyms for your main argument keyword. Reads as vocabulary breadth.' },
      { title: 'Blank filler strategy', desc: "If you don't know the content: define terms, explain methodology, give historical context, discuss implications. Earn partial credit on structure alone." },
      { title: 'Question decomposition', desc: 'Multi-part questions: underline every sub-question. Dedicated paragraph per sub-part. Miss none.' },
      { title: 'Mark scheme reverse engineering', desc: 'Write the mark scheme yourself before writing the answer. List what a top-band response must include, then write that.' },
      { title: 'Short sentence rhythm', desc: 'Alternate long analytical sentences with short, punchy declarative ones. Rhythm signals confident writing.' },
      { title: 'Self-citation trick', desc: '"As discussed in the introduction..." creates false impression of sustained argument even in a rushed answer.' },
      { title: 'Analogical reasoning', desc: 'Compare unknown phenomenon to a known one. Markers credit novel thinking. "This mirrors the structure of..."' },
      { title: 'Systemic perspective', desc: 'Address individual, group, societal, and global levels. Breadth signals sophisticated thinking.' },
      { title: 'Temporal framing', desc: 'Past → present → future structure. Shows awareness of change over time — always appreciated in humanities.' },
      { title: 'Open with an anecdote', desc: 'One sentence specific real-world opening. Humanizes abstract analysis and grabs marker attention.' },
      { title: 'Theory application', desc: 'Name a theoretical framework and apply it explicitly. Even basic application of a named theory scores analysis marks.' },
      { title: 'Uncertainty as sophistication', desc: '"While X is widely accepted, recent scholarship questions..." — acknowledging debate signals academic literacy.' },
      { title: 'Implicit assumptions surface', desc: 'State what assumptions underlie your argument. Shows metacognitive awareness.' },
      { title: 'Concession + rebuttal', desc: 'Every concession must be followed by a rebuttal. Concede-only reads as uncertainty; concede-rebut reads as nuance.' },
      { title: 'Last 5 minutes: conclusion only', desc: 'If running out of time, jump to conclusion. No conclusion = automatic grade cap on most mark schemes.' },
    ],
  },
  {
    category: 'Exam Room Positioning',
    emoji: '🪑',
    tricks: [
      { title: 'Back-row seating', desc: 'Invigilators walk a predictable circuit. Back row has the longest time between passes.' },
      { title: 'Aisle seat selection', desc: 'Aisle seats have invigilator walking past only one side. Notes on the far side are shielded.' },
      { title: 'Corner desk preference', desc: 'Corner seats have two wall sides and only one invigilator approach vector.' },
      { title: 'Near-window seat', desc: 'Bright window light makes it harder to see your desk clearly from across the room.' },
      { title: 'Tall person behind you', desc: 'A tall exam-taker directly behind you partially blocks the invigilator sightline to your desk.' },
      { title: 'Face tracking awareness', desc: 'Know where the invigilator is at all times using peripheral vision. Freeze all activity when direction changes.' },
      { title: 'Circuit pattern learning', desc: 'Invigilators follow fixed routes. Time the circuit on your first pass and predict the next.' },
      { title: 'Exam paper as shield', desc: 'Hold exam paper slightly raised while reading — it naturally shields your lap from invigilator view.' },
      { title: 'Head position discipline', desc: 'Keep head still and eyes only in the scanning zone. Head movement toward other papers triggers attention.' },
      { title: 'Acoustic awareness', desc: 'Know which chair legs scrape. Know which desk creaks. Avoid those movements.' },
      { title: 'Bathroom timing', desc: 'Request bathroom at minute 25-35 of a 3-hour exam — low invigilator attention, pre-complacency window.' },
      { title: 'Entry moment analysis', desc: 'When papers are distributed, use the noise/movement to discretely check any pre-positioned notes.' },
      { title: 'End-of-exam rush cover', desc: 'At the collection signal, use paper-stacking movement to conceal any removal of notes.' },
      { title: 'Confident composure', desc: 'Anxious behavior draws attention. Relaxed, steady writing speed never triggers surveillance.' },
      { title: 'Deliberate timing camouflage', desc: 'Always appear to be writing when invigilator approaches. Have a sentence in progress to continue visibly.' },
      { title: 'Pair covering', desc: 'Two students sit adjacent. One signals warning when invigilator turns; other accesses notes.' },
      { title: 'Object field awareness', desc: 'Know the exact position of everything on your desk before the exam. Any shifted object is a tell.' },
      { title: 'Paper rustle camouflage', desc: 'Open any note or wrapper during loud ambient noise — chair scrapes, paper shuffling, coughs.' },
      { title: 'Distraction creation', desc: 'Drop a pen on the far side of the desk — invigilator focuses on the sound, not your hands.' },
      { title: 'False start technique', desc: 'Open exam booklet, write your name conspicuously, appear engaged — invigilator marks you as active and moves on.' },
      { title: 'Writing speed consistency', desc: 'Constant, moderate writing speed reads as focused. Bursts and pauses suggest distraction or note-checking.' },
      { title: 'Note concealment timing', desc: 'Access notes only within 2 seconds. Longer access duration exponentially increases detection probability.' },
      { title: 'Preemptive compliance display', desc: 'Before exam starts, visibly clear your desk of everything extra. Establishes you as compliant in the invigilator\'s mental model.' },
      { title: 'Decoy object placement', desc: 'Place an allowed, clearly visible complex object on desk. Invigilator attention anchors to the visible — they stop scanning for hidden.' },
      { title: 'Name-remembering play', desc: 'Learn one invigilator\'s name and use it once. People monitor known-to-them people less carefully.' },
      { title: 'Question-asking tactic', desc: 'Ask a legitimate clarifying question early. Invigilator now thinks you are engaged and unlikely to cheat.' },
      { title: 'Friendly nod protocol', desc: 'Brief eye contact and slight nod when invigilator passes. Establishes benign presence, reduces suspicion.' },
      { title: 'Arrive-early advantage', desc: 'Arrive first, choose optimal seat, settle notes before others enter and invigilators have positioned themselves.' },
      { title: 'Weather small talk pre-exam', desc: 'One casual comment to invigilator before it starts. Familiarity = lower suspicion allocation.' },
      { title: 'Visible effort signaling', desc: 'Fill scratch paper with working, diagrams, crossed-out attempts. Appears as diligent effort regardless of actual process.' },
    ],
  },
  {
    category: 'Psychological & Performance',
    emoji: '🧘',
    tricks: [
      { title: 'Power pose pre-exam', desc: 'Stand in expansive posture for 2 minutes before entering. Reduces cortisol, increases testosterone.' },
      { title: 'Box breathing', desc: 'Inhale 4s, hold 4s, exhale 4s, hold 4s. Activates parasympathetic nervous system. Reduce exam panic in 90 seconds.' },
      { title: 'Name the anxiety', desc: 'Write "I am anxious" on scratch paper. Labeling emotion activates prefrontal cortex, reduces amygdala hijack.' },
      { title: 'Dump-page method', desc: 'First 2 minutes: write every formula and fact you\'re worried about forgetting on scratch paper. Clears working memory.' },
      { title: 'Time budget pre-planning', desc: 'Divide total marks by total minutes. Spend that many minutes per mark. Never linger.' },
      { title: 'Skip the paralysis', desc: 'Stuck on question? Mark it, move on. The answer often surfaces while doing easier questions.' },
      { title: 'Caffeine peak timing', desc: 'Caffeine peaks ~45 minutes post-consumption. Take it 45 minutes before exam start, not before.' },
      { title: 'Cold water alertness', desc: 'Cold water on wrists and back of neck activates the dive reflex. Instant alertness spike.' },
      { title: 'Chewing gum encoding', desc: 'Study while chewing spearmint gum. Chew the same gum during exam. State-dependent memory retrieval.' },
      { title: 'Rosemary scent recall', desc: 'Study near rosemary scent (oil diffuser). Wear rosemary oil wrist strip during exam. Olfactory memory is the most direct sensory path to recall.' },
      { title: 'Bilateral tapping', desc: 'Alternate left-right tapping on thighs under desk. EMDR-adjacent. Reduces working memory load from anxiety.' },
      { title: 'Positive self-talk scripting', desc: 'Pre-write three specific reassuring sentences. Recite when panic starts. Vague pep-talk is useless; specific script cuts through.' },
      { title: 'Reframe as challenge', desc: '"This exam is threatening me" → "This exam is challenging me." Semantics change cortisol to adrenaline — beneficial stress instead of detrimental.' },
      { title: 'Perspective reduction', desc: '"In 5 years, will this matter?" Activates long-term prefrontal processing. Shrinks the perceived stakes.' },
      { title: 'Handwriting slow-down', desc: 'When panicking, slow handwriting deliberately. Motor-level slowdown propagates upward to cognitive level.' },
      { title: 'Peripheral vision rest', desc: 'Briefly defocus eyes and stare at middle distance. Resets visual cortex overload from dense text scanning.' },
      { title: 'Sleep as performance', desc: 'Each hour under 7 hours reduces working memory by ~10%. No last-night cramming outweighs sleep loss.' },
      { title: 'Glucose management', desc: 'Eat low-GI meal 90 minutes pre-exam. Glucose crash from high-GI hits at exactly the 60-minute mark.' },
      { title: 'Hydration before, not during', desc: 'Drink 500ml 30 min before exam. During exam, small sips only — full bladder creates distraction.' },
      { title: 'Temperature regulation', desc: 'Bring a layer. Cold exam rooms reduce performance by forcing cognitive resources toward temperature regulation.' },
      { title: 'Internal monologue discipline', desc: 'Replace "I don\'t know this" with "I haven\'t recalled this yet." Keeps retrieval attempt active instead of aborting.' },
      { title: 'Fear of blank page kill', desc: 'First word on page kills blank-page avoidance. Write anything — your name, the date — the act of writing starts the motor.' },
      { title: 'Comparison elimination', desc: 'Never look at how far ahead others are. Other people\'s pace tells you nothing useful and adds cortisol.' },
      { title: 'End-of-exam false urgency', desc: '"10 minutes left" announcement creates adrenaline spike. Pre-plan: at that point, only check for blank answers. No new analysis.' },
      { title: 'Recency priming', desc: 'Read your summary notes in the 15 minutes immediately before exam entry. Recency effect puts those items first in retrieval.' },
      { title: 'Stress inoculation', desc: 'Take all practice tests under real-time pressure with distractions. Exam-day conditions feel familiar.' },
      { title: 'Confidence anchoring', desc: 'Recall a specific past exam you did well on. Hold that memory clearly for 10 seconds before starting. Activates prior success state.' },
      { title: 'Outcome detachment', desc: 'During exam, treat the grade as irrelevant. Paradoxically improves performance by removing evaluation anxiety from the cognitive loop.' },
      { title: 'Chunked time goals', desc: 'Don\'t think "I have 2 hours." Think "I will complete section A in 25 minutes." Smaller goals reduce overwhelm.' },
      { title: 'Post-exam analysis', desc: 'Review every wrong answer from practice. Understand the failure mode, not just the correct answer. Pattern recognition beats memorization.' },
    ],
  },
  {
    category: 'Study Efficiency Hacks',
    emoji: '⚡',
    tricks: [
      { title: 'Pomodoro 25/5', desc: '25 minutes focused study, 5 minute break. Brain clears interference traces during the break.' },
      { title: 'Pomodoro extension', desc: 'After 4 Pomodoros, take a 20-minute break. Extended rest consolidates the previous hour\'s material.' },
      { title: 'Single-subject blocks', desc: 'Never mix subjects within a Pomodoro. Context switching costs ~15 minutes of re-engagement each time.' },
      { title: 'Active recall over re-reading', desc: 'Re-reading produces fluency illusion — you recognize material but can\'t reproduce it. Active recall tests actual retrieval.' },
      { title: 'Cornell note method', desc: 'Main notes on right. Key words on left. Summary at bottom. Review by covering main and answering from key words only.' },
      { title: 'Concept mapping', desc: 'Draw topic relationships as a graph. Nodes = concepts, edges = relationships. Seeing structure beats linear notes.' },
      { title: 'Teach to explain', desc: 'Set a 10-minute timer and explain a topic aloud as if teaching it. Gaps in explanation reveal gaps in knowledge.' },
      { title: 'Error log', desc: 'Maintain a list of every question you got wrong in practice. Review the list daily. Wrong answers are the curriculum.' },
      { title: 'Predicted exam questions', desc: 'Write 10 questions a professor is likely to ask. Answer them. Correct prediction rate is usually 60-70%.' },
      { title: 'Past paper analysis', desc: 'Every past paper for the last 5 years. Map question frequency by topic. Study high-frequency topics first.' },
      { title: 'Marking scheme study', desc: 'Read published marking schemes before writing answers. Know exactly what earns points.' },
      { title: 'Exam time simulation', desc: 'Do full past papers under timed conditions. Without this, time-pressure is a new variable on exam day.' },
      { title: '80/20 topic selection', desc: '20% of topics appear in 80% of marks. Identify those 20% from past papers. Master them before touching the rest.' },
      { title: 'Formula proof not memorization', desc: 'Derive formulas from first principles once. You can re-derive on exam day. Memorized formulas are forgotten; understood ones are rebuilt.' },
      { title: 'Index card one-side rule', desc: 'One fact per card. Concept on front. Explanation on back. Shuffle. Test. Retire correct cards daily.' },
      { title: 'Anki interval scheduling', desc: 'Anki calculates optimal review intervals per card. Use it for vocabulary, formulas, and definitions.' },
      { title: 'Background music science', desc: 'Lyric-free music at ~60 BPM increases concentration. Alpha-wave music, lo-fi, or baroque classical are documented performers.' },
      { title: 'Environmental consistency', desc: 'Study in the same location always. Context-dependent memory retrieval means the room becomes a cue.' },
      { title: 'Distraction audit', desc: 'Track every distraction for one study session. The list will contain 3-5 patterns. Block those specifically.' },
      { title: 'Phone in another room', desc: 'Phone in same room but face-down still costs 10% working memory capacity due to inhibition effort.' },
      { title: 'Morning prime time', desc: 'Prefrontal cortex is sharpest 2-4 hours post-waking. Schedule hardest material in that window.' },
      { title: 'Evening review', desc: '30 minutes review before sleep. Hippocampus replays last-learned material first during REM.' },
      { title: 'Physical exercise before study', desc: '20 minutes aerobic exercise raises BDNF. Studied material within 30 minutes post-exercise has 20% higher retention.' },
      { title: 'Standing desk rotation', desc: 'Alternate seated and standing every 45 minutes. Movement prevents the adenosine accumulation that causes cognitive fog.' },
      { title: 'Goal specificity', desc: '"Study chemistry" is not a goal. "Complete 30 electrochemistry practice questions" is. Specific goals engage task-positive network.' },
      { title: 'Progress visualization', desc: 'Track topics completed on a physical chart. Visual progress activates reward dopamine. Dopamine encodes motivation.' },
      { title: 'Study group structure', desc: 'Unstructured study groups are less effective than solo. Effective group = each person teaches one topic to the group.' },
      { title: 'Pre-study intention statement', desc: 'Write one sentence: "Today I will complete X." Intention implementation increases follow-through by 3x.' },
      { title: 'Reward scheduling', desc: 'Pre-commit a specific reward for completing each session. Anticipated reward activates dopaminergic motivation circuits.' },
      { title: 'Review while commuting', desc: 'Passive commute time is dead time. Audio reviews, flashcard apps, or mental recall convert it to study time.' },
    ],
  },
  {
    category: 'Subject-Specific Shortcuts',
    emoji: '📐',
    tricks: [
      { title: 'Math: estimate before solving', desc: 'Rough estimate first. If your answer differs by an order of magnitude, you made an error in setup, not arithmetic.' },
      { title: 'Math: dimensional analysis', desc: 'Track units through every operation. Wrong units at the end means wrong equation choice — catch before writing.' },
      { title: 'Math: check with extremes', desc: 'Set variables to 0 or infinity. Does the answer behave sensibly at extremes? Yes = likely correct setup.' },
      { title: 'Math: work backwards', desc: 'Plug provided answer choices into the question. Often faster than solving forward, especially for algebra.' },
      { title: 'Math: draw the problem', desc: 'For geometry and word problems, a quick sketch almost always reveals the relationship the equation represents.' },
      { title: 'Physics: conservation laws first', desc: 'Before any equation: does this conserve energy? Momentum? Charge? Conservation usually gives you the shortcut.' },
      { title: 'Physics: order of magnitude', desc: 'If a physics answer is more than 2 orders of magnitude from everyday experience, suspect an error.' },
      { title: 'Chemistry: balance by inspection', desc: 'Balance the most complex molecule first. Leave monoatomic elements and water to last.' },
      { title: 'Chemistry: oxidation state shortcuts', desc: 'Group 1 = +1, Group 2 = +2, Oxygen = -2 (except peroxides), Hydrogen = +1 (except hydrides). Apply in sequence.' },
      { title: 'Chemistry: Le Chatelier heuristic', desc: 'Any stress shifts equilibrium to oppose that stress. Apply mechanically — no calculation needed for direction.' },
      { title: 'Biology: structure-function pairing', desc: 'Every structure question can be answered from function. Don\'t memorize structures — understand their mechanical purpose.' },
      { title: 'Biology: evolution lens', desc: 'Any "why does X exist" biology question: because it increased reproductive fitness. Frame all answers through selection pressure.' },
      { title: 'History: causation hierarchy', desc: 'Events have immediate causes, underlying causes, and structural causes. Always present all three. Single-cause answers score bottom band.' },
      { title: 'History: PERMS framework', desc: 'Political, Economic, Religious, Military, Social. Evaluate any historical event through all five dimensions.' },
      { title: 'History: periodization', desc: 'Divide the period into before/during/after around the key event. Marks are distributed across the arc, not just the event.' },
      { title: 'English: SLAP analysis', desc: 'Structure, Language, Audience, Purpose. Apply to any unseen text. Every close-reading question maps to one of these.' },
      { title: 'English: connotation scoring', desc: 'Replace a key word with its synonym. Notice what the original gains. The difference is the connotation — that\'s what earns analysis marks.' },
      { title: 'English: authorial intent framing', desc: '"The author uses X to create the effect of Y." Subject + technique + effect. Every analysis sentence should hit all three.' },
      { title: 'Economics: ceteris paribus discipline', desc: 'Isolate one variable per paragraph. "All else equal, an increase in X causes Y because Z." Mixed variables = muddled marks.' },
      { title: 'Economics: diagram as shorthand', desc: 'A correctly drawn supply/demand or AD/AS diagram earns marks even with limited prose. Always include labeled axes.' },
      { title: 'Law: IRAC structure', desc: 'Issue, Rule, Application, Conclusion. Every legal answer uses this skeleton. Miss one element = miss those marks.' },
      { title: 'Law: case name recall', desc: 'You don\'t need full citation. Court name + approximate year + outcome = sufficient for most undergraduate law marks.' },
      { title: 'Psychology: APFC framework', desc: 'Aim, Procedure, Findings, Conclusion for evaluating studies. Apply to any experimental psychology question.' },
      { title: 'Psychology: ethical critique', desc: 'Any study can be evaluated on informed consent, right to withdraw, deception, debriefing. Four points available on any study question.' },
      { title: 'Statistics: degrees of freedom intuition', desc: 'n-1 for most parametric tests. Know why: last value is always determined by others, costing one degree of freedom.' },
      { title: 'Statistics: p-value intuition', desc: 'p<0.05 means if H0 is true, results this extreme occur less than 5% of the time. Memorize the verbal definition for marks.' },
      { title: 'Geography: case study depth not breadth', desc: 'One detailed case study with specific statistics beats three vague ones. Depth signals knowledge; breadth can be guessed.' },
      { title: 'Geography: synoptic links', desc: 'Connect your case study to another topic: economic development, climate, urbanization. Cross-topic links score top-band marks.' },
      { title: 'Computer Science: trace tables', desc: 'For algorithm questions, draw a trace table: columns = variables, rows = iterations. Marks awarded per row, not just final output.' },
      { title: 'Computer Science: pseudocode over prose', desc: 'Pseudocode answers are marked against logic, not syntax. Use it to answer algorithm questions faster than prose.' },
    ],
  },
  {
    category: 'Time Management Under Pressure',
    emoji: '⏱️',
    tricks: [
      { title: 'Mark-per-minute allocation', desc: 'Total marks ÷ total minutes = minutes per mark. Spend exactly that time. Set internal sub-timers.' },
      { title: 'Triage first pass', desc: 'Read all questions in 3 minutes. Flag: easy (do first), medium (do second), hard (do last or skip).' },
      { title: 'Guaranteed marks first', desc: 'Answer every question you know with certainty before working on uncertain ones. Bank the certain marks.' },
      { title: 'Partial answer beats blank', desc: 'A partially correct answer scores partial marks. A blank scores zero. Always write something.' },
      { title: 'Formula dump on scratch', desc: 'First 2 minutes: dump all formulas and key terms onto scratch paper. Frees working memory for reasoning.' },
      { title: 'Long question: outline first', desc: 'For essays worth 20%+ of marks: write a 90-second bullet outline. Then write. No outline = no structure = capped marks.' },
      { title: 'Single-pass correction', desc: 'Write once, correct once at the end. Do not re-read and self-edit mid-answer. Interruption costs 3-5 minutes per question.' },
      { title: 'Question number sequencing', desc: 'Number all answers clearly before writing. Invigilators mark in sequence; unnumbered answers get misassigned.' },
      { title: 'Proofreading budget', desc: 'Reserve exactly 10% of time for review. For a 3-hour exam: 18 minutes. No more, no less.' },
      { title: 'Quick wins in review', desc: 'In review time, only: check blank questions, catch calculation errors, add any omitted examples. Don\'t rewrite complete answers.' },
      { title: 'Answer completion over perfection', desc: 'An 80% complete answer across all questions beats a 100% perfect answer to half. Marks distribute across questions.' },
      { title: 'Short essay in bullet form', desc: 'Running out of time? Switch to bullet points for remaining answer. Partial credit is awarded for bullet content in most mark schemes.' },
      { title: 'Clock independence', desc: 'Wear your own watch. Exam-room clocks are often small, positioned poorly, or missing entirely.' },
      { title: 'Micro-break on switch', desc: 'When switching between question sections: 30-second eyes-closed breath. Clears working memory for new context.' },
      { title: 'Write through uncertainty', desc: 'For unknown topics: define all terms in the question, describe the general context, explain what the answer would need to address. Earns method marks.' },
      { title: 'Section weighting awareness', desc: 'Many exams have unequal section weights. Identify the highest-marks section first and protect its time allocation.' },
      { title: 'Question re-reading', desc: 'Before starting each answer, read the question twice. Misread questions cost the entire mark allocation for that question.' },
      { title: 'Subpart tracking', desc: 'Multi-part questions: cross off each (a)(b)(c) as you complete it. Missing a subpart is the most common avoidable error.' },
      { title: 'Momentum preservation', desc: 'If writing is flowing, do not stop to check time. Interrupted flow costs more than a brief time check saves.' },
      { title: 'Difficult question time cap', desc: 'Set a maximum time per hard question — when it hits, move on. Return only if time remains. Never let one question consume another\'s allocation.' },
      { title: 'Legibility over speed', desc: 'Illegible answers get marked as blank. Slow down to maintain minimum legibility — the time cost of illegibility is losing all marks.' },
      { title: 'Calculator input double-check', desc: 'Re-enter each calculation once. Key-entry errors are the #1 source of wrong answers in numerical exams.' },
      { title: 'Diagram time limit', desc: 'Set a 60-second cap on any diagram. A rough, labeled diagram earns the same marks as a perfect one.' },
      { title: 'Answer in order unless strategy says otherwise', desc: 'Random ordering confuses invigilators and risks unchecked skips. Deviate from order only with a flagged return system.' },
      { title: 'First-question anchoring', desc: 'Starting on a question you know builds confidence and flow. First answer sets the cognitive tone for the session.' },
      { title: 'Space reservation', desc: 'Leave half a page blank after each answer in case you need to add content. Adding at the end without space = messy cross-referencing.' },
      { title: 'Timed mock conditions', desc: 'Practice under identical conditions: same room temperature, same equipment, same time of day as the real exam.' },
      { title: 'Mental endpoint visualization', desc: 'Before exam starts: visualize yourself writing the final word, putting down the pen, sitting back. Primes the brain for completion.' },
      { title: 'Silence the editor', desc: 'Your internal editor slows writing by 40%. Draft fast, edit once. Never draft in final-quality mode.' },
      { title: 'Reading time utilization', desc: 'If reading time is given: plan answers, not just read. Jot keywords for each question during reading time.' },
    ],
  },
  {
    category: 'Social Engineering the System',
    emoji: '🎭',
    tricks: [
      { title: 'Office hours relationship', desc: 'Attend office hours even without questions. Professors give higher marks to students they recognize as engaged.' },
      { title: 'Front-row visibility', desc: 'Sitting front-row during lectures correlates with B+ average vs C+ average for same academic ability. Proximity signals investment.' },
      { title: 'Question asking in lecture', desc: 'Ask one question per lecture — make it a good one. Professors remember questioners. Grade appeals go better with recognition.' },
      { title: 'Draft review request', desc: 'Submit a draft essay for feedback before the deadline. Professors who provide feedback are more invested in the final product scoring well.' },
      { title: 'Extension negotiation', desc: 'Request extensions before the deadline, not after. Cite a specific reason. 80% success rate if requested 48 hours ahead.' },
      { title: 'Rubric clarification question', desc: 'Ask one specific rubric question per assignment. Shows you read the rubric. Professors unconsciously grade serious-rubric-readers more charitably.' },
      { title: 'Grade appeal framing', desc: 'Never say "I deserve more marks." Say "I want to understand what I could have included to achieve the higher band." Triggers professor to re-read charitably.' },
      { title: 'Re-grade request framing', desc: '"I believe there may be a misalignment between my answer and the mark scheme on this point." Specific and academic. Not combative.' },
      { title: 'TA relationship', desc: 'TAs often mark most assignments. Build rapport with TAs specifically. Same engagement signals, more impactful target.' },
      { title: 'Extra credit identification', desc: 'Ask specifically "is there an opportunity for extra credit in this course?" Professors who have it will tell you. Most students never ask.' },
      { title: 'Curve awareness', desc: 'Know the class grade distribution. In curved classes, being in the top 20% matters more than absolute score.' },
      { title: 'Exam review session attendance', desc: 'Pre-exam review sessions often telegraph exact exam questions or topics. Treat them as mandatory.' },
      { title: 'Past student exam copies', desc: 'Students in fraternities, study groups, or alumni networks often share prior exam copies. The same questions reappear more than professors realize.' },
      { title: 'Rate My Professor strategic use', desc: 'Read all reviews for exam difficulty, curve policy, attendance policy, and grading harshness. Optimize course selection.' },
      { title: 'Syllabus parsing', desc: 'Parse the syllabus for: how many drops, whether attendance is graded, late penalty rate, extra credit opportunities. Know the rules.' },
      { title: 'Learning center exploit', desc: 'Many universities offer free tutoring via a learning center. The tutors often know the professor and the likely exam emphasis.' },
      { title: 'Group study strategic framing', desc: 'Be the organizer of a study group. Organizers remember material best — the act of coordinating forces review.' },
      { title: 'Peer explanation chain', desc: 'When someone explains to you, immediately explain it back in your own words. Second explanation has higher retention than the first listen.' },
      { title: 'Lab partner optimization', desc: 'Partner with the most capable person in lab. Reports are often shared or collaborative — quality partners elevate your grade.' },
      { title: 'Participation grade banking', desc: 'Front-load participation early in the semester when it stands out more. Professor mental models form in weeks 1-3.' },
      { title: 'Assignment completion before content', desc: 'For low-stakes assignments, submit on time even with incomplete quality. Completion marks score the same as high-quality marks where full marks are automatic.' },
      { title: 'Proofreading swap', desc: 'Exchange essays with a peer for proofreading. The peer catches errors invisible to you; you catch theirs. Both submit better work.' },
      { title: 'Email subject line professionalism', desc: 'Subject: "[Course Code] - [Specific Question] - [Your Name]". Professors with 200 students filter by this. Unprofessional subjects get slow responses.' },
      { title: 'Reply rate optimization', desc: 'Email professors before 9am or between 12-1pm. Response rates are highest in those windows when professors clear inboxes.' },
      { title: 'Format mirroring', desc: 'Write essays in the format the professor uses in their own published work. Recognizable structure reads as sophisticated.' },
      { title: 'Citation style compliance', desc: 'Wrong citation style is the single most-penalized formatting error. Match the syllabus specification exactly.' },
      { title: 'Word count gaming', desc: 'If word count is minimum-only: hit the minimum with quality content and stop. Padding above minimum with weak content lowers impression.' },
      { title: 'Header and subheader use', desc: 'In technical reports, clear headers dramatically improve readability scores. Markers follow the structure as a guide.' },
      { title: 'Appendix for excess material', desc: 'Materials too long for the body go in an appendix. Appendices are rarely marked against word count but signal thoroughness.' },
      { title: 'Feedback loop exploitation', desc: 'Submit assignment 1, get feedback, directly apply to assignment 2. Professors notice growth arcs. Growth signals competence development.' },
    ],
  },
  {
    category: 'Standardized Test Tricks',
    emoji: '📊',
    tricks: [
      { title: 'SAT math: backsolve', desc: 'For algebra problems with answer choices, plug choices into the equation. Start with C (middle value) — if wrong, you know which direction.' },
      { title: 'SAT reading: line reference', desc: 'Always read 5 lines before and after the cited line. Question traps use out-of-context line reference answers.' },
      { title: 'SAT evidence pairing', desc: 'Evidence questions have a clear correct answer that directly supports the previous question. Wrong evidence = both questions wrong.' },
      { title: 'ACT science: graph reading', desc: '60% of ACT science questions require only reading the graph correctly, not understanding the science. Master graph reading first.' },
      { title: 'ACT time pace', desc: 'ACT English: 36 seconds per question. Math: 60 seconds. Reading: 90 seconds. Science: 52 seconds. Pace strictly.' },
      { title: 'GRE verbal: vocabulary elimination', desc: 'GRE verbal tests vocabulary depth. Learn roots not words: -ology, -ism, -cide, pre-, post-, hyper-, hypo-. Decode unknowns from roots.' },
      { title: 'GRE quant: estimation', desc: 'GRE quant answer choices are spread far apart. Rough estimation is sufficient for 70% of questions. Save time.' },
      { title: 'GMAT CR: conclusion isolation', desc: 'Underline the conclusion in every critical reasoning stimulus. The question tests your relationship to that conclusion specifically.' },
      { title: 'GMAT RC: question first', desc: 'Read the questions before the passage. Know what you\'re looking for. Focused reading beats complete reading.' },
      { title: 'LSAT logic games: diagram immediately', desc: 'Spend 90 seconds diagramming each logic game fully before touching questions. Every question answer comes from the diagram.' },
      { title: 'LSAT sufficient vs necessary', desc: '"If A then B" = A sufficient for B, B necessary for A. Contrapositive = not-B then not-A. Confusing these is the #1 error.' },
      { title: 'MCAT passage structure', desc: 'MCAT passage question 1 usually tests main idea; middle questions test specific details; last question tests inference. Allocate attention accordingly.' },
      { title: 'TOEFL integrated: note structure', desc: 'Reading makes 3 points. Lecture contradicts or supports all 3. Notes: Point 1 / Contradict / how. Repeat x3.' },
      { title: 'IELTS writing band 7 formula', desc: 'Task 2: clear position in intro, 2 developed body paragraphs with specific examples, conclusion that echoes intro. No position change.' },
      { title: 'AP exam: FRQ scaffolding', desc: 'AP free-response is marked by sub-part, not holistically. A wrong final answer with correct setup earns most marks.' },
      { title: 'IB extended essay: research question focus', desc: 'The entire EE must answer exactly one research question. Every paragraph either answers it or explains why something is relevant to answering it.' },
      { title: 'GCSE mark scheme language mirroring', desc: 'GCSE mark schemes publish accepted vocabulary. Mirror it exactly. Novel but correct phrasings are sometimes marked incorrect.' },
      { title: 'A-Level: band descriptor reading', desc: 'A-Level mark schemes have band descriptors. Read the A-band descriptor, then write to hit every criterion it lists.' },
      { title: 'Cambridge IGCSE command word', desc: 'State/describe/explain/analyse/evaluate require different depth. Evaluate includes counterargument + weighing. Each has a prescribed depth.' },
      { title: 'Test timing awareness by format', desc: 'Computer adaptive tests (GRE, GMAT): first 10 questions disproportionately determine score. Spend double time on them.' },
      { title: 'Standardized test official prep only', desc: 'Use official practice materials only. Third-party tests have wrong difficulty calibration. Wrong difficulty = wrong preparation.' },
      { title: 'Error pattern analysis', desc: 'Categorize every wrong practice answer: content knowledge, reading error, time pressure, careless arithmetic. Fix the highest-frequency category first.' },
      { title: 'Dual score tracking', desc: 'Track both raw score and time-per-question. Improving speed without accuracy loss is the double variable to optimize.' },
      { title: 'Strategic omission', desc: 'For penalty-for-wrong-answer formats: omit questions where you have less than 60% confidence. Expected value of guessing is negative.' },
      { title: 'No-penalty guessing', desc: 'For no-penalty formats (SAT current format): always guess. Never leave blank. Even random guessing adds expected value.' },
      { title: 'Pacing practice under identical conditions', desc: 'Practice in identical environment: same sound level, same temperature, same table height. Environmental mismatch causes performance regression.' },
      { title: 'Score report mining', desc: 'Official score reports (GRE, SAT) include sub-score breakdowns. Use them to identify the specific weak subsection, not just the total.' },
      { title: 'Endurance training', desc: 'Full-length standardized tests are 3-4 hours. Cognitive performance degrades after 90 minutes without training. Practice at full length repeatedly.' },
      { title: 'Bubble sheet efficiency', desc: 'Batch-bubble: answer 5 questions, then bubble all 5. Individual bubbling after each question wastes ~3 minutes per exam.' },
      { title: 'Experimental section identification', desc: 'GRE, GMAT, SAT include unscored experimental sections. They look identical to scored sections. You cannot reliably identify them — treat all sections equally.' },
    ],
  },
  {
    category: 'Online & Remote Exam Tactics',
    emoji: '💻',
    tricks: [
      { title: 'Second device positioning', desc: 'Phone propped just off camera angle on a stand. Angle calculated so it\'s visible to you but outside camera FOV.' },
      { title: 'Notes on second monitor', desc: 'For webcam exams, the camera typically captures only the primary monitor. Second monitor is outside frame.' },
      { title: 'Printout below desk level', desc: 'Printed notes placed in lap, below webcam field of view. Look up slightly to appear thoughtful, glance down briefly to read.' },
      { title: 'Mirror positioning', desc: 'Small mirror angled to show your phone or note sheet — visible to you, not to camera.' },
      { title: 'Reflection in glasses', desc: 'Glasses wearers can angle a second monitor so its reflection is visible in lenses without camera catching the source.' },
      { title: 'Lighting control', desc: 'Bright window behind you creates a silhouette effect — camera struggles to see your face or desk clearly.' },
      { title: 'Virtual background use', desc: 'A virtual background can include text in a dark pattern that reads at short range but appears as a texture to the camera.' },
      { title: 'Screen recording offline', desc: 'For timed take-home: record your screen throughout. If accused of collusion, the recording proves continuous solo work.' },
      { title: 'Open book discipline', desc: 'For open-book exams: pre-tab every section with color-coded sticky notes. You need to find the information in 30 seconds, not 3 minutes.' },
      { title: 'Search term optimization', desc: 'For open-book online exams: practice Ctrl+F search terms that retrieve your needed content in one query.' },
      { title: 'Local copy of allowed materials', desc: 'Download all permitted reference materials locally. Remote exam connectivity issues may cut off cloud-stored materials.' },
      { title: 'Technical issue documentation', desc: 'Screenshot any technical error that affects your exam. Saved timestamp evidence for grade appeal.' },
      { title: 'Browser history cleanup understanding', desc: 'Know what is and isn\'t logged. Proctoring software logs keystrokes, tab switches, and focus changes — not content on other displays.' },
      { title: 'Proctorio tab switch detection', desc: 'Most proctoring software flags tab switches. Draft and copy-paste answers in the exam tab only. Research beforehand.' },
      { title: 'Eye gaze calibration', desc: 'Gaze detection software flags prolonged off-screen eye movement. Practice keeping gaze near your screen while reading notes.' },
      { title: 'Keyboard shortcut mastery', desc: 'Every second spent using menus instead of shortcuts is exam time lost. Master shortcuts for formatting, navigation, and search.' },
      { title: 'Typing speed as bottleneck', desc: 'Online exams are limited by typing speed. Typing below 60 WPM means essay questions are time-limited differently than handwritten exams.' },
      { title: 'Browser extension notes', desc: 'Some browser extensions persist across tabs. A notes extension that doesn\'t appear in the tab bar may survive proctoring tab monitoring.' },
      { title: 'Incognito mode for research', desc: 'Incognito tab does not share cookies with main session. Research in incognito; exam in normal tab. Cross-contamination of session data minimized.' },
      { title: 'Disconnection script', desc: 'Know the exam policy for disconnection. In most systems: save answers first, then reconnect. Practice the save-and-reconnect sequence.' },
      { title: 'Form auto-fill danger', desc: 'Browser auto-fill can populate wrong fields in online exam forms. Disable auto-fill before exam start.' },
      { title: 'Multiple window preparation', desc: 'For take-home exams: open reference materials, calculator, and exam in different windows. Pre-position before the clock starts.' },
      { title: 'System stability pre-check', desc: 'Restart computer, close all background apps, and run speed test 30 minutes before. Preventable technical failures should never happen.' },
      { title: 'Submission confirmation screenshot', desc: 'Screenshot the submission confirmation page immediately. Proof of submission for any dispute.' },
      { title: 'Earlier submission window', desc: 'Submit at 80% of the allowed time. Submissions in the final 5% of the window carry higher risk of technical failure at submission.' },
      { title: 'Exam platform practice run', desc: 'If a practice exam or sample question is available on the platform: complete it fully to experience the interface before graded exam.' },
      { title: 'Hotspot as backup', desc: 'Have phone hotspot ready before exam starts. If home internet drops, switch immediately without losing exam time to troubleshooting.' },
      { title: 'Wired connection preference', desc: 'Ethernet over WiFi for proctored online exams. WiFi latency spikes cause video drops that trigger proctoring flags.' },
      { title: 'VPN risk assessment', desc: 'Some proctoring systems flag VPN connections as suspicious. Know the policy before connecting to VPN during exam.' },
      { title: 'AI assistance boundaries', desc: 'Know exactly what AI assistance is and isn\'t permitted. Open-ended take-homes increasingly allow AI for research but not for direct answer generation. Know the line.' },
    ],
  },
  {
    category: 'Grade Recovery & Post-Exam',
    emoji: '📈',
    tricks: [
      { title: 'Immediate post-exam reconstruction', desc: 'Within 1 hour of exam: write down every question you can remember. Useful for appeal and for predicting score.' },
      { title: 'Mark scheme comparison', desc: 'When mark schemes release, compare your reconstructed answers point by point. Identify exactly where marks were lost.' },
      { title: 'Script request', desc: 'Most institutions allow you to request your marked exam script. Request it. Look for marking errors.' },
      { title: 'Arithmetic error appeals', desc: 'Marker arithmetic errors (wrong addition of sub-marks) are the most common and easiest to overturn in appeals.' },
      { title: 'Ambiguity appeal', desc: 'If a question was genuinely ambiguous and your interpretation is defensible, appeal on grounds of question ambiguity.' },
      { title: 'Mark scheme misapplication', desc: 'If a marker applied the wrong mark scheme (e.g., penalized a valid alternative method), appeal with the published mark scheme as evidence.' },
      { title: 'Remarking request', desc: 'Most systems allow a paid remarking. Statistically, remarking produces a grade change ~30% of the time. Worth it for high-stakes grades.' },
      { title: 'Appeal framing language', desc: '"I believe the marking may not have fully reflected the mark scheme criteria for [specific point]." Academic, specific, not emotional.' },
      { title: 'Module coordinator escalation', desc: 'If the module tutor rejects your appeal, escalate to the module coordinator with the same documentation, more formally presented.' },
      { title: 'Extenuating circumstances', desc: 'If personal circumstances affected performance: document them immediately after the exam. EC claims made weeks later have lower success rates.' },
      { title: 'Medical evidence timing', desc: 'EC documentation needs to be from the period in question. A doctor\'s letter written 3 weeks after the exam for illness on exam day is weaker than one from the same day.' },
      { title: 'Grade trajectory argument', desc: 'If your grade is anomalously low versus your consistent prior performance: present grade history as context in an EC claim.' },
      { title: 'Aegrotat consideration', desc: 'If illness was severe enough to prevent completion: aegrotat (pass on evidence of prior performance) may be available. Ask registrar.' },
      { title: 'Supplementary exam rights', desc: 'Know whether failing an exam triggers an automatic resit right or requires an application. Many students miss the application window.' },
      { title: 'Resit strategy difference', desc: 'A resit exam with a grade cap requires a different strategy: hit the cap and stop. Maximum effort for a capped grade is wasted effort.' },
      { title: 'Coursework reweighting', desc: 'Some programs allow coursework to reweight against exam grades if you demonstrate competency. Ask if this option exists.' },
      { title: 'Oral examination option', desc: 'Some institutions offer oral exams as a supplement to disputed written exam marks. An oral exam can rescue a borderline case.' },
      { title: 'Late drop policy', desc: 'Know the last day to drop a course without academic penalty. A failing grade is better prevented than cured.' },
      { title: 'Grade replacement policy', desc: 'Some programs allow grade replacement where a retaken course replaces the original grade. Confirm whether your program supports it.' },
      { title: 'Incomplete grade request', desc: '"Incomplete" grades defer the exam to a later date. Available in documented hardship situations. Buys time without formal failure.' },
      { title: 'Faculty advisor consultation', desc: 'Before any formal appeal: speak to your academic advisor informally. They know the system, the politics, and the likely outcome. Get intelligence before filing.' },
      { title: 'Student union support', desc: 'Student unions often have academic advisors who specialize in appeals. Free, confidential, and experienced in your institution\'s specific procedures.' },
      { title: 'Written record of all conversations', desc: 'After any verbal conversation about a grade dispute: send an email summarizing what was discussed. Creates a paper trail.' },
      { title: 'Ombudsperson escalation', desc: 'If internal appeals are exhausted unfairly: most institutions have a student ombudsperson. Escalation to them triggers formal review.' },
      { title: 'Regulatory body complaint', desc: 'External escalation route in severe cases: professional body or accreditation authority. Reserved for documented systemic unfairness.' },
      { title: 'Exam error patterns', desc: 'Identify your error patterns from returned exams: time pressure, careless reading, content gaps, or format unfamiliarity. Target the highest-frequency pattern.' },
      { title: 'Feedback actioning', desc: 'Feedback that isn\'t actioned is noise. For every piece of feedback received, identify exactly one thing you will do differently next time.' },
      { title: 'Predicted grade calculation', desc: 'Maintain a live grade calculator. Know at any point in the semester the minimum score needed on remaining assessments for your target grade.' },
      { title: 'Strategic module selection', desc: 'For elective modules: choose based on your profile of strengths (essay-writer vs calculator), not just interest. Grade optimization is a legitimate academic strategy.' },
      { title: 'Drop date awareness', desc: 'Know the last date to withdraw from each module. If mid-semester performance signals a low grade, the drop date is the last point to control the damage.' },
    ],
  },
  {
    category: 'Advanced Exam Techniques',
    emoji: '🔬',
    tricks: [
      { title: 'Predictive question generation', desc: 'Look at the syllabus, find the highest-weighted topics, and write 3 exam questions for each. Predict 70% of real questions this way.' },
      { title: 'Professor question habit analysis', desc: 'Every professor has preferred question types. Mine past exams for pattern: they ask the same type of question about different content.' },
      { title: 'Bloom\'s taxonomy level targeting', desc: 'Identify whether questions target recall, comprehension, application, analysis, synthesis, or evaluation. Calibrate answer depth accordingly.' },
      { title: 'Examiner commentary reading', desc: 'For standardized exams: official examiner reports (Cambridge, IB, AP) published annually say exactly where students lost marks. Read them.' },
      { title: 'Mark allocation time investment', desc: 'A 2-mark question should receive 2x the time investment of a 1-mark question. Linear time allocation per mark.' },
      { title: 'Command word dictionary', desc: 'Define: meaning list. Describe: features. Explain: how/why. Analyse: components + relationships. Evaluate: evidence + judgment. Discuss: multiple perspectives.' },
      { title: 'Evidence hierarchy for science', desc: 'Meta-analysis > RCT > cohort > case study > expert opinion. Reference evidence type to earn methodology marks.' },
      { title: 'Model answer reconstruction', desc: 'After practice tests: reconstruct model answers for every question. Your reconstructed model answer reveals your understanding gap more than reading the printed one.' },
      { title: 'Interleaved practice > blocked practice', desc: 'Practicing mixed problem types beats practicing one type repeatedly. Interleaving forces you to identify the problem type — the same challenge as in real exams.' },
      { title: 'Difficulty calibration', desc: 'Easy questions in an exam are designed to be answered in 40% of their allocated time. Hard ones are designed for 100%. Spend accordingly.' },
      { title: 'Source evaluation for humanities', desc: 'Every historical source should be evaluated: authorship, date, purpose, audience, bias, limitation. Six dimensions, six potential marks.' },
      { title: 'Statistical reasoning in science essays', desc: 'Reference sample sizes, confidence intervals, and effect sizes in science essay answers. These are the markers of quantitative literacy.' },
      { title: 'Argumentative fallacy spotting', desc: 'In critical thinking exams: name fallacies explicitly (ad hominem, straw man, false dichotomy). Naming earns marks; describing earns fewer.' },
      { title: 'Synthesis question recognition', desc: 'Questions asking you to "consider both X and Y" or "using materials from multiple sources" are synthesis questions. They require explicit linking between sources, not just summarizing each.' },
      { title: 'Transfer problem approach', desc: 'Novel problems test whether you can apply concepts to unfamiliar situations. Start by identifying which known concept is being tested, then apply it.' },
      { title: 'Metacognitive monitoring', desc: 'Actively assess your confidence on each answer. Low confidence = flag for review. High confidence without knowledge = dangerous. Calibration is a skill.' },
      { title: 'Retrieval cue planting', desc: 'When studying, create specific cue words to trigger each concept. In exam, write the cue word first on scratch paper before accessing the full concept.' },
      { title: 'Parallel processing on multi-question exams', desc: 'While writing one answer, your subconscious continues processing the next problem. Read the next question before finishing the current answer.' },
      { title: 'Context reconstruction technique', desc: 'For forgotten material: reconstruct the teaching context — what was the lecture before and after? What examples were given? Context reconstruction often retrieves the target fact.' },
      { title: 'Plausibility-based guessing', desc: 'For unknown multiple-choice: eliminate implausible answers on physical/logical grounds, then pick the most technical-sounding remaining option. Exam writers make correct answers look more specific.' },
      { title: 'Two-column compare in essays', desc: 'For compare/contrast questions: mentally draw a two-column table, fill it, then convert to flowing prose. Guarantees you address both sides.' },
      { title: 'Citation memory technique', desc: 'Author + date + claim. Don\'t memorize page numbers. "Smith (2019) found that..." is fully credited in most social science mark schemes.' },
      { title: 'Concept definition lead', desc: 'For any term in a question: define it precisely in your first sentence. Guarantees minimum marks even if the rest of the answer is weak.' },
      { title: 'Methodological critique addition', desc: 'For science answers about studies: add one methodological critique (sample size, confounding variables, ecological validity). Automatic marks for critical thinking.' },
      { title: 'Impact quantification', desc: 'Add scale and magnitude to every claim: "a significant increase" → "a 47% increase over baseline." Quantified claims earn analysis marks.' },
      { title: 'Contemporary example bonus', desc: 'Reference a current event from the past 12 months that illustrates your point. Signals current engagement with the field.' },
      { title: 'Disciplinary vocabulary density', desc: 'Count technical terms per paragraph. At least 3-4 technical terms per paragraph in a high-marking answer. Jargon-density signals subject mastery.' },
      { title: 'Uncertainty quantification', desc: '"This is uncertain because..." + reason. Acknowledged uncertainty reads as sophistication; unacknowledged overconfidence reads as naivety.' },
      { title: 'Interdisciplinary bridge', desc: 'Connect your subject to another discipline. Economics + psychology = behavioral economics. Biology + statistics = bioinformatics. Cross-disciplinary reference signals breadth.' },
      { title: 'Real-world implication chain', desc: 'End every major analytical point with its real-world implication. "This means that in practice..." Implication chains separate analysis from description.' },
    ],
  },
]

const extra: Category[] = [
  {
    category: 'Oral Exam & Viva Tactics',
    emoji: '🎙️',
    tricks: [
      { title: 'Restate to buy time', desc: '"That\'s a great question — what you\'re asking is..." Restating buys 5-8 seconds and signals comprehension even before you\'ve thought of the answer.' },
      { title: 'Partial answer with redirection', desc: '"I can speak to part of that — specifically X. The Y aspect is something I\'d want to revisit." Partial answer avoids silence without exposing the gap.' },
      { title: 'Confident pacing', desc: 'Speak slowly and deliberately. Rushed answers signal uncertainty. Slow answers signal command.' },
      { title: 'Silence tolerance', desc: 'A 3-second silence before a considered answer reads as thoughtfulness, not ignorance. Don\'t panic-fill.' },
      { title: 'Definition bridging', desc: 'When unsure of the topic: "Before answering, let me define what I mean by [key term]." Definition buys thinking time and demonstrates vocabulary.' },
      { title: 'Scope qualification', desc: '"Within the scope of [your framework], the answer is X. Outside that framework, there are other perspectives." Narrows the question to what you know.' },
      { title: 'Examiner agreement test', desc: 'After your answer, watch the examiner\'s face. A slight nod = correct direction. Slight frown = rephrase or expand.' },
      { title: 'Elaboration on follow-up', desc: 'When asked to elaborate: don\'t repeat yourself. Add an example, a counterpoint, or a real-world application — whichever you haven\'t given yet.' },
      { title: 'Known territory steering', desc: '"This connects to an area I know well — [related topic]." Steer conversation toward your strongest material.' },
      { title: 'Published work reference', desc: 'Name an author or paper you genuinely know. Demonstrated reading signals the depth the viva is testing for.' },
      { title: 'Disagreement framing', desc: '"I\'d push back slightly on the premise — the evidence suggests..." Polite disagreement shows independent thinking. Examiners reward it.' },
      { title: 'Methodology articulation', desc: 'Know exactly why you chose your methodology: why this and not that. Methodology defense is the most common viva attack vector.' },
      { title: 'Limitations ownership', desc: 'Identify your limitations before the examiner does and explain what future research would address them. Pre-emption reads as rigor.' },
      { title: 'Panel attention management', desc: 'In multi-examiner vivas: address the person who asked the question, but sweep to include others at the end of each answer.' },
      { title: 'Question clarification', desc: '"Could you clarify what you mean by X in that question?" Legitimate, buys time, and may reveal what they\'re actually looking for.' },
      { title: 'Preparation visit', desc: 'Visit the viva room the day before. Sit in the chair. Remove the environmental unfamiliarity variable.' },
      { title: 'Water glass use', desc: 'A sip of water is a socially legitimate 3-second pause. Keep water on the table.' },
      { title: 'Hands on table', desc: 'Hands visible on the table signals openness. Hands hidden under table signals concealment — subconscious read.' },
      { title: 'Eye contact balance', desc: 'Hold eye contact for 60-70% of your speaking time. Less = evasion; more = aggression.' },
      { title: 'Admission of uncertainty', desc: '"I\'m not certain, but my best understanding is..." Honest uncertainty with a supported guess scores better than silence or false confidence.' },
    ],
  },
  {
    category: 'Speed Reading & Comprehension',
    emoji: '👁️',
    tricks: [
      { title: 'Chunking groups of words', desc: 'Train your eyes to read 3-4 words per fixation instead of one. Reduces total eye movements by 60%.' },
      { title: 'Peripheral vision expansion', desc: 'Practice reading without moving your eyes — see words in peripheral field. Reduces regression (re-reading) by up to 30%.' },
      { title: 'Sub-vocalization reduction', desc: 'Reading speed is capped by inner voice speed (~150 WPM). Hum while reading to disrupt sub-vocalization. Reading speed increases, comprehension temporarily drops — rebuild gradually.' },
      { title: 'Pointer tracking', desc: 'Run a finger or pen tip under text at target speed. Eye follows the physical guide. Forces pace and reduces regression.' },
      { title: 'RSVP reading', desc: 'Rapid Serial Visual Presentation — one word at a time at set interval. Apps like Spritz or ReadMe! train this at 400-600 WPM.' },
      { title: 'First and last sentence preview', desc: 'Read first and last sentence of each paragraph before the whole passage. Primes comprehension so full read is faster.' },
      { title: 'Heading + first word scan', desc: 'For reference material: scan headings and first word of each paragraph only. Maps document structure in under 60 seconds.' },
      { title: 'Active question pre-framing', desc: 'Before reading, ask one question this passage should answer. Active question creates attentional filter — brain flags the relevant content automatically.' },
      { title: 'Re-reading recognition trap', desc: 'The urge to re-read is usually false familiarity, not comprehension failure. Move forward unless comprehension test fails.' },
      { title: 'Comprehension check every paragraph', desc: 'After each paragraph: one sentence summary in your head. If you can\'t do it, re-read that paragraph only.' },
      { title: 'Vocabulary as speed barrier', desc: 'Unknown words are the primary reading speed bottleneck. Build subject vocabulary before speed-reading subject material.' },
      { title: 'Physical annotation for retention', desc: 'Underline key claims, bracket examples, star conclusions. Physical engagement compensates for reduced re-reading.' },
      { title: 'Margin keywords', desc: 'Write one keyword per paragraph margin as you read. The keyword list becomes a rapid-review document.' },
      { title: 'Section timing', desc: 'Time each exam reading section. Knowing your per-page rate allows accurate time budgeting.' },
      { title: 'Dense vs light passage recognition', desc: 'Technical passages require slower reading. Narrative passages allow faster. Calibrate pace to density, not a uniform target speed.' },
      { title: 'Table and figure first', desc: 'In scientific passages: read tables and figures before the text. They summarize the key findings the text will then explain.' },
      { title: 'Abstract and conclusion only', desc: 'For exam source analysis: read abstract and conclusion. These contain 80% of what you need for an analysis question.' },
      { title: 'Topic sentence emphasis', desc: 'Topic sentences carry the paragraph\'s main claim. Read them at full attention; support sentences can be skimmed.' },
      { title: 'Signal word tracking', desc: 'Cause words (therefore, thus, because), contrast words (however, but, despite), and sequence words (firstly, next, finally) signal structure. Slow down at signal words.' },
      { title: 'Prediction verification', desc: 'Before each paragraph: predict what it will contain based on what came before. Prediction primes faster processing of expected content.' },
    ],
  },
  {
    category: 'Note-Taking Under Time Pressure',
    emoji: '⚡',
    tricks: [
      { title: 'Symbol system', desc: 'Develop a personal symbol set: → = causes, ≠ = differs from, * = important, ? = unclear, ! = surprising. Replaces full words in real-time.' },
      { title: 'Arrow chains', desc: 'X → Y → Z replaces "X causes Y which leads to Z." Arrow chains record causal sequences at 5x the speed.' },
      { title: 'Telegram style', desc: 'Drop articles, pronouns, and auxiliary verbs. "Rate rises → inflation falls → exports competitive" not "When the interest rate rises, the rate of inflation falls..."' },
      { title: 'Abbreviation set', desc: 'Pre-define abbreviations for every course: in economics, C=consumption, I=investment, G=government spending. Use them consistently.' },
      { title: 'Color coding live', desc: 'Two pens: black for facts, red for definitions. Color makes retrieval faster even if notation is messy.' },
      { title: 'Star the surprises', desc: 'Star anything that contradicts what you expected or what was in the reading. Stars mark the high-yield exam content.' },
      { title: 'Empty space preservation', desc: 'Leave blank lines in notes. Fill in missing content from the textbook later. Cramped notes are less retrievable.' },
      { title: 'Date and source header', desc: 'Every page: date, source (lecture/textbook/article), topic. Navigation headers make notes searchable without an index.' },
      { title: 'Single concept per page', desc: 'For complex topics: one concept per page with central node and radiating branches. Pages are scannable; paragraphs are not.' },
      { title: 'Reformulation not transcription', desc: 'Don\'t copy — summarize in your own words. Reformulation forces comprehension in real-time and produces better retrieval cues.' },
      { title: 'Review flag system', desc: 'R = review tonight, RR = review this week, ? = look up. Coded at capture time, processed at review time.' },
      { title: 'Box the definitions', desc: 'Draw a box around every formal definition. Boxes are visually distinct — definitions are the highest-yield retrieval targets.' },
      { title: 'Numbered list format', desc: 'For sequential content, always number. Numbered lists reveal when a step is missing. Un-numbered bullet lists don\'t.' },
      { title: 'Structural imitation', desc: 'Mirror the lecturer\'s structure in your notes. When they say "three points," number three. When they use a timeline, draw a timeline.' },
      { title: 'Question bank note style', desc: 'Write notes as question-answer pairs. The left column is the question, the right is the answer. Fold in half for self-testing.' },
      { title: 'End-of-lecture summary', desc: 'Last 2 minutes of every lecture: write 3 key points on a separate card. This is the study card for that lecture.' },
      { title: 'Comparison table insertion', desc: 'When two things are being compared: draw a table immediately. Tables store comparison structure that prose loses.' },
      { title: 'Formula notation consistency', desc: 'Every formula: write it, write what each variable means, write the units. Incomplete formula notes are useless at review time.' },
      { title: 'Cross-reference links', desc: 'When a concept connects to another page: write the page number link. Network of cross-references creates a subject map.' },
      { title: 'Digital vs physical choice', desc: 'Handwritten notes produce 30% higher retention than typed for conceptual content. Typed notes are faster and more complete for factual content. Choose by content type.' },
    ],
  },
]

const final: Category[] = [
  {
    category: 'Distraction & Focus Control',
    emoji: '🔇',
    tricks: [
      { title: 'Pre-distraction identification', desc: 'Before exam: list the three most likely distraction sources. Preemptively plan for each. Preplanned responses eliminate in-moment decision cost.' },
      { title: 'Noise anchoring', desc: 'Exam rooms have ambient noise. Find a steady rhythmic sound (HVAC, rain, clock) and use it as a focus anchor — attention to it crowds out intrusive thoughts.' },
      { title: 'Peripheral movement ignore protocol', desc: 'Train yourself to note peripheral movement without looking up. Peripheral response = wasted time + invigilator attention.' },
      { title: 'Tunnel vision induction', desc: 'Physically cup hands around eyes when reading a hard question. Reduces visual field to the question. Reduces cognitive load from ambient visual input.' },
      { title: 'Page cover technique', desc: 'Cover all questions except the one you\'re currently answering. Eliminates anxiety from seeing remaining question count.' },
      { title: 'Breath as reset', desc: 'When distracted: three slow breaths. Physiological regulation precedes cognitive regulation. Don\'t try to think your way back to focus.' },
      { title: 'Thought labeling', desc: 'Intrusive thought appears: label it "thinking" without engaging it. Mindfulness-derived. Labeling prevents the thought from hijacking attention.' },
      { title: 'Pen grip check', desc: 'When focus wanders: check your pen grip. Physical sensation refocuses attention on the task surface.' },
      { title: 'Written thought parking', desc: 'Intrusive thought mid-exam (e.g., "I forgot to submit the assignment"): write it on scratch paper. Externalizing parks it; it stops looping.' },
      { title: 'Focus-break distinction', desc: 'Distinguish a deliberate 30-second mental break from an inadvertent distraction. Deliberate breaks recover focus; inadvertent ones compound.' },
      { title: 'Single-question commitment', desc: 'Say silently: "For the next 8 minutes, I am only working on question 3." Commitment primes selective attention.' },
      { title: 'Other candidates as neutral stimuli', desc: 'Train yourself to perceive other candidates\' sounds (page turns, coughs, writing) as neutral noise, not competition signals.' },
      { title: 'Internal dialogue management', desc: 'Replace "I\'m going to fail this" with "I\'m working through question 2 right now." Present-action statements replace catastrophic future projections.' },
      { title: 'Attention restoration mini-break', desc: 'When cognitively depleted: 20-second eyes-closed rest. Attention restoration theory: even brief rest restores directed attention capacity.' },
      { title: 'Physical posture as signal', desc: 'Sit upright with both feet flat. Posture signals (to your own brain) that focused work is happening. Slouched posture correlates with mental drift.' },
      { title: 'Gratitude interrupt', desc: 'Brief moment of gratitude (for any exam-unrelated thing) reduces cortisol spike. Positive affect broadens cognitive attention range.' },
      { title: 'Urgency reframing', desc: 'Replace "I\'m running out of time" with "I have 30 minutes." Same information, different framing. Urgency-framing degrades performance; resource-framing stabilizes it.' },
      { title: 'Difficulty normalization', desc: 'When a question is hard: assume it\'s hard for everyone. Difficulty is the exam, not your failure. Normalization removes self-referential anxiety from the cognitive load.' },
      { title: 'Success recall interrupt', desc: 'At peak anxiety: 5-second recall of a specific past success. Brief positive memory interrupts the anxiety-thought spiral at physiological level.' },
      { title: 'Body scan quick check', desc: 'Rapid top-to-bottom body awareness: shoulders dropped? Jaw unclenched? Hands loose? Each tension found and released returns cognitive resources.' },
    ],
  },
  {
    category: 'Formatting & Presentation',
    emoji: '📋',
    tricks: [
      { title: 'First impression front page', desc: 'Name, date, exam code, candidate number — all on the front, clearly formatted. Administrative clarity signals organized thinking before marking begins.' },
      { title: 'Consistent heading hierarchy', desc: 'Section headings larger/bolder than sub-headings. Consistent hierarchy makes structure visible at a glance — marker reads faster, marks better.' },
      { title: 'Paragraph length control', desc: 'Every paragraph: 3-6 sentences. Shorter = underdeveloped. Longer = unfocused. Length itself is a signal.' },
      { title: 'Margin lines', desc: 'Keep writing inside the printed margin lines. Writing that bleeds to edges reads as uncontrolled. Margin discipline reads as disciplined thinking.' },
      { title: 'Consistent spacing', desc: 'Skip one line between paragraphs throughout. Inconsistent spacing reads as disorganized regardless of content quality.' },
      { title: 'Dark, legible ink only', desc: 'Blue or black only. Red and green read as annotations to the marker and create confusion. Pencil reduces legibility in scanned copies.' },
      { title: 'Cross-out not scribble', desc: 'Single diagonal line through crossed-out text. Scribbled-out text looks panicked. Single-line deletion looks deliberate.' },
      { title: 'Numbered continuation', desc: 'If you continue an answer elsewhere: "Answer continued on page X" at the original location. "Q3 continued from page Y" at the new location.' },
      { title: 'Equation display style', desc: 'One equation per line. Left-align. Show each algebraic step on its own line. Markers award marks per step in shown working.' },
      { title: 'Diagram labeling', desc: 'Every diagram: title, labeled axes, labeled components, and a key if symbols are used. Unlabeled diagrams earn zero marks in most mark schemes.' },
      { title: 'Table over list', desc: 'When comparing two or more things: use a table. Tables communicate comparison structure instantly. Bullet lists for the same content read as less organized.' },
      { title: 'Bold key terms', desc: 'In pen: underline key terms once. Underlining serves the same function as bold. Makes technical vocabulary visible to the marker scanning your work.' },
      { title: 'Section dividers', desc: 'Draw a horizontal line between answers to different questions. Prevents marker confusion about where one ends and the next begins.' },
      { title: 'Blank line before each answer', desc: 'Start each new answer with a blank line. Visual separation communicates organization.' },
      { title: 'Working space declaration', desc: '"Working:" above scratch working in math questions. "Answer:" above the final answer. Distinguishes scratchwork from the submission.' },
      { title: 'Circle the final answer', desc: 'For numerical questions: circle the final numerical answer. Marker eye goes to circled content. Prevents them from marking intermediate working as final.' },
      { title: 'Consistent date format', desc: 'Use the same date format throughout (DD/MM/YYYY or YYYY-MM-DD). Inconsistent formats signal carelessness.' },
      { title: 'Source referencing format', desc: 'Whatever citation style is required: use it identically for every source. One wrong citation in a consistent set reads as a typo. Random variation reads as unfamiliarity.' },
      { title: 'Page numbering on extra sheets', desc: 'If using extra answer sheets: number them and write your candidate number on each. Loose unnumbered sheets get separated and lost.' },
      { title: 'Proofreading mark awareness', desc: 'Know basic proofreading marks: stet (let it stand), ^ (insert), sp (spelling error). Using them correctly signals editorial control.' },
      { title: 'Unit consistency', desc: 'In scientific answers: every numerical value must be followed by its unit. "9.8" is incomplete; "9.8 m/s²" is correct. Missing units lose automatic marks.' },
      { title: 'Graph scale selection', desc: 'Choose a scale where your data fills at least 60% of the graph area. Tiny data in a huge graph reads as poor scientific presentation.' },
      { title: 'Error bar inclusion', desc: 'For plotted data with uncertainty: always include error bars. Missing error bars in science exams cost marks even if the graph is otherwise perfect.' },
      { title: 'Line of best fit discipline', desc: 'A line of best fit passes through the mean of the data distribution, not through every point. Drawing through every point is a common error.' },
      { title: 'Y-intercept significance', desc: 'Always comment on what the y-intercept represents physically. An unexplained y-intercept is a missed interpretation mark.' },
      { title: 'Anomalous data point handling', desc: 'Circle anomalous points, exclude them from the line of best fit, and note that they were excluded. All three steps earn marks separately.' },
      { title: 'Significant figures discipline', desc: 'Final answer significant figures should match the least precise measurement. Over-precision is as wrong as under-precision.' },
      { title: 'Hypothesis formation language', desc: '"I predict that if X increases, Y will increase because Z." If-then-because structure. All three elements required for full hypothesis marks.' },
      { title: 'Conclusion vs evaluation separation', desc: 'Conclusion: does the data support the hypothesis? Evaluation: how reliable is the evidence? These are different questions requiring separate paragraphs.' },
      { title: 'Experimental variable control statement', desc: '"The independent variable was X. The dependent variable was Y. Control variables included A, B, and C." Explicit statement earns automatic variable marks.' },
      { title: 'Repeatability vs reproducibility', desc: 'Repeatability = same experimenter, same equipment. Reproducibility = different experimenter, different lab. Distinguish them explicitly in evaluation sections.' },
      { title: 'Random vs systematic error distinction', desc: 'Random error: varies unpredictably (reduced by repeating). Systematic error: consistently wrong in one direction (fixed by calibration). Naming both earns two separate marks.' },
      { title: 'Validity chain', desc: '"This test is valid because it measures X (the construct), using Y (operationalization), which captures Z (the relevant dimension)." Full validity argument has three links.' },
      { title: 'Reliability coefficient reference', desc: 'In psychology/social science: mention Cronbach\'s alpha for internal reliability, test-retest correlation for stability. Naming the coefficient signals statistical literacy.' },
      { title: 'Ecological validity framing', desc: 'Laboratory experiments have low ecological validity. Field experiments have high ecological validity. State which and explain the implication for generalizability.' },
      { title: 'Inter-rater reliability mention', desc: 'For any study using observer scoring: mention inter-rater reliability. Its presence or absence is a standard evaluation point.' },
      { title: 'Demand characteristics awareness', desc: 'Participants behave differently when they know they\'re being studied. Naming demand characteristics earns evaluation marks on almost any psychology question.' },
      { title: 'Investigator effect', desc: 'Experimenter behavior unconsciously influences participant responses. Blinding procedures remove this. Name both the problem and the solution.' },
      { title: 'Ethics application', desc: 'Apply BPS/APA ethical guidelines by name to any psychological study question. Framework application earns more marks than a general ethics discussion.' },
    ],
  },
]

const combined = [...data, ...extra, ...final]
const TOTAL = combined.reduce((sum, c) => sum + c.tricks.length, 0)

export default function TricksPage() {
  const [search, setSearch] = useState('')
  const [active, setActive] = useState<string | null>(null)

  const filtered = useMemo(() => {
    if (!search.trim()) return combined
    const q = search.toLowerCase()
    return combined
      .map(c => ({
        ...c,
        tricks: c.tricks.filter(
          t => t.title.toLowerCase().includes(q) || t.desc.toLowerCase().includes(q)
        ),
      }))
      .filter(c => c.tricks.length > 0)
  }, [search])

  const totalFiltered = filtered.reduce((s, c) => s + c.tricks.length, 0)

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-xs font-mono text-zinc-500 uppercase tracking-widest">Study Tools</span>
          <span className="text-xs font-mono text-zinc-700">·</span>
          <span className="text-xs font-mono text-violet-500">{TOTAL} tricks</span>
        </div>
        <h1 className="text-3xl font-semibold text-zinc-100 tracking-tight mb-2">
          Exam Tricks & Strategies
        </h1>
        <p className="text-zinc-400 text-sm max-w-xl">
          Every technique, method, and shortcut collected in one place. Memory systems, positioning, signaling, psychology, subject shortcuts — and everything else.
        </p>
      </div>

      {/* Search */}
      <div className="mb-8">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search tricks…"
          className="w-full bg-white/[0.03] border border-white/[0.08] rounded-lg px-4 py-2.5 text-sm text-zinc-200 placeholder-zinc-600 outline-none focus:border-white/[0.15] transition-colors"
        />
        {search && (
          <p className="text-xs text-zinc-600 mt-2 font-mono">
            {totalFiltered} result{totalFiltered !== 1 ? 's' : ''} across {filtered.length} categor{filtered.length !== 1 ? 'ies' : 'y'}
          </p>
        )}
      </div>

      {/* Category index */}
      {!search && (
        <div className="flex flex-wrap gap-2 mb-10">
          {combined.map(c => (
            <button
              key={c.category}
              onClick={() => {
                setActive(c.category === active ? null : c.category)
                setTimeout(() => {
                  document.getElementById(`cat-${c.category}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
                }, 50)
              }}
              className={`text-xs px-3 py-1.5 rounded-full border transition-all ${
                active === c.category
                  ? 'bg-violet-500/20 border-violet-500/40 text-violet-300'
                  : 'bg-white/[0.03] border-white/[0.07] text-zinc-500 hover:text-zinc-300 hover:border-white/[0.12]'
              }`}
            >
              {c.emoji} {c.category}
              <span className="ml-1.5 text-zinc-600">{c.tricks.length}</span>
            </button>
          ))}
        </div>
      )}

      {/* Categories */}
      <div className="space-y-12">
        {filtered.map(cat => (
          <section key={cat.category} id={`cat-${cat.category}`}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xl">{cat.emoji}</span>
              <h2 className="text-base font-semibold text-zinc-200">{cat.category}</h2>
              <span className="text-xs font-mono text-zinc-600 ml-auto">{cat.tricks.length}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {cat.tricks.map((t, i) => (
                <div
                  key={i}
                  className="group rounded-xl p-4 transition-all duration-200"
                  style={{
                    background: '#050505',
                    border: '1px solid rgba(255,255,255,0.07)',
                    boxShadow: 'inset 0 1px 0 0 rgba(255,255,255,0.05)',
                  }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.12)'; el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.07), 0 0 0 1px rgba(255,255,255,0.04)' }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.borderColor = 'rgba(255,255,255,0.07)'; el.style.boxShadow = 'inset 0 1px 0 0 rgba(255,255,255,0.05)' }}
                >
                  <div className="text-xs font-semibold text-zinc-300 mb-1.5 leading-snug">{t.title}</div>
                  <div className="text-xs text-zinc-500 leading-relaxed">{t.desc}</div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20 text-zinc-600 text-sm">
          No tricks match &ldquo;{search}&rdquo;
        </div>
      )}

      {/* Footer count */}
      <div className="mt-16 pt-8 border-t border-white/[0.04] text-center">
        <span className="text-xs font-mono text-zinc-700">{TOTAL} tricks total · use them well</span>
      </div>
    </div>
  )
}
