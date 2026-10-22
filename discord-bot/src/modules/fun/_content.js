'use strict';
/** Local content for the fun category (also used as offline fallbacks for API commands). */

const eightBall = [
  'It is certain.', 'It is decidedly so.', 'Without a doubt.', 'Yes — definitely.', 'You may rely on it.',
  'As I see it, yes.', 'Most likely.', 'Outlook good.', 'Yes.', 'Signs point to yes.',
  'Reply hazy, try again.', 'Ask again later.', 'Better not tell you now.', 'Cannot predict now.', 'Concentrate and ask again.',
  "Don't count on it.", 'My reply is no.', 'My sources say no.', 'Outlook not so good.', 'Very doubtful.',
  'Absolutely, no question.', 'The stars say… maybe.', 'Not in a million years.', 'Only if you believe hard enough.', 'Ask your cat.',
];

const conch = [
  'Maybe someday.', 'Nothing.', 'Neither.', "I don't think so.", 'No.', 'Yes.', 'Try asking again.',
  'Follow the seahorse.', 'Ask again tomorrow.', 'The conch has spoken: no.', 'The conch has spoken: yes.', 'Hmm… nope.',
  'Of course.', 'Never.', 'Probably.', 'Definitely not.', 'All signs point to the Krusty Krab.', 'You already know the answer.',
  'Only on Tuesdays.', 'Go to sleep.',
];

const roasts = [
  "You're the human version of a participation trophy.",
  "I'd agree with you, but then we'd both be wrong.",
  'Your Wi-Fi signal has more personality than you.',
  "You bring everyone so much joy… when you log off.",
  "You're like a cloud: when you disappear, it's a beautiful day.",
  "If laziness were a sport, you'd still find a way to skip practice.",
  'Your search history is just "how to be interesting".',
  "You're proof that even evolution takes breaks.",
  'You have the energy of a phone at 1% battery.',
  "I've seen better comebacks in a loading screen.",
  "You're not stupid — you just have bad luck when thinking.",
  'Your fashion sense is "I got dressed in the dark during an earthquake".',
  "You're the reason shampoo bottles have instructions.",
  'Your typing speed is measured in words per fortnight.',
  "You're like a software update: nobody asked for you and you take forever.",
  "If you were a vegetable, you'd be a cabbage — and not even a fun one.",
  "Your jokes are like a broken pencil: pointless.",
  "You're the plot twist nobody needed.",
  'Even your reflection takes a break sometimes.',
  "You've got something on your chin… no, the third one.",
  'Your playlist is just the same song on shuffle.',
  "You're about as useful as a screen door on a submarine.",
  "Your aim in games is so bad, the enemies feel sorry for you.",
  "You're like Monday mornings: nobody's excited to see you.",
  'Your brain has too many tabs open and they are all frozen.',
  "You're the human equivalent of a 'reply all' email.",
  'Your cooking is so bad, the smoke alarm cheers you on.',
  "You're a limited edition — limited personality, that is.",
  'You run on 2% charm and 98% audacity.',
  'Your selfies need a loading bar.',
];

const compliments = [
  "You're an awesome friend.", 'You light up the room.', 'Your kindness is a balm to everyone who encounters it.',
  "You're more fun than bubble wrap.", 'You have the best laugh.', 'You bring out the best in other people.',
  'Your creativity is contagious.', "You're a great listener.", 'You make the server a better place.',
  "You're even better than a unicorn, because you're real.", 'Your perspective is refreshing.', "You're someone's reason to smile.",
  'You have impeccable taste.', 'Being around you is like a happy little vacation.', 'You could survive a zombie apocalypse.',
  "You're wonderful at figuring things out.", 'Your ideas are brilliant.', "You're like sunshine on a rainy day.",
  'You always know the right thing to say.', "You're braver than you believe.", 'Your vibe is immaculate.',
  "You're the main character, and the plot is great.", 'You make hard things look easy.', 'You have a heart of gold.',
  'Your memes are top-tier.', "You're the human version of a warm hug.", 'Talking to you is the best part of the day.',
  'You inspire people without even trying.', "You're a gift to everyone around you.", 'You have the patience of a saint.',
];

const pickupLines = [
  'Are you a Wi-Fi signal? Because I\'m feeling a connection.',
  'Are you made of copper and tellurium? Because you\'re Cu-Te.',
  'Do you have a map? I keep getting lost in your eyes.',
  "Are you a keyboard? Because you're just my type.",
  'Is your name Google? Because you have everything I\'ve been searching for.',
  "Are you a cat? Because you're purr-fect.",
  "Do you like Star Wars? Because Yoda one for me.",
  'Are you a bank loan? Because you have my interest.',
  "If you were a vegetable, you'd be a cute-cumber.",
  "Are you a campfire? Because you're hot and I want s'more.",
  'Is it hot in here, or is it just the CPU fan?',
  "Are you French? Because Eiffel for you.",
  'You must be a magician, because every time I look at you, everyone else disappears.',
  "Are you a parking ticket? Because you've got 'fine' written all over you.",
  'Do you believe in love at first sight, or should I walk by again?',
  "Are you a 90-degree angle? Because you're looking right.",
  "I'm not a photographer, but I can picture us together.",
  'Are you an exception? Because I want to catch you.',
  "You're so sweet, you'd put Hershey's out of business.",
  "Are you a 404 page? Because I can't find anyone like you.",
  'Is your name Wi-Fi? Because I want to be connected 24/7.',
  'Are you a sunrise? Because you brighten my day.',
  "If you were a fruit, you'd be a fine-apple.",
  "Are you a dictionary? Because you add meaning to my life.",
  'You must be a high test score, because I want to take you home and show my mom.',
  "Are you a light switch? Because you turn me on to great conversation.",
  "Are you a git commit? Because I'd never want to revert you.",
  "Are you a carbon sample? Because I want to date you.",
];

