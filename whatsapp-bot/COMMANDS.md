# Commands (284)

Default prefix is `!`. Type `!help <command>` in WhatsApp for details.

## 📌 General (17)

| Command | Who | What it does |
|---|---|---|
| `!help [category \| command]`<br><sub>also: !h</sub> | everyone | Categories, or details for one category/command |
| `!menu`<br><sub>also: !commands, !allcmds</sub> | everyone | Every command, grouped by category |
| `!ping` | everyone | Check the bot is alive (with response time) |
| `!uptime` | everyone | How long the bot has been running |
| `!botinfo`<br><sub>also: !about</sub> | everyone | Bot version, mode and server stats |
| `!owner` | everyone | Who runs this bot |
| `!rules` | everyone | Show the group rules |
| `!id`<br><sub>also: !jid</sub> | everyone | This chat's ID (for ALLOWED_GROUPS) |
| `!time [Region/City]` | everyone | Current time, optionally in a timezone |
| `!worldclock` | everyone | Time in major cities |
| `!date` | everyone | Today's date with day of the year and week number |
| `!calendar [month] [year]`<br><sub>also: !cal</sub> | everyone | Calendar for a month |
| `!stats` | everyone | Most used commands |
| `!feedback <message>` | everyone | Send a message to the bot owner |
| `!report @user <reason>` | everyone | Report a member to the admins |
| `!prefix` | everyone | Show the command prefix |
| `!settings` | everyone | This group's bot settings |

## 👥 Group & members (17)

| Command | Who | What it does |
|---|---|---|
| `!info`<br><sub>also: !groupinfo, !ginfo</sub> | everyone | Group name, size, admins and creation date |
| `!admins`<br><sub>also: !staff</sub> | everyone | List and mention the group admins |
| `!members`<br><sub>also: !membercount</sub> | everyone | How many members are in the group |
| `!desc`<br><sub>also: !description</sub> | everyone | Show the group description |
| `!whois [@user]`<br><sub>also: !profile</sub> | everyone | Info about a member (or yourself) |
| `!pfp [@user]`<br><sub>also: !avatar</sub> | everyone | Get someone's profile picture |
| `!groupicon`<br><sub>also: !gpp</sub> | everyone | Get the group's picture |
| `!rank [@user]`<br><sub>also: !level, !xp</sub> | everyone | Your level and XP (earned by chatting) |
| `!leaderboard`<br><sub>also: !lb, !top</sub> | everyone | Top 10 members by XP |
| `!topchatters`<br><sub>also: !active</sub> | everyone | Members who sent the most messages |
| `!inactive`<br><sub>also: !silent</sub> | 🛡️ admins | Members who haven't sent a message since the bot joined |
| `!afk [reason]`<br><sub>also: !away</sub> | everyone | Set yourself away; the bot tells people who mention you |
| `!randommember`<br><sub>also: !pick, !random</sub> | everyone | Pick a random member |
| `!who <question>` | everyone | Ask "who is most likely to…" and the bot picks someone |
| `!couple`<br><sub>also: !pair</sub> | everyone | Pick a random couple of the day 💞 |
| `!teams [number of teams]` | everyone | Split members into random teams |
| `!mywarns` | everyone | How many warnings you have |

## 🛡️ Admin tools (42)

