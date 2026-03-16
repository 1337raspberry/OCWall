# OC Wall Archive

An interactive archive of connecting wall puzzles from the TV show Only Connect. Browse over 900 walls across 20+ series, play them with show-accurate rules, and track your stats over time.

## How it works

The site is a static single-page app — just HTML, CSS, and vanilla JS with no dependencies or build step.

- **Wall data** lives in `data/walls.json`, a flat JSON array of episodes each containing one or more walls with four groups of four clues and their connections
- **Gameplay** mirrors the show's format: a 4x4 grid of 16 shuffled clues, a 2:30 timer, and free selection until two groups are found, then three guesses to find the remaining two
- **Scoring** follows the show's /10 system: 1 point per group found + 1 point per connection correctly identified during the post-game reveal phase + 2 bonus points for a perfect 8/8 (max 10)
- **Progress** is saved to `localStorage` — nothing is transmitted or collected. Best scores are kept per wall, and the stats page tracks totals, averages, score distribution, and series completion
## Running locally

Serve the project root with any static file server:

```
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

## Project structure

```
index.html          Main (and only) HTML page
css/style.css       All styles
js/game.js          All game logic, menu, stats, localStorage
data/walls.json     Wall dataset
```

## Disclaimer

This project is for archival and educational purposes only. All original content — including question data, connections, and any other copyrighted material — belongs to its respective rights holders. No copyright infringement is intended.

Question data was sourced from [ocdb.cc](https://ocdb.cc).

If you are a rights holder and have any concerns, please contact **admin [at] blueshelter [dot] net**.

(and if you are VCM or any of the wonderful staff or writers at OC, know that this was created with love for your wonderful show!)