const wyr = [
  ['be able to fly', 'be invisible'], ['live without music', 'live without movies'], ['always be 10 minutes late', 'always be 20 minutes early'],
  ['have unlimited pizza', 'have unlimited tacos'], ['explore space', 'explore the deep ocean'], ['speak every language', 'play every instrument'],
  ['never use social media again', 'never watch TV again'], ['live in the mountains', 'live by the beach'], ['have a rewind button', 'have a pause button for life'],
  ['be a famous musician', 'be a famous scientist'], ['only whisper', 'only shout'], ['have a pet dragon', 'have a pet unicorn'],
  ['be stuck in a comedy movie', 'be stuck in an action movie'], ['know the future', 'change the past'], ['live without coffee', 'live without chocolate'],
  ['have super strength', 'have super speed'], ['be the best player on a losing team', 'the worst player on a winning team'], ['read minds', 'teleport'],
  ['never be cold', 'never be hot'], ['have free Wi-Fi everywhere', 'free food everywhere'], ['talk to animals', 'talk to plants'],
  ['give up your phone for a month', 'give up junk food for a year'], ['live in a treehouse', 'live in a houseboat'], ['always lose at games', 'never get to play games'],
  ['have a personal chef', 'have a personal driver'], ['travel 100 years into the past', '100 years into the future'], ['be a wizard', 'be a superhero'],
  ['only eat breakfast foods', 'never eat breakfast foods again'], ['have a photographic memory', 'be able to forget anything you want'], ['be a pirate', 'be a ninja'],
  ['have a never-ending supply of snacks', 'a never-ending supply of games'], ['sing everything you say', 'dance everywhere you walk'],
];

const thisOrThat = [
  ['Cats', 'Dogs'], ['Coffee', 'Tea'], ['Summer', 'Winter'], ['Pizza', 'Burgers'], ['Books', 'Movies'], ['Morning', 'Night'],
  ['Beach', 'Mountains'], ['Sweet', 'Salty'], ['Console', 'PC'], ['Marvel', 'DC'], ['Call', 'Text'], ['Rain', 'Sunshine'],
  ['City', 'Countryside'], ['Pancakes', 'Waffles'], ['Netflix', 'YouTube'], ['Chocolate', 'Vanilla'], ['Android', 'iPhone'], ['Sneakers', 'Boots'],
  ['Fries', 'Onion rings'], ['Road trip', 'Flight'], ['Board games', 'Video games'], ['Ice cream', 'Cake'], ['Hoodie', 'Jacket'], ['Spicy', 'Mild'],
  ['Dinosaurs', 'Sharks'], ['Space', 'Ocean'], ['Comedy', 'Horror'], ['Early bird', 'Night owl'], ['Sushi', 'Pasta'], ['Lemonade', 'Iced tea'],
];

const truths = [
  "What's the most embarrassing thing you've ever said in a voice chat?", "What's a secret talent nobody here knows about?",
  "What's the last thing you searched online?", "What's your most irrational fear?", "Who was your first celebrity crush?",
  "What's the weirdest food combination you secretly love?", "What's the longest you've gone without showering?",
  "What's something you've lied about to get out of plans?", "What's your guilty-pleasure song?", "What's the most childish thing you still do?",
  "Have you ever pretended to be sick to skip school or work?", "What's the worst gift you've ever received?",
  "What app do you waste the most time on?", "What's a habit you're trying to break?", "What's the dumbest way you've hurt yourself?",
  "What's the most cringe username you've ever had?", "What's something you're proud of but never talk about?",
  "If you could swap lives with someone here for a day, who would it be?", "What's your biggest pet peeve?",
  "What's the strangest dream you remember?", "What's a movie that made you cry?", "What's your worst gaming rage moment?",
  "Have you ever laughed at the wrong moment?", "What's something you believed as a kid that was totally wrong?",
  "What's the most money you've spent on something useless?", "What's the most awkward thing that happened to you in public?",
  "What's your most-used emoji?", "What's one thing you'd change about yourself?", "Have you ever blamed something on a pet?",
  "What's the last thing that made you laugh really hard?",
];

const dares = [
  'Send the third photo in your camera roll (if it is appropriate!).', 'Talk in all caps for the next 5 minutes.',
  'Change your nickname to something the group picks for 1 hour.', 'Send a voice message singing the chorus of a song.',
  'Type your next three messages with your eyes closed.', "Compliment everyone who's online right now.",
  'Use only emojis for your next 5 messages.', 'Share your current desktop or phone wallpaper.', 'Do 15 jumping jacks and report back.',
  'Speak like a pirate for the next 10 minutes.', 'Write a short poem about the last person who messaged.', 'Tell us your worst joke.',
  'Set your status to something silly for 30 minutes.', 'Describe your day as if it were a movie trailer.', 'Do your best impression of a famous character.',
  'Send the last GIF you used.', 'Rate everyone online on a scale of 1 to pizza.', 'Try to lick your elbow and tell us if you succeeded.',
  'Write a haiku about cheese.', 'Spell your name backwards in every message for 5 minutes.', 'Share a fun fact you know off the top of your head.',
  'Hold your breath for 20 seconds right now.', 'Make up a new dance move and describe it.', 'Say the alphabet backwards as fast as you can.',
  'Send a message in a different language (use a translator if needed).', 'Talk only in questions for the next 3 messages.',
  'Draw a cat in 30 seconds and share it.', 'Speak in rhymes for the next 5 messages.', 'Pretend to be a news anchor reporting on the chat.',
  'Share your most-played song right now.',
];

