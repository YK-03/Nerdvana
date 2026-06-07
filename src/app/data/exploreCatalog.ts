import { type MediaLens } from "../mediaLens";

export interface CatalogEntity {
  id: string;
  providerId: string;
  title: string;
  mediaLens: MediaLens;
  thumbnailUrl: string;
  description: string;
  theme?: string;
}

export interface ExploreSection {
  title: string;
  entities: CatalogEntity[];
}

export const EXPLORE_CATALOG: ExploreSection[] = [
  {
    title: "MOVIES",
    entities: [
      {
        id: "dune",
        providerId: "tmdb::movie::438631",
        title: "Dune",
        mediaLens: "movies",
        thumbnailUrl: "/explore/dune.jpg",
        description: "Power, prophecy, ecology, and political control.",
      },
      {
        id: "interstellar",
        providerId: "tmdb::movie::157336",
        title: "Interstellar",
        mediaLens: "movies",
        thumbnailUrl: "/explore/interstellar.jpg",
        description: "Cosmic survival framed through family and causality.",
      },
      {
        id: "inception",
        providerId: "tmdb::movie::27205",
        title: "Inception",
        mediaLens: "movies",
        thumbnailUrl: "/explore/inception.jpg",
        description: "Dream layers, memory, and the cost of closure.",
      },
      {
        id: "batman-movie",
        providerId: "tmdb::movie::414906",
        title: "Batman",
        mediaLens: "movies",
        thumbnailUrl: "/explore/batman.jpg",
        description: "Vengeance, fear, and uncovering systemic corruption.",
      },
      {
        id: "fight-club",
        providerId: "tmdb::movie::550",
        title: "Fight Club",
        mediaLens: "movies",
        thumbnailUrl: "/explore/fight-club.jpg",
        description: "Consumerism, masculinity, and psychological fracture.",
      },
      {
        id: "blade-runner-2049",
        providerId: "tmdb::movie::335984",
        title: "Blade Runner 2049",
        mediaLens: "movies",
        thumbnailUrl: "/explore/blade-runner-2049.jpeg",
        description: "What it means to be human in a synthesized world.",
      },
    ],
  },
  {
    title: "TV SHOWS",
    entities: [
      {
        id: "dark",
        providerId: "tmdb::tv::70523",
        title: "Dark",
        mediaLens: "tvShows",
        thumbnailUrl: "/explore/dark.jpg",
        description: "Time travel, causality, and family secrets.",
      },
      {
        id: "breaking-bad",
        providerId: "tmdb::tv::1396",
        title: "Breaking Bad",
        mediaLens: "tvShows",
        thumbnailUrl: "/explore/breaking-bad.jpg",
        description: "Pride, moral decay, and the consequences of ambition.",
      },
      {
        id: "stranger-things",
        providerId: "tmdb::tv::66732",
        title: "Stranger Things",
        mediaLens: "tvShows",
        thumbnailUrl: "/explore/stranger-things.jpg",
        description: "Nostalgia, alternate dimensions, and coming of age.",
      },
      {
        id: "the-boys",
        providerId: "tmdb::tv::76479",
        title: "The Boys",
        mediaLens: "tvShows",
        thumbnailUrl: "/explore/the-boys.jpg",
        description: "Corporate power, celebrity culture, and corrupt heroes.",
      },
      {
        id: "game-of-thrones",
        providerId: "tmdb::tv::1399",
        title: "Game of Thrones",
        mediaLens: "tvShows",
        thumbnailUrl: "/explore/game-of-thrones.jpg",
        description: "Dynastic conflict, political betrayal, and ancient threats.",
      },
    ],
  },
  {
    title: "ANIME",
    entities: [
      {
        id: "one-piece",
        providerId: "jikan::anime::21",
        title: "One Piece",
        mediaLens: "anime",
        thumbnailUrl: "/explore/one-piece.jpg",
        description: "Freedom, dreams, and the Great Pirate Era.",
      },
      {
        id: "attack-on-titan",
        providerId: "jikan::anime::16498",
        title: "Attack on Titan",
        mediaLens: "anime",
        thumbnailUrl: "/explore/attack-on-titan.jpg",
        description: "Freedom, war cycles, and inherited violence.",
      },
      {
        id: "demon-slayer",
        providerId: "jikan::anime::38000",
        title: "Demon Slayer",
        mediaLens: "anime",
        thumbnailUrl: "/explore/demon-slayer.png",
        description: "Family bonds, tragedy, and the pursuit of a cure.",
      },
      {
        id: "death-note",
        providerId: "jikan::anime::1535",
        title: "Death Note",
        mediaLens: "anime",
        thumbnailUrl: "/explore/death-note.jpg",
        description: "Justice, god complexes, and a deadly game of wits.",
      },
      {
        id: "jujutsu-kaisen",
        providerId: "jikan::anime::40748",
        title: "Jujutsu Kaisen",
        mediaLens: "anime",
        thumbnailUrl: "/explore/jujutsu-kaisen.jpg",
        description: "Cursed energy, sacrifice, and the weight of death.",
      },
    ],
  },
  {
    title: "GAMES",
    entities: [
      {
        id: "rdr2",
        providerId: "igdb::game::25076",
        title: "Red Dead Redemption 2",
        mediaLens: "games",
        thumbnailUrl: "/explore/rdr2.jpg",
        description: "Loyalty, survival, and the end of the Wild West.",
      },
      {
        id: "elden-ring",
        providerId: "igdb::game::119133",
        title: "Elden Ring",
        mediaLens: "games",
        thumbnailUrl: "/explore/elden-ring.png",
        description: "Ambition, shattered grace, and the struggle for order.",
      },
      {
        id: "witcher-3",
        providerId: "igdb::game::1942",
        title: "The Witcher 3",
        mediaLens: "games",
        thumbnailUrl: "/explore/witcher-3.jpg",
        description: "Destiny, monsters, and morally grey choices.",
      },
      {
        id: "cyberpunk-2077",
        providerId: "igdb::game::1877",
        title: "Cyberpunk 2077",
        mediaLens: "games",
        thumbnailUrl: "/explore/cyberpunk-2077.jpg",
        description: "Transhumanism, corporate control, and a fight to survive.",
      },
      {
        id: "god-of-war",
        providerId: "igdb::game::19560",
        title: "God of War",
        mediaLens: "games",
        thumbnailUrl: "/explore/god-of-war.jpg",
        description: "Fatherhood, breaking cycles, and the weight of the past.",
      },
    ],
  },
  {
    title: "COMICS",
    entities: [
      {
        id: "batman-comic",
        providerId: "comicvine::character::1699",
        title: "Batman",
        mediaLens: "comics",
        thumbnailUrl: "/explore/batman-comic.jpg",
        description: "Justice, fear, and the mythology of Gotham.",
      },
      {
        id: "spider-man",
        providerId: "comicvine::character::1443",
        title: "Spider-Man",
        mediaLens: "comics",
        thumbnailUrl: "/explore/spider-man.jpg",
        description: "Responsibility, guilt, and balancing dual lives.",
      },
      {
        id: "daredevil",
        providerId: "comicvine::character::24694",
        title: "Daredevil",
        mediaLens: "comics",
        thumbnailUrl: "/explore/daredevil.jpg",
        description: "Faith, justice, and the corruption of Hell's Kitchen.",
      },
      {
        id: "invincible",
        providerId: "comicvine::character::41103",
        title: "Invincible",
        mediaLens: "comics",
        thumbnailUrl: "/explore/invincible.jpg",
        description: "Coming of age, legacy, and brutal subversion of tropes.",
      },
      {
        id: "watchmen",
        providerId: "comicvine::volume::18497",
        title: "Watchmen",
        mediaLens: "comics",
        thumbnailUrl: "/explore/watchmen.jpg",
        description: "Power, fatalism, and the deconstruction of heroes.",
      },
    ],
  },
];
