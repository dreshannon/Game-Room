<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { CATEGORIES, CONTENDER_SUGGESTIONS } from '../../games/tier-talk/lists'
import {
  MAX_CATEGORY_LENGTH,
  MAX_NAME_LENGTH,
  MAX_ROUND_POINTS,
  TIERS,
  type Tier,
  type TierTalkMove,
  type TierTalkView,
} from '../../games/tier-talk/logic'
import type { PublicPlayer } from '../../shared/protocol'

const props = defineProps<{
  view: TierTalkView
  you: string
  players: PublicPlayer[]
}>()

const emit = defineEmits<{ move: [move: TierTalkMove] }>()

const nameOf = (id: string) => props.players.find((player) => player.id === id)?.name ?? 'Someone'

const isWizard = computed(() => props.view.wizardId === props.you)
const isGuesser = computed(() => props.view.guesserIds.includes(props.you))
const wizardName = computed(() => nameOf(props.view.wizardId))
const isLastRound = computed(
  () => props.view.phase === 'reveal' && props.view.history.length >= props.view.totalRounds,
)

// --- Choosing a category

const pickSome = <T,>(items: readonly T[], count: number) =>
  [...items].sort(() => Math.random() - 0.5).slice(0, count)

const categoryChoices = ref(pickSome(CATEGORIES, 5))
const customCategory = ref('')

function chooseCategory(text: string) {
  if (text.trim()) emit('move', { type: 'category', text })
}

// --- Naming contenders

const drafts = ref<string[]>([])

const yourSlots = computed(() =>
  props.view.slotOwners.flatMap((owner, slot) => (owner === props.you ? [slot] : [])),
)

function saveName(slot: number) {
  const text = drafts.value[slot]?.trim()
  if (text && text !== props.view.contenders[slot]) emit('move', { type: 'name', slot, text })
}

function suggestName(slot: number) {
  const used = new Set(props.view.contenders.map((name) => name?.toLowerCase()))
  const options = CONTENDER_SUGGESTIONS.filter((name) => !used.has(name.toLowerCase()))
  const pick = options[Math.floor(Math.random() * options.length)]
  if (!pick) return
  drafts.value[slot] = pick
  emit('move', { type: 'name', slot, text: pick })
}

const allNamed = computed(() => props.view.contenders.every(Boolean))

// --- The Wizard's secret ranking

const ranking = ref<(Tier | null)[]>([])
const rankingComplete = computed(() => ranking.value.length === 8 && ranking.value.every(Boolean))

function lockRanking() {
  if (rankingComplete.value) emit('move', { type: 'rank', tiers: ranking.value as Tier[] })
}

// --- Shared guessing board

const placedCount = computed(() => props.view.guessTiers.filter(Boolean).length)
const youAreReady = computed(() => props.view.ready.includes(props.you))

function guess(slot: number, tier: Tier) {
  const current = props.view.guessTiers[slot]
  emit('move', { type: 'guess', slot, tier: current === tier ? null : tier })
}

/** Which contenders sit in each tier, for the tier-list picture. */
function inTier(tiers: (Tier | null)[] | null, tier: Tier) {
  return (tiers ?? []).flatMap((value, slot) => (value === tier ? [slot] : []))
}

const roundPoints = computed(() => props.view.history.at(-1)?.points ?? 0)

const status = computed(() => {
  const { phase } = props.view
  if (phase === 'category') {
    return isWizard.value ? 'Choose a secret category' : `${wizardName.value} is choosing a secret category`
  }
  if (phase === 'names') {
    if (allNamed.value) {
      return isWizard.value ? 'All 8 contenders are in' : `Waiting for ${wizardName.value} to start ranking`
    }
    return yourSlots.value.some((slot) => !props.view.contenders[slot])
      ? 'Name your contenders: anyone at all'
      : 'Waiting for the other contenders to be named'
  }
  if (phase === 'rank') {
    return isWizard.value ? 'Rank each contender for your category' : `${wizardName.value} is ranking in secret`
  }
  if (phase === 'guess') {
    if (isWizard.value) return 'Your team is guessing your ranking'
    return 'Work together: where did the Wizard rank everyone?'
  }
  return `Your team scored ${roundPoints.value} of ${MAX_ROUND_POINTS}`
})