const nhie = [
  'Never have I ever fallen asleep in a class or meeting.', 'Never have I ever stayed up all night gaming.', 'Never have I ever broken a bone.',
  'Never have I ever eaten something off the floor.', 'Never have I ever sent a message to the wrong person.', 'Never have I ever forgotten a friend\'s birthday.',
  'Never have I ever pretended to know a song.', 'Never have I ever cried during a cartoon.', 'Never have I ever been on a rollercoaster.',
  'Never have I ever cheated in a board game.', 'Never have I ever laughed so hard I cried.', 'Never have I ever gotten lost in my own city.',
  'Never have I ever binge-watched a whole season in one day.', 'Never have I ever burned toast.', 'Never have I ever sung in the shower.',
  'Never have I ever talked to a pet like it was a person.', 'Never have I ever walked into a glass door.', 'Never have I ever lost my phone while holding it.',
  'Never have I ever said "you too" when a waiter said "enjoy your meal".', 'Never have I ever rage-quit a game.', 'Never have I ever eaten pizza for breakfast.',
  'Never have I ever had a nickname I hated.', 'Never have I ever forgotten someone\'s name right after meeting them.', 'Never have I ever tripped up the stairs.',
  'Never have I ever made a sandwich at 3 AM.', 'Never have I ever pressed "remind me tomorrow" on an update for a month.', 'Never have I ever read the terms and conditions.',
  'Never have I ever googled myself.', 'Never have I ever slept for more than 12 hours.', 'Never have I ever built a pillow fort.',
];

const riddles = [
  { q: 'What has keys but can\'t open locks?', a: 'A piano' },
  { q: 'What gets wetter the more it dries?', a: 'A towel' },
  { q: 'What has to be broken before you can use it?', a: 'An egg' },
  { q: 'I\'m tall when I\'m young, and short when I\'m old. What am I?', a: 'A candle' },
  { q: 'What month of the year has 28 days?', a: 'All of them' },
  { q: 'What is full of holes but still holds water?', a: 'A sponge' },
  { q: 'What question can you never answer yes to?', a: 'Are you asleep yet?' },
  { q: 'What goes up but never comes down?', a: 'Your age' },
  { q: 'What has one eye but can\'t see?', a: 'A needle' },
  { q: 'What has many teeth but can\'t bite?', a: 'A comb' },
  { q: 'What can you catch but not throw?', a: 'A cold' },
  { q: 'What has hands but can\'t clap?', a: 'A clock' },
  { q: 'What has a head and a tail but no body?', a: 'A coin' },
  { q: 'What building has the most stories?', a: 'A library' },
  { q: 'What can travel around the world while staying in a corner?', a: 'A stamp' },
  { q: 'The more of this there is, the less you see. What is it?', a: 'Darkness' },
  { q: 'What has words but never speaks?', a: 'A book' },
  { q: 'What runs but never walks, has a mouth but never talks?', a: 'A river' },
  { q: 'What can fill a room but takes up no space?', a: 'Light' },
  { q: 'If you drop me I\'m sure to crack, but give me a smile and I\'ll always smile back. What am I?', a: 'A mirror' },
  { q: 'What has a neck but no head?', a: 'A bottle' },
  { q: 'What belongs to you, but other people use it more than you?', a: 'Your name' },
  { q: 'What comes once in a minute, twice in a moment, but never in a thousand years?', a: 'The letter M' },
  { q: 'What has legs but doesn\'t walk?', a: 'A table' },
  { q: 'I shave every day, but my beard stays the same. What am I?', a: 'A barber' },
  { q: 'What can you break, even if you never pick it up or touch it?', a: 'A promise' },
  { q: 'What gets bigger the more you take away from it?', a: 'A hole' },
  { q: 'What kind of band never plays music?', a: 'A rubber band' },
];

const tongueTwisters = [
  'She sells seashells by the seashore.', 'Peter Piper picked a peck of pickled peppers.', 'How much wood would a woodchuck chuck if a woodchuck could chuck wood?',
  'Red lorry, yellow lorry.', 'Unique New York, unique New York, you know you need unique New York.', 'Irish wristwatch, Swiss wristwatch.',
  'Six slippery snails slid slowly seaward.', 'Fuzzy Wuzzy was a bear. Fuzzy Wuzzy had no hair.', 'A proper copper coffee pot.',
  'Toy boat. Toy boat. Toy boat.', 'Betty Botter bought some butter, but she said the butter\'s bitter.', 'Fred fed Ted bread, and Ted fed Fred bread.',
  'I saw Susie sitting in a shoeshine shop.', 'Lesser leather never weathered wetter weather better.', 'Willy\'s real rear wheel.',
  'Eleven benevolent elephants.', 'Truly rural, truly rural.', 'Black background, brown background.', 'A big black bug bit a big black bear.',
  'Which wristwatches are Swiss wristwatches?', 'Scissors sizzle, thistles sizzle.', 'Six sticky skeletons.', 'Greek grapes, Greek grapes, Greek grapes.',
  'Rolling red wagons.', 'Thin sticks, thick bricks.', 'Selfish shellfish.', 'Stupid superstition.', 'Mixed biscuits, mixed biscuits.',
];

