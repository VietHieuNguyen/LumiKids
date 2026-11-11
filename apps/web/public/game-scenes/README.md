# Current game scenery

The runtime uses one user-selected background: `playroom-scene.webp`.
It is a WebP conversion of the current `background1.jpg` (539 x 360), with the
original preserved. No third-party license is inferred from this upload.
The old randomized scene list is no longer referenced by the runtime.

The image retains its proportions with cover cropping. Hanging cards, ropes,
colored pegs and controls are CSS/inline SVG decorations above that scenery.
Ropes ignore pointer events; peg colors do not encode answers. Horizontal rails
keep overflow scrollable and expose previous/next buttons. The source rail is
above the target or numeric-answer area. No opaque outer tray panels obscure
the scenery. The compact header and feedback badge use symbols and numbers.

The background is decorative and does not participate in game validation,
answer keys, metadata selection, or matching target shuffling.
