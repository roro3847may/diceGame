"use client";

import { useMemo, useRef, useState } from "react";

type Affinity = "physical" | "agility" | "magic";
type Role = "tank" | "dealer" | "healer";
type Phase = "home" | "setup" | "combat" | "perk" | "gameover";
type HealerMode = "heal" | "damage" | "xp";
type ArtifactKind = "xp" | "revive" | "vigor" | "shield" | "strike" | "mending" | "ward" | "focus";
type TransitionCue = { kind: "wave" | "stage"; title: string; subtitle: string; key: number } | null;
type LootCue = { name: string; label: string; key: number } | null;

type PerkRanks = Record<1 | 2 | 3, 0 | 1 | 2>;

type Hero = {
  id: string;
  name: string;
  affinity: Affinity;
  role: Role;
  hp: number;
  maxHp: number;
  shield: number;
  level: number;
  xp: number;
  perks: PerkRanks;
  reviveCharges: number;
  guardCharges: number;
  guarded: boolean;
  artifacts: [string | null, string | null];
};

type DraftHero = Pick<Hero, "name" | "affinity" | "role">;

type Enemy = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
  xp: number;
};

type PendingPerk = {
  heroId: string;
  level: number;
};

type RollState = {
  heroId: string;
  value: number;
  detail: string;
  mode: "normal" | "guard";
};

type Artifact = {
  id: string;
  kind: ArtifactKind;
  name: string;
  value: number;
  text: string;
  consumed?: boolean;
};

const AFFINITIES: Record<Affinity, { label: string; die: string; mark: string; desc: string }> = {
  physical: { label: "물리", die: "D6+1", mark: "힘", desc: "D6+1" },
  agility: { label: "민첩", die: "D4+", mark: "속", desc: "D4, 1이 아니면 한 번 더" },
  magic: { label: "마법", die: "복사", mark: "술", desc: "직전 최종값 복사" },
};

const ROLES: Record<Role, { label: string; mark: string }> = {
  tank: { label: "탱커", mark: "방" },
  dealer: { label: "딜러", mark: "검" },
  healer: { label: "힐러", mark: "치" },
};

const PERKS: Record<Role, Record<1 | 2 | 3, { title: string; ranks: [string, string] }>> = {
  tank: {
    1: { title: "후열 보호", ranks: ["바로 뒤 1명에게 같은 실드", "바로 뒤 2명에게 같은 실드"] },
    2: { title: "두꺼운 방패", ranks: ["실드량 1.5배", "실드량 2배"] },
    3: { title: "수호막", ranks: ["스테이지당 1회 공격 무마", "스테이지당 2회 공격 무마"] },
  },
  dealer: {
    1: { title: "연쇄 타격", ranks: ["무작위 적 1명에게 50% 추가 피해", "무작위 적 2명에게 50% 추가 피해"] },
    2: { title: "치명 집중", ranks: ["최종값 1.5배 피해", "최종값 2배 피해"] },
    3: { title: "사냥 본능", ranks: ["막타 경험치 추가", "막타 경험치 더 많이 추가"] },
  },
  healer: {
    1: { title: "암흑 치유", ranks: ["힐 대신 공격 가능", "힐/공격/경험치 부여 가능"] },
    2: { title: "광역 회복", ranks: ["2명 회복", "3명 회복"] },
    3: { title: "소생", ranks: ["스테이지당 1회 HP 1 부활", "스테이지당 2회 HP 1 부활"] },
  },
};

const HERO_NAMES = ["레온", "이라", "로완", "미라", "카엘"];
const ENEMY_NAMES = ["그늘 병사", "녹슨 기사", "공허 추적자", "잿빛 사제", "균열 인형", "검은 파수꾼"];
const AFFINITY_KEYS: Affinity[] = ["physical", "agility", "magic"];
const ROLE_KEYS: Role[] = ["tank", "dealer", "healer"];
const PERK_LEVELS = [5, 10, 15, 20];
const ARTIFACT_NAMES: Record<ArtifactKind, string> = {
  xp: "기록자의 깃털",
  revive: "꺼지지 않는 심지",
  vigor: "거인의 심장",
  shield: "수호자의 파편",
  strike: "붉은 송곳니",
  mending: "새벽의 잔",
  ward: "흐린 거울",
  focus: "별빛 주사위",
};

const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const hpBar = (current: number, max: number) => `${clamp((current / max) * 100, 0, 100)}%`;
const xpToNext = (level: number) => Math.floor(18 + level * level * 5.5);
const hpForLevel = (level: number) => 10 + Math.floor((level - 1) * 2.8 + Math.max(0, level - 6) * 0.8);
const artifactValueLabel = (artifact: Artifact) => {
  if (artifact.kind === "xp") return `x${artifact.value.toFixed(2)}`;
  if (artifact.kind === "revive") return `HP ${artifact.value}`;
  return `+${artifact.value}`;
};
const makeArtifact = (stage: number, wave: number): Artifact => {
  const kind = (["xp", "revive", "vigor", "shield", "strike", "mending", "ward", "focus"] as ArtifactKind[])[randomInt(0, 7)];
  const tier = Math.max(1, Math.floor((stage + wave) / 3));
  let value = 1;
  if (kind === "xp") value = Number((1.12 + randomInt(0, 10) / 100 + tier * 0.02).toFixed(2));
  else if (kind === "revive") value = randomInt(2 + tier, 4 + tier * 2);
  else if (kind === "vigor") value = randomInt(3 + tier, 5 + tier * 2);
  else if (kind === "ward") value = randomInt(1 + Math.floor(tier / 2), 2 + tier);
  else value = randomInt(1 + Math.floor(tier / 2), 2 + tier);

  const text: Record<ArtifactKind, string> = {
    xp: `경험치 획득 ${value.toFixed(2)}배`,
    revive: `사망 시 즉시 HP ${value}로 부활 후 폐기`,
    vigor: `최대 체력 +${value}`,
    shield: `얻는 실드 +${value}`,
    strike: `공격 피해 +${value}`,
    mending: `장착자가 주는 회복량 +${value}`,
    ward: `받는 피해 ${value} 감소`,
    focus: `최종 주사위 +${value}`,
  };

  return {
    id: `artifact-${Date.now()}-${Math.random()}`,
    kind,
    name: ARTIFACT_NAMES[kind],
    value,
    text: text[kind],
  };
};
let sharedAudioContext: AudioContext | null = null;