| Command | Who | What it does |
|---|---|---|
| `!tagall [message]`<br><sub>also: !everyone, !all</sub> | 🛡️ admins | Mention every member |
| `!hidetag <message>`<br><sub>also: !ht</sub> | 🛡️ admins | Notify everyone without listing their names |
| `!announce <message>` | 🛡️ admins | Post a formatted announcement and notify everyone |
| `!kick @user`<br><sub>also: !remove</sub> | 🛡️ admins | Remove members (mention or reply) _(bot must be admin)_ |
| `!promote @user` | 🛡️ admins | Make members admin _(bot must be admin)_ |
| `!demote @user` | 🛡️ admins | Remove admin rights _(bot must be admin)_ |
| `!add <number with country code>` | 🛡️ admins | Add a member by phone number _(bot must be admin)_ |
| `!lock` | 🛡️ admins | Only admins can send messages _(bot must be admin)_ |
| `!unlock` | 🛡️ admins | Everyone can send messages _(bot must be admin)_ |
| `!lockinfo` | 🛡️ admins | Only admins can edit name/icon/description _(bot must be admin)_ |
| `!unlockinfo` | 🛡️ admins | Everyone can edit name/icon/description _(bot must be admin)_ |
| `!mute <duration e.g. 30m, 2h>` | 🛡️ admins | Lock the group for a while, then unlock automatically _(bot must be admin)_ |
| `!setname <new name>`<br><sub>also: !setsubject</sub> | 🛡️ admins | Change the group name _(bot must be admin)_ |
| `!setdesc <text>` | 🛡️ admins | Change the group description _(bot must be admin)_ |
| `!setpic`<br><sub>also: !seticon</sub> | 🛡️ admins | Set the group picture (send or reply to an image) _(bot must be admin)_ |
| `!link`<br><sub>also: !invite</sub> | 🛡️ admins | Get the group's invite link _(bot must be admin)_ |
| `!revoke`<br><sub>also: !resetlink</sub> | 🛡️ admins | Reset the invite link (old one stops working) _(bot must be admin)_ |
| `!delete`<br><sub>also: !del</sub> | 🛡️ admins | Delete the message you reply to |
| `!warn @user [reason]` | 🛡️ admins | Warn a member; they are removed at the warn limit |
| `!unwarn @user` | 🛡️ admins | Remove one warning |
| `!warnings [@user]`<br><sub>also: !warns</sub> | 🛡️ admins | Show warnings for a member or the whole group |
| `!resetwarn @user \| all`<br><sub>also: !clearwarns</sub> | 🛡️ admins | Clear a member's warnings (or everyone's with 'all') |
| `!setwarnlimit <number>` | 🛡️ admins | Warnings before auto-removal |
| `!antilink on\|off` | 🛡️ admins | Turn Anti-link (deletes links from non-admins) on or off |
| `!antispam on\|off` | 🛡️ admins | Turn Anti-spam (warns people who flood the chat) on or off |
| `!antibadword on\|off`<br><sub>also: !filter</sub> | 🛡️ admins | Turn Bad-word filter on or off |
| `!welcome on\|off` | 🛡️ admins | Turn Welcome & goodbye messages on or off |
| `!levelup on\|off` | 🛡️ admins | Turn Level-up announcements on or off |
| `!addbadword <word> [word…]` | 🛡️ admins | Add words to the filter |
| `!delbadword <word>` | 🛡️ admins | Remove words from the filter |
| `!badwords` | 🛡️ admins | List filtered words |
| `!setwelcome <text> \| reset` | 🛡️ admins | Custom welcome text ({user} {group} {count} {desc}) |
| `!setgoodbye <text> \| reset` | 🛡️ admins | Custom goodbye text ({user} {group} {count}) |
| `!setrules <text> \| reset` | 🛡️ admins | Set the rules shown by !rules |
| `!botban @user` | 🛡️ admins | Stop a member from using the bot in this group |
| `!botunban @user` | 🛡️ admins | Let a member use the bot again |
| `!banlist` | 🛡️ admins | Members banned from the bot |
| `!resetxp @user \| all` | 🛡️ admins | Reset a member's XP (or everyone's with 'all') |
| `!kickall confirm` | 🛡️ admins | Remove everyone who is not an admin (asks to confirm) _(bot must be admin)_ |
| `!requests` | 🛡️ admins | List pending join requests _(bot must be admin)_ |
| `!approve all` | 🛡️ admins | Approve all pending join requests _(bot must be admin)_ |
| `!reject all` | 🛡️ admins | Reject all pending join requests _(bot must be admin)_ |

## 🎉 Fun (39)

