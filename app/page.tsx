"use client";

import { useMemo, useState } from "react";

type Affinity = "physical" | "agility" | "magic";
type Role = "tank" | "dealer" | "healer";
type Slot = "helmet" | "armor" | "boots" | "weapon";
type Phase = "setup" | "combat" | "loot" | "gameover";

type Gear = {
  id: string;
  affinity: Affinity;
  slot: Slot;
  value: number;
  stage: number;
  die: number;
};

type Hero = {
  id: string;
  name: string;
  affinity: Affinity;
  role: Role;
  hp: number;
  shield: number;
  equipment: Partial<Record<Slot, Gear>>;
};

type Enemy = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  attack: number;
};

type DraftHero = Pick<Hero, "name" | "affinity" | "role">;

const AFFINITIES: Record<Affinity, { label: string; die: string; mark: string; desc: string }> = {
  physical: { label: "물리", die: "D6+1", mark: "힘", desc: "1~6을 굴리고 1을 더합니다." },
  agility: { label: "민첩", die: "D4 연속", mark: "속", desc: "D4를 굴리고, 1이 아니면 한 번 더 굴려 더합니다." },
  magic: { label: "마법", die: "복사", mark: "술", desc: "직전 캐릭터의 최종 주사위 값을 복사합니다. 첫 행동이면 1입니다." },
};

const ROLES: Record<Role, { label: string; mark: string; desc: string }> = {
  tank: { label: "탱커", mark: "방", desc: "주사위 값만큼 공격하고, 초과분으로 파티에 실드를 줍니다." },
  dealer: { label: "딜러", mark: "검", desc: "주사위 값의 1.5배로 공격합니다. 소수점은 버립니다." },
  healer: { label: "힐러", mark: "치", desc: "공격하지 않고 아군 한 명을 회복합니다." },
};

const SLOTS: Record<Slot, { label: string; mark: string }> = {
  helmet: { label: "투구", mark: "투" },
  armor: { label: "갑옷", mark: "갑" },
  boots: { label: "신발", mark: "신" },
  weapon: { label: "무기", mark: "무" },
};

const HERO_NAMES = ["레온", "이라", "로완", "미라", "카엘"];
const MONSTER_NAMES = ["그늘 병사", "녹슨 기사", "공허 추적자", "잿빛 사제", "검은 파수꾼", "균열 인형"];
const AFFINITY_KEYS: Affinity[] = ["physical", "agility", "magic"];
const ROLE_KEYS: Role[] = ["tank", "dealer", "healer"];
const SLOT_KEYS: Slot[] = ["helmet", "armor", "boots", "weapon"];

const randomInt = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const makeDrafts = (size: 3 | 5): DraftHero[] =>
  Array.from({ length: size }, (_, index) => ({
    name: HERO_NAMES[index],
    affinity: AFFINITY_KEYS[index % AFFINITY_KEYS.length],
    role: ROLE_KEYS[index % ROLE_KEYS.length],
  }));

const maxHpOf = (hero: Hero) =>
  10 + SLOT_KEYS.filter((slot) => slot !== "weapon").reduce((sum, slot) => sum + (hero.equipment[slot]?.value ?? 0), 0);

const enemyCountRange = (stage: number) => {
  const min = Math.max(1, Math.floor(2 + stage * 0.55));
  const max = Math.max(min, Math.floor(3 + stage * 0.85 + Math.sqrt(stage)));
  return { min, max };
};

const enemyStatRange = (stage: number) => {
  const tier = Math.floor(stage / 5);
  const min = Math.max(1, Math.floor(stage * 1.35 + tier));
  const max = Math.max(min, Math.floor(stage * 2.05 + tier * 2));
  return { min, max };
};

const createEnemies = (stage: number): Enemy[] => {
  const countRange = enemyCountRange(stage);
  const statRange = enemyStatRange(stage);
  const count = randomInt(countRange.min, countRange.max);

  return Array.from({ length: count }, (_, index) => {
    const hp = randomInt(statRange.min, statRange.max);
    return {
      id: `enemy-${stage}-${index}-${Math.random()}`,
      name: `${MONSTER_NAMES[(stage + index) % MONSTER_NAMES.length]} ${index + 1}`,
      hp,
      maxHp: hp,
      attack: randomInt(statRange.min, statRange.max),
    };
  });
};