const topics = [
  "What's the best game you've played this year?", 'If you could live in any fictional world, which would it be?', "What's a skill you'd love to learn?",
  "What's your go-to comfort food?", 'What would you do with a million dollars?', "What's the best advice you've ever received?",
  "What's your dream vacation?", 'Which superpower would be the most useful in everyday life?', "What's a movie you can watch over and over?",
  "What's the most underrated food?", 'If animals could talk, which would be the rudest?', "What's your favorite season and why?",
  "What's a hobby you picked up recently?", 'If you could have dinner with anyone, who would it be?', "What's the best concert or event you've been to?",
  'Which song is stuck in your head right now?', 'What would your ideal weekend look like?', "What's the funniest thing that happened to you this week?",
  'If you could master one instrument instantly, which one?', 'What fictional character do you relate to the most?', "What's an unpopular opinion you have?",
  'What invention would make your life easier?', "What's your favorite meme of all time?", 'If you opened a restaurant, what would you serve?',
  "What's the best book you've ever read?", 'Pineapple on pizza: yes or no? Defend your answer.', "What's your favorite way to spend a rainy day?",
  "What's a small thing that makes you really happy?", 'If you could instantly become an expert in something, what would it be?', "What's the coolest place you've ever visited?",
];

const fortunes = [
  'A pleasant surprise is waiting for you.', 'Your hard work is about to pay off.', 'Good news will come to you from far away.',
  'Now is a good time to try something new.', 'A smile is your best accessory today.', 'An old friend will reach out soon.',
  'Your creativity will lead you to success.', 'Adventure is on the horizon.', 'You will find what you lost when you stop looking.',
  'A lucky number for you today is 7.', 'Someone is thinking kind thoughts about you.', 'You will soon solve a problem that has puzzled you.',
  'Patience is your superpower this week.', 'Take the chance — fortune favors the bold.', 'Your next snack will be exceptionally delicious.',
  'A small act of kindness will come back to you.', 'Today is a great day to learn something new.', 'You will win your next game. Probably.',
  'Your Wi-Fi will be strong and your ping low.', 'Laughter is in your near future.', 'The answer you seek is closer than you think.',
  'A new friendship will bring you joy.', 'Trust your instincts today.', 'Big things come in small packages.', 'Your talents will be recognized.',
  'Today you will find a reason to dance.', 'A good book will find its way to you.', 'Your future is as bright as your screen at 3 AM.',
  'Every exit is an entrance somewhere else.', 'You will discover a new favorite song.',
];

const jokes = [
  { setup: "Why don't scientists trust atoms?", punchline: 'Because they make up everything.' },
  { setup: 'Why did the scarecrow win an award?', punchline: 'Because he was outstanding in his field.' },
  { setup: 'What do you call fake spaghetti?', punchline: 'An impasta.' },
  { setup: 'Why did the bicycle fall over?', punchline: 'Because it was two-tired.' },
  { setup: 'What do you call a bear with no teeth?', punchline: 'A gummy bear.' },
  { setup: "Why can't you give Elsa a balloon?", punchline: 'Because she will let it go.' },
  { setup: 'What do you call a fish wearing a bowtie?', punchline: 'Sofishticated.' },
  { setup: 'Why did the math book look sad?', punchline: 'Because it had too many problems.' },
  { setup: 'What do you call cheese that isn\'t yours?', punchline: 'Nacho cheese.' },
  { setup: 'Why did the golfer bring two pairs of pants?', punchline: 'In case he got a hole in one.' },
  { setup: 'How does a penguin build its house?', punchline: 'Igloos it together.' },
  { setup: 'Why are skeletons so calm?', punchline: 'Because nothing gets under their skin.' },
  { setup: 'What did the ocean say to the beach?', punchline: 'Nothing, it just waved.' },
  { setup: 'Why did the cookie go to the doctor?', punchline: 'Because it felt crummy.' },
  { setup: 'What do you call a sleeping dinosaur?', punchline: 'A dino-snore.' },
  { setup: 'Why did the tomato blush?', punchline: 'Because it saw the salad dressing.' },
  { setup: 'What do you call a dog magician?', punchline: 'A labracadabrador.' },
  { setup: 'Why don\'t eggs tell jokes?', punchline: 'They\'d crack each other up.' },
  { setup: 'What has four wheels and flies?', punchline: 'A garbage truck.' },
  { setup: 'Why was the broom late?', punchline: 'It swept in.' },
  { setup: 'What do you call a can opener that doesn\'t work?', punchline: 'A can\'t opener.' },
  { setup: 'Why did the coffee file a police report?', punchline: 'It got mugged.' },
  { setup: 'How do you organize a space party?', punchline: 'You planet.' },
  { setup: 'Why did the stadium get hot after the game?', punchline: 'All of the fans left.' },
  { setup: 'What do you call a pile of cats?', punchline: 'A meow-ntain.' },
  { setup: 'I\'m reading a book about anti-gravity.', punchline: "It's impossible to put down." },
  { setup: 'Why couldn\'t the leopard play hide and seek?', punchline: 'Because he was always spotted.' },
];