| Command | Who | What it does |
|---|---|---|
| `!8ball <question>`<br><sub>also: !ask8</sub> | everyone | Ask the magic 8-ball a question |
| `!coin`<br><sub>also: !flip, !coinflip</sub> | everyone | Flip a coin |
| `!dice [NdM]`<br><sub>also: !roll</sub> | everyone | Roll dice (e.g. 2d6, d20) |
| `!rate <thing>` | everyone | Rate anything out of 10 |
| `!ship @user [@user]`<br><sub>also: !love</sub> | everyone | Love compatibility between two people |
| `!joke` | everyone | A random joke |
| `!pun` | everyone | A terrible pun |
| `!fact`<br><sub>also: !funfact</sub> | everyone | A random fun fact |
| `!quote` | everyone | An inspiring quote |
| `!advice` | everyone | Some life advice |
| `!pickup`<br><sub>also: !pickupline</sub> | everyone | A cheesy pickup line |
| `!truth` | everyone | Truth question |
| `!dare` | everyone | A dare |
| `!wyr`<br><sub>also: !wouldyourather</sub> | everyone | Would you rather… |
| `!nhie`<br><sub>also: !neverhaveiever</sub> | everyone | Never have I ever… |
| `!fortune` | everyone | Open a fortune cookie |
| `!motivate`<br><sub>also: !motivation</sub> | everyone | A motivational boost |
| `!compliment [@user]` | everyone | Compliment someone |
| `!roast [@user]` | everyone | Lighthearted roast |
| `!tod`<br><sub>also: !truthordare</sub> | everyone | Random truth or dare |
| `!riddle` | everyone | Get a riddle (reveal with !answer) |
| `!answer`<br><sub>also: !reveal</sub> | everyone | Reveal the answer to the last riddle |
| `!choose a \| b \| c`<br><sub>also: !pickone</sub> | everyone | Let the bot choose for you |
| `!iq [@user]` | everyone | Very scientific IQ test |
| `!cool [@user]` | everyone | How cool is someone? |
| `!lucky [@user]` | everyone | Today's luck meter |
| `!sus [@user]` | everyone | How sus is someone? |
| `!vibe [@user]` | everyone | Vibe check |
| `!hack @user` | everyone | Fake "hack" someone (a harmless prank) |
| `!horoscope <sign>`<br><sub>also: !zodiac</sub> | everyone | Today's (totally real) horoscope |
| `!rps rock\|paper\|scissors` | everyone | Rock, paper, scissors vs the bot |
| `!mood [@user]` | everyone | The bot guesses someone's mood |
| `!emoji [count]`<br><sub>also: !randomemoji</sub> | everyone | Random emojis |
| `!color`<br><sub>also: !randomcolor</sub> | everyone | Random colour with hex and RGB |
| `!fakename`<br><sub>also: !randomname</sub> | everyone | Random name generator |
| `!slap @user` | everyone | Slap someone with a trout 🐟 |
| `!hug @user` | everyone | Send someone a hug |
| `!highfive @user` | everyone | High five someone |
| `!countdown <YYYY-MM-DD>`<br><sub>also: !daysuntil</sub> | everyone | Days until a date |

## 🎮 Games (13)

| Command | Who | What it does |
|---|---|---|
| `!trivia`<br><sub>also: !quiz</sub> | everyone | Multiple-choice trivia question |
| `!guess`<br><sub>also: !guessnumber</sub> | everyone | Guess the number between 1 and 100 |
| `!hangman` | everyone | Classic hangman — guess letters or the whole word |
| `!scramble`<br><sub>also: !unscramble</sub> | everyone | Unscramble the word |
| `!mathquiz [easy\|hard]`<br><sub>also: !math</sub> | everyone | Quick mental-math challenge |
| `!emojiquiz`<br><sub>also: !guessmovie</sub> | everyone | Guess the movie from emojis |
| `!flagquiz`<br><sub>also: !flag</sub> | everyone | Guess the country from its flag |
| `!capital`<br><sub>also: !capitalquiz</sub> | everyone | Name the capital city |
| `!typerace`<br><sub>also: !typing</sub> | everyone | First to type the sentence exactly wins |
| `!ttt @opponent`<br><sub>also: !tictactoe</sub> | everyone | Tic-tac-toe against another member |
| `!hint` | everyone | Get a hint for the current game |
| `!stopgame`<br><sub>also: !endgame, !giveup</sub> | everyone | Stop the current game and reveal the answer |
| `!gamestats [@user]`<br><sub>also: !wins</sub> | everyone | How many games you have won |

