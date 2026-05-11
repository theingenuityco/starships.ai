/**
 * Starship Doc Domain Types
 *
 * Starship-scoped markdown documents usable by humans and agents.
 * Docs can be pinned to rooms for quick access.
 */

export interface StarshipDocModel {
  id: string;
  starshipId: string;
  title: string;
  slug: string;
  content: string;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
}

export type CreateStarshipDocRequest = {
  starshipId: string;
  title: string;
  content?: string;
};

export type UpdateStarshipDocRequest = {
  title?: string;
  content?: string;
  archived?: boolean;
};

export type StarshipDocListResponse = {
  docs: StarshipDocModel[];
};

export type StarshipDocDetailResponse = {
  doc: StarshipDocModel;
};
