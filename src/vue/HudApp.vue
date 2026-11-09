<script setup lang="ts">
import { computed } from 'vue'
import { hud, hudActions } from '../state/hud'

const hpPct = computed(() => `${Math.max(0, Math.min(100, hud.hp))}%`)
const spread = computed(() => `${hud.spread.toFixed(1)}px`)
const headshot = computed(() => hud.hitKey > 0 && hud.hitKey === hud.headshotKey)
const pingClass = computed(() => (hud.ping > 160 ? 'bad' : hud.ping > 80 ? 'warn' : 'good'))
</script>

<template>
  <div class="hud">
    <div class="vignette" :style="{ opacity: String(hud.damageFlash * 0.9) }" />

    <div v-if="hud.alive" class="crosshair" :style="{ '--spread': spread }">
      <span class="arm up" />
      <span class="arm down" />
      <span class="arm left" />
      <span class="arm right" />
      <span class="dot" />
    </div>

    <div v-if="hud.hitKey > 0" :key="hud.hitKey" class="hitmarker" :class="{ head: headshot }">
      <i />
      <i />
    </div>

    <header class="topbar">
      <div class="chip code">
        <span class="label">{{ hud.isHost ? 'Invite code' : 'Arena' }}</span>
        <strong>{{ hud.code }}</strong>
        <button class="copy" @click="hudActions.copyInvite()">
          {{ hud.isHost ? 'Copy' : 'Share' }}
        </button>
      </div>
      <div class="chip">
        {{ hud.playerCount }} <span class="dim">player{{ hud.playerCount === 1 ? '' : 's' }}</span>
      </div>
      <div class="chip" :class="pingClass">
        {{ hud.ping }} <span class="dim">ms</span>
      </div>
      <div class="chip dim">{{ hud.fps }} fps</div>
      <button class="leave" @click="hudActions.leave()">Leave</button>
    </header>

    <Transition name="fade">
      <div v-if="hud.notice" class="notice">{{ hud.notice }}</div>
    </Transition>

    <ul class="feed">
      <li
        v-for="entry in hud.feed"
        :key="entry.id"
        :class="{ mine: entry.killerIsMe, victimMe: entry.victimIsMe }"
      >
        <span class="k">{{ entry.killer }}</span>
        <span class="sep">▸</span>
        <span class="v">{{ entry.victim }}</span>
      </li>
    </ul>

    <section class="vitals">
      <div class="hpRow">
        <span class="hpNum" :class="{ low: hud.hp <= 30 }">{{ hud.hp }}</span>
        <span class="hpUnit">HP</span>
      </div>
      <div class="hpBar">
        <div class="hpFill" :class="{ low: hud.hp <= 30 }" :style="{ width: hpPct }" />
      </div>
    </section>

    <section class="ammo">
      <div class="ammoRow">
        <span class="ammoNum">{{ hud.ammo }}</span>
        <span class="ammoMag">/ {{ hud.magSize }}</span>
      </div>
      <div v-if="hud.reloading" class="reloadWrap">
        <div class="reloadBar" :style="{ width: hud.reloadProgress * 100 + '%' }" />
        <span class="reloadLabel">RELOADING</span>
      </div>
      <div v-else-if="hud.ammo <= 6" class="reloadHint">Press R to reload</div>
    </section>

    <section v-if="hud.showScore" class="scoreboard">
      <h2>Scoreboard</h2>
      <ul>
        <li v-for="row in hud.scoreboard" :key="row.id" :class="{ me: row.me }">
          <span class="name">{{ row.name }}<em v-if="!row.alive"> · down</em></span>
          <span class="k">{{ row.kills }}</span>
          <span class="d">{{ row.deaths }}</span>
        </li>
      </ul>
      <p class="hint">Hold Tab · Esc releases the mouse</p>
    </section>

    <div v-if="!hud.alive" class="overlay dead">
      <h1>ELIMINATED</h1>
      <p v-if="hud.killedBy" class="by">by {{ hud.killedBy }}</p>
      <p class="count">{{ hud.respawnIn.toFixed(1) }}s</p>
      <p class="sub">Respawning at the far corner…</p>
    </div>

    <div v-else-if="!hud.locked" class="overlay lock" @click.self="hudActions.requestLock()">
      <h1>NEON ARENA</h1>
      <p class="sub">Lock the mouse to fight</p>
      <button class="cta" @click="hudActions.requestLock()">Enter the arena</button>
      <div class="tips">
        <span><b>WASD</b> move</span>
        <span><b>Shift</b> sprint</span>
        <span><b>Space</b> jump</span>
        <span><b>Click</b> fire</span>
        <span><b>R</b> reload</span>
        <span><b>Tab</b> scores</span>
      </div>
      <button class="linky" @click="hudActions.leave()">Leave match</button>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  inset: 0;
  pointer-events: none;
  color: #e8f6ff;
  font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif;
  user-select: none;
  overflow: hidden;
}

