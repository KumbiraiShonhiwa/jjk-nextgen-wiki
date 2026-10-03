/// <reference types="astro/client" />

declare namespace App {
  interface Locals {
    /**
     * Spoiler level of the entity the current page is about, set by SpoilerWall. Gated content above
     * it is excluded from the search index so results never spoil (docs/04, Search).
     */
    pageLevel?: import('./content/schemas').SpoilerLevel;
  }
}