const programmingJokes = [
  { setup: 'Why do programmers prefer dark mode?', punchline: 'Because light attracts bugs.' },
  { setup: 'How many programmers does it take to change a light bulb?', punchline: "None, that's a hardware problem." },
  { setup: 'Why do Java developers wear glasses?', punchline: "Because they don't C#." },
  { setup: 'What is a programmer\'s favorite hangout place?', punchline: 'Foo Bar.' },
  { setup: 'Why did the developer go broke?', punchline: 'Because he used up all his cache.' },
  { setup: 'A SQL query walks into a bar, walks up to two tables and asks…', punchline: '"Can I join you?"' },
  { setup: 'Why was the JavaScript developer sad?', punchline: "Because he didn't Node how to Express himself." },
  { setup: 'What do you call 8 hobbits?', punchline: 'A hobbyte.' },
  { setup: 'There are 10 types of people in the world…', punchline: 'Those who understand binary and those who don\'t.' },
  { setup: 'Why did the programmer quit his job?', punchline: "Because he didn't get arrays." },
  { setup: 'What\'s the object-oriented way to become wealthy?', punchline: 'Inheritance.' },
  { setup: 'Why do Python programmers have low self-esteem?', punchline: "They're constantly comparing their self to other." },
  { setup: 'How do you comfort a JavaScript bug?', punchline: 'You console it.' },
  { setup: 'Why did the functions stop calling each other?', punchline: 'Because they had constant arguments.' },
  { setup: 'Knock knock. Race condition.', punchline: "Who's there?" },
  { setup: 'Why was the computer cold?', punchline: 'It left its Windows open.' },
  { setup: "What's a computer's favorite snack?", punchline: 'Microchips.' },
  { setup: 'Why did the private class variable break up with the public one?', punchline: 'It needed some space to encapsulate its feelings.' },
  { setup: 'What did the router say to the doctor?', punchline: 'It hurts when IP.' },
  { setup: "Why don't programmers like nature?", punchline: 'It has too many bugs.' },
  { setup: 'How do you tell an introverted programmer from an extroverted one?', punchline: "The extrovert looks at YOUR shoes while talking." },
  { setup: 'Why was the developer unhappy at their job?', punchline: 'They wanted arrays.' },
  { setup: 'What did the Git commit say to the developer?', punchline: '"I\'m not mad, I\'m just staged."' },
  { setup: 'Why did the developer cross the road?', punchline: 'To get to the other IDE.' },
  { setup: 'What is the most used language in programming?', punchline: 'Profanity.' },
  { setup: 'Why did the CSS developer go to therapy?', punchline: "They couldn't find their center." },
];

const knockKnock = [
  ['Lettuce', "Lettuce in, it's cold out here!"], ['Boo', "Don't cry, it's just a joke!"], ['Cow says', 'No, a cow says moo!'],
  ['Olive', 'Olive you and I miss you!'], ['Atch', 'Bless you!'], ['Tank', "You're welcome!"], ['Interrupting cow', 'MOO!'],
  ['Orange', "Orange you glad I didn't say banana?"], ['Harry', 'Harry up and answer the door!'], ['Lettuce', 'Lettuce tell you some jokes!'],
  ['Annie', 'Annie thing you can do, I can do better!'], ['Wooden shoe', 'Wooden shoe like to hear another joke?'], ['Nana', 'Nana your business!'],
  ['Hawaii', "I'm fine, Hawaii you?"], ['Ice cream', 'Ice cream if you don\'t let me in!'], ['Justin', 'Justin time for dinner!'],
  ['Figs', 'Figs the doorbell, it\'s broken!'], ['Water', 'Water you doing? Let me in!'], ['Candice', 'Candice door open, or what?'],
  ['Alpaca', 'Alpaca the trunk, you pack the suitcase!'], ['Dishes', 'Dishes the police, open up!'], ['Howl', 'Howl you know unless you open the door?'],
  ['Woo', "Don't get so excited, it's just a joke."], ['Kanga', 'Actually, it\'s kangaroo.'], ['Europe', "No, you're a poo!"], ['Says', 'Says me, that\'s who!'],
];

const chuckNorris = [
  'Chuck Norris counted to infinity. Twice.', 'Chuck Norris can slam a revolving door.', 'Chuck Norris doesn\'t read books. He stares them down until he gets the information he wants.',
  'When Chuck Norris does a push-up, he isn\'t lifting himself up — he\'s pushing the Earth down.', 'Chuck Norris can divide by zero.',
  'Death once had a near-Chuck-Norris experience.', 'Chuck Norris can unscramble an egg.', 'Chuck Norris\'s keyboard doesn\'t have a Ctrl key, because nothing controls Chuck Norris.',
  'Chuck Norris can win a game of Connect Four in three moves.', 'Time waits for no one. Unless that one is Chuck Norris.', 'Chuck Norris can hear sign language.',
  'Chuck Norris makes onions cry.', 'Chuck Norris can speak Braille.', 'Chuck Norris doesn\'t need a debugger. Bugs confess on their own.',
  'Chuck Norris\'s code compiles before he writes it.', 'Chuck Norris can kill two stones with one bird.', 'The dark is afraid of Chuck Norris.',
  'Chuck Norris can strangle you with a cordless phone.', 'Chuck Norris once kicked a horse in the chin. Its descendants are known today as giraffes.',
  'Chuck Norris can sneeze with his eyes open.', 'Chuck Norris doesn\'t wear a watch. He decides what time it is.', 'Chuck Norris can clap with one hand.',
  'Chuck Norris finished the internet.', 'Chuck Norris can do a wheelie on a unicycle.', 'Chuck Norris can lead a horse to water AND make it drink.',
  'Chuck Norris\'s tears cure diseases. Too bad he has never cried.',
];