## 💰 Economy (20)

| Command | Who | What it does |
|---|---|---|
| `!balance [@user]`<br><sub>also: !bal, !wallet, !money</sub> | everyone | Your coins (wallet + bank) |
| `!daily` | everyone | Claim your daily coins (every 1d) |
| `!weekly` | everyone | Claim your weekly coins (every 7d) |
| `!work`<br><sub>also: !job</sub> | everyone | Work a shift for coins (every 1h) |
| `!beg` | everyone | Beg for spare coins (every 10m) |
| `!crime` | everyone | Risky crime — win big or pay a fine (every 30m) |
| `!bet <amount\|all>`<br><sub>also: !gamble</sub> | everyone | Bet coins on a coin flip (double or nothing) |
| `!slots <amount>`<br><sub>also: !slot</sub> | everyone | Spin the slot machine |
| `!give @user <amount>`<br><sub>also: !pay, !transfer</sub> | everyone | Give coins to someone |
| `!rob @user`<br><sub>also: !steal</sub> | everyone | Try to steal from someone's wallet |
| `!deposit <amount\|all>`<br><sub>also: !dep</sub> | everyone | Move coins to the bank (safe from robbers) |
| `!withdraw <amount\|all>`<br><sub>also: !wd</sub> | everyone | Take coins out of the bank |
| `!richest`<br><sub>also: !baltop, !forbes</sub> | everyone | Richest members in this group |
| `!shop`<br><sub>also: !store</sub> | everyone | Items you can buy |
| `!buy <item> [qty]` | everyone | Buy an item from the shop |
| `!sell <item> [qty]` | everyone | Sell an item back for half price |
| `!inventory [@user]`<br><sub>also: !inv, !bag</sub> | everyone | Items you own |
| `!fish` | everyone | Go fishing (needs a fishingrod from !shop) |
| `!hunt` | everyone | Go hunting (needs a rifle from !shop) |
| `!mine` | everyone | Go mineing (needs a pickaxe from !shop) |

## 🧰 Utilities & media (28)

| Command | Who | What it does |
|---|---|---|
| `!poll Question \| option 1 \| option 2 …`<br><sub>also: !vote</sub> | everyone | Create a WhatsApp poll |
| `!multipoll Question \| option 1 \| option 2 …` | everyone | Poll where people can pick several options |
| `!save <name> <text>`<br><sub>also: !setnote, !addnote</sub> | everyone | Save a group note (or reply to a message) |
| `!note <name>`<br><sub>also: !get</sub> | everyone | Show a saved note |
| `!notes` | everyone | List saved notes |
| `!delnote <name>`<br><sub>also: !rmnote</sub> | 🛡️ admins | Delete a saved note |
| `!todo <task>` | everyone | Add to your personal to-do list |
| `!todos`<br><sub>also: !todolist</sub> | everyone | Show your to-do list |
| `!done <number>` | everyone | Tick off a to-do |
| `!cleartodos [all]` | everyone | Remove finished to-dos (or all with "all") |
| `!remind <time e.g. 10m, 2h, 1d> <text>`<br><sub>also: !reminder, !remindme</sub> | everyone | Set a reminder |
| `!reminders` | everyone | Your pending reminders |
| `!cancelremind <id>`<br><sub>also: !delremind</sub> | everyone | Cancel a reminder |
| `!stopwatch`<br><sub>also: !sw</sub> | everyone | Start / stop a personal stopwatch |
| `!password [length]`<br><sub>also: !pass, !genpass</sub> | everyone | Generate a strong random password |
| `!uuid` | everyone | Generate a random UUID |
| `!hash <text>` | everyone | MD5 / SHA-1 / SHA-256 of text |
| `!lorem [words]` | everyone | Placeholder text |
| `!qr <text>`<br><sub>also: !qrcode</sub> | everyone | Make a QR code image from text or a link |
| `!sticker`<br><sub>also: !s, !stiker</sub> | everyone | Turn an image into a sticker (send or reply to an image) |
| `!toimg`<br><sub>also: !toimage</sub> | everyone | Turn a sticker back into an image (reply to it) |
| `!circle` | everyone | Crop an image into a round sticker |
| `!grayscale` | everyone | Black & white version of an image (send or reply to an image) |
| `!blur` | everyone | Blur an image (send or reply to an image) |
| `!invert` | everyone | Invert image colours (send or reply to an image) |
| `!mirror` | everyone | Mirror an image horizontally (send or reply to an image) |
| `!mention <number> [text]` | everyone | Mention a member by number |
| `!wame [@user]`<br><sub>also: !chatlink</sub> | everyone | wa.me link to chat with someone |

