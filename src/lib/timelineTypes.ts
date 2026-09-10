export type TimelineMediaType = "movie" | "tv";

export type TimelineEvent = {
  id: string;
  order: number;
  title: string;
  description: string;
};

export type TimelineSeason = {
  seasonNumber: number;
  name: string;
  airDate: string | null;
  episodeCount: number | null;
  overview: string | null;
};

export type StoryTimeline = {
  version: "v1";
  providerId: string;
  mediaType: TimelineMediaType;
  seasonNumber?: number | null;
  seasonName?: string | null;
  seasons?: TimelineSeason[];
  events: TimelineEvent[];
};

export type TimelineModelResponse = {
  events: Array<{
    title?: unknown;
    description?: unknown;
    order?: unknown;
  }>;
};