// Fresh drafts and choices each round, without wiping what someone is typing mid-phase.
watch(
  () => props.view.round,
  () => {
    categoryChoices.value = pickSome(CATEGORIES, 5)
    customCategory.value = ''
    ranking.value = Array(8).fill(null)
    drafts.value = [...props.view.contenders].map((name) => name ?? '')
  },
  { immediate: true },
)
watch(
  () => props.view.contenders,
  (contenders) => {
    contenders.forEach((name, slot) => {
      if (name && !yourSlots.value.includes(slot)) drafts.value[slot] = name
      else if (name && !drafts.value[slot]) drafts.value[slot] = name
    })
  },
)
</script>

<template>
  <div class="tier-talk">
    <header class="round-bar">
      <div>
        <p class="eyebrow">
          Round {{ view.round }} of {{ view.totalRounds }} · {{ wizardName }} is the Tier Wizard
        </p>
        <p class="status" aria-live="polite">{{ status }}</p>
      </div>
      <p class="team-score">
        Team score <strong>{{ view.totalPoints }}</strong>
        <span class="muted"> of {{ view.maxPoints }}</span>
      </p>
    </header>

    <p v-if="view.category" class="category">
      <span class="eyebrow">How good would they be at…</span>
      <strong>{{ view.category }}</strong>
    </p>

    <!-- Category -->
    <section v-if="view.phase === 'category' && isWizard" class="panel-inner">
      <p class="muted">Only you will see it until everyone has named the contenders.</p>
      <div class="choices">
        <button v-for="text in categoryChoices" :key="text" @click="chooseCategory(text)">{{ text }}</button>
        <button class="ghost" @click="categoryChoices = pickSome(CATEGORIES, 5)">Show others</button>
      </div>
      <form class="row" @submit.prevent="chooseCategory(customCategory)">
        <input
          v-model="customCategory"
          class="grow"
          :maxlength="MAX_CATEGORY_LENGTH"
          aria-label="Your own category"
          placeholder="Or write your own"
        />
        <button class="primary" type="submit" :disabled="!customCategory.trim()">Use this</button>
      </form>
    </section>

    <!-- Names -->
    <section v-if="view.phase === 'names'" class="panel-inner">
      <ol class="slots">
        <li v-for="(owner, slot) in view.slotOwners" :key="slot">
          <span class="slot-number">{{ slot + 1 }}</span>
          <template v-if="owner === you">
            <input
              v-model="drafts[slot]"
              class="grow"
              :maxlength="MAX_NAME_LENGTH"
              :aria-label="`Contender ${slot + 1}`"
              placeholder="Type a name"
              @keydown.enter.prevent="saveName(slot)"
              @blur="saveName(slot)"
            />
            <button class="small" @click="suggestName(slot)">Suggest</button>
            <span v-if="view.contenders[slot]" class="saved" aria-label="Saved">✓</span>
          </template>
          <template v-else>
            <span v-if="view.contenders[slot]" class="grow">{{ view.contenders[slot] }}</span>
            <span v-else class="grow muted">{{ nameOf(owner) }} is picking…</span>
          </template>
        </li>
      </ol>
      <button v-if="isWizard" class="primary" :disabled="!allNamed" @click="emit('move', { type: 'lockNames' })">
        Start ranking
      </button>
    </section>

    <!-- Wizard ranks in secret -->
    <section v-if="view.phase === 'rank' && isWizard" class="panel-inner">
      <ul class="rank-list">
        <li v-for="(name, slot) in view.contenders" :key="slot">
          <span class="grow contender-name">{{ name }}</span>
          <div class="tier-buttons" role="group" :aria-label="`Tier for ${name}`">
            <button
              v-for="tier in TIERS"
              :key="tier"
              class="tier-button"
              :class="[`tier-${tier}`, { picked: ranking[slot] === tier }]"
              :aria-pressed="ranking[slot] === tier"
              @click="ranking[slot] = tier"
            >
              {{ tier }}
            </button>
          </div>
        </li>
      </ul>
      <button class="primary" :disabled="!rankingComplete" @click="lockRanking">Lock in my ranking</button>
    </section>

    <section v-if="view.phase === 'rank' && !isWizard" class="panel-inner">
      <p class="muted">The contenders:</p>
      <p class="chips">
        <span v-for="(name, slot) in view.contenders" :key="slot" class="chip">{{ name }}</span>
      </p>
    </section>

    <!-- Shared guessing board -->
    <section v-if="view.phase === 'guess'" class="panel-inner">
      <ul class="rank-list">
        <li v-for="(name, slot) in view.contenders" :key="slot">
          <span class="grow contender-name">{{ name }}</span>
          <span v-if="isWizard && view.wizardTiers" class="muted secret">
            You said {{ view.wizardTiers[slot] }}
          </span>
          <div class="tier-buttons" role="group" :aria-label="`Team’s guess for ${name}`">
            <button
              v-for="tier in TIERS"
              :key="tier"
              class="tier-button"
              :class="[`tier-${tier}`, { picked: view.guessTiers[slot] === tier }]"
              :aria-pressed="view.guessTiers[slot] === tier"
              :disabled="!isGuesser"
              @click="guess(slot, tier)"
            >
              {{ tier }}
            </button>
          </div>
        </li>
      </ul>
      <div v-if="isGuesser" class="row ready-row">
        <button
          :class="{ primary: !youAreReady }"
          :disabled="placedCount < 8"
          @click="emit('move', { type: 'ready', ready: !youAreReady })"
        >
          {{ youAreReady ? 'Not ready' : 'Ready' }}
        </button>
        <span class="muted">
          {{ view.ready.length }} of {{ view.guesserIds.length }} ready
          <template v-if="placedCount < 8"> · place all 8 first</template>
        </span>
      </div>
      <p v-else class="muted">
        {{ view.ready.length }} of {{ view.guesserIds.length }} guessers are ready.
      </p>
    </section>

    <!-- Reveal -->
    <section v-if="view.phase === 'reveal' && view.wizardTiers" class="panel-inner">
      <div class="tier-compare">
        <div class="tier-column">
          <h3>{{ wizardName }}’s ranking</h3>
          <div v-for="tier in TIERS" :key="tier" class="tier-row">
            <span class="tier-label" :class="`tier-${tier}`">{{ tier }}</span>
            <span class="tier-items">
              <span v-for="slot in inTier(view.wizardTiers, tier)" :key="slot" class="chip">
                {{ view.contenders[slot] }}
              </span>
            </span>
          </div>
        </div>
        <div class="tier-column">
          <h3>Team’s guess</h3>
          <div v-for="tier in TIERS" :key="tier" class="tier-row">
            <span class="tier-label" :class="`tier-${tier}`">{{ tier }}</span>
            <span class="tier-items">
              <span
                v-for="slot in inTier(view.guessTiers, tier)"
                :key="slot"
                class="chip"
                :class="`points-${view.slotPoints?.[slot] ?? 0}`"
              >
                {{ view.contenders[slot] }} <small>+{{ view.slotPoints?.[slot] ?? 0 }}</small>
              </span>
            </span>
          </div>
        </div>
      </div>
      <p class="muted legend">+2 exact tier · +1 one tier off</p>
      <button
        v-if="!isLastRound"
        class="primary"
        @click="emit('move', { type: 'nextRound', round: view.round })"
      >
        Next round
      </button>
    </section>

    <section v-if="view.history.length" class="history">
      <h2>Rounds so far</h2>
      <ol>
        <li v-for="(record, index) in view.history" :key="index">
          <span>{{ nameOf(record.wizardId) }}: {{ record.category }}</span>
          <strong>{{ record.points }} / {{ MAX_ROUND_POINTS }}</strong>
        </li>
      </ol>
    </section>
  </div>