const facts = [
  'Honey never spoils — edible honey has been found in ancient Egyptian tombs.', 'Octopuses have three hearts.', 'Botanically, bananas are berries, but strawberries are not.',
  'A day on Venus is longer than a year on Venus.', 'Wombat poop is cube-shaped.', 'The Eiffel Tower can grow about 15 cm taller in summer due to heat expansion.',
  'Sharks have existed longer than trees.', 'There are more possible chess games than atoms in the observable universe.', 'A group of flamingos is called a "flamboyance".',
  "Scotland's national animal is the unicorn.", 'The shortest war in history, between Britain and Zanzibar in 1896, lasted under an hour.',
  'Cleopatra lived closer in time to the Moon landing than to the building of the Great Pyramid of Giza.', 'Sea otters hold hands while sleeping so they don\'t drift apart.',
  'The dot over a lowercase "i" or "j" is called a tittle.', 'Oxford University is older than the Aztec Empire.', 'A bolt of lightning is about five times hotter than the surface of the Sun.',
  'Butterflies taste with their feet.', 'Peanuts are legumes, not nuts.', 'The inventor of the Pringles can was buried in one.', 'Koalas have fingerprints very similar to human fingerprints.',
  'Venus is the hottest planet in the solar system, even though Mercury is closer to the Sun.', 'Saturn is less dense than water.', 'The Great Wall of China is not visible to the naked eye from the Moon.',
  "An ostrich's eye is bigger than its brain.", 'The first recorded use of the word "nerd" was in a Dr. Seuss book from 1950.', 'Hot water can sometimes freeze faster than cold water — this is called the Mpemba effect.',
  'A group of crows is called a murder.', 'The Moon is slowly drifting away from Earth, about 3.8 cm per year.', 'Bees can recognize human faces.', 'Some metals, like sodium and potassium, react explosively with water.',
];

const quotes = [
  { q: 'The only way to do great work is to love what you do.', a: 'Steve Jobs' }, { q: 'The unexamined life is not worth living.', a: 'Socrates' },
  { q: 'I think, therefore I am.', a: 'René Descartes' }, { q: 'The only thing we have to fear is fear itself.', a: 'Franklin D. Roosevelt' },
  { q: 'Darkness cannot drive out darkness; only light can do that. Hate cannot drive out hate; only love can do that.', a: 'Martin Luther King Jr.' },
  { q: 'Stay hungry, stay foolish.', a: 'Steve Jobs' }, { q: 'Imagination is more important than knowledge.', a: 'Albert Einstein' },
  { q: 'To be, or not to be, that is the question.', a: 'William Shakespeare' }, { q: 'We are what we repeatedly do. Excellence, then, is not an act, but a habit.', a: 'Will Durant' },
  { q: 'The journey of a thousand miles begins with one step.', a: 'Lao Tzu' }, { q: 'The best way to predict the future is to invent it.', a: 'Alan Kay' },
  { q: 'Talk is cheap. Show me the code.', a: 'Linus Torvalds' }, { q: 'Premature optimization is the root of all evil.', a: 'Donald Knuth' },
  { q: 'Any sufficiently advanced technology is indistinguishable from magic.', a: 'Arthur C. Clarke' }, { q: 'Not all those who wander are lost.', a: 'J.R.R. Tolkien' },
  { q: 'Do. Or do not. There is no try.', a: 'Yoda' }, { q: "Life is what happens to you while you're busy making other plans.", a: 'John Lennon' },
  { q: 'Programs must be written for people to read, and only incidentally for machines to execute.', a: 'Harold Abelson' },
  { q: 'In three words I can sum up everything I\'ve learned about life: it goes on.', a: 'Robert Frost' },
  { q: 'Hope is the thing with feathers that perches in the soul.', a: 'Emily Dickinson' }, { q: "You miss 100% of the shots you don't take.", a: 'Wayne Gretzky' },
  { q: 'Float like a butterfly, sting like a bee.', a: 'Muhammad Ali' }, { q: 'There is nothing either good or bad, but thinking makes it so.', a: 'William Shakespeare' },
  { q: 'Well done is better than well said.', a: 'Benjamin Franklin' }, { q: 'Fall seven times, stand up eight.', a: 'Japanese proverb' },
  { q: 'If you want to go fast, go alone. If you want to go far, go together.', a: 'African proverb' }, { q: 'Knowledge is power.', a: 'Francis Bacon' },
  { q: 'Science is a way of thinking much more than it is a body of knowledge.', a: 'Carl Sagan' },
];

const advice = [
  'Drink a glass of water — you probably need it.', 'Back up your files before you need to.', "Don't compare your chapter 1 to someone else's chapter 20.",
  'Sleep is a feature, not a bug.', 'When in doubt, take a short walk.', 'Write things down; your memory is not a database.', 'Say thank you more often.',
  'Read the error message before googling it.', "It's okay to ask for help.", 'Done is better than perfect.', 'Stretch every hour you sit at a desk.',
  'Learn to cook one meal really well.', "If it takes less than two minutes, do it now.", 'Be kind; everyone is fighting a battle you know nothing about.',
  'Use a password manager.', 'Call your family once in a while.', 'Never skip leg day — or breakfast, for that matter.', 'Keep a list of small wins.',
  'Practice makes progress.', 'Turn off notifications you never read.', 'Listen more than you speak.', 'Clean as you go.',
  'The best time to start was yesterday; the next best time is now.', "Don't reply to important messages when you're angry.", 'Celebrate other people\'s success.',
  'Always carry a snack.', 'Go outside and touch some grass — it\'s nice.',
];

