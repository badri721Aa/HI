// AlhekmaTyper — content.js
// Runs in Google Docs context, receives messages from popup.html

let isTyping = false;
let tid = null;

chrome.runtime.onMessage.addListener((msg, sender, respond) => {
  if (msg.action === 'startTyping') {
    isTyping = true;
    typeSeq(msg.text, 0, msg.wpm, msg.typoChance, msg.pauseFreq);
    respond({ ok: true });
  }
  if (msg.action === 'stopTyping') {
    isTyping = false;
    clearTimeout(tid);
    respond({ ok: true });
  }
  return true;
});

function getDoc() {
  const f = document.querySelector('.docs-texteventtarget-iframe');
  return f ? f.contentDocument : document;
}

function insert(doc, char) {
  doc.execCommand('insertText', false, char);
}

function typeSeq(text, i, wpm, tc, pc) {
  if (!isTyping || i >= text.length) {
    isTyping = false;
    chrome.runtime.sendMessage({ action: 'done' });
    return;
  }

  const base = 60000 / (wpm * 5);
  const doc = getDoc();

  // Occasional typo + correction
  if (Math.random() < tc && i > 2) {
    const wrong = String.fromCharCode(97 + Math.floor(Math.random() * 26));
    insert(doc, wrong);
    tid = setTimeout(() => {
      doc.execCommand('delete');
      tid = setTimeout(() => typeSeq(text, i, wpm, tc, pc), base * 0.5);
    }, base * 3);
    return;
  }

  insert(doc, text[i]);

  let delay = base * (0.5 + Math.random());
  if (Math.random() < pc) {
    delay = base * (8 + Math.random() * 10);
  }

  tid = setTimeout(() => typeSeq(text, i + 1, wpm, tc, pc), delay);
}
