# station-age

A Discord bot that estimates how old an EVE Online player structure is, from its structure ID alone.

```
/stationage input: 1049372805366
```

The bot replies with an estimated first-seen date, the structure's approximate age, and how the estimate was made.

## How it works

EVE assigns structure IDs in increasing order, so a structure's ID tells you roughly when it was anchored. The bot compares the ID you give it against [Adam4EVE](https://www.adam4eve.eu/)'s public list of player structures, each of which has a date on which it was first seen.

- **Exact match**: the structure is in the list, so the bot reports its first-seen date.
- **Interpolated**: the ID falls between two known structures, so the bot estimates a date proportionally between their two dates.
- **Extrapolated**: the ID is lower or higher than every known structure, so the bot can only say "before" or "after" the nearest known date.

A structure is sometimes first seen long after it was anchored. To keep those late sightings from skewing results, the bot treats a structure as no younger than any structure with a higher ID.

The result is an estimate. The list only contains structures Adam4EVE has observed, and "first seen" is the day it noticed the structure, which can be later than the day the structure was anchored.

The list is downloaded on first use and cached in memory for six hours.

## Input formats

The `input` option accepts either:

- a numeric structure ID, such as `1049372805366`
- an in-game link, such as `<url=showinfo:35832//1049372805366>Some Structure</url>`. You get one by dragging a structure into an in-game chat or notepad and copying the text.

## Setup

You need Node.js 22.12 or newer and a Discord application with a bot user.

1. Create an application in the [Discord Developer Portal](https://discord.com/developers/applications) and add a bot to it. The bot needs no privileged intents.
2. Invite it to your server with the `bot` and `applications.commands` scopes.
3. Clone this repository and install dependencies:

   ```sh
   npm install
   ```

4. Copy `.env.example` to `.env` and fill in both values:

   | Variable | Where to find it |
   | --- | --- |
   | `DISCORD_TOKEN` | Developer Portal, **Bot** page, **Reset Token** |
   | `DISCORD_CLIENT_ID` | Developer Portal, **General Information** page, **Application ID** |

   The npm scripts below load `.env` for you. If you start the bot some other way, set both variables in its environment instead.

5. Register the `/stationage` command with Discord. Do this once, and again whenever the command definition changes:

   ```sh
   npm run deploy-commands
   ```

   The command is registered globally and can take a few minutes to show up.

6. Start the bot:

   ```sh
   npm run build
   npm start
   ```

   During development, `npm run dev` runs it from source and restarts on changes.

## Running with Docker

With `.env` filled in and the command registered (steps 4 and 5 above):

```sh
docker compose up -d --build
```

## Development

```sh
npm test            # run the test suite once
npm run test:watch  # re-run tests as files change
npm run coverage    # run the suite and enforce 100% coverage
npm run typecheck   # type-check the source and the tests
npm run lint        # check linting and formatting with Biome
npm run lint:fix    # fix what Biome can fix automatically, including formatting
```

The tests never contact Discord or Adam4EVE and do not read your `.env`.

Every pull request runs the lint check, the type check, the build and the coverage run on GitHub Actions. A pull request cannot be merged until that check passes, and the coverage run fails if any line, branch or function in `src/` is not exercised by a test.

Dependabot opens pull requests for dependency updates once a week, and waits until a new version is a week old before proposing it.

## Credits

Structure data comes from [Adam4EVE](https://www.adam4eve.eu/), fetched at runtime from `https://static.adam4eve.eu/IDs/playerStructure_extended.txt`. This project is not affiliated with Adam4EVE.

EVE Online and all related names and marks are trademarks of CCP hf. This project is not affiliated with or endorsed by CCP hf.

## License

[MIT](LICENSE)
