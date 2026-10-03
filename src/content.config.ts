import { defineCollection } from 'astro:content';
import { glob } from 'astro/loaders';
import { character } from './content/schemas/character';

const characters = defineCollection({
  loader: glob({ pattern: '*.json', base: './content/characters' }),
  schema: character,
});

export const collections = { characters };