## 🔤 Text tools (44)

| Command | Who | What it does |
|---|---|---|
| `!reverse <text>` | everyone | Reverse text |
| `!upper <text>`<br><sub>also: !uppercase</sub> | everyone | UPPERCASE |
| `!lower <text>`<br><sub>also: !lowercase</sub> | everyone | lowercase |
| `!title <text>`<br><sub>also: !titlecase</sub> | everyone | Title Case Every Word |
| `!mock <text>`<br><sub>also: !spongebob</sub> | everyone | sPoNgEbOb MoCk TeXt |
| `!clap <text>` | everyone | Add 👏 between 👏 words |
| `!vapor <text>`<br><sub>also: !aesthetic</sub> | everyone | Ｖａｐｏｒｗａｖｅ text |
| `!smallcaps <text>` | everyone | sᴍᴀʟʟ ᴄᴀᴘs |
| `!bubble <text>` | everyone | ⓑⓤⓑⓑⓛⓔ text |
| `!bold <text>` | everyone | 𝐁𝐨𝐥𝐝 unicode text |
| `!italic <text>` | everyone | 𝘐𝘵𝘢𝘭𝘪𝘤 unicode text |
| `!script <text>`<br><sub>also: !cursive</sub> | everyone | 𝓒𝓾𝓻𝓼𝓲𝓿𝓮 text |
| `!mono <text>`<br><sub>also: !monospace</sub> | everyone | 𝚖𝚘𝚗𝚘𝚜𝚙𝚊𝚌𝚎 text |
| `!double <text>` | everyone | 𝕕𝕠𝕦𝕓𝕝𝕖-𝕤𝕥𝕣𝕦𝕔𝕜 text |
| `!strike <text>` | everyone | S̶t̶r̶i̶k̶e̶t̶h̶r̶o̶u̶g̶h̶ |
| `!underline <text>` | everyone | U̲n̲d̲e̲r̲l̲i̲n̲e̲ |
| `!upsidedown <text>`<br><sub>also: !fliptext</sub> | everyone | uʍop ǝpısdn |
| `!binary <text>` | everyone | Text → binary |
| `!unbinary <text>` | everyone | Binary → text |
| `!hex <text>` | everyone | Text → hexadecimal |
| `!unhex <text>` | everyone | Hexadecimal → text |
| `!base64 <text>`<br><sub>also: !b64</sub> | everyone | Encode Base64 |
| `!unbase64 <text>`<br><sub>also: !unb64</sub> | everyone | Decode Base64 |
| `!morse <text>` | everyone | Text → Morse code |
| `!unmorse <text>` | everyone | Morse code → text |
| `!rot13 <text>` | everyone | ROT13 cipher |
| `!caesar <shift> <text>` | everyone | Caesar cipher with a shift |
| `!leet <text>` | everyone | 1337 5p34k |
| `!nato <text>` | everyone | NATO phonetic alphabet |
| `!piglatin <text>` | everyone | Pig Latin translator |
| `!emojify <text>` | everyone | Text → 🇪 🇲 🇴 🇯 🇮 letters |
| `!space <text>` | everyone | s p a c e   o u t   t e x t |
| `!zalgo <text>` | everyone | Z̷a̴l̸g̵o̶ cursed text |
| `!shuffle <text>` | everyone | Shuffle the words |
| `!sortlines <text>`<br><sub>also: !sort</sub> | everyone | Sort lines alphabetically |
| `!dedupe <text>` | everyone | Remove duplicate lines |
| `!urlencode <text>` | everyone | URL-encode text |
| `!urldecode <text>` | everyone | URL-decode text |
| `!count <text>`<br><sub>also: !wordcount, !charcount</sub> | everyone | Count characters, words, lines |
| `!palindrome <text>` | everyone | Is it a palindrome? |
| `!say <text>`<br><sub>also: !echo</sub> | everyone | Make the bot say something |
| `!readmore <text>` | everyone | Hide text behind “Read more” |
| `!anagram <word1> <word2>` | everyone | Are two words anagrams? |
| `!repeat <n> <text>` | everyone | Repeat text N times (max 20) |

