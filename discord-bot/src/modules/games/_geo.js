'use strict';
/** [ISO 3166-1 alpha-2, country, capital] — capital is null where it is disputed/ambiguous (flag quiz only). */
const COUNTRIES = [
  ['US', 'United States', 'Washington, D.C.'], ['CA', 'Canada', 'Ottawa'], ['MX', 'Mexico', 'Mexico City'], ['BR', 'Brazil', 'Brasília'],
  ['AR', 'Argentina', 'Buenos Aires'], ['CL', 'Chile', 'Santiago'], ['PE', 'Peru', 'Lima'], ['CO', 'Colombia', 'Bogotá'],
  ['VE', 'Venezuela', 'Caracas'], ['UY', 'Uruguay', 'Montevideo'], ['PY', 'Paraguay', 'Asunción'], ['EC', 'Ecuador', 'Quito'],
  ['BO', 'Bolivia', null], ['CU', 'Cuba', 'Havana'], ['JM', 'Jamaica', 'Kingston'], ['GB', 'United Kingdom', 'London'],
  ['IE', 'Ireland', 'Dublin'], ['FR', 'France', 'Paris'], ['DE', 'Germany', 'Berlin'], ['ES', 'Spain', 'Madrid'],
  ['PT', 'Portugal', 'Lisbon'], ['IT', 'Italy', 'Rome'], ['NL', 'Netherlands', 'Amsterdam'], ['BE', 'Belgium', 'Brussels'],
  ['CH', 'Switzerland', 'Bern'], ['AT', 'Austria', 'Vienna'], ['PL', 'Poland', 'Warsaw'], ['CZ', 'Czechia', 'Prague'],
  ['SK', 'Slovakia', 'Bratislava'], ['HU', 'Hungary', 'Budapest'], ['RO', 'Romania', 'Bucharest'], ['BG', 'Bulgaria', 'Sofia'],
  ['GR', 'Greece', 'Athens'], ['TR', 'Turkey', 'Ankara'], ['SE', 'Sweden', 'Stockholm'], ['NO', 'Norway', 'Oslo'],
  ['FI', 'Finland', 'Helsinki'], ['DK', 'Denmark', 'Copenhagen'], ['IS', 'Iceland', 'Reykjavík'], ['EE', 'Estonia', 'Tallinn'],
  ['LV', 'Latvia', 'Riga'], ['LT', 'Lithuania', 'Vilnius'], ['UA', 'Ukraine', 'Kyiv'], ['HR', 'Croatia', 'Zagreb'],
  ['RS', 'Serbia', 'Belgrade'], ['SI', 'Slovenia', 'Ljubljana'], ['EG', 'Egypt', 'Cairo'], ['MA', 'Morocco', 'Rabat'],
  ['DZ', 'Algeria', 'Algiers'], ['TN', 'Tunisia', 'Tunis'], ['NG', 'Nigeria', 'Abuja'], ['GH', 'Ghana', 'Accra'],
  ['KE', 'Kenya', 'Nairobi'], ['ET', 'Ethiopia', 'Addis Ababa'], ['ZA', 'South Africa', null], ['UG', 'Uganda', 'Kampala'],
  ['SN', 'Senegal', 'Dakar'], ['CN', 'China', 'Beijing'], ['JP', 'Japan', 'Tokyo'], ['KR', 'South Korea', 'Seoul'],
  ['IN', 'India', 'New Delhi'], ['PK', 'Pakistan', 'Islamabad'], ['BD', 'Bangladesh', 'Dhaka'], ['ID', 'Indonesia', null],
  ['MY', 'Malaysia', 'Kuala Lumpur'], ['TH', 'Thailand', 'Bangkok'], ['VN', 'Vietnam', 'Hanoi'], ['PH', 'Philippines', 'Manila'],
  ['SG', 'Singapore', 'Singapore'], ['SA', 'Saudi Arabia', 'Riyadh'], ['AE', 'United Arab Emirates', 'Abu Dhabi'], ['IR', 'Iran', 'Tehran'],
  ['IQ', 'Iraq', 'Baghdad'], ['JO', 'Jordan', 'Amman'], ['LB', 'Lebanon', 'Beirut'], ['QA', 'Qatar', 'Doha'],
  ['KW', 'Kuwait', 'Kuwait City'], ['AU', 'Australia', 'Canberra'], ['NZ', 'New Zealand', 'Wellington'], ['NP', 'Nepal', 'Kathmandu'],
  ['AF', 'Afghanistan', 'Kabul'], ['KZ', 'Kazakhstan', 'Astana'], ['MN', 'Mongolia', 'Ulaanbaatar'], ['FJ', 'Fiji', 'Suva'],
  ['PG', 'Papua New Guinea', 'Port Moresby'], ['NO', 'Norway', 'Oslo'], ['LU', 'Luxembourg', 'Luxembourg'], ['MT', 'Malta', 'Valletta'],
  ['CY', 'Cyprus', 'Nicosia'], ['GE', 'Georgia', 'Tbilisi'], ['AM', 'Armenia', 'Yerevan'], ['AZ', 'Azerbaijan', 'Baku'],
  ['CR', 'Costa Rica', 'San José'], ['PA', 'Panama', 'Panama City'], ['DO', 'Dominican Republic', 'Santo Domingo'], ['TZ', 'Tanzania', 'Dodoma'],
].filter((c, i, arr) => arr.findIndex((x) => x[0] === c[0]) === i);

