# Nerdvana

Nerdvana is an AI powered platform for exploring fictional universes through intelligent search and contextual conversations. It combines real time web search with large language models to help users discover and understand movies, television, anime, games, comics, and books.

Application: https://nerdvana-murex.vercel.app

---

## About

Nerdvana is designed around a conversational search experience. Users can search for a topic, continue asking follow up questions, and explore related information without losing context.

The application integrates multiple media data providers with AI generated responses, providing a unified interface for discovering characters, stories, lore, timelines, and recommendations across different fictional universes.

---

## Features

- AI powered conversational search
- Context aware follow up conversations
- Dynamic search autocomplete
- Explore mode for discovering related content
- Spoiler aware responses
- Search history with cloud synchronization
- Saved Lorebooks for preserving conversations
- Visual metadata panels with posters and media information
- Firebase authentication
- Responsive interface

---

## Screenshots

### Home

<img src="./public/assets/home.jpg" width="100%" />

### Search

<img src="./public/assets/search.jpg" width="100%" />

### Conversation

<img src="./public/assets/chat.jpg" width="100%" />

---

## Tech Stack

### Frontend

- React
- TypeScript
- Vite
- Tailwind CSS
- Zustand
- Framer Motion
- React Markdown

### Backend

- Vercel Serverless Functions
- Firebase Authentication
- Cloud Firestore

### AI

- Google Gemini
- Groq

### Search

- Serper API

### External Data Providers

- TMDB
- RAWG
- IGDB
- ComicVine
- Jikan
- AniList
- Google Books

---

## Architecture

Nerdvana is a client focused single page application backed by serverless APIs.

The frontend communicates with Vercel Serverless Functions, which coordinate AI inference, search, and external media providers. Authentication and user data are managed through Firebase Authentication and Cloud Firestore.

---

## License

Copyright © 2026 Yash Kaushik.

All Rights Reserved.

This repository is publicly available for viewing and evaluation purposes only. No permission is granted to copy, modify, distribute, sublicense, or use any part of this source code without prior written permission from the copyright holder.