## 🧮 Math (25)

| Command | Who | What it does |
|---|---|---|
| `!calc <expression>`<br><sub>also: !calculate, !=</sub> | everyone | Calculator: + - * / ^ % ! sqrt() sin() log() pi e… |
| `!sqrt <number>` | everyone | Square root |
| `!square <number>` | everyone | Square and cube of a number |
| `!percent <x> <y>`<br><sub>also: !pct</sub> | everyone | X% of Y, or what % X is of Y |
| `!randnum [min] <max>`<br><sub>also: !rng</sub> | everyone | Random number between min and max |
| `!isprime <number>`<br><sub>also: !prime</sub> | everyone | Is a number prime? |
| `!factors <number>` | everyone | Prime factorisation |
| `!divisors <number>` | everyone | All divisors of a number |
| `!fib <n>`<br><sub>also: !fibonacci</sub> | everyone | Fibonacci sequence (first N numbers) |
| `!factorial <n>` | everyone | n! |
| `!gcd <a> <b> [c…]`<br><sub>also: !hcf</sub> | everyone | Greatest common divisor |
| `!lcm <a> <b> [c…]` | everyone | Least common multiple |
| `!roman <number \| numeral>` | everyone | Number ↔ Roman numerals |
| `!average <n1> <n2> …`<br><sub>also: !avg, !mean, !statistics</sub> | everyone | Mean, median, min, max, sum of numbers |
| `!bmi <weight kg> <height cm>` | everyone | Body mass index |
| `!tip <bill> [tip%] [people]` | everyone | Tip calculator, optionally split |
| `!split <amount> <people>`<br><sub>also: !splitbill</sub> | everyone | Split an amount between people |
| `!age <YYYY-MM-DD>` | everyone | Exact age from a birth date |
| `!leapyear <year>`<br><sub>also: !leap</sub> | everyone | Is it a leap year? |
| `!base <number> <from> <to>`<br><sub>also: !convbase</sub> | everyone | Convert between number bases (2–36) |
| `!dayofweek <YYYY-MM-DD>`<br><sub>also: !weekday</sub> | everyone | What day of the week a date falls on |
| `!datediff <YYYY-MM-DD> <YYYY-MM-DD>` | everyone | Days between two dates |
| `!quadratic <a> <b> <c>` | everyone | Solve ax² + bx + c = 0 |
| `!interest <principal> <rate%> <years>` | everyone | Compound interest |
| `!discount <price> <discount%>` | everyone | Price after a discount |

## 📏 Converters (13)

| Command | Who | What it does |
|---|---|---|
| `!convert <value> <from> <to>`<br><sub>also: !conv, !unit</sub> | everyone | Convert any unit (length, weight, volume, speed, area, data, time, temperature) |
| `!temp <value><C\|F\|K>`<br><sub>also: !temperature</sub> | everyone | Convert temperature between C, F and K |
| `!length <value> <from> <to>` | everyone | Convert length (m, km, cm, mm, mi, mile…) |
| `!weight <value> <from> <to>` | everyone | Convert weight (kg, g, mg, t, ton, lb…) |
| `!volume <value> <from> <to>` | everyone | Convert volume (l, ml, m3, gal, qt, pt…) |
| `!speed <value> <from> <to>` | everyone | Convert speed (m/s, km/h, kmh, kph, mph, knot…) |
| `!area <value> <from> <to>` | everyone | Convert area (m2, km2, cm2, ha, acre, ft2…) |
| `!datasize <value> <from> <to>` | everyone | Convert data (b, kb, mb, gb, tb, kib…) |
| `!timeunit <value> <from> <to>` | everyone | Convert time (s, sec, min, h, hr, day…) |
| `!hex2rgb <#hex>` | everyone | Hex colour → RGB |
| `!rgb2hex <r> <g> <b>` | everyone | RGB → hex colour |
| `!epoch [timestamp \| YYYY-MM-DD]`<br><sub>also: !timestamp, !unix</sub> | everyone | Unix timestamp ↔ date (no arg = now) |
| `!shoesize <size> <eu\|us\|uk>` | everyone | Shoe size EU ↔ US (men) ↔ UK |