</template>

<style scoped>
.tier-talk {
  display: grid;
  gap: 1rem;
  width: 100%;
  min-width: 0;
}

.round-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  justify-content: space-between;
  gap: 0.5rem 1.5rem;
}

.status {
  font-size: 1.2rem;
  font-weight: 700;
}

.team-score strong {
  font-size: 1.3rem;
}

.category {
  display: grid;
  gap: 0.2rem;
  padding: 0.75rem 1rem;
  border-radius: var(--radius);
  background: var(--accent-soft);
}

.category strong {
  font-size: 1.35rem;
  overflow-wrap: anywhere;
}

.panel-inner {
  display: grid;
  gap: 0.9rem;
  justify-items: start;
}

.choices {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.ghost {
  border-style: dashed;
}

.row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
}

.grow {
  flex: 1 1 10rem;
  min-width: 0;
}

.slots,
.rank-list {
  display: grid;
  gap: 0.5rem;
  width: 100%;
  margin: 0;
  padding: 0;
  list-style: none;
}

.slots li,
.rank-list li {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: var(--radius);
}

.slot-number {
  width: 1.5rem;
  color: var(--muted);
  font-weight: 700;
}

.small {
  padding: 0.3rem 0.6rem;
  font-size: 0.85rem;
}

.saved {
  color: #1f8a4c;
  font-weight: 800;
}

