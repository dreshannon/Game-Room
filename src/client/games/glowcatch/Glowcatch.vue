<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  BRAG_POINTS,
  MAX_CHARMS,
  PLAIN_DICE,
  REVEAL_GROUP_MS,
  REVEAL_START_MS,
  type CastResult,
  type Charm,
  type GlowcatchMove,
  type GlowcatchView,
  type Lantern,
} from '../../../games/glowcatch/logic'
import type { Flicker } from '../../../games/glowcatch/fireflies'
import type { PublicPlayer } from '../../../shared/protocol'
import { canAnimate } from '../../motion'
import DiceIcon from './DiceIcon.vue'
import FireflyCard from './FireflyCard.vue'
import { meetChances } from './odds'

const props = defineProps<{ view: GlowcatchView; you: string; players: PublicPlayer[]; hostId?: string | null }>()
const emit = defineEmits<{ move: [move: GlowcatchMove] }>()

const v = computed(() => props.view)
const nameOf = (id: string) => (id === props.you ? 'You' : props.players.find((p) => p.id === id)?.name ?? 'Someone')
const me = computed(() => v.value.you)
const playing = computed(() => !!me.value?.playing)
const isHost = computed(() => props.hostId === props.you)
const meadowName = (m: number) => (m === 0 ? 'East meadow' : 'West meadow')
const listNames = (names: string[]) =>
  names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`

// ---- Clock and motion ----
const now = ref(Date.now())
let clock: ReturnType<typeof setInterval> | undefined
const animate = ref(false)
const updateMotion = () => (animate.value = canAnimate())
onMounted(() => {
  clock = setInterval(() => (now.value = Date.now()), 250)
  updateMotion()
  document.addEventListener('visibilitychange', updateMotion)
})
onBeforeUnmount(() => {
  clearInterval(clock)
  clearTimeout(toastTimer)
  document.removeEventListener('visibilitychange', updateMotion)
})
const secondsLeft = computed(() =>
  v.value.castEndsAt === null ? null : Math.max(0, Math.ceil((v.value.castEndsAt - now.value) / 1000)),
)
const timeShare = computed(() =>
  v.value.castEndsAt === null || v.value.timer === 0
    ? 1
    : Math.max(0, Math.min(1, (v.value.castEndsAt - now.value) / (v.value.timer * 1000))),
)
const revealLeft = computed(() =>
  v.value.revealEndsAt === null ? null : Math.max(0, Math.ceil((v.value.revealEndsAt - now.value) / 1000)),
)

// ---- Your pick, remembered between rounds and reloads ----
const PICK_KEY = 'glowcatch:pick'
function loadPick() {
  try {
    const saved = JSON.parse(localStorage.getItem(PICK_KEY) ?? 'null')
    if (saved && Number.isInteger(saved.plain) && saved.plain >= 0 && saved.plain <= PLAIN_DICE) return saved
  } catch {
    // Storage blocked or bad data: start fresh.
  }
  return null
}
const saved = loadPick()
const plain = ref<number>(saved?.plain ?? 3)
const lanterns = ref<Record<Lantern, boolean>>({ d12: !!saved?.d12, d20: !!saved?.d20 })
const charms = ref<number[]>([])
const meadow = ref(0)
watch([plain, lanterns], () => {
  try {
    localStorage.setItem(PICK_KEY, JSON.stringify({ plain: plain.value, ...lanterns.value }))
  } catch {
    // Not saved, which is fine.
  }
}, { deep: true })

const roundKey = computed(() => `${v.value.round}-${v.value.phase}`)
watch(
  roundKey,
  () => {
    charms.value = []
    const resting = me.value?.resting
    if (resting) lanterns.value = { d12: lanterns.value.d12 && !resting.d12, d20: lanterns.value.d20 && !resting.d20 }
    if (meadow.value >= v.value.meadowCount) meadow.value = 0
  },
  { immediate: true },
)

const myCast = computed(() => me.value?.cast ?? null)
const diceTotal = computed(() => plain.value + (lanterns.value.d12 ? 1 : 0) + (lanterns.value.d20 ? 1 : 0))
const chosenCharms = computed(() => (me.value?.charms ?? []).filter((c) => charms.value.includes(c.id)))
const pickSummary = computed(() => {
  const parts = [diceTotal.value === 0 ? 'Sitting out' : `${diceTotal.value} ${diceTotal.value === 1 ? 'die' : 'dice'}`]
  if (diceTotal.value > 0) parts.push(...chosenCharms.value.map(charmName))
  if (v.value.meadowCount === 2 && diceTotal.value > 0) parts.push(meadowName(meadow.value))
  return parts.join(' · ')
})
const castLabel = computed(() => (diceTotal.value === 0 ? 'Sit out' : 'Cast'))
const waitingCount = computed(() => v.value.players.filter((p) => !p.gone && !p.cast).length)
const pickers = computed(() => v.value.players.filter((p) => !p.gone))
const hurry = computed(() => !myCast.value && secondsLeft.value !== null && secondsLeft.value <= 5)

function toggleCharm(id: number) {
  charms.value = charms.value.includes(id) ? charms.value.filter((c) => c !== id) : [...charms.value, id]
}

function sendCast() {
  emit('move', {
    type: 'cast',
    plain: plain.value,
    d12: lanterns.value.d12,
    d20: lanterns.value.d20,
    charms: diceTotal.value === 0 ? [] : charms.value,
    meadow: meadow.value,
  })
}

const charmName = (c: Charm) => (c.kind === 'nudge' ? 'Nudge' : c.kind === 'spare' ? `Spare ${c.value}` : 'Brag')
const charmHelp = (c: Charm) =>
  c.kind === 'nudge'
    ? 'Moves a die 1 up or down'
    : c.kind === 'spare'
      ? `Adds a ${c.value} to your roll`
      : `+${BRAG_POINTS} if you catch anything`
const charmIcon = (c: Charm) => (c.kind === 'nudge' ? '±1' : c.kind === 'spare' ? `+${c.value}` : '★')

// ---- Chances for your pick ----
const chances = ref<Map<number, number>>(new Map())
let chanceTimer: ReturnType<typeof setTimeout> | undefined
const chanceKey = computed(() => {
  if (v.value.phase !== 'cast' || !playing.value || myCast.value) return ''
  const flies = v.value.meadows[meadow.value]?.map((f) => f.id).join() ?? ''
  return `${plain.value}|${lanterns.value.d12}|${lanterns.value.d20}|${charms.value.join()}|${meadow.value}|${flies}`
})
watch(
  chanceKey,
  (key) => {
    clearTimeout(chanceTimer)
    if (!key) return
    chanceTimer = setTimeout(() => {
      const sides = [...Array(plain.value).fill(6), ...(lanterns.value.d12 ? [12] : []), ...(lanterns.value.d20 ? [20] : [])]
      const spares = chosenCharms.value.filter((c) => c.kind === 'spare').map((c) => c.value)
      const nudges = chosenCharms.value.filter((c) => c.kind === 'nudge').length
      chances.value = meetChances(v.value.meadows[meadow.value] ?? [], sides, spares, nudges)
    }, 120)
  },
  { immediate: true },
)
const chanceFor = (m: number, id: number) =>
  chanceKey.value && m === meadow.value ? (chances.value.get(id) ?? null) : null

// ---- Flickers: a short notice, and a tag on the fireflies that did it ----
const FLICKER_NOTE: Record<Flicker, string> = {
  swarm: 'brought a friend',
  gift: 'gave everyone a charm',
  breeze: 'woke all lanterns',
}
const freshIds = computed(() => new Set(v.value.phase === 'cast' ? v.value.flickers.map((f) => f.id) : []))
const toast = ref('')
let toastTimer: ReturnType<typeof setTimeout> | undefined
watch(
  () => `${v.value.round}-${v.value.phase}`,
  () => {
    clearTimeout(toastTimer)
    if (v.value.phase !== 'cast' || v.value.flickers.length === 0) return (toast.value = '')
    toast.value = v.value.flickers.map((f) => `${f.name} ${FLICKER_NOTE[f.flicker]}`).join(' · ')
    toastTimer = setTimeout(() => (toast.value = ''), 6000)
  },
  { immediate: true },
)

// ---- The reveal ----
interface Group {
  meadow: number
  group: number
  dice: number
  shown: CastResult[]
  quiet: CastResult[]
}
const groups = computed<Group[]>(() => {
  const out: Group[] = []
  for (const r of v.value.results) {
    let g = out.find((x) => x.meadow === r.meadow && x.group === r.group)
    if (!g) out.push((g = { meadow: r.meadow, group: r.group, dice: r.dice.length, shown: [], quiet: [] }))
    // Your own roll has its own card at the top.
    if (r.playerId === props.you) continue
    if (r.caught.length || r.missed.length) g.shown.push(r)
    else g.quiet.push(r)
  }
  return out
    .filter((g) => g.shown.length || g.quiet.length)
    .sort((a, b) => a.meadow - b.meadow || a.group - b.group)
})
const myResult = computed(() => v.value.results.find((r) => r.playerId === props.you) ?? null)
const delay = (group: number) =>
  animate.value ? { animationDelay: `${REVEAL_START_MS + group * REVEAL_GROUP_MS}ms` } : {}
const quietLine = (rows: CastResult[]) => {
  const names = listNames(rows.map((r) => nameOf(r.playerId)))
  const charmNote = rows.every((r) => r.gotCharm) ? ` (+1 charm${rows.length > 1 ? ' each' : ''})` : ''
  const empty = rows.every((r) => r.emptied)
  return `${names} caught nothing${empty ? ', the meadow was empty' : ''}${charmNote}.`
}
const iAmReady = computed(() => v.value.ready.includes(props.you))
/** Other players who haven't tapped Next round yet. */
const othersNotReady = computed(
  () => v.value.players.filter((p) => !p.gone && p.id !== props.you && !v.value.ready.includes(p.id)).length,
)

// ---- Scores ----
const showAll = ref(false)
const standings = computed(() =>
  [...v.value.players].sort((a, b) => Number(a.gone) - Number(b.gone) || b.score - a.score || a.fireflies - b.fireflies),
)
const placeOf = (id: string) => standings.value.findIndex((p) => p.id === id) + 1
const shortList = computed(() => standings.value.length > 5 && !showAll.value && v.value.phase !== 'over')
const shownStandings = computed(() =>
  shortList.value ? standings.value.filter((p, i) => i < 3 || p.id === props.you) : standings.value,
)

const phaseLine = computed(() => {
  if (v.value.phase === 'over') return 'Final scores'
  if (v.value.phase === 'reveal') return 'Fewest dice roll first'
  return 'Pick your dice in secret'
})
const initials = (id: string) => (props.players.find((p) => p.id === id)?.name ?? '?').slice(0, 2)
</script>

<template>
  <div class="gc" :class="{ animate }">
    <header class="top">
      <p class="eyebrow">Round {{ v.round }} of {{ v.rounds }} · {{ phaseLine }}</p>
      <div v-if="v.phase === 'cast'" class="pickers" aria-label="Who has cast">
        <span
          v-for="p in pickers"
          :key="p.id"
          class="dot"
          :class="{ done: p.cast, mine: p.id === you }"
          :title="`${nameOf(p.id)}: ${p.cast ? 'cast' : 'picking'}`"
          >{{ initials(p.id) }}</span
        >
      </div>
    </header>

    <p v-if="toast" class="toast" role="status">✦ {{ toast }}</p>

    <div class="meadows" :class="{ two: v.meadowCount === 2 }">
      <section v-for="(flies, m) in v.meadows" :key="m" class="meadow" :class="{ picked: v.meadowCount === 2 && chanceKey && m === meadow }">
        <h2 v-if="v.meadowCount === 2">{{ meadowName(m) }}</h2>
        <p v-if="flies.length === 0" class="empty">No fireflies left here.</p>
        <div class="flies">
          <FireflyCard
            v-for="f in flies"
            :key="f.id"
            :firefly="f"
            :chance="chanceFor(m, f.id)"
            :fresh="freshIds.has(f.id)"
          />
        </div>
      </section>
    </div>
    <p v-if="chanceKey" class="hint muted">
      The % is how often your pick rolls each firefly. Fewer dice roll first, so a small pick can get there before
      the big ones. Tap a firefly for more.
    </p>

    <!-- Casting -->
    <section v-if="v.phase === 'cast' && playing && !myCast" class="panel cast">
        <div class="pick">
          <p class="label">Plain dice <span class="muted">· 1–6 each</span></p>
          <div class="stepper">
            <button :disabled="plain === 0" aria-label="One fewer die" @click="plain--">−</button>
            <div class="pips" :aria-label="`${plain} plain dice`">
              <DiceIcon v-for="i in PLAIN_DICE" :key="i" :sides="6" :value="i" :off="i > plain" />
            </div>
            <button :disabled="plain === PLAIN_DICE" aria-label="One more die" @click="plain++">+</button>
          </div>
        </div>

        <div class="pick">
          <p class="label">Lanterns <span class="muted">· big dice that rest a round after you use them</span></p>
          <div class="row">
            <button
              v-for="l in (['d12', 'd20'] as const)"
              :key="l"
              class="toggle lantern"
              :class="{ chosen: lanterns[l] }"
              :disabled="me!.resting[l]"
              :aria-pressed="lanterns[l]"
              @click="lanterns[l] = !lanterns[l]"
            >
              <DiceIcon :sides="l === 'd12' ? 12 : 20" :off="me!.resting[l]" />
              <span>
                {{ l === 'd12' ? '1–12' : '1–20' }}
                <small>{{ me!.resting[l] ? 'Resting this round' : lanterns[l] ? 'In' : 'Tap to add' }}</small>
              </span>
            </button>
          </div>
        </div>

        <div class="pick">
          <p class="label">Charms <span class="muted">· {{ me!.charms.length }} of {{ MAX_CHARMS }}, used up when cast</span></p>
          <p v-if="me!.charms.length === 0" class="muted small">Catch nothing in a round to get one.</p>
          <div class="row">
            <button
              v-for="c in me!.charms"
              :key="c.id"
              class="toggle charm"
              :class="{ chosen: charms.includes(c.id) }"
              :aria-pressed="charms.includes(c.id)"
              :disabled="diceTotal === 0"
              @click="toggleCharm(c.id)"
            >
              <span class="charm-icon" aria-hidden="true">{{ charmIcon(c) }}</span>
              <span>
                {{ charmName(c) }}
                <small>{{ charmHelp(c) }}</small>
              </span>
            </button>
          </div>
        </div>

        <div v-if="v.meadowCount === 2" class="pick">
          <p class="label">Meadow <span class="muted">· you only compete with players in the same one</span></p>
          <div class="row">
            <button
              v-for="m in [0, 1]"
              :key="m"
              class="toggle"
              :class="{ chosen: meadow === m }"
              :aria-pressed="meadow === m"
              @click="meadow = m"
            >
              {{ meadowName(m) }}
            </button>
          </div>
        </div>
    </section>

    <!-- Sticks to the bottom of the screen while you scroll the meadow on a phone. -->
    <div v-if="v.phase === 'cast' && playing" class="bar" :class="{ hurry }">
        <div v-if="v.castEndsAt !== null" class="time" aria-hidden="true">
          <span :style="{ transform: `scaleX(${timeShare})` }" />
        </div>
        <div class="bar-row">
          <div class="bar-text">
            <template v-if="!myCast">
              <strong>{{ pickSummary }}</strong>
              <span class="muted small">
                <template v-if="secondsLeft !== null">{{ secondsLeft }}s left · time’s up means you sit out</template>
                <template v-else>No time limit</template>
              </span>
            </template>
            <template v-else>
              <strong>You’re in.</strong>
              <span class="muted small">
                Waiting for {{ waitingCount }} more<template v-if="secondsLeft !== null"> · {{ secondsLeft }}s</template>
              </span>
            </template>
          </div>
          <button v-if="!myCast" class="primary" @click="sendCast">{{ castLabel }}</button>
          <button v-else @click="emit('move', { type: 'uncast' })">Change</button>
        </div>
        <p v-if="isHost && v.castEndsAt === null && myCast && waitingCount > 0" class="host-skip">
          <button class="link" @click="emit('move', { type: 'next' })">Skip ahead</button>
          <span class="muted small">Anyone still picking sits this round out.</span>
        </p>
    </div>

    <!-- Reveal -->
    <section v-if="v.phase !== 'cast'" class="panel reveal">
      <div class="reveal-head">
        <h2>Round {{ v.round }}</h2>
        <p v-if="v.phase === 'reveal' && revealLeft !== null" class="muted small">
          {{ v.round < v.rounds ? `Next round in ${revealLeft}s` : `Final scores in ${revealLeft}s` }}
        </p>
      </div>

      <div v-if="myResult" class="mine-card" :style="delay(myResult.group)">
        <p class="eyebrow">Your roll · {{ myResult.total }}</p>
        <div class="faces">
          <DiceIcon
            v-for="(d, i) in myResult.dice"
            :key="i"
            :sides="d.sides"
            :value="d.value"
            :dashed="d.value !== d.rolled"
          />
          <span v-for="(s, i) in myResult.spares" :key="`s${i}`" class="spare">+{{ s }}</span>
        </div>
        <p v-if="myResult.dice.some((d) => d.value !== d.rolled)" class="muted small">Dashed dice were nudged.</p>
        <div v-if="myResult.caught.length" class="caught">
          <FireflyCard v-for="f in myResult.caught" :key="f.id" :firefly="f" small />
        </div>
        <p class="note big">
          <template v-if="myResult.caught.length">
            You caught {{ listNames(myResult.caught.map((f) => f.name)) }}! +{{ myResult.caught.reduce((s, f) => s + f.points, 0) + myResult.bragPoints }}
            points<template v-if="myResult.bragPoints"> (Brag +{{ myResult.bragPoints }})</template>.
          </template>
          <template v-else-if="myResult.emptied">The meadow was empty by your turn.</template>
          <template v-else>Nothing this time.</template>
          <template v-if="myResult.gotCharm"> You got a charm.</template>
        </p>
        <p v-for="m in myResult.missed" :key="m.firefly.id" class="note">
          {{ m.why === 'tie' ? `Tied for ${m.firefly.name}, so it stays.` : `${m.firefly.name} went to a lower total.` }}
        </p>
      </div>
      <p v-else-if="v.phase === 'reveal' && playing" class="muted">You sat this round out.</p>

      <p v-if="v.results.length === 0" class="muted">Nobody cast any dice this round.</p>

      <div v-for="g in groups" :key="`${g.meadow}-${g.group}`" class="group" :style="delay(g.group)">
        <p class="eyebrow">
          <span v-if="v.meadowCount === 2">{{ meadowName(g.meadow) }} · </span>{{ g.dice }}
          {{ g.dice === 1 ? 'die' : 'dice' }}
        </p>
        <div v-for="r in g.shown" :key="r.playerId" class="roll" :class="{ me: r.playerId === you }">
          <p class="who">{{ nameOf(r.playerId) }} <span class="muted">· {{ r.total }}</span></p>
          <div class="faces">
            <DiceIcon v-for="(d, i) in r.dice" :key="i" :sides="d.sides" :value="d.value" :dashed="d.value !== d.rolled" />
            <span v-for="(s, i) in r.spares" :key="`s${i}`" class="spare">+{{ s }}</span>
          </div>
          <div class="outcome">
            <FireflyCard v-for="f in r.caught" :key="f.id" :firefly="f" small />
            <p v-if="r.bragPoints" class="note good">Brag +{{ r.bragPoints }}</p>
            <p v-for="m in r.missed" :key="m.firefly.id" class="note">
              {{ m.why === 'tie' ? 'Tied for' : 'Lost' }} {{ m.firefly.name }}{{ m.why === 'lower' ? ' to a lower total' : '' }}
            </p>
          </div>
        </div>
        <p v-if="g.quiet.length" class="note quiet">{{ quietLine(g.quiet) }}</p>
      </div>

      <div v-if="v.phase === 'reveal' && revealLeft === null" class="ready-row">
        <button v-if="playing" class="primary" :disabled="iAmReady" @click="emit('move', { type: 'ready' })">
          {{ iAmReady ? 'Ready' : v.round < v.rounds ? 'Next round' : 'See final scores' }}
        </button>
        <span v-if="othersNotReady > 0" class="muted small">
          Waiting for {{ othersNotReady }} {{ othersNotReady === 1 ? 'other player' : 'other players' }}
        </span>
        <button v-if="isHost && iAmReady && othersNotReady > 0" class="skip" @click="emit('move', { type: 'next' })">
          Skip ahead
        </button>
      </div>
    </section>

    <!-- Scores -->
    <section class="panel scores">
      <h2>Scores</h2>
      <ol>
        <li v-for="p in shownStandings" :key="p.id" :class="{ gone: p.gone, mine: p.id === you }">
          <span class="place">{{ placeOf(p.id) }}</span>
          <span class="name">{{ nameOf(p.id) }}</span>
          <span class="meta">
            <span v-if="p.gone" class="status">Left</span>
            <span class="muted" :title="`${p.fireflies} fireflies, ${p.charms} charms`">
              {{ p.fireflies }} ✦ · {{ p.charms }} charm{{ p.charms === 1 ? '' : 's' }}
            </span>
            <strong class="score">{{ p.score }}</strong>
          </span>
        </li>
      </ol>
      <button v-if="standings.length > 5 && v.phase !== 'over'" class="link" @click="showAll = !showAll">
        {{ showAll ? 'Show top 3' : `Show all ${standings.length}` }}
      </button>
    </section>
  </div>
</template>

<style scoped>
.gc {
  --gc-sky: #34406b;
  --gc-sky-low: #4e5a86;
  --gc-card: #fffdf8;
  --gc-card-ink: #221f1a;
  --gc-card-muted: #6b655a;
  --gc-card-line: transparent;
  --gc-glow: #e8e35a;
  --gc-glow-strong: #b8a400;
  --gc-good: #1d7a4c;
  --gc-wing: rgba(120, 140, 200, 0.55);
  --gc-body: #2b2a35;
  display: grid;
  gap: 1rem;
  width: 100%;
  min-width: 0;
}

:root[data-theme='dark'] .gc {
  --gc-sky: #0f1426;
  --gc-sky-low: #1b2340;
  --gc-card: #24211d;
  --gc-card-ink: #f2ede3;
  --gc-card-muted: #a89f90;
  --gc-card-line: #3c3730;
  --gc-glow: #f1ea6b;
  --gc-glow-strong: #f1ea6b;
  --gc-good: #7fd6a4;
  --gc-wing: rgba(205, 218, 255, 0.6);
  --gc-body: #5a5868;
}

.top {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.pickers {
  display: flex;
  flex-wrap: wrap;
  gap: 0.2rem;
}

.dot {
  display: grid;
  place-items: center;
  width: 1.6rem;
  height: 1.6rem;
  border: 1.5px dashed var(--muted);
  border-radius: 50%;
  color: var(--muted);
  font-size: 0.65rem;
  font-weight: 700;
}

.dot.done {
  border: 1.5px solid var(--accent);
  background: var(--accent-soft);
  color: var(--ink);
}

.dot.mine {
  outline: 2px solid var(--ink);
  outline-offset: 1px;
}

.toast {
  padding: 0.4rem 0.75rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
  font-size: 0.88rem;
}

.animate .toast {
  animation: toast 6s ease both;
}

@keyframes toast {
  0% {
    opacity: 0;
  }
  8%,
  85% {
    opacity: 1;
  }
  100% {
    opacity: 0;
  }
}

.meadows {
  display: grid;
  gap: 0.75rem;
}

@media (min-width: 720px) {
  .meadows.two {
    grid-template-columns: 1fr 1fr;
  }
}

.meadow {
  min-width: 0;
  padding: 0.75rem;
  border-radius: var(--radius);
  background: linear-gradient(180deg, var(--gc-sky), var(--gc-sky-low));
}

.meadow.picked {
  box-shadow: 0 0 0 3px var(--gc-glow);
}

.meadow h2 {
  margin-bottom: 0.5rem;
  color: #f4f0ff;
}

.empty {
  color: #d8dcf0;
}

.flies {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
  gap: 0.5rem;
  align-items: start;
}

.hint {
  margin-top: -0.5rem;
  font-size: 0.82rem;
}

.cast {
  display: grid;
  gap: 0.9rem;
}

.label {
  margin-bottom: 0.35rem;
  font-weight: 700;
}

.label .muted {
  font-weight: 400;
  font-size: 0.85rem;
}

.small {
  font-size: 0.85rem;
}

.stepper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.stepper button {
  width: 2.6rem;
  padding: 0.4rem 0;
  font-size: 1.2rem;
}

.pips {
  display: flex;
  gap: 0.25rem;
  min-width: 0;
}

.pips :deep(.die) {
  width: 1.75rem;
  height: 1.75rem;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 6rem;
  text-align: left;
}

.toggle > span {
  display: grid;
  gap: 0.1rem;
}

.toggle small {
  color: var(--muted);
  font-weight: 400;
  font-size: 0.78rem;
}

.toggle.chosen {
  border-color: var(--accent);
  background: var(--accent-soft);
}

.charm {
  max-width: 13rem;
}

.charm-icon {
  display: grid !important;
  place-items: center;
  flex-shrink: 0;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--gc-glow);
  color: #1d1b10;
  font-weight: 800;
  font-size: 0.85rem;
}

.bar {
  position: sticky;
  bottom: 0.5rem;
  z-index: 2;
  padding: 0.6rem 0.9rem 0.75rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--surface);
  box-shadow: 0 4px 18px rgba(0, 0, 0, 0.18);
}

.time {
  height: 4px;
  margin-bottom: 0.5rem;
  border-radius: 999px;
  background: var(--line);
  overflow: hidden;
}

.time span {
  display: block;
  height: 100%;
  background: var(--accent);
  transform-origin: left;
  transition: transform 0.25s linear;
}

.bar-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.bar-text {
  display: grid;
  min-width: 0;
}

.bar-row button {
  flex-shrink: 0;
  min-width: 6rem;
}

.animate .hurry .primary {
  animation: pulse 0.9s ease-in-out infinite;
}

.hurry .time span {
  background: #d6453d;
}

@keyframes pulse {
  50% {
    transform: scale(1.06);
  }
}

.reveal {
  display: grid;
  gap: 0.9rem;
}

.reveal-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.mine-card {
  display: grid;
  gap: 0.45rem;
  padding: 0.75rem;
  border: 2px solid var(--gc-glow-strong);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--gc-glow) 12%, var(--surface));
}

.caught {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr));
  gap: 0.35rem;
}

.group {
  display: grid;
  gap: 0.5rem;
}

.animate .group,
.animate .mine-card {
  animation: rise 0.4s ease-out both;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(0.4rem);
  }
}

.roll {
  display: grid;
  grid-template-columns: minmax(5rem, 8rem) auto 1fr;
  align-items: start;
  gap: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px solid var(--line);
}

.roll.me .who {
  color: var(--accent);
}

@media (max-width: 560px) {
  .roll {
    grid-template-columns: 1fr;
    gap: 0.3rem;
  }
}

.who {
  font-weight: 700;
  overflow-wrap: anywhere;
}

.faces {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem;
}

.spare {
  display: grid;
  place-items: center;
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  background: var(--gc-glow);
  color: #1d1b10;
  font-weight: 800;
  font-size: 0.85rem;
}

.outcome {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}

.note {
  color: var(--muted);
  font-size: 0.88rem;
}

.note.big {
  color: var(--ink);
  font-size: 1rem;
  font-weight: 700;
}

.note.good {
  color: var(--ink);
  font-weight: 700;
}

.note.quiet {
  padding-top: 0.4rem;
  border-top: 1px solid var(--line);
}

.ready-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
}

.skip {
  margin-left: auto;
}

.scores ol {
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.scores li {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0;
  border-top: 1px solid var(--line);
}

.scores li.mine .name {
  font-weight: 800;
}

.scores li.gone {
  opacity: 0.55;
}

.place {
  width: 1.4rem;
  color: var(--muted);
  font-size: 0.85rem;
  font-variant-numeric: tabular-nums;
}

.scores .name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.meta {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
  font-size: 0.88rem;
}

.status {
  padding: 0 0.45rem;
  border-radius: 999px;
  background: var(--line);
  font-size: 0.78rem;
}

.score {
  min-width: 1.6rem;
  font-size: 1.05rem;
  text-align: right;
}

.host-skip {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.5rem;
}

.host-skip .link {
  margin-top: 0.25rem;
}

.link {
  margin-top: 0.5rem;
  padding: 0.3rem 0;
  border: 0;
  background: none;
  color: var(--accent);
}
</style>