.vignette {
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 50% 55%, transparent 40%, rgba(255, 40, 70, 0.75) 100%);
  transition: opacity 90ms linear;
}

/* crosshair */
.crosshair {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
}
.arm {
  position: absolute;
  background: rgba(235, 250, 255, 0.9);
  box-shadow: 0 0 6px rgba(56, 225, 255, 0.9);
}
.arm.up,
.arm.down {
  width: 2px;
  height: 9px;
  left: -1px;
  transform: translateY(-50%);
}
.arm.up {
  bottom: calc(var(--spread) + 5px);
}
.arm.down {
  top: calc(var(--spread) + 5px);
}
.arm.left,
.arm.right {
  height: 2px;
  width: 9px;
  top: -1px;
  transform: translateX(-50%);
}
.arm.left {
  right: calc(var(--spread) + 5px);
}
.arm.right {
  left: calc(var(--spread) + 5px);
}
.dot {
  position: absolute;
  width: 3px;
  height: 3px;
  left: -1.5px;
  top: -1.5px;
  border-radius: 50%;
  background: #ffe9a8;
}

/* hitmarker */
.hitmarker {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0;
  height: 0;
  animation: hitpop 220ms ease-out forwards;
}
.hitmarker i {
  position: absolute;
  width: 2px;
  height: 13px;
  left: -1px;
  top: -6px;
  background: #ffffff;
  box-shadow: 0 0 8px #fff;
}
.hitmarker i:first-child {
  transform: translate(-7px, 0) rotate(45deg);
}
.hitmarker i:last-child {
  transform: translate(7px, 0) rotate(-45deg);
}
.hitmarker.head i {
  background: #ffd479;
  box-shadow: 0 0 10px #ffb347;
}
@keyframes hitpop {
  0% {
    opacity: 1;
    transform: scale(1.35);
  }
  100% {
    opacity: 0;
    transform: scale(0.9);
  }
}

