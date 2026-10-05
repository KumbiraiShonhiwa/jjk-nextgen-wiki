import { defineCollection } from 'astro:content';
import { file, glob } from 'astro/loaders';
import { arc, chapter, character, communityLink, domain, edge, episode, location, organization, technique } from './content/schemas';

const dir = (name: string) => glob({ pattern: '*.json', base: `./content/${name}` });

export const collections = {
  characters: defineCollection({ loader: dir('characters'), schema: character }),
  techniques: defineCollection({ loader: dir('techniques'), schema: technique }),
  domains: defineCollection({ loader: dir('domains'), schema: domain }),
  arcs: defineCollection({ loader: dir('arcs'), schema: arc }),
  organizations: defineCollection({ loader: dir('organizations'), schema: organization }),
  locations: defineCollection({ loader: dir('locations'), schema: location }),
  episodes: defineCollection({ loader: dir('episodes'), schema: episode }),
  chapters: defineCollection({ loader: dir('chapters'), schema: chapter }),
  edges: defineCollection({ loader: file('./content/edges.json'), schema: edge }),
  links: defineCollection({ loader: file('./content/links/community.json'), schema: communityLink }),
};
