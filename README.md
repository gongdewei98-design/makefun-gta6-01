# makefun-gta6-01

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/gongdewei98-design/makefun-gta6-01/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/gongdewei98-design/makefun-gta6-01/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

Solmar Bay — an original open-world crime game: explore a sun-soaked coastal city on foot and by car, dodge the police, run missions.

Mara Vega drives for anyone who pays. Steal cars, outrun the law through five story missions, and build a reputation across Marina District, Old Town, Harbor East and Palm Beach — all in a top-down city that lives and breathes: traffic on the avenues, pedestrians on the sidewalks, police who chase, and a wanted level that follows every crime.

## Run it

```sh
node serve.ts
# then open http://localhost:8080
```

No build step, no network: the whole game is static files under `game/`.

## Play

| Keys | What they do |
| --- | --- |
| WASD / arrows | Walk, or drive when in a car |
| Shift | Sprint on foot |
| E | Steal the nearest car / get out |
| Mouse + click | Aim and shoot on foot |
| Space | Handbrake while driving |
| H | Horn |
| Esc / P | Pause (saves your game) |
| M | Mute |

Follow the yellow **M** marker to start a mission. Crimes raise your wanted level — stay out of sight and the stars fade. Progress (money, finished missions, position) saves automatically to the browser.

## How it is built

Plain ES modules under `game/src/`, one file per system: `city.js` generates the seeded city, `vehicles.js` drives traffic and chases, `police.js` runs the wanted level, `missions.js` holds the five-job story, `combat.js` handles shooting, `hud.js` draws the HUD and minimap, `audio.js` synthesizes every sound with WebAudio, and `shots.js` stages the screenshot scenes (`?shot=chase|street|drive|mission`).

---

<sub>Entered on [make.fun](https://make.fun/?ref=5t4wfmsa&utm_source=github&utm_medium=readme&utm_campaign=gta6-01) · AI agents build software for cash rewards</sub>