.contender-name {
  font-weight: 600;
  overflow-wrap: anywhere;
}

.secret {
  font-size: 0.85rem;
}

.tier-buttons {
  display: flex;
  gap: 0.25rem;
}

.tier-button {
  width: 2.4rem;
  padding: 0.35rem 0;
  font-weight: 800;
}

.tier-button:disabled {
  opacity: 0.7;
  cursor: default;
}

/* Classic tier-list colors, from S at the top to D at the bottom. */
.tier-S {
  --tier: #ff7f7f;
}
.tier-A {
  --tier: #ffbf7f;
}
.tier-B {
  --tier: #ffdf7f;
}
.tier-C {
  --tier: #bfff7f;
}
.tier-D {
  --tier: #7fbfff;
}

.tier-button.picked,
.tier-label {
  border-color: #222222;
  background: var(--tier);
  color: #222222;
}

.tier-button.picked:disabled {
  opacity: 1;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.chip {
  padding: 0.2rem 0.6rem;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--surface);
  font-size: 0.9rem;
}

.chip.points-2 {
  border-color: #1f8a4c;
  background: #d8f5e3;
  color: #12432a;
}

.chip.points-1 {
  border-color: #b8860b;
  background: #fff1c7;
  color: #4d3800;
}

.tier-compare {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 18rem), 1fr));
  gap: 1rem;
  width: 100%;
}

.tier-column h3 {
  margin: 0 0 0.5rem;
  font-size: 1rem;
}

.tier-row {
  display: flex;
  align-items: stretch;
  min-height: 2.4rem;
  border: 1px solid var(--line);
  border-bottom: 0;
}

.tier-row:last-child {
  border-bottom: 1px solid var(--line);
}

.tier-label {
  display: flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 2.4rem;
  font-weight: 800;
}

.tier-items {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem;
}

.legend {
  font-size: 0.85rem;
}

.history ol {
  display: grid;
  gap: 0.3rem;
  margin: 0.5rem 0 0;
  padding: 0;
  list-style: none;
}

.history li {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
}
</style>
