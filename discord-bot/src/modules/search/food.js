'use strict';
const { truncate } = require('../../core/utils');
const { button, row } = require('../../core/ui');
const { getJson, userError, enc } = require('./_http');

const MEAL = 'https://www.themealdb.com/api/json/v1/1';
const DRINK = 'https://www.thecocktaildb.com/api/json/v1/1';

function ingredients(item, max) {
  const out = [];
  for (let i = 1; i <= max; i++) {
    const name = item[`strIngredient${i}`]?.trim();
    if (!name) continue;
    const measure = item[`strMeasure${i}`]?.trim();
    out.push(`• ${measure ? `${measure} ` : ''}${name}`);
  }
  return out;
}

function mealEmbed(ctx, m) {
  const links = [m.strSource, m.strYoutube].filter((u) => /^https?:\/\//.test(u || ''));
  return {
    embeds: [
      ctx.embed({
        title: `🍽️ ${m.strMeal}`,
        url: links[0],
        thumbnail: m.strMealThumb,
        fields: [
          { name: 'Category', value: m.strCategory || null, inline: true },
          { name: 'Cuisine', value: m.strArea || null, inline: true },
          { name: 'Ingredients', value: truncate(ingredients(m, 20).join('\n'), 1024) },
          { name: 'Instructions', value: truncate(m.strInstructions || 'No instructions.', 1024) },
        ],
        footer: 'Data: TheMealDB',
      }),
    ],
    components: links.length ? [row(...links.map((u) => button(u, /youtu/.test(u) ? 'Video' : 'Full recipe', 'Link')))] : [],
  };
}

function drinkEmbed(ctx, d) {
  return {
    embeds: [
      ctx.embed({
        title: `🍹 ${d.strDrink}`,
        thumbnail: d.strDrinkThumb,
        fields: [
          { name: 'Type', value: [d.strCategory, d.strAlcoholic].filter(Boolean).join(' • ') || null, inline: true },
          { name: 'Glass', value: d.strGlass || null, inline: true },
          { name: 'Ingredients', value: truncate(ingredients(d, 15).join('\n'), 1024) },
          { name: 'Instructions', value: truncate(d.strInstructions || 'No instructions.', 1024) },
        ],
        footer: 'Data: TheCocktailDB • please drink responsibly',
      }),
    ],
  };
}

module.exports = [
  {
    name: 'recipe',
    aliases: ['meal', 'recipes'],
    description: 'Find a recipe with ingredients and instructions',
    usage: '<dish>',
    examples: ['lasagne', 'chicken curry'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 80);
      await ctx.defer();
      const data = await getJson(`${MEAL}/search.php?s=${enc(q)}`);
      const meal = data?.meals?.[0];
      if (!meal) throw userError(`No recipe found for **${q}**. Try \`${ctx.prefix}randomrecipe\`.`);
      await ctx.reply(mealEmbed(ctx, meal));
    },
  },
  {
    name: 'randomrecipe',
    aliases: ['randommeal', 'whattocook'],
    description: 'A random recipe for inspiration',
    cooldown: 3,
    async execute(ctx) {
      await ctx.defer();
      const data = await getJson(`${MEAL}/random.php`);
      if (!data?.meals?.[0]) throw userError('No recipe came back — try again.');
      await ctx.reply(mealEmbed(ctx, data.meals[0]));
    },
  },
  {
    name: 'cocktail',
    aliases: ['drink', 'mocktail'],
    description: 'Find a cocktail or drink recipe',
    usage: '<drink>',
    examples: ['margarita', 'mojito'],
    minArgs: 1,
    cooldown: 3,
    async execute(ctx) {
      const q = ctx.rest(0).slice(0, 80);
      await ctx.defer();
      const data = await getJson(`${DRINK}/search.php?s=${enc(q)}`);
      const drink = Array.isArray(data?.drinks) ? data.drinks[0] : null;
      if (!drink) throw userError(`No drink found for **${q}**.`);
      await ctx.reply(drinkEmbed(ctx, drink));
    },
  },
  {
    name: 'randomcocktail',
    aliases: ['randomdrink'],
    description: 'A random cocktail recipe',
    cooldown: 3,
    async execute(ctx) {
      await ctx.defer();
      const data = await getJson(`${DRINK}/random.php`);
      if (!data?.drinks?.[0]) throw userError('No drink came back — try again.');
      await ctx.reply(drinkEmbed(ctx, data.drinks[0]));
    },
  },
];