const puns = [
  "I used to be a banker, but I lost interest.", "I'm reading a book on the history of glue — I can't put it down.", "Time flies like an arrow. Fruit flies like a banana.",
  "I'm on a seafood diet. I see food and I eat it.", "Don't trust stairs. They're always up to something.", "I would tell you a construction joke, but I'm still working on it.",
  "A bicycle can't stand on its own because it's two-tired.", "I'm terrified of elevators, so I'm taking steps to avoid them.", 'The rotation of Earth really makes my day.',
  "I wasn't originally going to get a brain transplant, but then I changed my mind.", 'Did you hear about the claustrophobic astronaut? He just needed a little space.',
  "I lost my job at the bank on my first day. A woman asked me to check her balance, so I pushed her over.", 'I once got fired from a canned juice company. Apparently I couldn\'t concentrate.',
  "What do you call a belt made of watches? A waist of time.", 'The past, present and future walked into a bar. It was tense.', "I'm good friends with 25 letters of the alphabet. I don't know Y.",
  "A boiled egg every morning is hard to beat.", 'Velcro — what a rip-off!', 'I can\'t believe I got fired from the calendar factory. All I did was take a day off.',
  'What do you call a factory that makes okay products? A satisfactory.', 'I used to hate facial hair, but then it grew on me.', 'The man who invented the knock-knock joke won the No-bell prize.',
  'Atheism is a non-prophet organization.', "Why don't skeletons fight each other? They don't have the guts.", "I'm no cheetah — you're lion!", 'Never trust an atom; they make up everything.',
];

const excuses = [
  'My Wi-Fi was haunted.', 'My cat sat on my keyboard and deleted everything.', 'I was abducted by aliens, but they returned me — with snacks.',
  'Mercury is in retrograde.', 'My alarm clock is on strike.', 'I was stuck in a very long YouTube tutorial.', 'My dog ate my charger.',
  'I accidentally joined a flash mob.', 'The update took 3 hours and then needed another update.', 'I got lost in my own house.', 'A squirrel stole my keys.',
  'I was busy being productive in a parallel universe.', 'My code compiled on the first try and I was in shock.', 'My shoelaces were in a feud.',
  'I was helping a turtle cross the road. It took a while.', 'My plant needed emotional support.', 'The elevator was taking the stairs.',
  'I fell asleep on the bus and woke up in another city.', 'I was in a staring contest with my reflection. I lost.', 'My time machine is still in beta.',
  'A pigeon looked at me funny and I had to process that.', "I couldn't find matching socks.", 'My game had a mandatory 2-hour cutscene.', 'My mom said no.',
  'I was trapped under a heavy blanket of comfort.', 'My keyboard ran out of vowels.',
];

const superpowers = [
  'Talking to animals 🐾', 'Teleportation 🌀', 'Invisibility 👻', 'Super speed ⚡', 'Flight 🕊️', 'Time travel ⏳', 'Mind reading 🧠', 'Super strength 💪',
  'Shapeshifting 🦎', 'Breathing underwater 🌊', 'Controlling the weather ⛈️', 'Healing others ❤️‍🩹', 'Perfect memory 📚', 'Never needing sleep 🌙',
  'Speaking every language 🌍', 'Summoning snacks at will 🍪', 'Always having full phone battery 🔋', 'Instantly mastering any skill 🎯', 'Freezing time ⏸️',
  'Talking to plants 🌱', 'Making anyone laugh 😂', 'Infinite Wi-Fi range 📶', 'X-ray vision 👁️', 'Duplicating yourself 👥', 'Controlling fire 🔥',
  'Elasticity 🧘', 'Night vision 🦉', 'Finding anything that is lost 🔎',
];

const spiritAnimals = [
  ['🦉 Owl', 'wise, observant, and secretly awake at 3 AM'], ['🐺 Wolf', 'loyal to the pack and fiercely independent'], ['🦊 Fox', 'clever, curious and a little mischievous'],
  ['🐻 Bear', 'strong, protective and a big fan of naps'], ['🐬 Dolphin', 'playful, social and always in a good mood'], ['🐢 Turtle', 'patient, calm and steady wins the race'],
  ['🦁 Lion', 'brave, confident and born to lead'], ['🐱 Cat', 'independent, graceful and judges everyone silently'], ['🐶 Dog', 'loyal, enthusiastic and everyone\'s best friend'],
  ['🦋 Butterfly', 'always growing and changing for the better'], ['🐼 Panda', 'chill, cuddly and powered by snacks'], ['🦅 Eagle', 'focused, ambitious and sees the big picture'],
  ['🐙 Octopus', 'a creative multitasker with too many tabs open'], ['🐧 Penguin', 'awkward on land, unstoppable in their element'], ['🦥 Sloth', 'living life at their own peaceful pace'],
  ['🐝 Bee', 'hardworking, organized and a great team player'], ['🦄 Unicorn', 'one of a kind, magical and a little extra'], ['🐸 Frog', 'adaptable and always ready to leap'],
  ['🐘 Elephant', 'never forgets and cares deeply about family'], ['🦦 Otter', 'playful, affectionate and holds hands'], ['🐿️ Squirrel', 'energetic, prepared and always snacking'],
  ['🦈 Shark', 'focused and unstoppable once they have a goal'], ['🐨 Koala', 'cozy, relaxed and a professional sleeper'], ['🦜 Parrot', 'chatty, colorful and the life of the party'],
  ['🐉 Dragon', 'legendary, powerful and slightly dramatic'], ['🦔 Hedgehog', 'prickly on the outside, sweet on the inside'], ['🐋 Whale', 'gentle, deep-thinking and calm'],
  ['🐇 Rabbit', 'quick-thinking, lucky and full of energy'], ['🦩 Flamingo', 'stylish, confident and stands out in any crowd'], ['🐌 Snail', 'carries their comfort zone everywhere'],
];

