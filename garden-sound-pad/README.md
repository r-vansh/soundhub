# Garden sound pad

A Framer code component (`GardenHero.tsx`): a dot-grid garden where every action plays a soft synthesized sound, all tuned to one scale. Tap to grow plants, hover or swipe to sway them, drag to move them, and watch for birds. Sound starts on the first click or tap, and a dot speaker icon mutes it.

## Use in Framer

In Framer, add a new code file, paste in `GardenHero.tsx`, and drop the component on the canvas. Sound, volume, ambient pad, tree tap and pollen sound are all set from the property controls. The editor canvas stays silent on purpose, so test in Preview or on the published site.

## Sound test checklist

Test in Framer **Preview** and on the published site. The editor canvas stays silent on purpose.

### First sound
- [ ] Load the page and hover over the plants before clicking anything. There should be no sound.
- [ ] Click empty ground once. A plant grows and you hear its notes.
- [ ] Phone: the first tap plants and plays a sound. If the iPhone silent switch is on, there is no sound, which is expected.

### Every action
- [ ] Spawn: tall plants start on lower notes and short plants on higher ones.
- [ ] Rare golden plant: a rolled chord with an echo plays just after the spawn notes. It shows up about 1 in 25 times.
- [ ] Hover or swipe sway: you hear bass-drum thuds that keep pace with your hand. Fast swipes give tighter, shorter hits and don't pile up.
- [ ] Tap a tree, pine or fern: marimba (the Tree Tap default).
- [ ] Tap a flower: a rustle, a puff, then three breath notes.
- [ ] Swaying flowers shed pollen with soft breath puffs, at most about 4 a second, never constant.
- [ ] Drag a plant: a two-note lift when you pick it up and a low thud when you drop it.
- [ ] Drop a plant at an edge: four notes fall as it fades.
- [ ] Birds: a chirp or two comes from the side they fly in from. Moving near them gives a wing flutter and a burst of chirps.

### Mute icon (top right)
- [ ] Click the icon. Sound stops and the icon switches to a cross. Click again and sound comes back.
- [ ] Mute, then reload. It stays muted, because the choice is saved in the browser.
- [ ] Clicking the icon never plants anything.
- [ ] Tab to the icon with the keyboard and press Enter. It toggles and shows a focus ring.

### Framer controls
- [ ] Sound off: the garden is silent and the icon is gone.
- [ ] Volume: 0.35 is soft. Try 0.2 to 0.5.
- [ ] Start Muted on: a new visitor starts muted. To test this, clear site data or use a private window, because a saved mute choice wins.
- [ ] Mute Icon off: the icon is hidden.
- [ ] Tree Tap: switch between Marimba, Floor Tom, Leaf Shaker and Wood Knock, and tap a tree after each.
- [ ] Pollen Sound: switch between Breath, Celesta, Dewdrop and Glint.
- [ ] Ambient on: after the first click, a soft major-chord pad with slow rolling notes fades in over a couple of seconds. Ambient Volume (default 0.5) sets its level. Turning Ambient off fades it out.
- [ ] The Text colour also colours the icon, even when Counter is off.

### Off-screen and background
- [ ] Turn Ambient on, then scroll the hero off-screen. The ambient sound stops, and it comes back when you scroll back.
- [ ] Switch tabs. The sound stops and resumes when you return.

### Phones
- [ ] A sideways swipe plays thuds that follow your finger: a slow drag gives sparse, soft thuds and a fast flick gives a dense, loud roll. A vertical swipe scrolls the page, with no sound stuck on.
- [ ] Hold a plant to pick it up. The lift sound plays and the page doesn't scroll.