const getAudioContext = () => {
  if (typeof window === "undefined") return null;
  const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!sharedAudioContext) sharedAudioContext = new AudioContextClass();
  if (sharedAudioContext.state === "suspended") void sharedAudioContext.resume();
  return sharedAudioContext;
};

const unlockAudio = () => {
  const context = getAudioContext();
  if (!context) return;
  const gain = context.createGain();
  gain.gain.value = 0.0001;
  gain.connect(context.destination);
  const oscillator = context.createOscillator();
  oscillator.frequency.value = 180;
  oscillator.connect(gain);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.02);
};

const playTone = (frequency: number, duration = 0.08, volume = 0.025, type: OscillatorType = "triangle") => {
  const context = getAudioContext();
  if (!context) return;
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = frequency;
  oscillator.type = type;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(volume, context.currentTime + 0.008);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + duration);
  oscillator.stop(context.currentTime + duration);
};

const playChord = (frequencies: number[], duration = 0.12, volume = 0.018) => {
  frequencies.forEach((frequency, index) => {
    window.setTimeout(() => playTone(frequency, duration, volume), index * 32);
  });
};

const playSfx = (name: "ui" | "roll" | "attack" | "heal" | "loot" | "wave" | "stage" | "equip" | "enemy") => {
  if (name === "roll") return playChord([392, 523, 659, 784], 0.045, 0.016);
  if (name === "attack") return playChord([196, 330, 262], 0.07, 0.022);
  if (name === "heal") return playChord([440, 554, 659], 0.11, 0.018);
  if (name === "loot") return playChord([659, 784, 988, 1175], 0.105, 0.024);
  if (name === "wave") return playChord([247, 370, 494], 0.12, 0.018);
  if (name === "stage") return playChord([196, 262, 392, 523], 0.18, 0.02);
  if (name === "equip") return playChord([330, 440], 0.07, 0.017);
  if (name === "enemy") return playTone(120, 0.09, 0.024, "sawtooth");
  return playChord([220, 277, 330], 0.08, 0.014);
};

const makeDrafts = (size: 3 | 5): DraftHero[] =>
  Array.from({ length: size }, (_, index) => ({
    name: HERO_NAMES[index],
    affinity: AFFINITY_KEYS[index % AFFINITY_KEYS.length],
    role: ROLE_KEYS[index % ROLE_KEYS.length],
  }));

const waveCountFor = (stage: number, partySize: number) =>
  clamp(2 + Math.floor((stage - 1) / 2) + (partySize === 5 && stage > 3 ? 1 : 0), 2, partySize === 3 ? 5 : 6);

const enemiesForWave = (stage: number, wave: number, totalWaves: number, partySize: number): Enemy[] => {
  const baseCount = partySize === 3 ? 1 : 2;
  const count = clamp(baseCount + Math.floor((wave - 1) / 2) + (stage > 7 ? 1 : 0), 1, partySize === 3 ? 3 : 4);
  return Array.from({ length: count }, (_, index) => {
    const elite = wave === totalWaves && index === count - 1 ? 1 : 0;
    const hp = Math.floor(5 + stage * 2.05 + wave * 1.05 + elite * (3 + stage * 0.7));
    const attack = Math.max(1, Math.floor(1.4 + stage * 0.85 + wave * 0.45 + elite));
    return {
      id: `enemy-${stage}-${wave}-${index}-${Math.random()}`,
      name: `${ENEMY_NAMES[(stage + wave + index) % ENEMY_NAMES.length]} ${wave}-${index + 1}`,
      hp,
      maxHp: hp,
      attack,
      xp: Math.floor(5 + stage * 2 + wave * 1.5 + elite * stage),
    };
  });
};

const makeStage = (stage: number, partySize: number) => {
  const total = waveCountFor(stage, partySize);
  return {
    totalWaves: total,
    enemies: enemiesForWave(stage, 1, total, partySize),
  };
};

const createHero = (draft: DraftHero, index: number): Hero => ({
  ...draft,
  name: draft.name.trim() || `모험가 ${index + 1}`,
  id: `hero-${Date.now()}-${index}`,
  hp: 10,
  maxHp: 10,
  shield: 0,
  level: 1,
  xp: 0,
  perks: { 1: 0, 2: 0, 3: 0 },
  reviveCharges: 0,
  guardCharges: 0,
  guarded: false,
  artifacts: [null, null],
});

const heroArtifacts = (hero: Hero, artifacts: Artifact[]) =>
  hero.artifacts.map((id) => artifacts.find((artifact) => artifact.id === id)).filter((artifact): artifact is Artifact => Boolean(artifact));

const artifactSum = (hero: Hero, artifacts: Artifact[], kind: ArtifactKind) =>
  heroArtifacts(hero, artifacts).filter((artifact) => artifact.kind === kind).reduce((sum, artifact) => sum + artifact.value, 0);

const xpMultiplierOf = (hero: Hero, artifacts: Artifact[]) =>
  heroArtifacts(hero, artifacts).filter((artifact) => artifact.kind === "xp").reduce((multi, artifact) => multi * artifact.value, 1);

const maxHpOf = (hero: Hero, artifacts: Artifact[]) => hero.maxHp + artifactSum(hero, artifacts, "vigor");

const applyLevelUps = (hero: Hero, gained: number): { hero: Hero; pending: PendingPerk[]; notes: string[] } => {
  const next = { ...hero, xp: hero.xp + gained };
  const pending: PendingPerk[] = [];
  const notes: string[] = [];

  while (next.xp >= xpToNext(next.level)) {
    next.xp -= xpToNext(next.level);
    next.level += 1;
    const nextMax = hpForLevel(next.level);
    const hpGain = nextMax - next.maxHp;
    next.maxHp = nextMax;
    next.hp = Math.min(next.maxHp, next.hp + hpGain);
    notes.push(`${next.name} 레벨 ${next.level}`);
    if (PERK_LEVELS.includes(next.level)) pending.push({ heroId: next.id, level: next.level });
  }

  return { hero: next, pending, notes };
};