const flagOf = (code) => String.fromCodePoint(...[...code.toUpperCase()].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));

const EMOJI_PUZZLES = [
  ['🦁👑', ['the lion king', 'lion king']], ['🕷️🧑', ['spider-man', 'spiderman', 'spider man']], ['❄️👸⛄', ['frozen']], ['🚢🧊💔', ['titanic']],
  ['🦈🌊😱', ['jaws']], ['🧙‍♂️💍🌋', ['the lord of the rings', 'lord of the rings', 'lotr']], ['⚡👓🧙', ['harry potter']], ['🐠🔍', ['finding nemo', 'nemo']],
  ['🦖🏝️', ['jurassic park']], ['👻🚫', ['ghostbusters']], ['🤖🌱🚀', ['wall-e', 'walle', 'wall e']], ['🏠🎈👴', ['up']], ['🐀👨‍🍳', ['ratatouille']],
  ['🍫🏭', ['charlie and the chocolate factory', 'willy wonka']], ['🧸🤠🚀', ['toy story']], ['🦇🦸‍♂️', ['batman']], ['🐼🥋', ['kung fu panda']],
  ['👽📞🏠', ['et', 'e.t.', 'e.t']], ['🧜‍♀️🦀', ['the little mermaid', 'little mermaid']], ['⭐⚔️', ['star wars']], ['🔙🔜🚗⏰', ['back to the future']],
  ['🦍🏙️', ['king kong']], ['🌊🏝️⛵🐔', ['moana']], ['🧛🏨', ['hotel transylvania']], ['🐢🥷🍕', ['teenage mutant ninja turtles', 'ninja turtles', 'tmnt']],
  ['🏠😱🎄', ['home alone']], ['🐉🧑‍🦰🛡️', ['how to train your dragon']], ['🐝🎬', ['bee movie']], ['🧟‍♂️🌍', ['world war z']], ['🏴‍☠️🦜💀', ['pirates of the caribbean']],
  ['🌧️🐱🐶', ["raining cats and dogs", 'its raining cats and dogs']], ['🐘🏠', ['elephant in the room']], ['⏰💰', ['time is money']], ['🥚🧺', ['eggs in one basket', 'all your eggs in one basket']],
  ['🍯🌙', ['honeymoon']], ['🧠⛈️', ['brainstorm']], ['⭐🐟', ['starfish']], ['☀️🌻', ['sunflower']], ['🔥🦊', ['firefox']], ['🦶⚽', ['football']],
];

module.exports = { COUNTRIES, flagOf, EMOJI_PUZZLES };