const makeGear = (stage: number): Gear => {
  const die = randomInt(1, 12);
  const affinity = AFFINITY_KEYS[Math.floor((die - 1) / 4)];
  const slot = SLOT_KEYS[(die - 1) % 4];
  const armorTier = Math.max(1, Math.floor(stage * 0.9));
  const value = slot === "weapon"
    ? Number((1 + 0.1 * (Math.floor(stage / 10) + 1)).toFixed(1))
    : randomInt(armorTier, armorTier + Math.max(1, Math.floor(stage / 3)));

  return { id: `gear-${Date.now()}-${Math.random()}`, affinity, slot, value, stage, die };
};

const hpBar = (current: number, max: number) => `${Math.max(0, Math.min(100, (current / max) * 100))}%`;

export default function Home() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [partySize, setPartySize] = useState<3 | 5>(3);
  const [drafts, setDrafts] = useState<DraftHero[]>(() => makeDrafts(3));
  const [heroes, setHeroes] = useState<Hero[]>([]);
  const [enemies, setEnemies] = useState<Enemy[]>([]);
  const [stage, setStage] = useState(1);
  const [bestStage, setBestStage] = useState(1);
  const [acted, setActed] = useState<string[]>([]);
  const [selectedHero, setSelectedHero] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [rolled, setRolled] = useState<{ heroId: string; value: number; detail: string } | null>(null);
  const [lastRoll, setLastRoll] = useState<number | null>(null);
  const [log, setLog] = useState<string[]>(["파티를 만들고 첫 원정을 시작하세요."]);
  const [lootRemaining, setLootRemaining] = useState(0);
  const [currentLoot, setCurrentLoot] = useState<Gear | null>(null);
  const [showRules, setShowRules] = useState(false);

  const livingEnemies = useMemo(() => enemies.filter((enemy) => enemy.hp > 0), [enemies]);
  const livingHeroes = useMemo(() => heroes.filter((hero) => hero.hp > 0), [heroes]);
  const activeHero = heroes.find((hero) => hero.id === selectedHero) ?? null;
  const eligibleLootHeroes = currentLoot ? heroes.filter((hero) => hero.affinity === currentLoot.affinity) : [];

  const appendLog = (message: string) => setLog((current) => [message, ...current].slice(0, 11));

  const changePartySize = (size: 3 | 5) => {
    setPartySize(size);
    setDrafts(makeDrafts(size));
  };

  const updateDraft = (index: number, patch: Partial<DraftHero>) => {
    setDrafts((current) => current.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft));
  };

  const startGame = () => {
    const party = drafts.map((draft, index) => ({
      ...draft,
      name: draft.name.trim() || `모험가 ${index + 1}`,
      id: `hero-${Date.now()}-${index}`,
      hp: 10,
      shield: 0,
      equipment: {},
    }));
    const firstEnemies = createEnemies(1);
    setHeroes(party);
    setEnemies(firstEnemies);
    setStage(1);
    setBestStage(1);
    setActed([]);
    setLastRoll(null);
    setSelectedHero(null);
    setSelectedTarget(firstEnemies[0]?.id ?? null);
    setLog([`스테이지 1. 적 ${firstEnemies.length}명이 길을 막습니다.`, "당신의 턴입니다. 원하는 순서대로 행동하세요."]);
    setPhase("combat");
  };

  const resetGame = () => {
    setPhase("setup");
    setDrafts(makeDrafts(partySize));
    setHeroes([]);
    setEnemies([]);
    setStage(1);
    setActed([]);
    setSelectedHero(null);
    setSelectedTarget(null);
    setRolled(null);
    setLastRoll(null);
    setCurrentLoot(null);
    setLootRemaining(0);
    setLog(["새 원정을 준비합니다."]);
  };

  const chooseHero = (hero: Hero) => {
    if (hero.hp <= 0 || acted.includes(hero.id) || rolled) return;
    setSelectedHero(hero.id);
    if (hero.role === "healer") setSelectedTarget(hero.id);
    else if (!selectedTarget || !livingEnemies.some((enemy) => enemy.id === selectedTarget)) setSelectedTarget(livingEnemies[0]?.id ?? null);
  };

  const rollForHero = () => {
    if (!activeHero || activeHero.hp <= 0 || acted.includes(activeHero.id)) return;
    let base = 1;
    let detail = "";

    if (activeHero.affinity === "physical") {
      const die = randomInt(1, 6);
      base = die + 1;
      detail = `D6 ${die} + 1`;
    } else if (activeHero.affinity === "agility") {
      const first = randomInt(1, 4);
      const second = first === 1 ? 0 : randomInt(1, 4);
      base = first + second;
      detail = second ? `D4 ${first} + 추가 ${second}` : `D4 ${first}, 추가 실패`;
    } else {
      base = lastRoll ?? 1;
      detail = lastRoll === null ? "기록 없음, 기본값 1 복사" : `직전 값 ${lastRoll} 복사`;
    }

    const weapon = activeHero.equipment.weapon?.value ?? 1;
    const value = Math.floor(base * weapon);
    if (weapon > 1) detail += ` x 무기 ${weapon.toFixed(1)}`;
    setRolled({ heroId: activeHero.id, value, detail });
    setLastRoll(value);
    appendLog(`${activeHero.name}의 주사위: ${value} (${detail})`);
  };

  const finishStage = (survivors: Hero[]) => {
    const chances = Math.floor(stage / 10) + 1;
    setBestStage((best) => Math.max(best, stage));
    setHeroes(survivors);
    setLootRemaining(chances);
    setCurrentLoot(null);
    setSelectedHero(null);
    setSelectedTarget(null);
    setRolled(null);
    setPhase("loot");
    appendLog(`스테이지 ${stage} 클리어. 전리품 기회 ${chances}회를 얻었습니다.`);
  };

  const markActed = (heroId: string) => {
    setActed((current) => current.includes(heroId) ? current : [...current, heroId]);
    setSelectedHero(null);
    setRolled(null);
  };

  const resolveAction = () => {
    if (!activeHero || !rolled || rolled.heroId !== activeHero.id || !selectedTarget) return;

    if (activeHero.role === "healer") {
      const target = heroes.find((hero) => hero.id === selectedTarget && hero.hp > 0);
      if (!target) return;
      const amount = Math.min(rolled.value, maxHpOf(target) - target.hp);
      setHeroes((current) => current.map((hero) => hero.id === target.id ? { ...hero, hp: Math.min(maxHpOf(hero), hero.hp + rolled.value) } : hero));
      appendLog(`${activeHero.name}이 ${target.name}을 ${amount} 회복했습니다.`);
      markActed(activeHero.id);
      return;
    }

    const target = enemies.find((enemy) => enemy.id === selectedTarget && enemy.hp > 0);
    if (!target) return;
    const damage = activeHero.role === "dealer" ? Math.floor(rolled.value * 1.5) : rolled.value;
    const nextEnemies = enemies.map((enemy) => enemy.id === target.id ? { ...enemy, hp: Math.max(0, enemy.hp - damage) } : enemy);
    let nextHeroes = heroes;

    if (activeHero.role === "tank") {
      const shield = Math.max(0, rolled.value - 3);
      if (shield > 0) nextHeroes = heroes.map((hero) => hero.hp > 0 ? { ...hero, shield: hero.shield + shield } : hero);
      appendLog(`${activeHero.name}이 ${target.name}에게 ${damage} 피해${shield > 0 ? `, 파티 실드 +${shield}` : ""}.`);
    } else {
      appendLog(`${activeHero.name}이 ${target.name}에게 ${damage} 피해.`);
    }

    setEnemies(nextEnemies);
    setHeroes(nextHeroes);
    markActed(activeHero.id);
    const nextLiving = nextEnemies.filter((enemy) => enemy.hp > 0);
    setSelectedTarget(nextLiving[0]?.id ?? null);
    if (nextLiving.length === 0) finishStage(nextHeroes);
  };

  const passHero = (hero: Hero) => {
    if (hero.hp <= 0 || acted.includes(hero.id) || rolled) return;
    appendLog(`${hero.name}은 이번 턴을 넘겼습니다.`);
    markActed(hero.id);
  };

  const endPlayerTurn = () => {
    if (rolled) return;
    let nextHeroes = heroes.map((hero) => ({ ...hero }));
    const attackLog: string[] = [];
    const attackers = livingEnemies.slice().sort((a, b) => b.attack - a.attack);

    for (const enemy of attackers) {
      const alive = nextHeroes.filter((hero) => hero.hp > 0);
      if (alive.length === 0) break;
      const highestHp = Math.max(...alive.map((hero) => hero.hp));
      const candidates = alive.filter((hero) => hero.hp === highestHp);
      const target = candidates[randomInt(0, candidates.length - 1)];
      const absorbed = Math.min(target.shield, enemy.attack);
      const damage = enemy.attack - absorbed;
      nextHeroes = nextHeroes.map((hero) => hero.id === target.id ? {
        ...hero,
        shield: hero.shield - absorbed,
        hp: Math.max(0, hero.hp - damage),
      } : hero);
      attackLog.push(`${enemy.name} -> ${target.name} ${damage} 피해${absorbed ? ` (실드 ${absorbed} 흡수)` : ""}`);
    }

    setHeroes(nextHeroes);
    setActed([]);
    setSelectedHero(null);
    setSelectedTarget(livingEnemies[0]?.id ?? null);
    setLog((current) => ["적의 턴이 끝났습니다. 다시 당신의 턴입니다.", ...attackLog.reverse(), ...current].slice(0, 11));

    if (nextHeroes.every((hero) => hero.hp <= 0)) {
      setPhase("gameover");
      setLog((current) => [`파티가 스테이지 ${stage}에서 쓰러졌습니다.`, ...current].slice(0, 11));
    }
  };

  const rollLoot = () => {
    if (lootRemaining <= 0 || currentLoot) return;
    const gear = makeGear(stage);
    setCurrentLoot(gear);
    appendLog(`D12 결과 ${gear.die}: ${AFFINITIES[gear.affinity].label} ${SLOTS[gear.slot].label} 발견.`);
  };

  const consumeLoot = () => {
    setLootRemaining((count) => Math.max(0, count - 1));
    setCurrentLoot(null);
  };

  const equipLoot = (heroId: string) => {
    if (!currentLoot) return;
    const gear = currentLoot;
    const hero = heroes.find((candidate) => candidate.id === heroId);
    if (!hero || hero.affinity !== gear.affinity) return;
    setHeroes((current) => current.map((candidate) => candidate.id === heroId ? {
      ...candidate,
      equipment: { ...candidate.equipment, [gear.slot]: gear },
    } : candidate));
    appendLog(`${hero.name}이 ${AFFINITIES[gear.affinity].label} ${SLOTS[gear.slot].label}을 장착했습니다.`);
    consumeLoot();
  };

  const nextStage = () => {
    const next = stage + 1;
    const nextEnemies = createEnemies(next);
    setStage(next);
    setBestStage((best) => Math.max(best, next));
    setHeroes((current) => current.map((hero) => ({ ...hero, hp: maxHpOf(hero), shield: 0 })));
    setEnemies(nextEnemies);
    setActed([]);
    setSelectedHero(null);
    setSelectedTarget(nextEnemies[0]?.id ?? null);
    setRolled(null);
    setCurrentLoot(null);
    setLastRoll(null);
    setPhase("combat");
    setLog([`스테이지 ${next}. 적 ${nextEnemies.length}명이 나타났습니다.`, "모든 체력이 회복되고 실드가 제거되었습니다."]);
  };

  return (
    <main className="game-shell">
      <header className="topbar">
        <button className="brand" onClick={() => phase === "setup" ? undefined : resetGame()} aria-label="원정 처음으로">
          <span className="brand-die">D</span>
          <span><b>끝없는 원정</b><small>SOLO TABLETOP QUEST</small></span>
        </button>
        <div className="top-actions">
          {phase !== "setup" && <button className="text-button" onClick={resetGame}>새 원정</button>}
          <button className="rule-button" onClick={() => setShowRules(true)}>규칙</button>
        </div>
      </header>

      {phase === "setup" && (
        <section className="setup-page">
          <div className="setup-copy">
            <p className="eyebrow">SOLO DICE RPG</p>
            <h1>파티를 만들고<br /><em>끝없는 스테이지</em>로</h1>
            <p className="lead">물리, 민첩, 마법 속성과 탱커, 딜러, 힐러 직업을 조합해 3인 또는 5인 파티를 구성하세요. 목표는 단순합니다. 더 깊이, 더 오래 버티기.</p>
            <div className="balance-note">
              <b>밸런스 조정됨</b>
              <span>적 수는 완만히 증가하고, 장비 성장은 오래 버티는 쪽으로 정리했습니다.</span>
            </div>
          </div>

          <div className="setup-panel">
            <div className="panel-heading">
              <div><span className="step-kicker">파티 준비</span><h2>캐릭터 생성</h2></div>
              <div className="party-toggle" role="group" aria-label="파티 인원">
                <button className={partySize === 3 ? "active" : ""} onClick={() => changePartySize(3)}>3인</button>
                <button className={partySize === 5 ? "active" : ""} onClick={() => changePartySize(5)}>5인</button>
              </div>
            </div>
            <p className="panel-note">모든 캐릭터는 기본 체력 10으로 시작합니다.</p>
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
            <button className="primary-button start-button" onClick={startGame}>원정 시작</button>
          </div>
        </section>
      )}

      {phase === "combat" && (
        <section className="combat-page">
          <div className="stage-strip">
            <div><span>STAGE</span><strong>{String(stage).padStart(2, "0")}</strong></div>
            <p>최고 기록 {bestStage} · 적 {livingEnemies.length}/{enemies.length}</p>
            <div className="turn-badge"><i /> 플레이어 턴</div>
          </div>

          <div className="battle-grid">
            <section className="party-column">
              <div className="section-title"><div><span>YOUR PARTY</span><h2>파티</h2></div><small>{livingHeroes.length} / {heroes.length} 생존</small></div>
              <div className="hero-list">
                {heroes.map((hero) => {
                  const maxHp = maxHpOf(hero);
                  const isActed = acted.includes(hero.id);
                  return (
                    <div key={hero.id} role="button" tabIndex={hero.hp > 0 && !isActed ? 0 : -1} aria-label={`${hero.name} 선택`} className={`hero-card affinity-border-${hero.affinity} ${selectedHero === hero.id ? "selected" : ""} ${hero.hp <= 0 ? "fallen" : ""} ${isActed ? "acted" : ""}`} onClick={() => chooseHero(hero)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") chooseHero(hero); }}>
                      <div className={`hero-avatar affinity-${hero.affinity}`}>{AFFINITIES[hero.affinity].mark}<small>{ROLES[hero.role].mark}</small></div>
                      <div className="hero-info">
                        <div className="hero-name"><h3>{hero.name}</h3><span>{AFFINITIES[hero.affinity].label} · {ROLES[hero.role].label}</span></div>
                        <div className="bar-row"><div className="hp-track"><i style={{ width: hpBar(hero.hp, maxHp) }} /></div><b>{hero.hp}/{maxHp}</b>{hero.shield > 0 && <span className="shield">실드 {hero.shield}</span>}</div>
                        <div className="gear-row">{SLOT_KEYS.map((slot) => <span key={slot} className={hero.equipment[slot] ? "equipped" : ""} title={hero.equipment[slot] ? `${SLOTS[slot].label} ${hero.equipment[slot]!.value}` : `${SLOTS[slot].label} 비어 있음`}>{SLOTS[slot].mark}</span>)}</div>
                      </div>
                      <div className="hero-state">{hero.hp <= 0 ? "전투 불능" : isActed ? "행동 완료" : selectedHero === hero.id ? "선택됨" : "대기"}</div>
                      {hero.hp > 0 && !isActed && !rolled && <button className="pass-mini" onClick={(event) => { event.stopPropagation(); passHero(hero); }}>패스</button>}
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="battlefield">
              <div className="battlefield-head">
                <div><span>ENCOUNTER</span><h2>적 무리</h2></div>
                <div className="enemy-count"><strong>{livingEnemies.length}</strong><span>남음</span></div>
              </div>
              <div className="enemy-grid">
                {enemies.map((enemy) => (
                  <button key={enemy.id} className={`enemy-card ${selectedTarget === enemy.id ? "targeted" : ""} ${enemy.hp <= 0 ? "defeated" : ""}`} disabled={enemy.hp <= 0 || activeHero?.role === "healer"} onClick={() => setSelectedTarget(enemy.id)}>
                    <span className="enemy-icon">적</span>
                    <span className="enemy-info"><b>{enemy.name}</b><span className="enemy-bar"><i style={{ width: hpBar(enemy.hp, enemy.maxHp) }} /></span><small>HP {enemy.hp}/{enemy.maxHp} <em>공격 {enemy.attack}</em></small></span>
                    {selectedTarget === enemy.id && enemy.hp > 0 && activeHero?.role !== "healer" && <span className="target-mark">표적</span>}
                  </button>
                ))}
              </div>

              <div className="action-console">
                <div className="action-context">
                  <span className="console-label">ACTION</span>
                  {activeHero ? <><h3>{activeHero.name} 행동</h3><p>{AFFINITIES[activeHero.affinity].desc} {ROLES[activeHero.role].desc}</p></> : <><h3>행동할 캐릭터를 선택하세요</h3><p>파티 카드에서 살아있는 캐릭터를 골라 주사위를 굴립니다.</p></>}
                </div>
                <div className="dice-zone">
                  {rolled ? <div className="rolled-die"><span>{rolled.value}</span><small>{rolled.detail}</small></div> : <div className="idle-die">?</div>}
                  <button className="roll-button" onClick={rollForHero} disabled={!activeHero || !!rolled}>{rolled ? "굴림 완료" : "주사위 굴리기"}</button>
                  <button className="resolve-button" onClick={resolveAction} disabled={!rolled || !selectedTarget}>{activeHero?.role === "healer" ? "회복하기" : "공격하기"}</button>
                </div>
                {activeHero?.role === "healer" && rolled && (
                  <div className="heal-targets"><span>회복 대상</span>{livingHeroes.map((hero) => <button key={hero.id} className={selectedTarget === hero.id ? "active" : ""} onClick={() => setSelectedTarget(hero.id)}>{hero.name}</button>)}</div>
                )}
              </div>
            </section>

            <aside className="chronicle">
              <div className="section-title"><div><span>CHRONICLE</span><h2>전투 기록</h2></div></div>
              <ol>{log.map((entry, index) => <li key={`${entry}-${index}`}><span>{String(log.length - index).padStart(2, "0")}</span><p>{entry}</p></li>)}</ol>
              <div className="turn-footer">
                <div><span>행동 완료</span><strong>{acted.length} / {livingHeroes.length}</strong></div>
                <button onClick={endPlayerTurn} disabled={!!rolled || livingEnemies.length === 0}>턴 종료</button>
                <small>행동하지 않은 캐릭터는 자동으로 패스됩니다.</small>
              </div>
            </aside>
          </div>
        </section>
      )}

      {phase === "loot" && (
        <section className="interlude-page">
          <div className="interlude-copy">
            <span className="chapter-mark">CHAPTER CLEARED</span>
            <h1>스테이지 {stage}<br /><em>정복 완료</em></h1>
            <p>전리품 주사위로 장비를 얻습니다. 같은 속성의 캐릭터만 장착할 수 있습니다.</p>
            <div className="clear-stats"><div><span>다음 스테이지</span><b>{stage + 1}</b></div><div><span>전리품 기회</span><b>{lootRemaining}</b></div></div>
          </div>
          <div className="loot-panel">
            <div className="loot-head"><div><span>REWARD ROLL</span><h2>전리품 선택</h2></div><span className="d12-badge">D12</span></div>
            {!currentLoot && lootRemaining > 0 && <div className="loot-empty"><div className="big-die">12</div><h3>전리품을 굴리세요</h3><p>속성 3종 × 장비 부위 4종, 총 12가지 결과</p><button className="primary-button" onClick={rollLoot}>전리품 굴리기</button></div>}
            {currentLoot && (
              <div className="loot-result">
                <div className={`loot-art affinity-${currentLoot.affinity}`}><span>{SLOTS[currentLoot.slot].mark}</span><small>D12 · {currentLoot.die}</small></div>
                <div className="loot-detail"><span>{AFFINITIES[currentLoot.affinity].label} 장비</span><h3>{AFFINITIES[currentLoot.affinity].label} {SLOTS[currentLoot.slot].label}</h3><p>{currentLoot.slot === "weapon" ? `주사위 결과 x${currentLoot.value.toFixed(1)}` : `최대 체력 +${currentLoot.value}`}</p></div>
                <div className="equip-list"><span>장착 가능 캐릭터</span>{eligibleLootHeroes.map((hero) => <button key={hero.id} onClick={() => equipLoot(hero.id)}><b>{hero.name}</b><small>{hero.equipment[currentLoot.slot] ? `현재 ${hero.equipment[currentLoot.slot]!.value}, 교체` : "빈 슬롯, 장착"}</small></button>)}{eligibleLootHeroes.length === 0 && <p>장착 가능한 속성의 캐릭터가 없습니다.</p>}<button className="discard-button" onClick={consumeLoot}>버리고 다음으로</button></div>
              </div>
            )}
            {!currentLoot && lootRemaining === 0 && <div className="loot-empty ready"><div className="camp-mark">휴식</div><h3>파티가 다시 일어납니다</h3><p>모든 체력이 회복되고, 남은 실드는 제거됩니다.</p><button className="primary-button" onClick={nextStage}>스테이지 {stage + 1} 진입</button></div>}
          </div>
        </section>
      )}

      {phase === "gameover" && (
        <section className="gameover-page">
          <span className="chapter-mark">THE EXPEDITION ENDS</span>
          <h1>원정 종료<br /><em>스테이지 {stage}</em></h1>
          <p>조합을 바꾸고 다시 도전해 보세요. 마법 캐릭터는 행동 순서에 따라 강해집니다.</p>
          <div className="record-card"><span>최종 기록</span><strong>{String(stage).padStart(2, "0")}</strong><small>도달 스테이지</small></div>
          <button className="primary-button" onClick={resetGame}>새 파티 만들기</button>
        </section>
      )}

      {showRules && (
        <div className="modal-backdrop">
          <section className="rules-modal" role="dialog" aria-modal="true" aria-labelledby="rules-title">
            <button className="modal-close" onClick={() => setShowRules(false)} aria-label="닫기">x</button>
            <span className="chapter-mark">FIELD MANUAL</span><h2 id="rules-title">원정 규칙</h2>
            <div className="rules-grid">
              <article><b>01 · 주사위</b><p><strong>물리</strong> D6+1 · <strong>민첩</strong> D4, 첫 값이 1이 아니면 한 번 더 · <strong>마법</strong> 직전 캐릭터의 최종 값을 복사합니다.</p></article>
              <article><b>02 · 직업</b><p><strong>탱커</strong>는 공격과 파티 실드, <strong>딜러</strong>는 1.5배 공격, <strong>힐러</strong>는 아군 한 명을 회복합니다.</p></article>
              <article><b>03 · 적 턴</b><p>공격력이 높은 적부터 행동합니다. 매 공격마다 현재 체력이 가장 높은 캐릭터를 새로 노립니다.</p></article>
              <article><b>04 · 장비</b><p>같은 속성 장비만 장착합니다. 투구, 갑옷, 신발은 최대 체력 증가. 무기는 주사위 결과에 배율을 곱합니다.</p></article>
            </div>
            <button className="primary-button" onClick={() => setShowRules(false)}>규칙 닫기</button>
          </section>
        </div>
      )}
    </main>
  );
}