export default function Home() {
  const [phase, setPhase] = useState<Phase>("home");
  const [partySize, setPartySize] = useState<3 | 5>(3);
  const [drafts, setDrafts] = useState<DraftHero[]>(() => makeDrafts(3));
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [stage, setStage] = useState(1);
  const [wave, setWave] = useState(1);
  const [totalWaves, setTotalWaves] = useState(2);
  const [acted, setActed] = useState<string[]>([]);
  const [, setSelectedHero] = useState<string | null>(null);
  const [selectedEnemy, setSelectedEnemy] = useState<string | null>(null);
  const [selectedAlly, setSelectedAlly] = useState<string | null>(null);
  const [healerMode, setHealerMode] = useState<HealerMode>("heal");
  const [multiTargets, setMultiTargets] = useState<string[]>([]);
  const [rolled, setRolled] = useState<RollState | null>(null);
  const [rollingValue, setRollingValue] = useState<number | null>(null);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [turnStarted, setTurnStarted] = useState(false);
  const [pendingPerks, setPendingPerks] = useState<PendingPerk[]>([]);
  const [log, setLog] = useState<string[]>(["파티를 만들고 원정을 시작하세요."]);
  const [showRules, setShowRules] = useState(true);
  const [transitionCue, setTransitionCue] = useState<TransitionCue>(null);
  const [lootCue, setLootCue] = useState<LootCue>(null);
  const lootCueTimer = useRef<number | null>(null);

  const livingHeroes = useMemo(() => heroes.filter((hero) => hero.hp > 0), [heroes]);
  const livingEnemies = useMemo(() => enemies.filter((enemy) => enemy.hp > 0), [enemies]);
  const currentHero = heroes.find((hero) => hero.hp > 0 && !acted.includes(hero.id)) ?? null;
  const activeHero = currentHero;
  const canReorder = phase === "combat" && !turnStarted && !rolled && rollingValue === null;
  const turnText = artifacts.length > 0 && phase === "combat"
    ? `유물을 장착하세요 · ${currentHero ? `${currentHero.name} 행동` : "적 턴"}`
    : currentHero ? `${currentHero.name} 행동` : "적 턴";

  const appendLog = (message: string) => setLog((current) => [message, ...current].slice(0, 12));

  const showTransition = (kind: "wave" | "stage", title: string, subtitle: string) => {
    playSfx(kind);
    setTransitionCue({ kind, title, subtitle, key: Date.now() });
    window.setTimeout(() => setTransitionCue(null), kind === "wave" ? 820 : 1200);
  };

  const showLootCue = (artifact: Artifact) => {
    if (lootCueTimer.current) window.clearTimeout(lootCueTimer.current);
    setLootCue({ name: artifact.name, label: artifactValueLabel(artifact), key: Date.now() });
    lootCueTimer.current = window.setTimeout(() => setLootCue(null), 1050);
  };

  const changePartySize = (size: 3 | 5) => {
    setPartySize(size);
    setDrafts(makeDrafts(size));
  };

  const openSetup = (size: 3 | 5) => {
    unlockAudio();
    playSfx("ui");
    setPartySize(size);
    setDrafts(makeDrafts(size));
    setPhase("setup");
  };

  const updateDraft = (index: number, patch: Partial<DraftHero>) => {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft));
  };

  const startGame = () => {
    unlockAudio();
    playChord([262, 330, 392], 0.12, 0.02);
    const party = drafts.map(createHero);
    const nextStage = makeStage(1, partySize);
    setHeroes(party);
    setEnemies(nextStage.enemies);
    setArtifacts([]);
    setStage(1);
    setWave(1);
    setTotalWaves(nextStage.totalWaves);
    setActed([]);
    setSelectedHero(party[0]?.id ?? null);
    setSelectedEnemy(nextStage.enemies[0]?.id ?? null);
    setSelectedAlly(party[0]?.id ?? null);
    setMultiTargets(party[0]?.id ? [party[0].id] : []);
    setRolled(null);
    setLastRoll(null);
    setTurnStarted(false);
    setPendingPerks([]);
    setLog([`스테이지 1, 웨이브 1/${nextStage.totalWaves} 시작.`, "위에 있는 캐릭터부터 행동합니다."]);
    setShowRules(false);
    setPhase("combat");
  };

  const resetGame = () => {
    setPhase("home");
    setDrafts(makeDrafts(partySize));
    setHeroes([]);
    setEnemies([]);
    setArtifacts([]);
    setStage(1);
    setWave(1);
    setActed([]);
    setPendingPerks([]);
    setSelectedHero(null);
    setRolled(null);
    setRollingValue(null);
    setLastRoll(null);
    setTurnStarted(false);
    setLog(["새 원정을 준비합니다."]);
  };

  const moveHero = (heroId: string, direction: -1 | 1) => {
    if (!canReorder) return;
    setHeroes((current) => {
      const index = current.findIndex((hero) => hero.id === heroId);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= current.length) return current;
      const next = [...current];
      [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
      setSelectedHero(next.find((hero) => hero.hp > 0)?.id ?? null);
      return next;
    });
  };

  const rollValue = (hero: Hero) => {
    let base = 1;
    let detail = "";
    if (hero.affinity === "physical") {
      const die = randomInt(1, 6);
      base = die + 1;
      detail = `D6 ${die} + 1`;
    } else if (hero.affinity === "agility") {
      const first = randomInt(1, 4);
      const second = first === 1 ? 0 : randomInt(1, 4);
      base = first + second;
      detail = second ? `D4 ${first} + ${second}` : `D4 ${first}`;
    } else {
      base = lastRoll ?? 1;
      detail = lastRoll === null ? "복사값 없음: 1" : `직전값 ${lastRoll}`;
    }
    const value = base + hero.level - 1 + artifactSum(hero, artifacts, "focus");
    return { value, detail: `${detail} + 레벨 ${hero.level - 1}` };
  };

  const rollForHero = () => {
    if (!activeHero || activeHero.id !== currentHero?.id || rolled || rollingValue !== null) return;
    playSfx("roll");
    setTurnStarted(true);
    let ticks = 0;
    const roller = window.setInterval(() => {
      ticks += 1;
      setRollingValue(randomInt(1, 12));
      if (ticks >= 12) {
        window.clearInterval(roller);
        const result = rollValue(activeHero);
        setRollingValue(null);
        setRolled({ heroId: activeHero.id, value: result.value, detail: result.detail, mode: "normal" });
        setLastRoll(result.value);
        if (activeHero.role === "healer") {
          setSelectedAlly(livingHeroes[0]?.id ?? activeHero.id);
          setMultiTargets([livingHeroes[0]?.id ? livingHeroes[0].id : activeHero.id]);
          setHealerMode("heal");
        } else {
          setSelectedEnemy(livingEnemies[0]?.id ?? null);
        }
        appendLog(`${activeHero.name} 주사위 ${result.value}`);
      }
    }, 38);
  };

  const useGuard = () => {
    if (!activeHero || activeHero.role !== "tank" || activeHero.id !== currentHero?.id || activeHero.guardCharges <= 0 || rolled || rollingValue !== null) return;
    setHeroes((current) => current.map((hero) => hero.id === activeHero.id ? { ...hero, guardCharges: hero.guardCharges - 1, guarded: true } : hero));
    setRolled({ heroId: activeHero.id, value: 0, detail: "다음 공격 1회 무마", mode: "guard" });
    setTurnStarted(true);
    appendLog(`${activeHero.name}이 수호막을 펼쳤습니다.`);
  };

  const dropArtifact = (reason: string, guaranteed = false) => {
    if (!guaranteed && randomInt(1, 100) > 45) return;
    const artifact = makeArtifact(stage, wave);
    setArtifacts((current) => [artifact, ...current].slice(0, 18));
    appendLog(`${reason}: 유물 획득 - ${artifact.name} ${artifactValueLabel(artifact)}`);
    showLootCue(artifact);
    playSfx("loot");
  };

  const equipArtifact = (heroId: string, artifactId: string, slot: 0 | 1) => {
    if (phase !== "combat" || !artifactId) return;
    playSfx("equip");
    setHeroes((current) => current.map((hero) => {
      const nextSlots: [string | null, string | null] = hero.artifacts.includes(artifactId)
        ? hero.artifacts.map((id) => id === artifactId ? null : id) as [string | null, string | null]
        : [...hero.artifacts] as [string | null, string | null];
      if (hero.id === heroId) {
        nextSlots[slot] = artifactId;
        const nextMax = maxHpOf({ ...hero, artifacts: nextSlots }, artifacts);
        return { ...hero, artifacts: nextSlots, hp: Math.min(hero.hp, nextMax) };
      }
      return { ...hero, artifacts: nextSlots };
    }));
  };

  const unequipArtifact = (heroId: string, slot: 0 | 1) => {
    if (phase !== "combat") return;
    setHeroes((current) => current.map((hero) => {
      if (hero.id !== heroId) return hero;
      const nextSlots: [string | null, string | null] = [...hero.artifacts] as [string | null, string | null];
      nextSlots[slot] = null;
      return { ...hero, artifacts: nextSlots, hp: Math.min(hero.hp, maxHpOf({ ...hero, artifacts: nextSlots }, artifacts)) };
    }));
  };

  const gainPartyXp = (amount: number, reason: string, dealerBonus?: { heroId: string; amount: number }) => {
    const newPending: PendingPerk[] = [];
    const levelNotes: string[] = [];
    setHeroes((current) => current.map((hero) => {
      const aliveShare = hero.hp > 0 ? amount : Math.floor(amount * 0.45);
      const bonus = dealerBonus?.heroId === hero.id ? dealerBonus.amount : 0;
      const result = applyLevelUps(hero, Math.floor((aliveShare + bonus) * xpMultiplierOf(hero, artifacts)));
      newPending.push(...result.pending);
      levelNotes.push(...result.notes);
      return result.hero;
    }));
    if (newPending.length) setPendingPerks((current) => [...current, ...newPending]);
    appendLog(`${reason}: 파티 경험치 +${amount}${dealerBonus ? `, 막타 보너스 +${dealerBonus.amount}` : ""}`);
    if (levelNotes.length) appendLog(levelNotes.join(", "));
  };

  const endHeroAction = () => {
    if (!activeHero) return;
    const nextActed = [...acted, activeHero.id];
    setActed(nextActed);
    setRolled(null);
    setRollingValue(null);
    setSelectedHero(null);
    setSelectedEnemy(livingEnemies[0]?.id ?? null);
    setSelectedAlly(null);
    setMultiTargets([]);

    const nextHero = heroes.find((hero) => hero.hp > 0 && !nextActed.includes(hero.id));
    if (nextHero) {
      setSelectedHero(nextHero.id);
      return;
    }
    enemyTurn();
  };

  const resetPlayerTurnForNextPack = (nextEnemies: Enemy[]) => {
    setActed([]);
    setTurnStarted(false);
    setRolled(null);
    setRollingValue(null);
    setSelectedHero(heroes.find((hero) => hero.hp > 0)?.id ?? null);
    setSelectedEnemy(nextEnemies[0]?.id ?? null);
    setSelectedAlly(null);
    setMultiTargets([]);
    setHealerMode("heal");
  };

  const checkWaveEnd = (nextEnemies: Enemy[], killer?: Hero) => {
    const stillAlive = nextEnemies.some((enemy) => enemy.hp > 0);
    if (stillAlive) return false;

    const killXp = Math.floor(4 + stage * 2 + wave * 1.8);
    let bonus: { heroId: string; amount: number } | undefined;
    if (killer?.role === "dealer" && killer.perks[3] > 0) {
      bonus = { heroId: killer.id, amount: Math.floor(killXp * (killer.perks[3] === 1 ? 0.8 : 1.5)) };
    }
    gainPartyXp(killXp, "웨이브 정리", bonus);
    dropArtifact("웨이브 보상");

    if (wave < totalWaves) {
      const nextWave = wave + 1;
      const nextPack = enemiesForWave(stage, nextWave, totalWaves, partySize);
      setWave(nextWave);
      setEnemies(nextPack);
      resetPlayerTurnForNextPack(nextPack);
      showTransition("wave", `WAVE ${nextWave}`, `${nextWave}/${totalWaves}`);
      appendLog(`웨이브 ${nextWave}/${totalWaves} 등장.`);
      return true;
    }

    const clearXp = Math.floor(10 + stage * 5 + totalWaves * 2);
    gainPartyXp(clearXp, `스테이지 ${stage} 클리어`);
    dropArtifact("스테이지 보상", true);
    const nextStageNumber = stage + 1;
    const nextStage = makeStage(nextStageNumber, partySize);
    setStage(nextStageNumber);
    setWave(1);
    setTotalWaves(nextStage.totalWaves);
    setEnemies(nextStage.enemies);
    setLastRoll(null);
    resetPlayerTurnForNextPack(nextStage.enemies);
    setHeroes((current) => current.map((hero) => ({
      ...hero,
      shield: 0,
      guarded: false,
      guardCharges: hero.role === "tank" ? hero.perks[3] : 0,
      reviveCharges: hero.role === "healer" ? hero.perks[3] : 0,
    })));
    showTransition("stage", `STAGE ${nextStageNumber}`, "원정은 계속됩니다");
    appendLog(`스테이지 ${nextStageNumber} 진입.`);
    if (pendingPerks.length > 0) setPhase("perk");
    return true;
  };

  const resolveAction = () => {
    if (!activeHero || !rolled || rolled.heroId !== activeHero.id) return;
    playSfx(activeHero.role === "healer" ? "heal" : activeHero.role === "tank" ? "equip" : "attack");
    if (rolled.mode === "guard") {
      endHeroAction();
      return;
    }

    if (activeHero.role === "tank") {
      let shield = rolled.value + artifactSum(activeHero, artifacts, "shield");
      if (activeHero.perks[2] === 1) shield = Math.floor(shield * 1.5);
      if (activeHero.perks[2] === 2) shield = shield * 2;
      const activeIndex = heroes.findIndex((hero) => hero.id === activeHero.id);
      const protectedIds = [activeHero.id];
      if (activeHero.perks[1] >= 1 && heroes[activeIndex + 1]?.hp > 0) protectedIds.push(heroes[activeIndex + 1].id);
      if (activeHero.perks[1] >= 2 && heroes[activeIndex + 2]?.hp > 0) protectedIds.push(heroes[activeIndex + 2].id);
      setHeroes((current) => current.map((hero) => protectedIds.includes(hero.id) ? { ...hero, shield: hero.shield + shield } : hero));
      appendLog(`${activeHero.name} 실드 +${shield}${protectedIds.length > 1 ? `, 후열 ${protectedIds.length - 1}명 보호` : ""}`);
      endHeroAction();
      return;
    }

    if (activeHero.role === "dealer") {
      const target = livingEnemies.find((enemy) => enemy.id === selectedEnemy) ?? livingEnemies[0];
      if (!target) return;
      const multiplier = activeHero.perks[2] === 2 ? 2 : activeHero.perks[2] === 1 ? 1.5 : 1;
      const damage = Math.floor(rolled.value * multiplier) + artifactSum(activeHero, artifacts, "strike");
      let nextEnemies = enemies.map((enemy) => enemy.id === target.id ? { ...enemy, hp: Math.max(0, enemy.hp - damage) } : enemy);
      const splashCount = activeHero.perks[1];
      if (splashCount > 0) {
        const candidates = nextEnemies.filter((enemy) => enemy.hp > 0 && enemy.id !== target.id);
        for (let i = 0; i < splashCount && candidates.length > 0; i += 1) {
          const picked = candidates.splice(randomInt(0, candidates.length - 1), 1)[0];
          nextEnemies = nextEnemies.map((enemy) => enemy.id === picked.id ? { ...enemy, hp: Math.max(0, enemy.hp - Math.floor(damage * 0.5)) } : enemy);
        }
      }
      setEnemies(nextEnemies);
      appendLog(`${activeHero.name}이 ${target.name}에게 ${damage} 피해.`);
      if (!checkWaveEnd(nextEnemies, activeHero)) endHeroAction();
      return;
    }

    if (activeHero.role === "healer") {
      if (healerMode === "damage" && activeHero.perks[1] >= 1) {
        const target = livingEnemies.find((enemy) => enemy.id === selectedEnemy) ?? livingEnemies[0];
        if (!target) return;
        const damage = rolled.value + artifactSum(activeHero, artifacts, "strike");
        const nextEnemies = enemies.map((enemy) => enemy.id === target.id ? { ...enemy, hp: Math.max(0, enemy.hp - damage) } : enemy);
        setEnemies(nextEnemies);
        appendLog(`${activeHero.name}이 어둠의 치유로 ${target.name}에게 ${damage} 피해.`);
        if (!checkWaveEnd(nextEnemies, activeHero)) endHeroAction();
        return;
      }

      if (healerMode === "xp" && activeHero.perks[1] >= 2) {
        const target = heroes.find((hero) => hero.id === selectedAlly) ?? activeHero;
        const xpAmount = Math.max(1, Math.floor(rolled.value * 0.7));
        const result = applyLevelUps(target, xpAmount);
        setHeroes((current) => current.map((hero) => hero.id === target.id ? result.hero : hero));
        if (result.pending.length) setPendingPerks((current) => [...current, ...result.pending]);
        appendLog(`${target.name} 경험치 +${xpAmount}`);
        endHeroAction();
        return;
      }

      const targetLimit = activeHero.perks[2] === 2 ? 3 : activeHero.perks[2] === 1 ? 2 : 1;
      const targets = multiTargets.length ? multiTargets.slice(0, targetLimit) : [selectedAlly ?? activeHero.id];
      const healAmount = rolled.value + artifactSum(activeHero, artifacts, "mending");
      setHeroes((current) => current.map((hero) => targets.includes(hero.id) && hero.hp > 0 ? { ...hero, hp: Math.min(maxHpOf(hero, artifacts), hero.hp + healAmount) } : hero));
      appendLog(`${activeHero.name} 회복 ${healAmount} (${targets.length}명).`);
      endHeroAction();
    }
  };

  const enemyTurn = () => {
    let nextHeroes = heroes.map((hero) => ({ ...hero }));
    let nextArtifacts = artifacts.map((artifact) => ({ ...artifact }));
    const topTarget = () => nextHeroes.find((hero) => hero.hp > 0);
    const attackLogs: string[] = [];

    for (const enemy of livingEnemies) {
      const target = topTarget();
      if (!target) break;
      if (target.guarded) {
        nextHeroes = nextHeroes.map((hero) => hero.id === target.id ? { ...hero, guarded: false } : hero);
        attackLogs.push(`${target.name}의 수호막이 공격을 무마.`);
        continue;
      }
      const absorbed = Math.min(target.shield, enemy.attack);
      const reduced = Math.max(0, enemy.attack - absorbed - artifactSum(target, nextArtifacts, "ward"));
      let revived = false;
      nextHeroes = nextHeroes.map((hero) => {
        if (hero.id !== target.id) return hero;
        const damagedHero = { ...hero, shield: hero.shield - absorbed, hp: Math.max(0, hero.hp - reduced) };
        if (damagedHero.hp > 0) return damagedHero;
        const reviveArtifact = heroArtifacts(hero, nextArtifacts).find((artifact) => artifact.kind === "revive");
        if (!reviveArtifact) return damagedHero;
        revived = true;
        nextArtifacts = nextArtifacts.filter((artifact) => artifact.id !== reviveArtifact.id);
        return {
          ...damagedHero,
          hp: Math.min(maxHpOf(damagedHero, nextArtifacts), reviveArtifact.value),
          artifacts: damagedHero.artifacts.map((id) => id === reviveArtifact.id ? null : id) as [string | null, string | null],
        };
      });
      if (revived) attackLogs.push(`${target.name}의 유물이 깨지며 즉시 부활.`);
      attackLogs.push(`${enemy.name} -> ${target.name} ${reduced} 피해.`);
    }

    if (nextHeroes.every((hero) => hero.hp <= 0)) {
      setHeroes(nextHeroes);
      setArtifacts(nextArtifacts);
      setPhase("gameover");
      setLog((current) => [`여정 종료. 스테이지 ${stage}, 웨이브 ${wave}에서 전멸.`, ...attackLogs.reverse(), ...current].slice(0, 12));
      return;
    }

    setHeroes(nextHeroes);
    setArtifacts(nextArtifacts);
    setActed([]);
    setTurnStarted(false);
    setSelectedHero(nextHeroes.find((hero) => hero.hp > 0)?.id ?? null);
    setLog((current) => ["적 턴 종료.", ...attackLogs.reverse(), ...current].slice(0, 12));
  };

  const toggleHealTarget = (heroId: string) => {
    const limit = activeHero?.perks[2] === 2 ? 3 : activeHero?.perks[2] === 1 ? 2 : 1;
    setMultiTargets((current) => {
      if (current.includes(heroId)) return current.filter((id) => id !== heroId);
      return [...current, heroId].slice(-limit);
    });
    setSelectedAlly(heroId);
  };

  const reviveHero = (healerId: string, targetId: string) => {
    setHeroes((current) => current.map((hero) => {
      if (hero.id === healerId) return { ...hero, reviveCharges: Math.max(0, hero.reviveCharges - 1) };
      if (hero.id === targetId) return { ...hero, hp: 1 };
      return hero;
    }));
    appendLog("소생으로 아군이 HP 1로 복귀.");
  };

  const choosePerk = (pending: PendingPerk, perk: 1 | 2 | 3) => {
    const hero = heroes.find((candidate) => candidate.id === pending.heroId);
    if (!hero) return;
    playChord([587, 740, 880], 0.11, 0.02);
    const currentRank = hero.perks[perk];
    if (currentRank >= 2) return;
    setHeroes((current) => current.map((candidate) => candidate.id === hero.id ? {
      ...candidate,
      perks: { ...candidate.perks, [perk]: (currentRank + 1) as 1 | 2 },
      guardCharges: candidate.role === "tank" && perk === 3 ? currentRank + 1 : candidate.guardCharges,
      reviveCharges: candidate.role === "healer" && perk === 3 ? currentRank + 1 : candidate.reviveCharges,
    } : candidate));
    const rest = pendingPerks.slice(1);
    setPendingPerks(rest);
    appendLog(`${hero.name} 특전 획득: ${PERKS[hero.role][perk].title} ${currentRank + 1}단계`);
    if (rest.length === 0) setPhase("combat");
  };

  const activePending = pendingPerks[0];
  const perkHero = activePending ? heroes.find((hero) => hero.id === activePending.heroId) : null;

  return (
    <main className="game-shell">
      <header className="topbar">
        <button className="brand" onClick={phase === "setup" ? undefined : resetGame} aria-label="처음으로">
          <span className="brand-die">D</span>
          <span><b>끝없는 원정</b><small>WAVE TACTICS RPG</small></span>
        </button>
        <div className="top-actions">
          {phase !== "setup" && <button className="text-button" onClick={resetGame}>새 원정</button>}
          <button className="rule-button" onClick={() => setShowRules(true)}>규칙</button>
        </div>
      </header>

      {phase === "home" && (
        <section className="home-page">
          <div className="setup-copy">
            <p className="eyebrow">SOLO WAVE RPG</p>
            <h1 className="hero-title">
              <span>순서를 짜고</span>
              <em>웨이브를</em>
              <em>버텨라</em>
            </h1>
            <div className="home-actions">
              <button className="primary-button" onClick={() => openSetup(3)}>3인 원정 시작</button>
              <button className="primary-button ghost" onClick={() => openSetup(5)}>5인 원정 시작</button>
            </div>
            <div className="hero-graphic" aria-hidden="true">
              <span className="sigil sigil-one">D6</span>
              <span className="sigil sigil-two">XP</span>
              <span className="sigil sigil-three"> relic </span>
              <i />
            </div>
          </div>
        </section>
      )}

      {phase === "setup" && (
        <section className="setup-builder">
          <div className="setup-panel">
            <div className="panel-heading">
              <div><span className="step-kicker">파티 준비</span><h2>캐릭터 선택</h2></div>
              <div className="party-toggle" role="group" aria-label="파티 인원">
                <button className={partySize === 3 ? "active" : ""} onClick={() => changePartySize(3)}>3인</button>
                <button className={partySize === 5 ? "active" : ""} onClick={() => changePartySize(5)}>5인</button>
              </div>
            </div>
            <div className="draft-list">
              {drafts.map((draft, index) => (
                <article className="draft-card" key={index}>
                  <span className={`portrait affinity-${draft.affinity}`}>{AFFINITIES[draft.affinity].mark}</span>
                  <div className="draft-main">
                    <label><span>이름</span><input value={draft.name} maxLength={10} onChange={(event) => updateDraft(index, { name: event.target.value })} /></label>
                    <div className="select-row">
                      <label><span>속성</span><select value={draft.affinity} onChange={(event) => updateDraft(index, { affinity: event.target.value as Affinity })}>{AFFINITY_KEYS.map((key) => <option key={key} value={key}>{AFFINITIES[key].label} · {AFFINITIES[key].die}</option>)}</select></label>
                      <label><span>직업</span><select value={draft.role} onChange={(event) => updateDraft(index, { role: event.target.value as Role })}>{ROLE_KEYS.map((key) => <option key={key} value={key}>{ROLES[key].label}</option>)}</select></label>
                    </div>
                  </div>
                  <span className="draft-number">0{index + 1}</span>
                </article>
              ))}
            </div>
            <div className="builder-actions">
              <button className="text-button" onClick={() => setPhase("home")}>돌아가기</button>
              <button className="primary-button start-button" onClick={startGame}>원정 시작</button>
            </div>
          </div>
        </section>
      )}

      {phase === "combat" && (
        <section className="combat-page">
          {transitionCue && (
            <div key={transitionCue.key} className={`transition-cue ${transitionCue.kind}`}>
              <span>{transitionCue.subtitle}</span>
              <strong>{transitionCue.title}</strong>
            </div>
          )}
          {lootCue && (
            <div key={lootCue.key} className="loot-cue" aria-live="polite">
              <span>유물 획득</span>
              <strong>{lootCue.name}</strong>
              <em>{lootCue.label}</em>
            </div>
          )}
          <div className="stage-strip">
            <div><span>STAGE</span><strong>{stage}</strong></div>
            <p>웨이브 {wave}/{totalWaves} · 적 {livingEnemies.length}</p>
            <div className="turn-badge"><i /> {turnText}</div>
          </div>
          <div className="battle-grid">
            <section className="party-column">
              <div className="section-title"><div><span>ORDER</span><h2>파티 순서</h2></div><small>{canReorder ? "변경 가능" : "고정"}</small></div>
              <div className="hero-list">
                {heroes.map((hero, index) => (
                  <article key={hero.id} className={`hero-card affinity-border-${hero.affinity} ${currentHero?.id === hero.id ? "selected" : ""} ${hero.hp <= 0 ? "fallen" : ""}`}>
                    <div className={`hero-avatar affinity-${hero.affinity}`}>{AFFINITIES[hero.affinity].mark}<small>{ROLES[hero.role].mark}</small></div>
                    <div className="hero-info">
                      <div className="hero-name"><h3>{hero.name}</h3><span>Lv.{hero.level} {AFFINITIES[hero.affinity].label} · {ROLES[hero.role].label}</span></div>
                      <div className="bar-row"><div className="hp-track"><i style={{ width: hpBar(hero.hp, maxHpOf(hero, artifacts)) }} /></div><b>{hero.hp}/{maxHpOf(hero, artifacts)}</b>{hero.shield > 0 && <span className="shield">실드 {hero.shield}</span>}</div>
                      <div className="xp-line">XP {hero.xp}/{xpToNext(hero.level)} · 특전 {hero.perks[1]}/{hero.perks[2]}/{hero.perks[3]}</div>
                      <div className="hero-relics">
                        {[0, 1].map((slot) => {
                          const artifact = artifacts.find((item) => item.id === hero.artifacts[slot]);
                          return <button key={slot} className={artifact ? "filled" : ""} onClick={() => unequipArtifact(hero.id, slot as 0 | 1)}>
                            {artifact ? artifact.name : `유물 ${slot + 1}`}
                          </button>;
                        })}
                      </div>
                      {artifacts.length > 0 && <div className="relic-equip-row">
                        {artifacts.map((artifact) => {
                          const equipped = heroes.some((owner) => owner.artifacts.includes(artifact.id));
                          return <button key={artifact.id} className={equipped ? "equipped" : ""} title={artifact.text} onClick={() => equipArtifact(hero.id, artifact.id, hero.artifacts[0] ? 1 : 0)}>
                            {artifact.name}
                          </button>;
                        })}
                      </div>}
                    </div>
                    {canReorder && <div className="order-buttons"><button onClick={() => moveHero(hero.id, -1)} disabled={index === 0}>↑</button><button onClick={() => moveHero(hero.id, 1)} disabled={index === heroes.length - 1}>↓</button></div>}
                  </article>
                ))}
              </div>
            </section>

            <section className="battlefield">
              <div className="battlefield-head">
                <div><span>WAVE</span><h2>전장</h2></div>
                <div className="enemy-count"><strong>{livingEnemies.length}</strong><span>남음</span></div>
              </div>
              <div className="enemy-grid">
                {enemies.map((enemy) => (
                  <button key={enemy.id} className={`enemy-card ${selectedEnemy === enemy.id ? "targeted" : ""} ${enemy.hp <= 0 ? "defeated" : ""}`} disabled={enemy.hp <= 0 || activeHero?.role === "tank"} onClick={() => setSelectedEnemy(enemy.id)}>
                    <span className="enemy-icon">적</span>
                    <span className="enemy-info"><b>{enemy.name}</b><span className="enemy-bar"><i style={{ width: hpBar(enemy.hp, enemy.maxHp) }} /></span><small>HP {enemy.hp}/{enemy.maxHp} <em>공격 {enemy.attack}</em></small></span>
                  </button>
                ))}
              </div>
              <div className="action-console">
                <div className="action-context">
                  <span className="console-label">ACTION</span>
                  {activeHero ? <><h3>{activeHero.name}</h3><p>{AFFINITIES[activeHero.affinity].desc} · {ROLES[activeHero.role].label}</p></> : <><h3>행동할 캐릭터 없음</h3><p>적의 턴으로 넘어갑니다.</p></>}
                  {activeHero?.role === "healer" && rolled && <div className="mode-row">
                    <button className={healerMode === "heal" ? "active" : ""} onClick={() => setHealerMode("heal")}>회복</button>
                    {activeHero.perks[1] >= 1 && <button className={healerMode === "damage" ? "active" : ""} onClick={() => setHealerMode("damage")}>공격</button>}
                    {activeHero.perks[1] >= 2 && <button className={healerMode === "xp" ? "active" : ""} onClick={() => setHealerMode("xp")}>경험치</button>}
                  </div>}
                </div>
                <div className="dice-zone">
                  {rolled ? <div className="rolled-die"><span>{rolled.mode === "guard" ? "막" : rolled.value}</span><small>{rolled.detail}</small></div> : <div className={`idle-die ${rollingValue !== null ? "rolling" : ""}`}>{rollingValue ?? "?"}</div>}
                  <button className="roll-button" onClick={rollForHero} disabled={!activeHero || activeHero.id !== currentHero?.id || !!rolled || rollingValue !== null}>{rollingValue !== null ? "굴리는 중" : rolled ? "굴림 완료" : "주사위 굴리기"}</button>
                  <button className="resolve-button" onClick={resolveAction} disabled={!rolled}>{activeHero?.role === "tank" ? "실드 얻기" : activeHero?.role === "healer" ? "적용하기" : "공격하기"}</button>
                  {activeHero?.role === "tank" && activeHero.guardCharges > 0 && <button className="skill-button" onClick={useGuard} disabled={!!rolled}>수호막 {activeHero.guardCharges}</button>}
                </div>
                {activeHero?.role === "healer" && rolled && healerMode !== "damage" && (
                  <div className="heal-targets"><span>{healerMode === "xp" ? "경험치 대상" : "회복 대상"}</span>{heroes.filter((hero) => healerMode === "xp" || hero.hp > 0).map((hero) => <button key={hero.id} className={multiTargets.includes(hero.id) || selectedAlly === hero.id ? "active" : ""} onClick={() => healerMode === "heal" ? toggleHealTarget(hero.id) : setSelectedAlly(hero.id)}>{hero.name}</button>)}</div>
                )}
                {heroes.some((hero) => hero.hp <= 0) && heroes.some((hero) => hero.role === "healer" && hero.hp > 0 && hero.reviveCharges > 0) && (
                  <div className="heal-targets"><span>소생</span>{heroes.filter((hero) => hero.hp <= 0).map((fallen) => {
                    const healer = heroes.find((hero) => hero.role === "healer" && hero.hp > 0 && hero.reviveCharges > 0);
                    return healer ? <button key={fallen.id} onClick={() => reviveHero(healer.id, fallen.id)}>{fallen.name}</button> : null;
                  })}</div>
                )}
              </div>
            </section>

            <aside className="chronicle">
              <div className="section-title"><div><span>LOG</span><h2>기록</h2></div></div>
              <ol>{log.map((entry, index) => <li key={`${entry}-${index}`}><span>{String(log.length - index).padStart(2, "0")}</span><p>{entry}</p></li>)}</ol>
            </aside>
          </div>
        </section>
      )}

      {phase === "perk" && perkHero && activePending && (
        <section className="perk-page">
          <span className="chapter-mark">LEVEL {activePending.level}</span>
          <h1>{perkHero.name} 특전 선택</h1>
          <div className="perk-grid">
            {([1, 2, 3] as const).map((key) => {
              const rank = perkHero.perks[key];
              const disabled = rank >= 2;
              return <button key={key} disabled={disabled} onClick={() => choosePerk(activePending, key)}>
                <b>{PERKS[perkHero.role][key].title}</b>
                <span>{rank + 1}단계: {PERKS[perkHero.role][key].ranks[Math.min(rank, 1)]}</span>
              </button>;
            })}
          </div>
        </section>
      )}

      {phase === "gameover" && (
        <section className="gameover-page">
          <span className="chapter-mark">THE EXPEDITION ENDS</span>
          <h1>여정 종료<br /><em>스테이지 {stage}</em></h1>
          <p>순서와 특전 조합을 바꾸면 다른 깊이까지 내려갈 수 있습니다.</p>
          <button className="primary-button" onClick={resetGame}>새 파티 만들기</button>
        </section>
      )}

      {showRules && (
        <div className="modal-backdrop">
          <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <button className="modal-close" onClick={() => setShowRules(false)} aria-label="닫기">x</button>
            <span className="chapter-mark">VERSION 1</span>
            <h2 id="rules-title">규칙 요약</h2>
            <div className="rules-grid">
              <article><b>순서</b><p>위 캐릭터부터 행동하고, 적은 항상 가장 위의 생존 캐릭터를 공격합니다. 아무도 행동 전이면 순서 변경 가능.</p></article>
              <article><b>직업</b><p>탱커는 본인 실드, 딜러는 주사위만큼 공격, 힐러는 아군을 회복합니다.</p></article>
              <article><b>성장</b><p>막타, 웨이브, 스테이지로 경험치를 얻고 레벨마다 최종 주사위와 최대 체력이 증가합니다.</p></article>
              <article><b>유물</b><p>유물은 캐릭터당 2개까지 장착합니다. 내 턴에는 언제든 교체 가능하며, 대부분 패시브로 작동합니다.</p></article>
            </div>
            <button className="primary-button" onClick={() => setShowRules(false)}>닫기</button>
          </section>
        </div>
      )}
    </main>
  );
}
