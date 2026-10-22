'use strict';
/** Open Trivia DB categories + an offline question bank used when the API is unreachable. */

const CATEGORIES = {
  general: 9, books: 10, film: 11, music: 12, tv: 14, videogames: 15, boardgames: 16, science: 17, computers: 18, math: 19,
  mythology: 20, sports: 21, geography: 22, history: 23, politics: 24, art: 25, celebrities: 26, animals: 27, vehicles: 28,
  comics: 29, gadgets: 30, anime: 31, cartoons: 32,
};

const mc = (question, correct, incorrect, category = 'General Knowledge', difficulty = 'easy') => ({ type: 'multiple', question, correct, incorrect, category, difficulty });
const tf = (question, correct, category = 'General Knowledge', difficulty = 'easy') => ({ type: 'boolean', question, correct: correct ? 'True' : 'False', incorrect: [correct ? 'False' : 'True'], category, difficulty });

const LOCAL = [
  mc('What is the largest planet in our solar system?', 'Jupiter', ['Saturn', 'Neptune', 'Earth'], 'Science'),
  mc('What is the chemical symbol for gold?', 'Au', ['Ag', 'Gd', 'Go'], 'Science'),
  mc('How many continents are there on Earth?', '7', ['5', '6', '8'], 'Geography'),
  mc('Who painted the Mona Lisa?', 'Leonardo da Vinci', ['Michelangelo', 'Raphael', 'Vincent van Gogh'], 'Art'),
  mc('What is the capital of Japan?', 'Tokyo', ['Kyoto', 'Osaka', 'Seoul'], 'Geography'),
  mc('What is the hardest natural substance?', 'Diamond', ['Quartz', 'Iron', 'Granite'], 'Science'),
  mc('How many legs does a spider have?', '8', ['6', '10', '12'], 'Animals'),
  mc('Which planet is known as the Red Planet?', 'Mars', ['Venus', 'Jupiter', 'Mercury'], 'Science'),
  mc('Which gas do plants absorb from the air for photosynthesis?', 'Carbon dioxide', ['Oxygen', 'Nitrogen', 'Helium'], 'Science'),
  mc('What is the longest river in South America?', 'Amazon', ['Paraná', 'Orinoco', 'Magdalena'], 'Geography', 'medium'),
  mc('In which year did the Titanic sink?', '1912', ['1905', '1915', '1920'], 'History', 'medium'),
  mc('What is the smallest prime number?', '2', ['1', '3', '0'], 'Mathematics'),
  mc('Which is the largest ocean?', 'Pacific Ocean', ['Atlantic Ocean', 'Indian Ocean', 'Arctic Ocean'], 'Geography'),
  mc('Who wrote "Romeo and Juliet"?', 'William Shakespeare', ['Charles Dickens', 'Jane Austen', 'Mark Twain'], 'Books'),
  mc('What is the square root of 144?', '12', ['14', '10', '16'], 'Mathematics'),
  mc('Which language has the most native speakers?', 'Mandarin Chinese', ['English', 'Spanish', 'Hindi'], 'General Knowledge', 'medium'),
  mc('How many bones are in the adult human body?', '206', ['196', '212', '230'], 'Science', 'medium'),
  mc('What is the fastest land animal?', 'Cheetah', ['Lion', 'Pronghorn', 'Greyhound'], 'Animals'),
  mc('Which element has the atomic number 1?', 'Hydrogen', ['Helium', 'Oxygen', 'Carbon'], 'Science'),
  mc('What is the main ingredient in guacamole?', 'Avocado', ['Tomato', 'Pea', 'Cucumber']),
  mc('What does CPU stand for?', 'Central Processing Unit', ['Computer Personal Unit', 'Central Program Utility', 'Core Processing Unit'], 'Computers'),
  mc('Who developed the theory of relativity?', 'Albert Einstein', ['Isaac Newton', 'Niels Bohr', 'Galileo Galilei'], 'Science'),
  mc('How many minutes are in a full day?', '1440', ['1200', '1600', '1340'], 'Mathematics'),
  mc('In Minecraft, which block is used to build a Nether portal?', 'Obsidian', ['Netherrack', 'Cobblestone', 'Bedrock'], 'Video Games'),
  mc('What is the tallest mountain on Earth above sea level?', 'Mount Everest', ['K2', 'Kangchenjunga', 'Mont Blanc'], 'Geography'),
  mc('Which is the only mammal capable of true flight?', 'Bat', ['Flying squirrel', 'Sugar glider', 'Colugo'], 'Animals', 'medium'),
  mc('How many players are on the field for one soccer team?', '11', ['9', '10', '12'], 'Sports'),
  mc('What is the freezing point of water in Fahrenheit?', '32°F', ['0°F', '100°F', '212°F'], 'Science'),
  tf('The Great Wall of China is visible from the Moon with the naked eye.', false, 'General Knowledge', 'medium'),
  tf('Sound travels faster in water than in air.', true, 'Science', 'medium'),
  tf('An octopus has three hearts.', true, 'Animals'),
  tf('Mount Everest is located in South America.', false, 'Geography'),
];

module.exports = { CATEGORIES, LOCAL };
