# Don't Wake Dad

Sneak to the fridge and back without waking Dad. Hold to move, let go when the snoring stops.

A 3D browser game. No install, no signup, plays offline after the first load.

## Run

```sh
npm install
npm run dev        # http://localhost:5173
npm run build      # static site in dist/
npm run preview    # serve dist/ locally
```

Controls: hold the screen, mouse button, Space or an arrow key to sneak. Release to freeze.

## Test on a phone

`npm run dev -- --host`, then open the Network URL on a phone on the same Wi-Fi. Phones play in landscape. Offline play needs the built site (`npm run build && npm run preview -- --host`), because the service worker only runs in the build.

## Where things are

| File | What |
|---|---|
| `src/main.ts` | Game loop, Dad's states, input, camera, screens |
| `src/world.ts` | House layout, model loading, characters |
| `src/levels.ts` | The 8 levels and the caught and win lines |
| `src/audio.ts` | Every sound, synthesized with Web Audio |
| `public/models/` | Kenney CC0 models (characters, furniture, food) |

## Credits

3D models by [Kenney](https://kenney.nl), CC0.
