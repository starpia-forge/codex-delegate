# Default pets are unofficial fan art, removed on request

The bundled default pets are fan-made sprites of characters from 『まちカドまぞく』 (© 伊藤いづも / 芳文社): leader momo, researcher mikan, critic sion, implementer shamiko, computer-user lico. The maintainer wants these characters, not neutral placeholders or newly drawn art, to be what a fresh install shows. We have no licence from the rights holder, so every place that names the artwork (the tray licence window, the README and each `pet.json` description) credits the original work and its rights holder, says the art is unofficial and unaffiliated, and promises removal on request.

## Considered Options

- Keep the placeholders as defaults and ship the characters as an opt-in set chosen in `pet.json`. A takedown would then leave the default experience untouched, but nobody would see the characters without configuring them.
- Draw original default pets (the original plan for ticket 15).

## Consequences

A licence notice doesn't grant the right to distribute the art. Every published pet release carries it, and a takedown can't recall releases that are already out. On a request from the rights holder, we cut a new pet release that restores the placeholder sheets (`pet/generate-placeholders.mjs`) and delete the artwork from the repository.

The source sheets in `pet/art/machikado-mazoku/` have 11 rows. Only the first 9 rows follow the Codex pet v1 layout, so the packaged sheets keep those 9 and the two extra look-around rows are left unused.
