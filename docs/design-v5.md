# MIRROR v5: Liquid mirror

## Brief

- **Subject:** a tool for one personal decision. You write the options; MIRROR shows where each could lead at three
  points in time, what every future rests on, and the cheapest way to find out more.
- **Audience:** someone stuck on a real choice (job, city, business, studies), in English or Greek, often on a phone.
- **Primary job of the website:** make the idea felt in five seconds, prove it with the real engine, then let people start.
- **Rejected:** v3/v4 read as generated. Diagnosis: near-black with violet/cyan glow, tracked CAPS labels above every
  heading, "A · B · C" meta strings, arrows on every button, 01/02/03 numbering, identical fade-ups on every section,
  a glow on every card. Effects everywhere, none of them meaning anything.

## Visitor jobs (heuristic evaluation, to be tested with 5 people)

| Visitor needs to… | v4 | v5 answer |
|---|---|---|
| Get what it is in 5 s | a tagline over an abstract film | the headline is a question about *their* choice, and its reflection splits into futures |
| Believe it's not fortune-telling | buried in principles | said under the hero, shown in the story, and marked on every future |
| See it work | demo halfway down | demo is the third thing, the story leads straight into it |
| Know it's private and free | credits row | one plain line next to the button |
| Start | many equal buttons | one primary action everywhere: "Explore a decision" |

Test script for the first round (5 participants, 20 min each, think-aloud):
1. "Look at this page for ten seconds, then tell me what it does." (comprehension)
2. "You're deciding whether to move cities. Show me how you'd see what that choice rests on." (demo)
3. "Is anything you type here sent anywhere?" (trust)
4. "Start your own decision." (conversion path)
5. "Switch the site to Greek." (language)

## Tokens

| Name | Hex | Role |
|---|---|---|
| graphite | `#1C1F24` | page |
| graphite-2 | `#262A31` | raised surfaces in the app |
| pewter | `#8C939E` | secondary text, speculative lines |
| silver | `#C9CED6` | body text, assumed lines |
| mirror | `#F2F4F7` | headlines, known lines, primary button fill |
| signal | `#FF6A2B` | only for doubt and broken futures. Never decoration |

The identity is monochrome metal. Colour appears only when something is in doubt or breaks, so it always means something.
(Revised from the first plan, which used orange as a general accent: graphite plus one hot accent is a stock dark
template. Here the orange is a state, not a brand colour.)

Light theme: polished steel, `#E7EAEE` page, `#1C1F24` text, same signal.

**Type.** Bricolage Grotesque (display, the face the client chose) set very large and tight, used as an object: the hero
headline is reflected in the liquid. Inter for reading. Greek letters from Inter Display / Inter. No CAPS labels anywhere;
small labels are sentence case, Inter 500, pewter. Scale: perfect fourth from 17 px (17, 22.7, 30.2, 40.3, 53.7, 71.6),
hero clamps to 9 vw.

**Layout.** One left-aligned column on a 12-column grid (text mostly in columns 1–8), sections separated by space, not
rules or boxes. The only full-bleed things are the two pools of liquid (hero and footer) and the pinned story.

```
hero (100svh)
 mirror ○                          How it works  Example  Questions   EN ΕΛ   [Explore a decision]

 What happens if
 you choose it?
 ════════════════════════════════════════════ waterline (liquid starts here)
 ≈ ʇı ǝsooɥɔ noʎ ɟı uǝddɐɥ ʇɐɥM ≈  reflection ripples under the pointer,
 ≈ and splits into three ghosts ≈   drifting apart: three futures
 MIRROR maps where each option could lead, and what that rests on.   [Explore a decision]  Try the example

story (pinned, 400vh of scroll, 4 moments)
 ┌ sticky stage ───────────────────┐   now          You write the choice
 │  ● ───── a                      │   1 month      It splits into futures
 │    ╲──── b      (draws with     │   6 months     You test what they rest on
 │     ╲─── c       the scroll)    │   later        You choose, then look back
 └─────────────────────────────────┘

demo (real engine) · specimen (a bead of mercury travels through known → assumed → speculative → broken)
principles (each line rises out of its own reflection) · questions · footer pool reflecting the word "mirror"
```

## Effects map (all tied to reflection or futures)

| Where | Effect | Why it's there |
|---|---|---|
| Hero | WebGL2 liquid mirror reflecting the real headline; pointer ripples; reflection splits into 3 | the product in one image |
| Page | drop transition: navigating spreads a circle of liquid from where you clicked | entering the mirror |
| Story | scroll-scrubbed drawing of one decision splitting; time labels advance | it's a real sequence |
| Demo | futures that lose their footing crack; judgements slide | shows cause and effect |
| Specimen | a mercury bead travels a line whose texture changes state | teaches the line language |
| Principles | each statement rises out of its mirrored copy | the brand idea, quietly |
| Buttons | magnetic pull; liquid fill from the pointer's entry point | answers the person |
| Footer | second pool reflecting "mirror" | bookend |

Reduced motion: liquid becomes a still reflection, story shows all four moments, nothing waits to appear.