## 🌐 Web lookups (14)

| Command | Who | What it does |
|---|---|---|
| `!weather <city>` | everyone | Current weather for a city |
| `!wiki <topic>`<br><sub>also: !wikipedia</sub> | everyone | Wikipedia summary |
| `!define <word>`<br><sub>also: !dict, !meaning</sub> | everyone | Dictionary definition |
| `!synonyms <word>`<br><sub>also: !syn</sub> | everyone | Synonyms of a word |
| `!currency <amount> <FROM> <TO>`<br><sub>also: !fx, !exchange</sub> | everyone | Convert currencies (live rates) |
| `!crypto <coin e.g. bitcoin>` | everyone | Crypto price in USD |
| `!translate <lang> <text>  (e.g. !translate es hello)`<br><sub>also: !tr</sub> | everyone | Translate text |
| `!github <username>`<br><sub>also: !gh</sub> | everyone | GitHub user profile |
| `!country <name>` | everyone | Facts about a country |
| `!shorten <url>`<br><sub>also: !short, !tinyurl</sub> | everyone | Shorten a link |
| `!ipinfo <ip>`<br><sub>also: !ip</sub> | everyone | Location info for an IP address |
| `!catfact` | everyone | A random cat fact |
| `!dog`<br><sub>also: !doggo</sub> | everyone | A random dog photo |
| `!cat`<br><sub>also: !kitty</sub> | everyone | A random cat photo |

## 👑 Owner (12)

| Command | Who | What it does |
|---|---|---|
| `!mode public\|self` | 👑 owner | public = everyone can use the bot, self = only you |
| `!setprefix <symbol>` | 👑 owner | Change the command prefix |
| `!groups`<br><sub>also: !grouplist</sub> | 👑 owner | Groups the bot is in |
| `!broadcast <message>`<br><sub>also: !bc</sub> | 👑 owner | Send a message to every group |
| `!leave [group id]` | 👑 owner | Make the bot leave this group (or a group ID) |
| `!join <invite link>` | 👑 owner | Join a group from an invite link |
| `!block @user \| number` | 👑 owner | Block a user on WhatsApp |
| `!unblock @user \| number` | 👑 owner | Unblock a user on WhatsApp |
| `!setbio <text>`<br><sub>also: !setstatus</sub> | 👑 owner | Change the bot account's About text |
| `!setbotname <name>` | 👑 owner | Change the bot account's display name |
| `!restart` | 👑 owner | Restart the bot (needs pm2 or a process manager) |
| `!backup` | 👑 owner | Get a copy of the bot database |

## ⚙️ Automatic features

- **Welcome & goodbye messages** — customisable with `!setwelcome` / `!setgoodbye`
- **XP & levels** — members earn XP by chatting; level-up announcements
- **Message counting** — powers `!topchatters` and `!inactive`
- **AFK replies** — tells people when someone they mention is away
- **Anti-link** — deletes links from non-admins and warns them
- **Bad-word filter** — deletes filtered words and warns
- **Anti-spam** — warns people who flood the chat
- **Auto-remove** — members are removed when they hit the warn limit
- **Timed mute** — group unlocks itself when `!mute` ends
- **Reminders** — delivered on time, even after a restart
- **Chat games** — answer by just typing, no prefix needed
- **Per-group settings** and a **bot ban list**
- **Self / public mode** — run it on your own number
- **Auto-reconnect** and saved login
