import type { EntityType } from '../slugs.ts';
import { mapArc } from './arc.ts';
import { mapCharacter } from './character.ts';
import type { Draft, MapInput, Skip } from './common.ts';
import { mapDomain } from './domain.ts';
import { mapLocation } from './location.ts';
import { mapOrganization } from './organization.ts';
import { mapTechnique } from './technique.ts';

export type { Draft, DraftEdge, RefRequest, Skip } from './common.ts';

export const MAPPERS: Record<EntityType, (input: MapInput) => Draft | Skip> = {
  characters: mapCharacter,
  techniques: mapTechnique,
  domains: mapDomain,
  arcs: mapArc,
  organizations: mapOrganization,
  locations: mapLocation,
};

export const isSkip = (r: Draft | Skip): r is Skip => 'skip' in r;
