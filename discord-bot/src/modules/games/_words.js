'use strict';
/** Word lists for wordle / hangman / scramble / typerace / wordchain. */

// 600+ common five-letter words (wordle answers; any 5-letter guess is accepted).
const FIVE = 'about above abuse actor acute admit adopt adult after again agent agree ahead alarm album alert alike alive allow alone along alter amber among angel anger angle angry apart apple apply arena argue arise array arrow aside asset audio audit avoid award aware awful bacon badge basic basin beach beard beast begin being belly below bench berry birth black blade blame blank blast blaze bleak blend bless blind block blond blood bloom blown board boost booth bound brain brand brave bread break breed brick bride brief bring broad brook broom brown brush build built bunch burst cabin cable camel candy canoe cargo carry catch cause chain chair chalk charm chart chase cheap check cheek cheer chess chest chief child chill choir chord civil claim clash class clean clear clerk click cliff climb clock close cloth cloud coach coast cobra cocoa color comet coral couch count court cover crack craft crane crash crate crawl crazy cream crime crisp cross crowd crown crush curve cycle daily dairy dance delay depth diary dizzy dodge donor doubt dough draft drain drama dream dress drift drill drink drive eager eagle early earth eight elbow elder elite empty enjoy enter entry equal error essay event every exact exist extra fable faith false fancy feast fence fever field fifty fight final flame flash fleet flesh float flock flood floor flour fluid flute focus force forge forth forty forum frame fresh front frost fruit funny fuzzy giant glass globe glove grace grade grain grand grant grape graph grass great green greet grill group guard guess guest guide habit happy harsh heart heavy hedge hello hobby honey honor horse hotel house human humor hurry ideal image index inner input irony issue ivory jelly jewel joint judge juice jumbo knife knock label labor laser later laugh layer learn lemon level light limit linen liver local lodge logic loyal lucky lunar lunch magic major maker mango maple march match mayor medal media melon mercy metal meter might minor mixer model money month moral motor mount mouse mouth movie muddy music naval nerve never night ninja noble noise north novel nurse ocean offer often olive onion opera orbit order organ other otter ought outer owner oxide paint panda panel paper party pasta patch pause peace peach pearl pedal penny phase phone photo piano piece pilot pinch pizza place plain plane plant plate plaza point polar porch pound power press price pride prime print prize proof proud pulse punch pupil puppy purse queen quick quiet quilt quite radar radio rainy raise rally ranch range rapid raven reach react ready realm rebel relax reply rider ridge rifle right rival river roast robin robot rocky rough round route royal rugby ruler rural salad salon sauce scale scare scarf scene scent scope score scout screw sense serve seven shade shake shape share shark sharp sheep shelf shell shift shine shirt shock shore short shout sight silly since skate skill skirt slate sleep slice slide slope smart smile smoke snack snake solar solid solve sound south space spare spark speak speed spell spend spice spike spine spoon sport spray squad stack staff stage stair stamp stand start state steak steam steel steep stick still stone stool store storm story stove strap straw strip study style sugar suite sunny super swamp sweet swift swing sword syrup table taste teach tempo thank theme thick thing think third thumb tiger toast today token tooth topic torch total touch tough tower toxic track trade trail train treat trend trial tribe trick truck truly trust truth tulip twist uncle under union unity upper urban usual valid value vapor vault video vigor viral visit vital vivid vocal voice wagon waste watch water whale wheat wheel while white whole woman world worry worth wrist yacht yield young youth zebra'.split(' ');

const HANGMAN = {
  animals: 'elephant giraffe kangaroo penguin dolphin octopus cheetah hedgehog squirrel flamingo crocodile butterfly chameleon porcupine armadillo rhinoceros hippopotamus jellyfish gorilla leopard'.split(' '),
  food: 'pancake spaghetti avocado broccoli pineapple sandwich chocolate cinnamon blueberry croissant pepperoni hamburger lasagna pretzel strawberry watermelon cucumber mushroom popcorn burrito'.split(' '),
  countries: 'argentina australia brazil canada denmark ethiopia finland germany iceland indonesia jamaica kenya morocco netherlands norway portugal singapore switzerland thailand vietnam'.split(' '),
  tech: 'keyboard computer internet algorithm database javascript browser software hardware network compiler variable function terminal processor bluetooth satellite password download robotics'.split(' '),
  space: 'astronaut galaxy telescope asteroid universe gravity meteorite constellation nebula planet comet satellite spaceship jupiter saturn mercury eclipse orbit rocket supernova'.split(' '),
  sports: 'basketball football volleyball badminton skateboard swimming marathon cycling gymnastics wrestling archery baseball snowboard climbing surfing hockey tennis boxing karate cricket'.split(' '),
};

const SENTENCES = [
  'The quick brown fox jumps over the lazy dog.',
  'Practice makes progress, not perfection.',
  'A journey of a thousand miles begins with a single step.',
  'Pack my box with five dozen liquor jugs.',
  'Every great developer you know got there by solving problems.',
  'The early bird catches the worm, but the second mouse gets the cheese.',
  'Sphinx of black quartz, judge my vow.',
  'How vexingly quick daft zebras jump!',
  'Typing fast is fun when you do not have to look at the keyboard.',
  'Bright stars twinkle above the quiet mountain lake tonight.',
  'Coffee in the morning makes everything a little bit better.',
  'Never underestimate the power of a good nap.',
  'The best way to learn something is to teach it to someone else.',
  'Cats are liquid when they sit inside a cardboard box.',
  'Pizza is a circle, cut into triangles, served in a square.',
  'Waves crashed against the rocks as the sun slowly set.',
  'Discord servers are better with friendly people and good bots.',
  'Keep calm and keep typing until the very last word.',
  'An apple a day keeps the doctor away, or so they say.',
  'Jackdaws love my big sphinx of quartz.',
  'Rain on the window sounds like a soft drum roll.',
  'Dragons guard treasure deep within the misty mountains.',
  'Water boils at one hundred degrees Celsius at sea level.',
  'She packed a sandwich, a book, and an umbrella for the trip.',
  'The museum was quiet except for the echo of footsteps.',
];

module.exports = { FIVE, HANGMAN, SENTENCES };
