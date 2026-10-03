import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { arc, character, domain, edge, location, organization, technique } from './content/schemas';

const dir = (name: string) => glob({ pattern: '*.json', base: `./content/${name}` });

export const collections = {
  characters: defineCollection({ loader: dir('characters'), schema: character }),
  techniques: defineCollection({ loader: dir('techniques'), schema: technique }),
  domains: defineCollection({ loader: dir('domains'), schema: domain }),
  arcs: defineCollection({ loader: dir('arcs'), schema: arc }),
  organizations: defineCollection({ loader: dir('organizations'), schema: organization }),
  locations: defineCollection({ loader: dir('locations'), schema: location }),
  edges: defineCollection({ loader: file('./content/edges.json'), schema: edge }),
};