const showerThoughts = [
  'Your stomach thinks all potatoes are mashed.', 'A lot of people get up before their alarm just to turn it off.', 'Nothing is on fire. Fire is on things.',
  'The word "swims" upside down is still "swims".', 'If you rip a hole in a net, there are fewer holes in it than before.', 'Your future self is watching you right now through memories.',
  'Every time you clean something, you make something else dirty.', 'The brain named itself.', 'Lawyers hope you get sued, doctors hope you get sick.',
  'Tomatoes are a fruit, so ketchup is technically a smoothie.', 'Birthdays are just a countdown that resets.', 'Every photo of the Moon is technically a photo of the past.',
  'You have never seen your own face, only reflections and pictures.', 'Clapping is just hitting yourself because you like something.', 'The "S" in "lisp" is just cruel.',
  'A "fire hydrant" would be a water hydrant if words made sense.', 'Somewhere, someone is having the best day of their life right now.', 'Maybe plants are farming us by giving us oxygen.',
  'An escalator can never break; it can only become stairs.', 'Fruit flies like bananas, so do people.', 'The person who named the "dashboard" was really fast.',
  'Your age is just how many laps you\'ve done around the Sun.', 'Silent letters are like secret agents.', 'Pirates had eye patches; we have dark mode.',
  'Every single person you meet knows something you don\'t.', 'You only see stars because the sky is mostly empty.',
];

const motivation = [
  "You don't have to be great to start, but you have to start to be great.", 'Small progress is still progress.', 'Believe you can and you\'re halfway there.',
  'Every expert was once a beginner.', 'Discipline is choosing what you want most over what you want now.', 'Your only limit is you.',
  'Success is the sum of small efforts repeated day in and day out.', "Don't watch the clock; do what it does — keep going.", 'Great things never come from comfort zones.',
  'Dream big. Start small. Act now.', 'You are capable of amazing things.', 'Mistakes are proof that you are trying.', 'One day or day one — you decide.',
  'Stop doubting yourself. Work hard and make it happen.', "It's going to be hard, but hard does not mean impossible.", 'Be stronger than your excuses.',
  "Rest if you must, but don't quit.", 'The comeback is always stronger than the setback.', 'Focus on progress, not perfection.', 'Today is a good day to have a good day.',
  'You are one decision away from a totally different life.', 'Fall in love with the process and the results will come.', 'Push yourself, because no one else is going to do it for you.',
  'Turn your can\'ts into cans and your dreams into plans.', 'The secret of getting ahead is getting started.', 'You got this. Seriously.',
];

const horoscope = {
  signs: {
    aries: '♈', taurus: '♉', gemini: '♊', cancer: '♋', leo: '♌', virgo: '♍', libra: '♎', scorpio: '♏', sagittarius: '♐', capricorn: '♑', aquarius: '♒', pisces: '♓',
  },
  openers: [
    'The stars are aligned in your favor today.', 'A curious energy surrounds you.', 'Today the universe asks you to slow down.', 'Change is in the air.',
    'Your confidence is shining brighter than usual.', 'The Moon whispers of new beginnings.', 'A quiet day hides a happy surprise.', 'Your intuition is extra sharp today.',
  ],
  middles: [
    'A conversation with a friend could spark a great idea.', 'Focus on one task at a time and you will get far.', 'Someone appreciates you more than they say.',
    'Avoid starting arguments in the group chat.', 'Your creativity will help you solve an old problem.', 'Treat yourself to your favorite snack.',
    'An unexpected message brings good vibes.', 'Take a break from screens for a few minutes and breathe.', 'Say yes to something new.',
  ],
  closers: [
    'Lucky color: {color}. Lucky number: {num}.', 'Best time for good decisions: around {hour}:00.', 'Your lucky emoji today: {emoji}.',
    'Keep an eye out for the number {num}.', 'Wear something {color} for extra luck.',
  ],
  colors: ['blue', 'green', 'gold', 'purple', 'red', 'silver', 'orange', 'pink', 'teal', 'white'],
  emojis: ['🍀', '⭐', '🌈', '🔥', '🌙', '🎯', '💎', '🌻', '🎲', '🦋'],
};

module.exports = {
  eightBall, conch, roasts, compliments, pickupLines, wyr, thisOrThat, truths, dares, nhie, riddles, tongueTwisters, topics, fortunes,
  jokes, programmingJokes, knockKnock, chuckNorris, facts, quotes, advice, puns, excuses, superpowers, spiritAnimals, showerThoughts, motivation, horoscope,
};