/* top bar */
.topbar {
  position: absolute;
  top: 14px;
  left: 16px;
  right: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 9px;
  background: rgba(7, 13, 22, 0.68);
  border: 1px solid rgba(56, 225, 255, 0.22);
  backdrop-filter: blur(6px);
}
.chip .dim,
.dim {
  color: rgba(200, 226, 240, 0.55);
}
.chip.code {
  gap: 8px;
}
.chip.code .label {
  color: rgba(200, 226, 240, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.12em;
  font-size: 9px;
}
.chip.code strong {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 15px;
  letter-spacing: 0.16em;
  color: #8df0ff;
}
.copy,
.leave {
  pointer-events: auto;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  padding: 4px 9px;
  border-radius: 6px;
  border: 1px solid rgba(56, 225, 255, 0.4);
  background: rgba(56, 225, 255, 0.12);
  color: #bdf3ff;
  transition: background 120ms;
}
.copy:hover,
.leave:hover {
  background: rgba(56, 225, 255, 0.28);
}
.leave {
  margin-left: auto;
  border-color: rgba(255, 90, 120, 0.4);
  background: rgba(255, 90, 120, 0.12);
  color: #ffc3cd;
}
.leave:hover {
  background: rgba(255, 90, 120, 0.28);
}
.chip.good {
  color: #7dffb0;
}
.chip.warn {
  color: #ffd479;
}
.chip.bad {
  color: #ff7d92;
}

.notice {
  position: absolute;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  padding: 7px 14px;
  border-radius: 8px;
  background: rgba(7, 13, 22, 0.8);
  border: 1px solid rgba(56, 225, 255, 0.28);
  font-size: 12px;
  letter-spacing: 0.04em;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 200ms;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* kill feed */
.feed {
  position: absolute;
  top: 64px;
  right: 18px;
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  align-items: flex-end;
  font-size: 12px;
}
.feed li {
  padding: 4px 9px;
  border-radius: 6px;
  background: rgba(7, 13, 22, 0.7);
  border: 1px solid rgba(120, 160, 190, 0.18);
  display: inline-flex;
  gap: 6px;
  align-items: baseline;
}
.feed .k {
  color: #a9d8ff;
}
.feed .v {
  color: #ff9db0;
  text-decoration: line-through;
  text-decoration-color: rgba(255, 157, 176, 0.5);
}
.feed .sep {
  color: rgba(200, 226, 240, 0.4);
}
.feed li.mine {
  border-color: rgba(77, 255, 155, 0.45);
  box-shadow: 0 0 14px rgba(77, 255, 155, 0.16);
}
.feed li.mine .k {
  color: #7dffb0;
}
.feed li.victimMe {
  border-color: rgba(255, 90, 120, 0.45);
}

/* vitals */
.vitals {
  position: absolute;
  left: 22px;
  bottom: 22px;
  width: 208px;
}
.hpRow {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.hpNum {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 34px;
  font-weight: 700;
  line-height: 1;
  color: #7dffb0;
  text-shadow: 0 0 18px rgba(77, 255, 155, 0.4);
}
.hpNum.low {
  color: #ff5a74;
  text-shadow: 0 0 18px rgba(255, 90, 116, 0.5);
}
.hpUnit {
  font-size: 11px;
  letter-spacing: 0.18em;
  color: rgba(200, 226, 240, 0.5);
}
.hpBar {
  margin-top: 6px;
  height: 6px;
  border-radius: 4px;
  background: rgba(9, 16, 26, 0.8);
  border: 1px solid rgba(120, 160, 190, 0.2);
  overflow: hidden;
}
.hpFill {
  height: 100%;
  background: linear-gradient(90deg, #2affa0, #7dffb0);
  box-shadow: 0 0 12px rgba(77, 255, 155, 0.6);
  transition: width 140ms ease-out;
}
.hpFill.low {
  background: linear-gradient(90deg, #ff2d55, #ff8a9c);
  box-shadow: 0 0 12px rgba(255, 90, 116, 0.7);
}

/* ammo */
.ammo {
  position: absolute;
  right: 22px;
  bottom: 22px;
  text-align: right;
}
.ammoRow {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  gap: 5px;
}
.ammoNum {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 38px;
  font-weight: 700;
  line-height: 1;
  color: #ffe9a8;
  text-shadow: 0 0 18px rgba(255, 190, 90, 0.35);
}
.ammoMag {
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 14px;
  color: rgba(200, 226, 240, 0.5);
}
.reloadWrap {
  position: relative;
  margin-top: 7px;
  width: 132px;
  height: 5px;
  border-radius: 4px;
  background: rgba(9, 16, 26, 0.85);
  border: 1px solid rgba(255, 190, 90, 0.28);
  overflow: hidden;
  margin-left: auto;
}
.reloadBar {
  height: 100%;
  background: linear-gradient(90deg, #ffb347, #ffe9a8);
}
.reloadLabel,
.reloadHint {
  display: block;
  margin-top: 5px;
  font-size: 10px;
  letter-spacing: 0.22em;
  color: #ffd479;
}
.reloadHint {
  letter-spacing: 0.06em;
  color: rgba(255, 212, 121, 0.8);
}

/* scoreboard */
.scoreboard {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(440px, 86vw);
  padding: 18px 20px 14px;
  border-radius: 14px;
  background: rgba(6, 11, 20, 0.9);
  border: 1px solid rgba(56, 225, 255, 0.3);
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(10px);
}
.scoreboard h2 {
  margin: 0 0 12px;
  font-size: 12px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(160, 220, 240, 0.75);
  font-weight: 600;
}
.scoreboard ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
  font-size: 13px;
}
.scoreboard li {
  display: grid;
  grid-template-columns: 1fr 44px 44px;
  align-items: center;
  padding: 6px 8px;
  border-radius: 7px;
  background: rgba(12, 22, 36, 0.6);
}
.scoreboard li.me {
  background: rgba(56, 225, 255, 0.14);
  border: 1px solid rgba(56, 225, 255, 0.35);
}
.scoreboard .name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.scoreboard .name em {
  font-style: normal;
  color: rgba(255, 120, 140, 0.8);
  font-size: 11px;
}
.scoreboard .k,
.scoreboard .d {
  text-align: center;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
}
.scoreboard .k {
  color: #7dffb0;
}
.scoreboard .d {
  color: rgba(255, 157, 176, 0.85);
}
.scoreboard .hint {
  margin: 10px 0 0;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(200, 226, 240, 0.4);
  text-align: center;
}

/* overlays */
.overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background: radial-gradient(circle at 50% 50%, rgba(5, 8, 15, 0.72), rgba(3, 5, 10, 0.94));
  backdrop-filter: blur(3px);
}
.overlay.lock {
  pointer-events: auto;
  cursor: pointer;
}
.overlay.dead {
  background: radial-gradient(circle at 50% 50%, rgba(40, 4, 10, 0.55), rgba(3, 5, 10, 0.92));
}
.overlay h1 {
  margin: 0;
  font-size: clamp(30px, 6vw, 58px);
  letter-spacing: 0.14em;
  font-weight: 800;
  color: #eaf9ff;
  text-shadow: 0 0 40px rgba(56, 225, 255, 0.45);
}
.overlay.dead h1 {
  color: #ff8fa3;
  text-shadow: 0 0 40px rgba(255, 60, 90, 0.4);
  letter-spacing: 0.2em;
}
.overlay .sub {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.08em;
  color: rgba(200, 226, 240, 0.65);
}
.overlay .by {
  margin: 0;
  font-size: 14px;
  color: rgba(255, 200, 210, 0.85);
}
.overlay .count {
  margin: 2px 0 0;
  font-family: ui-monospace, 'SFMono-Regular', Menlo, monospace;
  font-size: 28px;
  color: #ffd479;
}
.cta {
  pointer-events: auto;
  margin-top: 8px;
  cursor: pointer;
  font: inherit;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 12px 26px;
  border-radius: 10px;
  border: none;
  color: #04121a;
  background: linear-gradient(135deg, #38e1ff, #7df9c9);
  box-shadow: 0 10px 34px rgba(56, 225, 255, 0.35);
  transition: transform 120ms, box-shadow 120ms;
}
.cta:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 40px rgba(56, 225, 255, 0.5);
}
.tips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  justify-content: center;
  max-width: 460px;
  margin-top: 12px;
  font-size: 11px;
  color: rgba(200, 226, 240, 0.6);
}
.tips b {
  color: #8df0ff;
  font-weight: 600;
}
.linky {
  pointer-events: auto;
  margin-top: 14px;
  cursor: pointer;
  font: inherit;
  font-size: 11px;
  background: none;
  border: none;
  color: rgba(200, 226, 240, 0.45);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.linky:hover {
  color: #ffc3cd;
}
</style>
