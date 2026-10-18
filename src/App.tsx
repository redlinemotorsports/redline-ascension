import { useEffect, useMemo, useRef, useState } from "react";
import { applyStartingUpgrade, buildSynergies, CAMPAIGN_LENGTH, CHAMPIONSHIP_ACHIEVEMENTS, createRace, draftUpgradeCards, DRIVER_MARKET, ensureFullGrid, formatLapTime, getStrategyAdvice, setDriverStrategy, standings, stepRace, upgradeCar, UPGRADE_CARD_POOL, type BattleMode, type CarState, type FuelMode, type Pace, type RaceState, type StrategyAdvice, type Tyre, type PaddockEvent, type GameMode, UPGRADE_EVOLUTIONS } from "./simulation";
import { RIVAL_STYLE_INFO } from "./rivals";

const SAVE_KEY = "redline-paddock-prototype-v1";
const BEST_RUN_KEY = "redline-paddock-best-run-v1";
const GARAGE_META_KEY = "redline-paddock-garage-meta-v1";
type GarageMeta = { research: number; unlocks: string[]; rewardedRuns: string[]; rewardedAchievements?: string[]; rewardedDiscoveries?: string[]; masteryRewards?: string[]; unlockedDriverIds?: string[]; levels: Record<string, number> };
const EMPTY_GARAGE_META: GarageMeta = { research: 0, unlocks: [], rewardedRuns: [], rewardedAchievements: [], rewardedDiscoveries: [], masteryRewards: [], unlockedDriverIds: [], levels: {} };
function loadGarageMeta(): GarageMeta {
  try {
    const raw = localStorage.getItem(GARAGE_META_KEY);
    if (!raw) return EMPTY_GARAGE_META;
    const parsed = JSON.parse(raw) as Partial<GarageMeta>;
    const unlocks = Array.isArray(parsed.unlocks) ? parsed.unlocks.filter((id): id is string => typeof id === "string") : [];
    const levels = parsed.levels && typeof parsed.levels === "object" ? Object.fromEntries(Object.entries(parsed.levels).map(([id, level]) => [id, Math.max(0, Math.min(5, Math.floor(Number(level) || 0)))])) : Object.fromEntries(unlocks.map((id) => [id, 1]));
    return { research: Math.max(0, Number(parsed.research) || 0), unlocks: [...new Set([...unlocks, ...Object.keys(levels).filter((id) => (levels[id] ?? 0) > 0)])], rewardedRuns: Array.isArray(parsed.rewardedRuns) ? parsed.rewardedRuns.filter((id): id is string => typeof id === "string") : [], rewardedAchievements: Array.isArray(parsed.rewardedAchievements) ? parsed.rewardedAchievements.filter((id): id is string => typeof id === "string") : [], rewardedDiscoveries: Array.isArray(parsed.rewardedDiscoveries) ? parsed.rewardedDiscoveries.filter((id): id is string => typeof id === "string") : [], masteryRewards: Array.isArray(parsed.masteryRewards) ? parsed.masteryRewards.filter((id): id is string => typeof id === "string") : [], unlockedDriverIds: Array.isArray(parsed.unlockedDriverIds) ? [...new Set(parsed.unlockedDriverIds.filter((id): id is string => typeof id === "string"))] : [], levels };
  } catch { return EMPTY_GARAGE_META; }
}
const GARAGE_PERKS = [
  { id: "aero-blueprint", title: "Aerodynamics", category: "CAR PERFORMANCE", description: "Improve cornering performance with a stronger aero platform.", cost: 2, effect: "aero" },
  { id: "power-mapping", title: "Engine Power", category: "CAR PERFORMANCE", description: "Increase engine output and straight-line pace.", cost: 2, effect: "power" },
  { id: "chassis-balance", title: "Chassis Balance", category: "CAR PERFORMANCE", description: "Improve mechanical grip and car balance.", cost: 2, effect: "suspension" },
  { id: "energy-recovery", title: "Energy Recovery", category: "CAR PERFORMANCE", description: "Improve power deployment and acceleration.", cost: 3, effect: "energy" },
  { id: "tyre-management", title: "Tyre Management", category: "RACE OPERATIONS", description: "Improve driver tyre care for longer, more consistent stints.", cost: 2, effect: "tyres" },
  { id: "pit-crew-training", title: "Pit Crew Training", category: "RACE OPERATIONS", description: "Reduce the time lost during your team's pit stops.", cost: 3, effect: "pit" },
  { id: "reliability-process", title: "Reliability", category: "RACE OPERATIONS", description: "Strengthen component reliability and reduce wear-related risk.", cost: 3, effect: "reliability" },
  { id: "repair-efficiency", title: "Repair Efficiency", category: "RACE OPERATIONS", description: "Reduce routine operating and maintenance expenses.", cost: 2, effect: "repair" },
  { id: "driver-pace", title: "Driver Pace", category: "DRIVER DEVELOPMENT", description: "Raise both drivers' baseline pace.", cost: 3, effect: "pace" },
  { id: "qualifying-skill", title: "Qualifying Preparation", category: "DRIVER DEVELOPMENT", description: "Give both drivers a small, lasting pace advantage.", cost: 2, effect: "qualifying" },
  { id: "racecraft-coaching", title: "Racecraft Coaching", category: "DRIVER DEVELOPMENT", description: "Improve racecraft for overtaking and defending.", cost: 2, effect: "racecraft" },
  { id: "consistency-programme", title: "Consistency Programme", category: "DRIVER DEVELOPMENT", description: "Reduce performance swings and improve consistency.", cost: 3, effect: "consistency" },
  { id: "strategy-simulation", title: "Strategy Simulation", category: "RACE STRATEGY", description: "Improve driver consistency through better preparation.", cost: 3, effect: "strategy" },
  { id: "weather-analysis", title: "Weather Analysis", category: "RACE STRATEGY", description: "Help drivers adapt tyre use to changing conditions.", cost: 2, effect: "weather" },
  { id: "safety-car-planning", title: "Safety-Car Planning", category: "RACE STRATEGY", description: "Sharpen racecraft when neutralisations disrupt the field.", cost: 2, effect: "safety" },
  { id: "opponent-analysis", title: "Opponent Analysis", category: "RACE STRATEGY", description: "Use rival data to improve baseline driver pace.", cost: 3, effect: "opponents" },
  { id: "research-efficiency", title: "Research Efficiency", category: "TEAM DEVELOPMENT", description: "Earn extra Research Points as this upgrade levels up.", cost: 4, effect: "research" },
  { id: "staff-training", title: "Staff Training", category: "TEAM DEVELOPMENT", description: "Improve team morale and driver consistency at the start of a run.", cost: 3, effect: "staff" },
  { id: "factory-workflow", title: "Factory Workflow", category: "TEAM DEVELOPMENT", description: "Streamline operations and begin each run with extra funds.", cost: 3, effect: "factory" },
  { id: "simulator-programme", title: "Simulator Programme", category: "TEAM DEVELOPMENT", description: "Build well-rounded driver performance through simulator work.", cost: 4, effect: "simulator" },
  { id: "sponsor-network", title: "Sponsor Network", category: "COMMERCIAL & FINANCE", description: "Improve sponsor income and begin each career with extra funding.", cost: 3, effect: "sponsor" },
  { id: "contract-negotiation", title: "Contract Negotiation", category: "COMMERCIAL & FINANCE", description: "Reduce driver payroll costs for every race weekend.", cost: 3, effect: "contracts" },
  { id: "budget-management", title: "Budget Management", category: "COMMERCIAL & FINANCE", description: "Reduce recurring operating expenses and add a small cash reserve.", cost: 2, effect: "budget" },
  { id: "prize-money-bonus", title: "Prize-Money Bonus", category: "COMMERCIAL & FINANCE", description: "Increase the commercial return from every completed weekend.", cost: 4, effect: "prize" },
] as const;
function garageLevel(meta: GarageMeta, id: string): number {
  return Math.max(0, Math.min(5, meta.levels?.[id] ?? (meta.unlocks.includes(id) ? 1 : 0)));
}
function applyGarageBonuses<T extends RaceState>(state: T, meta: GarageMeta, newCareer: boolean): T {
  const level = (id: string) => garageLevel(meta, id);
  const cars = state.cars.map((car) => {
    if (!car.playerCar) return car;
    return {
      ...car,
      driverPace: Math.min(100, car.driverPace + level("driver-pace") * 1.5 + level("qualifying-skill") + level("opponent-analysis") + level("simulator-programme")),
      driverRacecraft: Math.min(100, car.driverRacecraft + level("racecraft-coaching") * 2 + level("safety-car-planning") + level("simulator-programme")),
      driverTyreManagement: Math.min(100, car.driverTyreManagement + level("tyre-management") * 2 + level("weather-analysis") + level("simulator-programme")),
      driverConsistency: Math.min(100, car.driverConsistency + level("consistency-programme") * 2 + level("strategy-simulation") + level("staff-training") + level("simulator-programme")),
    };
  });
  const baseCashBonus = newCareer ? level("sponsor-network") * 100000 + level("factory-workflow") * 50000 + level("budget-management") * 50000 : 0;
  const modules = newCareer ? {
    aero: state.upgradeModules.aero + level("aero-blueprint"),
    power: state.upgradeModules.power + level("power-mapping") + level("energy-recovery"),
    suspension: state.upgradeModules.suspension + level("chassis-balance"),
    reliability: state.upgradeModules.reliability + level("reliability-process"),
  } : state.upgradeModules;
  return {
    ...state,
    cash: state.cash + baseCashBonus,
    cars,
    upgradeModules: modules,
    permanentPerks: Object.fromEntries(GARAGE_PERKS.map((perk) => [perk.id, level(perk.id)])),
    teamMorale: Math.min(100, (state.teamMorale ?? 62) + (newCareer ? level("staff-training") * 2 : 0)),
    driverContracts: newCareer ? (state.driverContracts ?? []).map((contract) => ({ ...contract, salaryPerRace: Math.max(20000, Math.round(contract.salaryPerRace * (1 - level("contract-negotiation") * 0.03))) })) : state.driverContracts,
  };
}
type BestRun = { points: number; position: number; seed: number };

type CodexDossier = { id: string; team: string; mode: string; round: number; position: number; points: number; cash: number; upgrades: string[]; endedAt: string };
type CodexMeta = { discoveredUpgradeIds: string[]; dossiers: CodexDossier[]; usageCounts: Record<string, number>; favoriteUpgradeIds: string[] };
const CODEX_META_KEY = "redline-paddock-engineering-codex-v1";
const EMPTY_CODEX_META: CodexMeta = { discoveredUpgradeIds: [], dossiers: [], usageCounts: {}, favoriteUpgradeIds: [] };
function loadCodexMeta(): CodexMeta {
  try {
    const parsed = JSON.parse(localStorage.getItem(CODEX_META_KEY) ?? "null") as Partial<CodexMeta> | null;
    return {
      discoveredUpgradeIds: Array.isArray(parsed?.discoveredUpgradeIds) ? [...new Set(parsed.discoveredUpgradeIds.filter((id): id is string => typeof id === "string"))] : [],
      dossiers: Array.isArray(parsed?.dossiers) ? parsed.dossiers.filter((item): item is CodexDossier => Boolean(item && typeof item.id === "string" && typeof item.team === "string" && Array.isArray(item.upgrades))).slice(0, 50) : [],
      usageCounts: parsed?.usageCounts && typeof parsed.usageCounts === "object" ? Object.fromEntries(Object.entries(parsed.usageCounts).filter(([, count]) => typeof count === "number").map(([id, count]) => [id, Math.max(0, Math.floor(count as number))])) : {},
      favoriteUpgradeIds: Array.isArray(parsed?.favoriteUpgradeIds) ? [...new Set(parsed.favoriteUpgradeIds.filter((id): id is string => typeof id === "string"))] : [],
    };
  } catch { return EMPTY_CODEX_META; }
}


function evolutionHintsForUpgrade(upgradeId: string, race: RaceState): { key: string; text: string; ready: boolean }[] {
  const installedIds = new Set((race.installedUpgrades ?? []).map((item) => item.id));
  const activeIds = new Set(race.activeEvolutions ?? []);
  return UPGRADE_EVOLUTIONS.filter((evolution) => evolution.requiredUpgradeIds.includes(upgradeId)).map((evolution) => {
    const counterpartId = evolution.requiredUpgradeIds.find((id) => id !== upgradeId) ?? "";
    const counterpartTitle = UPGRADE_CARD_POOL.find((item) => item.id === counterpartId)?.title ?? counterpartId;
    const ready = installedIds.has(counterpartId);
    const active = activeIds.has(evolution.id);
    return {
      key: evolution.id,
      ready,
      text: active ? `EVOLUTION ACTIVE · ${evolution.title}` : ready ? `COMBO READY · Completes ${evolution.title}` : `COMBO CLUE · Pair with ${counterpartTitle}`,
    };
  });
}

const money = (amount: number) => new Intl.NumberFormat("en-MY", { style: "currency", currency: "MYR", maximumFractionDigits: 0 }).format(amount);
const pct = (value: number) => Math.round(value) + "%";

const PADDOCK_EVENT_DECK: PaddockEvent[] = [
 {id:"floor-protest",category:"FIA PROTEST",title:"A Rival Files a Technical Protest",source:"FIA TECHNICAL DELEGATE",story:"A rival alleges that your latest floor concept exploits a grey area in the technical regulations. Officials want documentation before qualifying. Your engineers believe the design is defensible, but a forced modification could cost performance.",choices:[
 {id:"defend",label:"Defend the design",description:"Commission an urgent technical review. Expensive, but a successful defence protects the upgrade.",cashDelta:-140000,moraleDelta:3,reputationDelta:5},
 {id:"modify",label:"Make a precautionary change",description:"Lose some engineering momentum to reduce the risk of a penalty.",cashDelta:-80000,moraleDelta:-1,reputationDelta:1},
 {id:"cooperate",label:"Cooperate with inspectors",description:"Share the documentation and accept a disruptive inspection window.",cashDelta:-30000,moraleDelta:0,reputationDelta:3}]},
 {id:"sponsor-pressure",category:"COMMERCIAL",title:"The Sponsor Wants a Statement",source:"COMMERCIAL DEPARTMENT",story:"Your principal sponsor wants more visibility after disappointing results. They are considering reducing future support unless the team commits to a promotional appearance before the race.",choices:[
 {id:"accept",label:"Accept the activation",description:"Protect the commercial relationship and receive an immediate payment, at the cost of preparation time.",cashDelta:180000,moraleDelta:-2,reputationDelta:2},
 {id:"negotiate",label:"Negotiate a smaller activation",description:"Secure a modest payment while keeping the drivers focused.",cashDelta:90000,moraleDelta:1,reputationDelta:1},
 {id:"refuse",label:"Protect race preparation",description:"Reject the demand. The team stays focused, but the sponsor relationship cools.",cashDelta:0,moraleDelta:3,reputationDelta:-6}]},
 {id:"radio-leak",category:"PADDOCK POLITICS",title:"A Radio Message Leaks",source:"PADDOCK MEDIA",story:"A clipped team-radio exchange is circulating online. Rival principals suggest your drivers were ordered to manipulate track position. The full recording is more nuanced, but the story is gathering attention.",choices:[
 {id:"transparent",label:"Release the full context",description:"Pay for communications support and make the recording public.",cashDelta:-65000,moraleDelta:2,reputationDelta:7},
 {id:"quiet",label:"Keep the team quiet",description:"Avoid feeding the story, accepting that speculation may continue.",cashDelta:0,moraleDelta:-1,reputationDelta:-2},
 {id:"counter",label:"Challenge the rival publicly",description:"Fight back loudly. It may rally the team, but escalates paddock tension.",cashDelta:-25000,moraleDelta:4,reputationDelta:-1}]},
 {id:"supplier-crisis",category:"TEAM DRAMA",title:"A Supplier Misses the Deadline",source:"CHIEF MECHANIC",story:"A critical component shipment has been delayed. Your mechanics can rework an older part, pay for an emergency shipment or accept a compromise that increases reliability risk.",choices:[
 {id:"express",label:"Pay for emergency delivery",description:"Protect preparation time with an expensive courier and supplier fee.",cashDelta:-125000,moraleDelta:2,reputationDelta:1},
 {id:"reuse",label:"Rework the older component",description:"Save money through extra workshop hours. The crew will be tired, but the job is manageable.",cashDelta:-45000,moraleDelta:-2,reputationDelta:0},
 {id:"discount",label:"Accept the compromise",description:"Keep cash in reserve, knowing the reliability margin will be thinner.",cashDelta:0,moraleDelta:-1,reputationDelta:-1}]},
 {id:"driver-ultimatum",category:"TEAM DRAMA",title:"Your Driver Wants a Contract Meeting",source:"DRIVER MANAGEMENT",story:"One driver believes the team has underinvested in performance and wants clarity about their future. A respectful meeting could preserve trust; ignoring the issue may make the next contract review more expensive.",choices:[
 {id:"commit",label:"Offer a performance commitment",description:"Invest in the relationship and signal that the driver is part of the plan.",cashDelta:-90000,moraleDelta:7,reputationDelta:1},
 {id:"honest",label:"Set realistic expectations",description:"Be candid about the budget. It costs nothing, but the driver may be disappointed.",cashDelta:0,moraleDelta:1,reputationDelta:0},
 {id:"pressure",label:"Tell them to focus on racing",description:"Avoid a financial commitment, but risk losing trust in the garage.",cashDelta:0,moraleDelta:-8,reputationDelta:-1}]},
 {id:"rival-poach",category:"PADDOCK POLITICS",title:"A Rival Is Courting Your Engineer",source:"TECHNICAL DIRECTOR",story:"A better-funded rival has approached one of your key engineers. You can make a retention offer, offer a non-financial role commitment or let them explore the market.",choices:[
 {id:"retain",label:"Make a retention offer",description:"Pay a retention bonus to protect continuity in the engineering group.",cashDelta:-160000,moraleDelta:4,reputationDelta:2},
 {id:"promote",label:"Offer a bigger technical role",description:"Promise more responsibility and keep cash for car development.",cashDelta:-35000,moraleDelta:5,reputationDelta:1},
 {id:"release",label:"Let them explore",description:"Keep the budget intact, but the uncertainty unsettles the team.",cashDelta:0,moraleDelta:-5,reputationDelta:-1}]},
 {id:"scrutineering",category:"FIA PROTEST",title:"Random Scrutineering Notice",source:"FIA SCRUTINEERING",story:"Officials select your car for an additional pre-session inspection after a rival raises questions about your setup. No violation has been established. The team can prepare a full technical case or take a conservative setup approach.",choices:[
 {id:"full-case",label:"Prepare the technical case",description:"Spend on engineering documentation and defend the current specification.",cashDelta:-100000,moraleDelta:2,reputationDelta:4},
 {id:"conservative",label:"Run a conservative setup",description:"Give away some potential pace and reduce the chance of a prolonged dispute.",cashDelta:-25000,moraleDelta:0,reputationDelta:1},
 {id:"appeal",label:"Request formal clarification",description:"Pay a smaller fee to clarify the rule and reduce future uncertainty.",cashDelta:-55000,moraleDelta:1,reputationDelta:3}]},
 {id:"unexpected-bonus",category:"COMMERCIAL",title:"A Sponsor Offers a Survival Bonus",source:"COMMERCIAL DEPARTMENT",story:"A partner offers an emergency payment if the team can provide a strong story for the weekend. You can accept a straightforward exposure package, negotiate a smaller commitment or decline to protect the team's independence.",choices:[
 {id:"take-bonus",label:"Accept the bonus",description:"Bring in cash immediately, with a modest hit to staff time.",cashDelta:240000,moraleDelta:-1,reputationDelta:1},
 {id:"small-deal",label:"Negotiate a smaller deal",description:"Take less money while keeping the workload manageable.",cashDelta:130000,moraleDelta:1,reputationDelta:1},
 {id:"decline-bonus",label:"Decline the offer",description:"Keep full focus on racing and maintain independence.",cashDelta:0,moraleDelta:2,reputationDelta:0}]},
 {id:"monsoon-forecast",category:"TEAM DRAMA",title:"Monsoon Weather Is Moving In",source:"METEOROLOGY DEPARTMENT",story:"Weather radar predicts heavy rain around race time. Invest in wet-weather preparation, gamble on the forecast or choose a compromise.",choices:[
 {id:"wet-test",label:"Run the wet-weather package",description:"Spend RM90,000 on setup simulation and tyre data for better pace and tyre control.",cashDelta:-90000,moraleDelta:2,reputationDelta:1,weekendEffect:"wet-prepared"},
 {id:"dry-gamble",label:"Stick with the dry setup",description:"Save money, but rain could catch the team out and cost pace.",cashDelta:0,moraleDelta:0,reputationDelta:0,weekendEffect:"wet-unprepared"},
 {id:"mixed-setup",label:"Choose a safe compromise",description:"Spend RM35,000 on a flexible setup with no major advantage or penalty.",cashDelta:-35000,moraleDelta:1,reputationDelta:1}]},
 {id:"technical-directive",category:"FIA PROTEST",title:"A Late Technical Directive",source:"FIA TECHNICAL DELEGATE",story:"A clarification changes how a key aerodynamic area will be inspected this weekend. Comply early, challenge the interpretation or make a conservative adjustment.",choices:[
 {id:"comply-early",label:"Comply before scrutineering",description:"Spend RM70,000 on an orderly adjustment and avoid the worst disruption.",cashDelta:-70000,moraleDelta:1,reputationDelta:4,weekendEffect:"directive-compliant"},
 {id:"fight-directive",label:"Challenge the interpretation",description:"Spend less now, but uncertainty may cost valuable pace.",cashDelta:-25000,moraleDelta:2,reputationDelta:-2,weekendEffect:"directive-restricted"},
 {id:"quick-adjust",label:"Make a quick adjustment",description:"Pay a smaller fee and take a conservative approach.",cashDelta:-40000,moraleDelta:0,reputationDelta:1}]},
 {id:"spare-parts-crunch",category:"TEAM DRAMA",title:"The Spare Parts Cabinet Is Nearly Empty",source:"CHIEF MECHANIC",story:"A run of minor failures has depleted spare-parts stock. Emergency delivery protects the cars, while stretching existing components increases the risk of extra wear.",choices:[
 {id:"secure-spares",label:"Fly in emergency spares",description:"Spend RM110,000 to protect component condition throughout the weekend.",cashDelta:-110000,moraleDelta:2,reputationDelta:1,weekendEffect:"spares-secured"},
 {id:"stretch-parts",label:"Stretch the existing stock",description:"Keep the cash, but component wear and reliability risk will rise.",cashDelta:0,moraleDelta:-2,reputationDelta:-1,weekendEffect:"parts-shortage"},
 {id:"borrow-parts",label:"Borrow from a partner team",description:"Pay RM45,000 and keep reliability on neutral footing.",cashDelta:-45000,moraleDelta:1,reputationDelta:1}]},
 {id:"nemesis-showdown",category:"PADDOCK POLITICS",title:"Your Nemesis Demands a Showdown",source:"PADDOCK MEDIA",story:"A rival principal has made this personal. The team wants a direct response before the next race: go all-in on beating them, or stay composed and let the result speak for itself.",choices:[
 {id:"feud-attack",label:"Declare war on track",description:"Spend RM60,000 on a targeted performance programme. Gain a stronger pace edge over your nemesis, but push the team harder.",cashDelta:-60000,moraleDelta:2,reputationDelta:2,weekendEffect:"feud-attack"},
 {id:"feud-composed",label:"Keep the response professional",description:"A modest RM20,000 preparation cost. Give up a little peak pace for a more controlled showdown.",cashDelta:-20000,moraleDelta:3,reputationDelta:4,weekendEffect:"feud-composed"},
 {id:"feud-ignore",label:"Refuse to play their game",description:"Spend nothing and avoid the media circus, but your rival gets extra motivation.",cashDelta:0,moraleDelta:1,reputationDelta:-2,weekendEffect:"feud-composed"}]},
];
function createPaddockEvent(race: RaceState): PaddockEvent {
 const previous = race.resolvedPaddockEvents ?? [];
 if (race.rivalryFeudTeam && !previous.slice(-2).includes("nemesis-showdown")) {
   const showdown = PADDOCK_EVENT_DECK.find((event) => event.id === "nemesis-showdown");
   if (showdown) return { ...showdown, title: race.rivalryFeudTeam + " Demand a Showdown", story: race.rivalryFeudTeam + " have turned your rivalry into a public feud. Their principal wants a direct response before the next race: attack them on track, stay composed, or refuse to play their game.", choices: showdown.choices.map((choice) => ({ ...choice })) };
 }
 const candidates = PADDOCK_EVENT_DECK.filter((event) => !previous.slice(-3).includes(event.id));
 const pool = candidates.length ? candidates : PADDOCK_EVENT_DECK;
 const seed = (race.seed ^ Math.imul(race.weekendNumber + 31, 2246822519)) >>> 0;
 return pool[seed % pool.length];
}
function driverSalary(name: string): number {
 const profile = DRIVER_MARKET.find((driver) => driver.name === name);
 return Math.round((42000 + Math.max(0, (profile?.pace ?? 80) - 75) * 3200) / 5000) * 5000;
}

const TEAM_COLOR_PRESETS = [
  { name: "Racing Red", primary: "#f04438", secondary: "#f2f2f2" },
  { name: "Midnight Blue", primary: "#2864dc", secondary: "#dce9ff" },
  { name: "Emerald", primary: "#16a36a", secondary: "#e0ffef" },
  { name: "Solar Gold", primary: "#e8b323", secondary: "#17191f" },
  { name: "Violet", primary: "#8657d8", secondary: "#f0e6ff" },
  { name: "Arctic", primary: "#49b9d1", secondary: "#10232b" },
  { name: "Graphite", primary: "#777f8d", secondary: "#f2f2f2" },
  { name: "Hot Pink", primary: "#ec4f9b", secondary: "#fff0f7" },
  { name: "Orange", primary: "#f07828", secondary: "#fff0dc" },
  { name: "Lime", primary: "#9bbf35", secondary: "#18210b" },
] as const;
const SAVE_CODE_PREFIX = "RLP1";
function checksum(text: string) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = Math.imul(hash, 16777619); }
  return (hash >>> 0).toString(36).toUpperCase();
}
function encodeSaveCode(payload: unknown) {
  const json = JSON.stringify(payload);
  const bytes = encodeURIComponent(json).replace(/%([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
  return SAVE_CODE_PREFIX + "." + btoa(bytes) + "." + checksum(json);
}
function decodeSaveCode(code: string): any {
  const parts = code.trim().replace(/\s+/g, "").split(".");
  if (parts.length !== 3 || parts[0] !== SAVE_CODE_PREFIX) throw new Error("This doesn't look like a Redline Ascension save code.");
  let json = "";
  try {
    const bytes = atob(parts[1]);
    const escaped = Array.from(bytes, (char) => "%" + char.charCodeAt(0).toString(16).padStart(2, "0")).join("");
    json = decodeURIComponent(escaped);
  } catch { throw new Error("The save code is incomplete or damaged."); }
  if (checksum(json) !== parts[2]) throw new Error("Save code verification failed. Check that the entire code was copied.");
  const payload = JSON.parse(json);
  if (payload?.format !== 1 || payload?.race?.version !== 1 || !Array.isArray(payload?.race?.cars) || payload.race.cars.length < 10) throw new Error("This save is not compatible with this version of Redline Ascension.");
  if (!payload.garageMeta || !Array.isArray(payload.garageMeta.unlocks) || !Array.isArray(payload.garageMeta.rewardedRuns)) throw new Error("The save code is missing Garage progression data.");
  return payload;
}

function loadRace(): RaceState {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw) {
      const saved = JSON.parse(raw) as RaceState;
      if (saved.version === 1 && Array.isArray(saved.cars) && saved.cars.length >= 10) {
        const playerDrivers = saved.cars.filter((car) => car.playerCar).slice(0, 2);
        const migrated: RaceState = { ...saved, upgradeModules: saved.upgradeModules ?? { aero: 0, power: 0, suspension: 0, reliability: 0 }, teamMorale: saved.teamMorale ?? 62, teamReputation: saved.teamReputation ?? 45, pendingPaddockEvent: saved.pendingPaddockEvent ?? null, paddockEventRound: saved.paddockEventRound ?? 0, resolvedPaddockEvents: saved.resolvedPaddockEvents ?? [], driverContracts: saved.driverContracts?.length ? saved.driverContracts : playerDrivers.map((car, index) => ({ id: "driver-" + (index + 1), driverName: car.driver, salaryPerRace: driverSalary(car.driver), expiresAtRound: 10, renewed: false, loyalty: 60 })) };
        return ensureFullGrid(migrated);
      }
    }
  } catch { /* Ignore a damaged local save and start a new career. */ }
  return createRace();
}

function seededTrack(seed: number) {
  let value = seed >>> 0;
  const rand = () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
  // Original procedural layouts, shaped around real circuit archetypes rather than one oval formula.
  // Coordinates are normalized to the map canvas; each seed picks a distinct family and subtly varies it.
  const layouts: [number, number][][] = [
    // Fast, flowing GP circuit: long straights, sweeping direction changes and a tight final section.
    [[.16,.30],[.34,.22],[.49,.25],[.60,.34],[.72,.25],[.85,.29],[.91,.40],[.84,.49],[.72,.46],[.65,.54],[.78,.65],[.83,.77],[.75,.84],[.60,.81],[.54,.70],[.42,.69],[.35,.82],[.23,.85],[.13,.77],[.17,.65],[.27,.59],[.22,.49],[.12,.47],[.09,.38]],
    // Street-style layout: narrow straights, square corners and a tight central hairpin.
    [[.13,.24],[.39,.24],[.43,.31],[.43,.40],[.34,.43],[.31,.49],[.37,.54],[.63,.54],[.70,.49],[.70,.39],[.77,.34],[.88,.37],[.91,.47],[.86,.56],[.79,.59],[.78,.70],[.70,.77],[.53,.77],[.49,.69],[.49,.63],[.38,.63],[.29,.70],[.17,.69],[.11,.61],[.13,.50],[.20,.45],[.20,.36]],
    // Technical S-curves and crossover-like middle section, inspired by classic driver circuits.
    [[.12,.70],[.20,.79],[.34,.79],[.41,.70],[.35,.62],[.24,.60],[.19,.52],[.23,.43],[.35,.40],[.43,.46],[.49,.55],[.56,.55],[.62,.45],[.58,.34],[.49,.30],[.44,.23],[.51,.17],[.66,.18],[.77,.26],[.82,.38],[.78,.49],[.69,.56],[.72,.66],[.83,.71],[.86,.80],[.76,.86],[.60,.85],[.52,.77],[.43,.72]],
    // Long back straight and deep hairpin: asymmetric, endurance-style silhouette.
    [[.10,.34],[.28,.29],[.49,.29],[.72,.27],[.86,.30],[.91,.38],[.89,.48],[.82,.53],[.71,.51],[.66,.58],[.70,.68],[.82,.72],[.85,.81],[.77,.87],[.61,.85],[.51,.78],[.46,.67],[.38,.62],[.29,.66],[.25,.77],[.16,.81],[.09,.75],[.12,.64],[.20,.57],[.22,.48],[.14,.45]],
    // Compact, angular park circuit with a sequence of linked corners.
    [[.18,.25],[.34,.20],[.47,.25],[.53,.33],[.65,.28],[.78,.30],[.86,.39],[.82,.47],[.72,.48],[.67,.42],[.59,.47],[.60,.57],[.72,.60],[.83,.57],[.89,.65],[.84,.76],[.70,.81],[.61,.75],[.51,.70],[.42,.77],[.28,.81],[.17,.76],[.12,.66],[.19,.58],[.30,.56],[.34,.48],[.26,.43],[.14,.44],[.11,.34]]
  ];
  const layout = layouts[Math.floor(rand() * layouts.length)];
  const scaleX = 284;
  const scaleY = 164;
  const rotation = (rand() - 0.5) * 0.14;
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  return layout.map(([nx, ny]) => {
    const x = (nx - 0.5) * scaleX;
    const y = (ny - 0.5) * scaleY;
    const jitterX = (rand() - 0.5) * 7;
    const jitterY = (rand() - 0.5) * 7;
    return [
      Math.max(35, Math.min(345, 190 + x * cos - y * sin + jitterX)),
      Math.max(22, Math.min(198, 110 + x * sin + y * cos + jitterY))
    ] as [number, number];
  });
}

function smoothTrackPath(points: readonly (readonly [number, number])[]) {
  const midpoint = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const first = midpoint(points[points.length - 1], points[0]);
  let path = "M " + first[0] + " " + first[1];
  for (let i = 0; i < points.length; i++) {
    const next = midpoint(points[i], points[(i + 1) % points.length]);
    path += " Q " + points[i][0] + " " + points[i][1] + " " + next[0] + " " + next[1];
  }
  return path + " Z";
}

function sampleSmoothTrack(points: readonly (readonly [number, number])[], samplesPerSegment = 16): [number, number][] {
  const midpoint = (a: readonly [number, number], b: readonly [number, number]): [number, number] => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const samples: [number, number][] = [];
  for (let index = 0; index < points.length; index++) {
    const previous = points[(index - 1 + points.length) % points.length];
    const control = points[index];
    const next = points[(index + 1) % points.length];
    const start = midpoint(previous, control);
    const end = midpoint(control, next);
    for (let step = 0; step < samplesPerSegment; step++) {
      const t = step / samplesPerSegment;
      const inverse = 1 - t;
      samples.push([
        inverse * inverse * start[0] + 2 * inverse * t * control[0] + t * t * end[0],
        inverse * inverse * start[1] + 2 * inverse * t * control[1] + t * t * end[1],
      ]);
    }
  }
  return samples;
}

function trackPosition(progress: number, points: readonly (readonly [number, number])[]) {
  const segments = points.map((point, index) => Math.hypot(points[(index + 1) % points.length][0] - point[0], points[(index + 1) % points.length][1] - point[1]));
  const totalLength = segments.reduce((total, length) => total + length, 0);
  let distance = (((progress % 1) + 1) % 1) * totalLength;
  for (let index = 0; index < points.length; index++) {
    const a = points[index];
    const b = points[(index + 1) % points.length];
    const segmentLength = segments[index];
    if (distance <= segmentLength || index === points.length - 1) {
      const fraction = segmentLength === 0 ? 0 : distance / segmentLength;
      return { x: a[0] + (b[0] - a[0]) * fraction, y: a[1] + (b[1] - a[1]) * fraction };
    }
    distance -= segmentLength;
  }
  return { x: points[0][0], y: points[0][1] };
}

function CircuitMap({ cars, lap, teamName, speed = 1, circuitSeed = 8241, circuitName = "Copperhead Ring" }: { cars: CarState[]; lap: number; teamName: string; speed?: number; circuitSeed?: number; circuitName?: string }) {
  const [selectedSector, setSelectedSector] = useState<number | "ALL">("ALL");
  const [selectedTurn, setSelectedTurn] = useState<number | null>(null);
  const trackPoints = useMemo(() => seededTrack(circuitSeed), [circuitSeed]);
  const trackPath = useMemo(() => smoothTrackPath(trackPoints), [trackPoints]);
  const trackGeometry = useMemo(() => sampleSmoothTrack(trackPoints), [trackPoints]);
  const [visualPositions, setVisualPositions] = useState<Record<string, { x: number; y: number }>>(() => Object.fromEntries(cars.map((car) => [car.id, trackPosition(car.progress, trackGeometry)])));
  const visualPositionsRef = useRef(visualPositions);
  const animationFrameRef = useRef<number | null>(null);
  const nearbyRivalIds = useMemo(() => {
    const playerCars = cars.filter((car) => car.playerCar && !car.finished);
    if (!playerCars.length) return new Set<string>();
    const trackFraction = (progress: number) => ((progress % 1) + 1) % 1;
    return new Set(cars.filter((car) => !car.playerCar && !car.finished).map((car) => {
      const rivalProgress = trackFraction(car.progress);
      const gap = Math.min(...playerCars.map((player) => {
        const rawGap = Math.abs(rivalProgress - trackFraction(player.progress));
        return Math.min(rawGap, 1 - rawGap);
      }));
      return { id: car.id, gap };
    }).sort((a, b) => a.gap - b.gap).slice(0, 4).map((car) => car.id));
  }, [cars]);
  const points = useMemo(() => cars.map((car) => ({ ...car, ...(visualPositions[car.id] ?? trackPosition(car.progress, trackGeometry)), nearbyRival: nearbyRivalIds.has(car.id) })), [cars, trackPoints, nearbyRivalIds]);
  useEffect(() => {
    const targets = Object.fromEntries(cars.map((car) => [car.id, trackPosition(car.progress, trackGeometry)])) as Record<string, { x: number; y: number }>;
    const from = visualPositionsRef.current;
    const startedAt = performance.now();
    const duration = Math.max(1000 / speed, 120);
    if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
    const animate = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / duration);
      const eased = progress * progress * (3 - 2 * progress);
      const next: Record<string, { x: number; y: number }> = {};
      for (const [id, target] of Object.entries(targets)) {
        const origin = from[id] ?? target;
        next[id] = { x: origin.x + (target.x - origin.x) * eased, y: origin.y + (target.y - origin.y) * eased };
      }
      visualPositionsRef.current = next;
      setVisualPositions(next);
      if (progress < 1) animationFrameRef.current = window.requestAnimationFrame(animate);
      else animationFrameRef.current = null;
    };
    animationFrameRef.current = window.requestAnimationFrame(animate);
    return () => {
      if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    };
  }, [cars, trackGeometry, speed]);
  const startFinish = trackPosition(0, trackGeometry);
  const sectorOne = trackPosition(1 / 3, trackPoints);
  const sectorTwo = trackPosition(2 / 3, trackPoints);
  const turnMarkers = useMemo(() => {
    const candidates = trackPoints.map((point, index) => {
      const previous = trackPoints[(index - 1 + trackPoints.length) % trackPoints.length];
      const next = trackPoints[(index + 1) % trackPoints.length];
      const incoming = [point[0] - previous[0], point[1] - previous[1]];
      const outgoing = [next[0] - point[0], next[1] - point[1]];
      const inLength = Math.hypot(incoming[0], incoming[1]) || 1;
      const outLength = Math.hypot(outgoing[0], outgoing[1]) || 1;
      const cosine = Math.max(-1, Math.min(1, (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (inLength * outLength)));
      const deflection = 180 - Math.acos(cosine) * 180 / Math.PI;
      return { x: point[0], y: point[1], index, deflection };
    }).filter((point) => point.deflection >= 18).sort((a, b) => b.deflection - a.deflection);
    const selected: typeof candidates = [];
    for (const candidate of candidates) {
      if (selected.every((point) => {
        const distance = Math.abs(point.index - candidate.index);
        return Math.min(distance, trackPoints.length - distance) >= 2;
      })) selected.push(candidate);
      if (selected.length === 8) break;
    }
    return selected.sort((a, b) => a.index - b.index).map((point, index) => ({ ...point, number: index + 1, sector: Math.min(3, Math.floor(point.index / trackPoints.length * 3) + 1) }));
  }, [trackPoints]);
  const activeTurn = turnMarkers.find((turn) => turn.number === selectedTurn) ?? null;
  const visibleTurns = turnMarkers.filter((turn) => selectedSector === "ALL" || turn.sector === selectedSector);
  const sectorCars = [...cars].filter((car) => selectedSector === "ALL" || Math.min(3, Math.floor((((car.progress % 1) + 1) % 1) * 3) + 1) === selectedSector).sort((a, b) => b.progress - a.progress);
  const fastestLastLap = cars.filter((car) => car.lastLap > 0 && !car.finished).reduce((best, car) => Math.min(best, car.lastLap), Infinity);
  const battleWatch = useMemo(() => {
    const runningCars = [...cars].filter((car) => !car.finished).sort((a, b) => b.progress - a.progress);
    return runningCars.slice(0, -1).map((car, index) => {
      const ahead = car;
      const behind = runningCars[index + 1];
      const gapLaps = Math.max(0, ahead.progress - behind.progress);
      const gapPercent = gapLaps * 100;
      return { ahead, behind, gapLaps, gapPercent, playerInvolved: ahead.playerCar || behind.playerCar };
    }).sort((a, b) => a.gapLaps - b.gapLaps).slice(0, 3);
  }, [cars]);
  return <div className="circuit-wrap circuit-theme">
    <div className="circuit-hud"><span><i /> CIRCUIT TELEMETRY</span><b>SEED {circuitSeed.toString(16).toUpperCase().padStart(6, "0").slice(-6)}</b></div>
    <svg viewBox="0 0 380 220" role="img" aria-label={"Live circuit map for " + circuitName}>
      <defs>
        <filter id="player-glow" x="-200%" y="-200%" width="400%" height="400%">
          <feGaussianBlur stdDeviation="2.5" />
        </filter>
        <linearGradient id="track-asphalt" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#59616b" />
          <stop offset="48%" stopColor="#343b45" />
          <stop offset="100%" stopColor="#20262e" />
        </linearGradient>
        <pattern id="pitwall-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="#8c9aad" strokeOpacity=".09" strokeWidth=".45" />
        </pattern>
      </defs>
      <rect x="0" y="0" width="380" height="220" fill="url(#pitwall-grid)" />
      <path d="M12 16h22M12 16v22M368 16h-22M368 16v22M12 204h22M12 204v-22M368 204h-22M368 204v-22" fill="none" stroke="#748296" strokeOpacity=".42" strokeWidth=".7" />
      {/* Layered asphalt, painted edge lines and timing-sector overlays inspired by a live pit-wall track map. */}
      <path d={trackPath} fill="none" stroke="#080a0e" strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <path d={trackPath} fill="none" stroke="#a9b1bc" strokeWidth="13" strokeLinecap="round" strokeLinejoin="round" opacity=".52" />
      <path d={trackPath} fill="none" stroke="url(#track-asphalt)" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
      <path d={trackPath} fill="none" stroke="#d4d9e0" strokeOpacity=".48" strokeWidth=".7" strokeDasharray="2 2.5" strokeLinecap="butt" />
      <path d={trackPath} pathLength="300" fill="none" stroke="#ff5147" strokeWidth="3" strokeDasharray="100 200" strokeDashoffset="0" strokeLinecap="butt" />
      <path d={trackPath} pathLength="300" fill="none" stroke="#49a7ff" strokeWidth="3" strokeDasharray="100 200" strokeDashoffset="-100" strokeLinecap="butt" />
      <path d={trackPath} pathLength="300" fill="none" stroke="#f4c95d" strokeWidth="3" strokeDasharray="100 200" strokeDashoffset="-200" strokeLinecap="butt" />
      <path className="track-telemetry-flow" d={trackPath} pathLength="300" fill="none" stroke="#fff1e9" strokeWidth="1.2" strokeDasharray="7 293" strokeDashoffset="0" strokeLinecap="round" />
      <g transform={"translate(" + startFinish.x + " " + startFinish.y + ")"}>
        <circle r="7" fill="#050609" stroke="#f4f5f7" strokeWidth="1.4" />
        <path d="M-5 -5h10v10h-10z" fill="#f4f5f7" />
        <path d="M-5 -5h5v5h-5zM0 0h5v5H0z" fill="#050609" />
      </g>
      <text x={startFinish.x + 12} y={startFinish.y - 12} className="track-marker-label">START / FINISH</text>
      <g className="track-sector sector-one" transform={"translate(" + sectorOne.x + " " + sectorOne.y + ")"}><circle r="7" /><text y="2.5">S1</text></g>
      <g className="track-sector sector-two" transform={"translate(" + sectorTwo.x + " " + sectorTwo.y + ")"}><circle r="7" /><text y="2.5">S2</text></g>
      {turnMarkers.map((turn) => <g key={turn.number} className={"track-turn" + (selectedSector !== "ALL" && turn.sector !== selectedSector ? " turn-dimmed" : "") + (selectedTurn === turn.number ? " turn-selected" : "")} transform={"translate(" + turn.x + " " + turn.y + ")"} aria-label={"Turn " + turn.number + ", sector " + turn.sector}>
        <circle r={selectedTurn === turn.number ? 7 : 5.4} fill={selectedTurn === turn.number ? "#ff453a" : "#050609"} stroke={selectedTurn === turn.number ? "#ffb0aa" : "#d8dce4"} strokeWidth="1" />
        <text y="1.9" textAnchor="middle" fill="#f2f4f8" fontSize="5.5" fontWeight="700">{turn.number}</text>
      </g>)}
      <g className="track-core">
        <text x="190" y="105" textAnchor="middle" className="track-center-label">LAP {String(lap).padStart(2, "0")}</text>
        <text x="190" y="118" textAnchor="middle" className="track-center-sub">{circuitName.toUpperCase()}</text>
        <text x="190" y="131" textAnchor="middle" className="track-center-live">● LIVE TIMING</text>
      </g>
      {points.map((car) => <g key={car.id} className={car.playerCar ? "track-car team-car" : car.nearbyRival ? "track-car nearby-rival" : "track-car rival-car"}>
        {car.playerCar && <circle className="track-car-halo team-halo" cx={car.x} cy={car.y} r="9" fill="none" stroke={car.teamColor} strokeWidth="1.6" opacity=".95" />}
        {car.nearbyRival && <circle className="track-car-halo rival-halo" cx={car.x} cy={car.y} r="7" fill="none" stroke="#ffd166" strokeWidth="1.4" opacity=".95" />}
        {car.playerCar && <circle cx={car.x} cy={car.y} r="10" fill={car.teamColor} opacity=".2" filter="url(#player-glow)" />}
        {car.playerCar && <circle cx={car.x} cy={car.y} r="7" fill={car.teamColor} opacity=".24" />}
        <circle cx={car.x} cy={car.y} r={car.playerCar ? 4.5 : car.nearbyRival ? 3.8 : 2.5} fill={car.teamColor} stroke={car.playerCar ? "#ffffff" : car.nearbyRival ? "#ffd166" : "#11141a"} strokeWidth={car.playerCar || car.nearbyRival ? 1.3 : .8} />
        {(car.playerCar || car.nearbyRival) && <text x={car.x + 7} y={car.y - 6} className={car.playerCar ? "track-car-label team-car-label" : "track-car-label rival-car-label"}>{car.playerCar ? (car.id === "rp-1" ? "07" : "22") : car.driver.split(" ").map((part) => part[0]).join("").toUpperCase()}</text>}
      </g>)}
    </svg>
    <div className="map-legend"><span><i className="dot red" /> {teamName.toUpperCase()}</span><span><i className="dot teal" /> VORTEX</span><span><i className="dot purple" /> APEX</span><span><i className="dot gold" /> NORTHSTAR</span><span><i className="dot blue" /> VELOCITY</span><span><i className="dot" style={{ background: "#d8dce4" }} /> TURN NUMBERS</span><span className="map-threat-key"><i /> NEAREST RIVALS</span></div>
    <div className="circuit-controls" aria-label="Circuit sector selection">
      <div className="sector-tabs">
        {(["ALL", 1, 2, 3] as const).map((sector) => <button key={String(sector)} type="button" className={selectedSector === sector ? "sector-tab active" : "sector-tab"} aria-pressed={selectedSector === sector} onClick={() => { setSelectedSector(sector); setSelectedTurn(null); }}>{sector === "ALL" ? "FULL CIRCUIT" : "SECTOR " + sector}</button>)}
      </div>
      <section className="circuit-time-gain" aria-label="Potential time-gain zones">
        <div className="circuit-battle-heading"><span className="circuit-panel-kicker">TIME-GAIN ZONES</span><small>ESTIMATED HIGH-LOAD CORNERS</small></div>
        <div className="circuit-time-gain-list">
          {[...turnMarkers].sort((a, b) => b.deflection - a.deflection).slice(0, 3).map((turn, index) => <div className="circuit-time-gain-row" key={turn.number}>
            <b>0{index + 1}</b><span><strong>TURN {String(turn.number).padStart(2, "0")}</strong><small>SECTOR {turn.sector}</small></span><em>{Math.round(turn.deflection)}°</em>
          </div>)}
        </div>
        <p className="circuit-timing-note">Focus areas are estimated from track geometry, not measured telemetry or guaranteed lap-time gains.</p>
      </section>
      <section className="circuit-battle-watch" aria-label="Closest battles on track">
        <div className="circuit-battle-heading"><span className="circuit-panel-kicker">BATTLE WATCH</span><small>SMALLEST GAPS · LIVE ORDER</small></div>
        {battleWatch.length ? <div className="circuit-battle-list">
          {battleWatch.map((battle, index) => <div key={battle.ahead.id + "-" + battle.behind.id} className={"circuit-battle-row" + (battle.playerInvolved ? " player-battle" : "")}>
            <b>0{index + 1}</b>
            <span className="battle-driver"><i style={{ background: battle.ahead.teamColor }} />{battle.ahead.driver}<small>P{Math.max(1, cars.slice().sort((a, b) => b.progress - a.progress).findIndex((car) => car.id === battle.ahead.id) + 1)}</small></span>
            <span className="battle-gap">{battle.gapPercent < 0.01 ? "SIDE BY SIDE" : battle.gapPercent.toFixed(2) + "% LAP"}<small>{battle.gapPercent < 1.5 ? "ATTACK RANGE" : "GAP"}</small></span>
            <span className="battle-driver"><i style={{ background: battle.behind.teamColor }} />{battle.behind.driver}<small>P{Math.max(1, cars.slice().sort((a, b) => b.progress - a.progress).findIndex((car) => car.id === battle.behind.id) + 1)}</small></span>
          </div>)}
        </div> : <p className="circuit-empty">No active battles to track.</p>}
        <p className="circuit-timing-note">Gap is estimated from lap progress, not a measured distance or guaranteed overtake.</p>
      </section>
      <div className="circuit-detail-grid">
        <section className="circuit-detail-panel">
          <div className="circuit-panel-kicker">CORNER-BY-CORNER</div>
          <div className="circuit-turn-list">
            {visibleTurns.map((turn) => <button type="button" key={turn.number} className={selectedTurn === turn.number ? "circuit-turn-row active" : "circuit-turn-row"} onClick={() => setSelectedTurn(turn.number)} aria-pressed={selectedTurn === turn.number}>
              <b>T{String(turn.number).padStart(2, "0")}</b><span>Sector {turn.sector}</span><i style={{ width: Math.max(18, Math.min(100, turn.deflection)) + "%" }} /><small>{Math.round(turn.deflection)}°</small>
            </button>)}
            {visibleTurns.length === 0 && <p className="circuit-empty">No numbered corners in this sector for this layout.</p>}
          </div>
          {activeTurn && <div className="selected-turn-note"><b>TURN {String(activeTurn.number).padStart(2, "0")}</b><span>Estimated direction change: {Math.round(activeTurn.deflection)}° · Sector {activeTurn.sector}</span></div>}
        </section>
        <section className="circuit-detail-panel">
          <div className="circuit-panel-kicker">{selectedSector === "ALL" ? "LIVE TRACK ORDER" : "SECTOR " + selectedSector + " TRACK ORDER"}</div>
          <div className="circuit-timing-head"><span>CAR / DRIVER</span><span>LAST LAP Δ</span></div>
          <div className="circuit-timing-list">
            {sectorCars.slice(0, 8).map((car, index) => {
              const delta = car.lastLap > 0 && Number.isFinite(fastestLastLap) ? car.lastLap - fastestLastLap : null;
              return <div className={"circuit-timing-row" + (car.playerCar ? " player-timing" : "")} key={car.id}>
                <b>{index + 1}</b><i style={{ background: car.teamColor }} /><span>{car.driver}{car.playerCar ? " · YOU" : ""}</span><strong>{delta === null ? "—" : delta < 0.005 ? "FASTEST" : "+" + delta.toFixed(2) + "s"}</strong>
              </div>;
            })}
          </div>
          <p className="circuit-timing-note">Last-lap gap to the fastest recorded lap in this field; not a live sector split.</p>
        </section>
      </div>
    </div>
  </div>;
}


function DriverPortrait({ driver, index }: { driver: { name: string; color: string }; index: number }) {
  const accent = driver.color;
  // Cinematic, photoreal-inspired driver bust silhouettes: varied hairlines, natural head shapes,
  // subtle studio rim-light, racing suit shoulders and no cartoon facial features.
  const profiles = [
    { head: "M29 29 C29 17 36 11 45 11 C55 11 61 19 60 31 L58 42 C56 51 51 57 45 59 C38 56 32 50 30 41Z", hair: "M28 32 C25 20 31 10 41 8 C51 5 60 13 62 23 L60 34 L55 25 C48 28 39 24 34 20 L32 33Z", fringe: "M31 22 C37 25 47 27 56 23 L55 29 C48 31 39 29 33 26Z" },
    { head: "M31 29 C31 18 37 12 45 12 C54 12 59 20 59 31 L57 42 C55 50 50 56 45 58 C39 55 34 49 32 41Z", hair: "M29 29 C28 18 34 10 43 9 C53 8 60 15 60 25 L57 31 L54 20 C48 24 39 23 33 20 L32 31Z", fringe: "M33 20 C39 24 48 24 55 20 L54 26 C47 29 39 27 33 24Z" },
    { head: "M30 28 C30 17 37 12 45 12 C54 12 60 19 59 31 L57 41 C55 50 50 56 44 58 C37 55 32 49 31 40Z", hair: "M28 32 C27 19 34 10 44 9 C54 8 61 16 61 27 L58 34 L54 22 C47 25 39 24 33 21 L32 33Z", fringe: "M32 21 C38 24 46 25 55 21 L55 27 C47 29 39 28 33 25Z" },
    { head: "M31 28 C31 18 37 12 45 12 C54 12 59 20 59 31 L57 42 C55 50 50 55 45 58 C39 55 34 49 32 41Z", hair: "M29 29 C28 17 36 9 45 9 C55 9 61 17 60 27 L58 33 L54 22 C48 25 40 24 34 20 L32 31Z", fringe: "M33 21 C39 25 48 25 55 22 L54 27 C47 30 39 28 33 25Z" }
  ];
  const profile = profiles[index % profiles.length];
  const id = "portrait-" + index;
  return <div className="driver-portrait" style={{ "--driver-accent": accent } as React.CSSProperties} aria-label={driver.name + " portrait"}>
    <svg viewBox="0 0 88 94" role="img" aria-label={"Driver silhouette of " + driver.name} focusable="false">
      <defs>
        <linearGradient id={id + "-studio"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#858b96" stopOpacity=".58" />
          <stop offset="38%" stopColor="#333741" stopOpacity=".32" />
          <stop offset="100%" stopColor="#07090d" stopOpacity=".98" />
        </linearGradient>
        <linearGradient id={id + "-skin"} x1="0" y1="0" x2="1" y2=".25">
          <stop offset="0%" stopColor="#8d929b" />
          <stop offset="28%" stopColor="#565b65" />
          <stop offset="62%" stopColor="#343842" />
          <stop offset="100%" stopColor="#12151b" />
        </linearGradient>
        <linearGradient id={id + "-skinrim"} x1="0" y1="0" x2="1" y2=".1">
          <stop offset="0%" stopColor="#dce0e6" stopOpacity=".72" />
          <stop offset="42%" stopColor="#9299a5" stopOpacity=".26" />
          <stop offset="100%" stopColor="#171a20" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={id + "-hair"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#343943" />
          <stop offset="32%" stopColor="#11141a" />
          <stop offset="100%" stopColor="#020306" />
        </linearGradient>
        <linearGradient id={id + "-suit"} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#363b45" />
          <stop offset="48%" stopColor="#15181f" />
          <stop offset="100%" stopColor="#050609" />
        </linearGradient>
        <filter id={id + "-grain"}>
          <feTurbulence type="fractalNoise" baseFrequency=".82" numOctaves="2" seed={index + 8} />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer><feFuncA type="table" tableValues="0 .1" /></feComponentTransfer>
        </filter>
        <clipPath id={id + "-clip"}><rect width="88" height="94" rx="1.5" /></clipPath>
      </defs>
      <g clipPath={"url(#" + id + "-clip)"}>
        <rect width="88" height="94" fill="#0b0d12" />
        <rect width="88" height="94" fill={"url(#" + id + "-studio)"} />
        {/* Paddock-light backdrop and layered race suit */}
        <path d="M8 0H24L8 54H0V18Z" fill="#c4cad4" opacity=".055" />
        <path d="M72 0H88V47L80 60L67 24Z" fill={accent} opacity=".075" />
        <ellipse cx="44" cy="35" rx="34" ry="43" fill="#c4cad4" opacity=".07" />
        <path d="M3 98 C5 80 13 71 27 66 L36 62 L53 62 L63 67 C76 71 83 82 86 98Z" fill="#030407" />
        <path d="M13 98 C15 81 23 73 34 69 L44 78 L54 69 C66 73 74 82 76 98Z" fill={"url(#" + id + "-suit)"} />
        <path d="M15 88C22 77 27 73 35 70L40 77L31 91Z" fill="#6e7580" opacity=".18" />
        <path d="M73 88C66 77 61 73 53 70L48 77L57 91Z" fill="#000" opacity=".56" />
        <path d="M33 54 L33 67 L44 78 L55 66 L55 53Z" fill="#090b10" />
        <path d="M34 63 L44 75 L54 63 L52 59 L36 59Z" fill="#9299a5" opacity=".28" />
        <path d="M44 78 L44 94" stroke={accent} strokeWidth="1.3" strokeOpacity=".65" />
        <path d="M19 94L24 80M69 94L64 80" stroke="#b7bdc7" strokeOpacity=".17" strokeWidth=".7" />
        <path d="M30 34 C26 31 26 38 30 42 L33 43Z" fill="#30343d" />
        <path d="M58 34 C63 31 63 38 58 43 L56 43Z" fill="#20242c" />
        {/* Sculpted face planes with restrained, low-contrast features */}
        <path d={profile.head} fill={"url(#" + id + "-skin)"} />
        <path d="M31 29C33 20 39 15 45 15C53 15 57 22 57 31L55 43C53 51 49 55 45 57C39 54 34 48 32 40Z" fill="#a4aab4" opacity=".075" />
        <path d="M31 35C34 32 38 32 41 34M48 34C51 32 55 32 57 35" fill="none" stroke="#11141a" strokeWidth="1.8" strokeLinecap="round" />
        <path d="M32 36C35 34 38 34 40 36M49 36C52 34 55 34 56 36" fill="none" stroke="#b0b6c0" strokeOpacity=".32" strokeWidth=".65" strokeLinecap="round" />
        <path d="M44 35L42 43L45 45" fill="none" stroke="#11141a" strokeOpacity=".7" strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M39 49C42 50 47 50 50 48" fill="none" stroke="#11141a" strokeOpacity=".9" strokeWidth="1.3" strokeLinecap="round" />
        <path d="M39 50C42 51 47 51 50 49" fill="none" stroke="#aab0ba" strokeOpacity=".18" strokeWidth=".6" strokeLinecap="round" />
        <path d={profile.hair} fill={"url(#" + id + "-hair)"} />
        <path d={profile.fringe} fill="#10131a" />
        <path d="M30 31 C29 43 34 54 43 59" fill="none" stroke="#d1d6de" strokeOpacity=".32" strokeWidth="1.05" />
        <path d="M31 40 C32 49 36 55 42 58" fill="none" stroke="#8b929e" strokeOpacity=".28" strokeWidth="2.2" />
        <path d="M58 34 C60 43 56 53 49 58" fill="none" stroke="#a1a8b3" strokeOpacity=".24" strokeWidth="1.1" />
        <path d="M28 31 C26 21 32 12 40 9" fill="none" stroke="#e0e4ea" strokeOpacity=".4" strokeWidth="1.2" />
        <path d="M33 17C38 11 48 10 54 17" fill="none" stroke="#aeb5c0" strokeOpacity=".18" strokeWidth=".75" />
        <path d="M0 0 H88 V94 H0Z" fill={"url(#" + id + "-skinrim)"} />
        <path d="M0 0 H2 V94 H0Z" fill={accent} opacity=".3" />
        <rect width="88" height="94" filter={"url(#" + id + "-grain)"} opacity=".26" />
        <rect x=".5" y=".5" width="87" height="93" fill="none" stroke="#b9bec8" strokeOpacity=".18" />
      </g>
    </svg>
    <span className="driver-portrait-number">{String(index + 1).padStart(2, "0")}</span>
  </div>;
}
function MobileTabIcon({ id }: { id: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.45, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className={"mobile-tab-icon mobile-tab-icon-" + id} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
    {id === "race" && <g {...common}>
      <path d="M5 22.5 7.5 13l4-4h9l4 4 2.5 9.5v3H5z"/>
      <path d="m9 13 2.5-2.5h8L22 13l1.5 5h-16z"/>
      <path d="M10 18h12M12 22h8M8 25.5v2M24 25.5v2"/>
      <path d="M3 15h3M26 15h3" opacity=".6"/>
      <path d="M12 9V6h8v3" opacity=".75"/>
    </g>}
    {id === "strategy" && <g {...common}>
      <path d="M5 6.5h22v19H5z"/>
      <path d="M9 11h5M9 15h3M9 19h4"/>
      <path d="m15 22 3-5 3 2 4-7"/>
      <path d="M22 12h3v3" opacity=".75"/>
      <path d="M8 3.5h16" opacity=".5"/>
    </g>}
    {id === "standings" && <g {...common}>
      <path d="M6 4.5h20v23H6z"/>
      <path d="M6 11h20M6 18h20M13 4.5v23"/>
      <path d="M9 7.5h1.5M16 7.5h6M9 14.5h1.5M16 14.5h6M9 21.5h1.5M16 21.5h6"/>
      <path d="M3 8v16M29 8v16" opacity=".55"/>
    </g>}
    {id === "garage" && <g {...common}>
      <path d="m3.5 13 12.5-8 12.5 8"/>
      <path d="M6.5 12v15h19V12"/>
      <path d="M10 27v-8.5h12V27"/>
      <path d="M12 15h8M14 12.5h4"/>
      <path d="M12 22h8M12 24.5h8" opacity=".6"/>
    </g>}
    {id === "more" && <g {...common}>
      <path d="M5 7h22M5 16h22M5 25h22"/>
      <circle cx="11" cy="7" r="2.2" fill="#0b0e13"/>
      <circle cx="21" cy="16" r="2.2" fill="#0b0e13"/>
      <circle cx="14" cy="25" r="2.2" fill="#0b0e13"/>
      <path d="M11 4.5v5M21 13.5v5M14 22.5v5" opacity=".7"/>
    </g>}
  </svg>;
}
function GaragePerkIcon({ effect }: { effect: string }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.55, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const paths: Record<string, string> = {
    aero:"M4 23 35 8 27 24 14 27 4 23Zm10 4-4 7 11-8",
    power:"M11 7h18v5l3 3v17H8V15l3-3zM14 19h12v7H14z",
    suspension:"M9 6h22M9 34h22M20 6v5l-6 5 12 6-12 6 6 6",
    energy:"M23 4 10 22h9l-2 14 13-20h-9z",
    tyres:"M12 5h16v30H12zM15 10h10M15 16h10M15 22h10M15 28h10",
    reliability:"M20 4 33 9v10c0 8-5 13-13 17C12 32 7 27 7 19V9zM13 20l5 5 9-11",
    repair:"M7 12h26v20H7zM12 8h16M12 18h16M12 24h10",
    pace:"M5 33V20h7v13M17 33V12h7v21M29 33V6h6v27M4 36h32",
    qualifying:"M6 31V19h7v12M17 31V11h7v20M28 31V5h6v26M4 35h32",
    racecraft:"M6 31V19h7v12M17 31V11h7v20M28 31V5h6v26M4 35h32",
    consistency:"M6 31V19h7v12M17 31V11h7v20M28 31V5h6v26M4 35h32",
    strategy:"M6 31V19h7v12M17 31V11h7v20M28 31V5h6v26M4 35h32",
    weather:"M10 25a6 6 0 0 1 1-12 9 9 0 0 1 17 3 5 5 0 0 1 0 9zM13 29l-2 5m10-5-2 5m10-5-2 5",
    safety:"M20 4 33 9v10c0 8-5 13-13 17C12 32 7 27 7 19V9zM20 12v9m0 5h.1",
    opponents:"M15 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10M4 34c0-7 4-11 11-11s11 4 11 11M27 7a4 4 0 0 1 0 8m-1 8c5 0 8 4 8 9",
    research:"M14 5h12M17 5v10L9 28a4 4 0 0 0 4 6h14a4 4 0 0 0 4-6l-8-13V5M12 27h16",
    staff:"M14 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10M3 34c0-7 4-11 11-11s11 4 11 11M27 7a4 4 0 0 1 0 8m-2 8c5 0 8 4 8 9",
    factory:"M5 34V15l10 6v-6l10 6v-9h8v22zM10 28h4m6 0h4m4-11h2",
    simulator:"M5 6h30v21H5zM12 34h16M20 27v7M10 12h20M10 17h7M10 22h12",
    sponsor:"M7 13h26v19H7zM12 13V9h16v4M13 21h14M13 26h8",
    contracts:"M10 6h15l5 5v23H10zM25 6v6h5M15 18h10M15 23h10M15 28h6",
    budget:"M5 20h30M8 20V9h24v11M8 20v12h24V20M13 15h14M13 26h14",
    prize:"M11 6h18v8c0 7-4 11-9 11s-9-4-9-11zM11 10H5v4c0 4 3 6 7 6M29 10h6v4c0 4-3 6-7 6M20 25v7M13 34h14"
  };
  return <span className="garage-perk-icon-frame"><svg className="garage-perk-icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false"><path {...common} d={paths[effect] || paths.research}/></svg></span>;
}
function UpgradeIcon({ type }: { type: string | undefined }) {
  const common = { fill: "none", stroke: "url(#upgrade-metal-stroke)", strokeWidth: 1.65, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return <svg className="upgrade-category-icon" viewBox="0 0 48 48" aria-hidden="true" focusable="false"><defs><linearGradient id="upgrade-metal-stroke" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stopColor="#f0f3f7"/><stop offset="48%" stopColor="#8b97a7"/><stop offset="100%" stopColor="#d4dbe4"/></linearGradient></defs>
    {type === "aero" && <g {...common}><path d="M5 27 41 10 32 28 18 31 5 27Z"/><path d="m18 31-5 9 13-11"/><path d="M9 19 4 17M14 14 10 11M21 10 19 5"/></g>}
    {type === "power" && <g {...common}><path d="M13 11h22v5l3 3v16l-4 4H14l-4-4V19l3-3Z"/><path d="M18 11V7h12v4M17 21h14v9H17z"/><path d="M20 25h8M21 34v4M27 34v4M8 23H5M43 23h-3"/></g>}
    {type === "suspension" && <g {...common}><path d="M12 8h24M12 40h24M24 8v5l-7 4 14 6-14 6 14 6-7 5v0"/><path d="M10 8v6M38 8v6M10 34v6M38 34v6"/></g>}
    {type === "reliability" && <g {...common}><path d="M24 5 39 11v11c0 10-6 16-15 21C15 38 9 32 9 22V11Z"/><path d="m16 24 5 5 11-12"/></g>}
    {type !== "aero" && type !== "power" && type !== "suspension" && type !== "reliability" && <g {...common}><ellipse cx="24" cy="13" rx="13" ry="5"/><path d="M11 13v7c0 3 6 5 13 5s13-2 13-5v-7M11 20v7c0 3 6 5 13 5 2 0 4-.2 6-.6M11 27v7c0 3 6 5 13 5 2 0 4-.2 6-.6"/><path d="m31 29 4 4 7-8"/></g>}
  </svg>;
}

function PitWallGraphic() {
  return <div className="hero-art pitwall-art realism-pitwall-scene" aria-hidden="true">
    <div className="pitwall-room-light" />
    <div className="pitwall-room-ceiling"><i/><i/><i/></div>
    <div className="pitwall-glass-wall">
      <div className="pitwall-display pitwall-display-wide"><span>LIVE TELEMETRY / CAR 07</span><i/><i/><i/><b>THROTTLE</b></div>
      <div className="pitwall-display pitwall-display-small"><span>TYRE STATUS</span><b><i/><i/><i/></b><em>SOFT / 18 LAPS</em></div>
      <div className="pitwall-display pitwall-display-mid"><span>SECTOR DELTA</span><i/><i/><i/><b>−0.284</b></div>
      <div className="pitwall-display pitwall-display-weather"><span>TRACK CONDITIONS</span><b>DRY</b><i/><i/><em>28° C · 34% HUMIDITY</em></div>
      <div className="pitwall-screen-reflection" />
    </div>
    <div className="pitwall-desk">
      <div className="pitwall-console"><i/><i/><i/><b>RACE STRATEGY</b></div>
      <div className="pitwall-console"><i/><i/><i/><b>CAR PERFORMANCE</b></div>
      <div className="pitwall-console"><i/><i/><i/><b>LIVE TIMING</b></div>
      <div className="pitwall-engineer engineer-one"><i/><b/></div>
      <div className="pitwall-engineer engineer-two"><i/><b/></div>
      <div className="pitwall-engineer engineer-three"><i/><b/></div>
    </div>
    <div className="pitwall-room-depth" />
    <div className="hero-art-caption"><span>LIVE</span><i /> PIT WALL OPERATIONS <b>RACE CONTROL</b></div>
  </div>;
}

function DriverStrategy({ car, status, teamName, advice, onApplyAdvice, onPace, onTyre, onPitLap, onBattleMode, onFuelMode }: {
  car: CarState; status: RaceState["status"]; teamName: string; advice: StrategyAdvice | null; onApplyAdvice: () => void; onPace: (pace: Pace) => void; onTyre: (tyre: Tyre) => void; onPitLap: (lap: number) => void; onBattleMode: (mode: BattleMode) => void; onFuelMode: (mode: FuelMode) => void;
}) {
  const disabled = status === "finished" || status === "gameover";
  return <div className="driver-strategy">
    <div className="driver-head"><span className="driver-number">{car.id === "rp-1" ? "07" : "22"}</span><div className="driver-ident"><strong>{car.driver}</strong><span>{teamName.toUpperCase()} · {car.id === "rp-1" ? "CAR 01" : "CAR 02"}</span></div><span className={"tyre-pill tyre-" + car.tyre.toLowerCase()}>{car.tyre[0]}</span></div>
    <div className="driver-metrics">
      <div><span>TYRE LIFE</span><strong>{pct((1 - car.tyreWear) * 100)}</strong><div className="meter"><i style={{ width: pct((1 - car.tyreWear) * 100) }}/></div></div>
      <div><span>FUEL LOAD</span><strong>{pct(car.fuel)}</strong><div className="meter fuel"><i style={{ width: pct(car.fuel) }}/></div></div>
    </div>
    {advice && <div className="strategy-advice">
      <div className="strategy-advice-copy"><span>LIVE ENGINEER CALL</span><strong>{advice.headline}</strong><p>{advice.reason}</p></div>
      <button type="button" disabled={disabled} onClick={onApplyAdvice}>{advice.actionLabel} <span>↗</span></button>
    </div>}
    <div className="strategy-label">PACE MODE · SPEED VS TYRE/FUEL COST</div>
    <div className="segmented">{(["CONSERVE", "BALANCED", "PUSH"] as Pace[]).map((pace) => <button key={pace} disabled={disabled} className={car.pace === pace ? "selected" : ""} onClick={() => onPace(pace)}>{pace}</button>)}</div>
    <div className="strategy-label strategy-control-label">RACECRAFT · HOW TO FIGHT TRAFFIC</div>
    <div className="segmented">{(["STANDARD", "OVERTAKE", "DEFEND"] as BattleMode[]).map((mode) => <button key={mode} disabled={disabled} className={(car.battleMode ?? "STANDARD") === mode ? "selected" : ""} onClick={() => onBattleMode(mode)}>{mode}</button>)}</div>
    <div className="strategy-label strategy-control-label">FUEL DEPLOYMENT · PACE VS RANGE</div>
    <div className="segmented">{(["SAVE", "NORMAL", "DEPLOY"] as FuelMode[]).map((mode) => <button key={mode} disabled={disabled} className={(car.fuelMode ?? "NORMAL") === mode ? "selected" : ""} onClick={() => onFuelMode(mode)}>{mode}</button>)}</div>
    <div className="strategy-row">
      <label>Next tyre<select disabled={disabled} value={car.nextTyre} onChange={(e) => onTyre(e.target.value as Tyre)}><option value="SOFT">Soft</option><option value="MEDIUM">Medium</option><option value="HARD">Hard</option></select></label>
      <label>Pit target<select disabled={disabled} value={car.pitLap} onChange={(e) => onPitLap(Number(e.target.value))}>{Array.from({ length: 12 }, (_, i) => i + 3).map((lap) => <option key={lap} value={lap}>Lap {lap}</option>)}</select></label>
    </div>
  </div>;
}


function EngineeringCodex({ meta, onMetaChange, modules, installedUpgrades, activeEvolutionIds, standalone = false, onClose }: {
  meta: CodexMeta;
  onMetaChange: (next: CodexMeta | ((current: CodexMeta) => CodexMeta)) => void;
  modules: RaceState["upgradeModules"];
  installedUpgrades: NonNullable<RaceState["installedUpgrades"]>;
  activeEvolutionIds: string[];
  standalone?: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"registry" | "synergy" | "dossiers">("registry");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("ALL");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [researchMode, setResearchMode] = useState(standalone);
  const [plannerIds, setPlannerIds] = useState<string[]>([]);
  const discovered = new Set(meta.discoveredUpgradeIds);
  const installedIds = new Set(installedUpgrades.map((item) => item.id));
  const plannedInstalledIds = new Set([...installedIds, ...plannerIds]);
  const filtered = UPGRADE_CARD_POOL.filter((card) => {
    const visible = researchMode || discovered.has(card.id) || installedIds.has(card.id);
    const matchesQuery = (card.title + " " + card.subtitle + " " + card.description + " " + card.effect).toLowerCase().includes(query.toLowerCase());
    return visible && matchesQuery && (category === "ALL" || card.subtitle === category) && (!favoritesOnly || meta.favoriteUpgradeIds.includes(card.id));
  });
  const categories = ["ALL", ...Array.from(new Set(UPGRADE_CARD_POOL.map((card) => card.subtitle)))];
  const discoveredCount = UPGRADE_CARD_POOL.filter((card) => discovered.has(card.id)).length;
  const masteredCount = UPGRADE_CARD_POOL.filter((card) => (meta.usageCounts[card.id] ?? 0) >= 3).length;
  const planned = UPGRADE_CARD_POOL.filter((card) => plannerIds.includes(card.id));
  const plannedModules = {
    aero: modules.aero + planned.reduce((sum, card) => sum + (card.upgradeType === "aero" ? card.amount ?? 0 : 0), 0),
    power: modules.power + planned.reduce((sum, card) => sum + (card.upgradeType === "power" ? card.amount ?? 0 : 0), 0),
    suspension: modules.suspension + planned.reduce((sum, card) => sum + (card.upgradeType === "suspension" ? card.amount ?? 0 : 0), 0),
    reliability: modules.reliability + planned.reduce((sum, card) => sum + (card.upgradeType === "reliability" ? card.amount ?? 0 : 0), 0),
  };
  const recipes = [
    { id: "aero-power", title: "Aero + Power Integration", description: "Coordinate aerodynamic load with power deployment for a stronger baseline pace.", requirements: "Aerodynamics 2+ · Power unit 2+", active: plannedModules.aero >= 2 && plannedModules.power >= 2 },
    { id: "endurance-platform", title: "Endurance Platform", description: "A stable mechanical platform and reliable components reduce tyre wear across long stints.", requirements: "Suspension 2+ · Reliability 2+", active: plannedModules.suspension >= 2 && plannedModules.reliability >= 2 },
  ];
  const evolutionRecipes = UPGRADE_EVOLUTIONS.map((evolution) => ({
    ...evolution,
    active: activeEvolutionIds.includes(evolution.id),
    ready: evolution.requiredUpgradeIds.every((id) => plannedInstalledIds.has(id)),
    requiredTitles: evolution.requiredUpgradeIds.map((id) => UPGRADE_CARD_POOL.find((card) => card.id === id)?.title ?? id),
  }));
  const closeLabel = standalone ? "RETURN TO GAME" : "CLOSE CODEX";
  return <div className={standalone ? "engineering-codex-page" : "engineering-codex-overlay"} role={standalone ? undefined : "dialog"} aria-modal={standalone ? undefined : true} aria-labelledby="engineering-codex-title">
    <section className="engineering-codex-shell">
      <header className="engineering-codex-header">
        <div><span className="section-kicker">REDLINE ASCENSION · ENGINEERING INTELLIGENCE</span><h1 id="engineering-codex-title">Engineering <em>Codex.</em></h1><p>A permanent record of discovered technology, proven synergies, and the builds that carried your team.</p></div>
        <button className="save-transfer-close" onClick={onClose} aria-label={closeLabel}>×</button>
      </header>
      <div className="engineering-codex-stats">
        <div><span>TECHNOLOGIES DISCOVERED</span><strong>{discoveredCount} / {UPGRADE_CARD_POOL.length}</strong></div>
        <div><span>TECH MASTERED · LV.3</span><strong>{masteredCount} / {UPGRADE_CARD_POOL.length}</strong></div>
        <div><span>RUN DOSSIERS</span><strong>{meta.dossiers.length}</strong></div>
      </div>
      <div className="engineering-codex-stats engineering-codex-stats-secondary">
        <div><span>CONFIRMED SYNERGIES</span><strong>{recipes.filter((recipe) => recipe.active).length}</strong></div>
        <div><span>FAVOURITE TECHNOLOGIES</span><strong>{meta.favoriteUpgradeIds.length}</strong></div>
      </div>
      <nav className="engineering-codex-tabs" aria-label="Engineering Codex sections">
        <button className={tab === "registry" ? "active" : ""} onClick={() => setTab("registry")}>01 · TECHNOLOGY REGISTRY</button>
        <button className={tab === "synergy" ? "active" : ""} onClick={() => setTab("synergy")}>02 · SYNERGY LAB</button>
        <button className={tab === "dossiers" ? "active" : ""} onClick={() => setTab("dossiers")}>03 · RUN DOSSIERS</button>
      </nav>
      {tab === "registry" && <section className="engineering-codex-section">
        <div className="engineering-codex-tools"><input aria-label="Search technologies" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search technologies, effects, categories..." /><select aria-label="Filter technology category" value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="codex-mode-toggle" onClick={() => setResearchMode((value) => !value)}>{researchMode ? "DISCOVERY MODE" : "RESEARCH MODE"}</button><button className={"codex-mode-toggle" + (favoritesOnly ? " active" : "")} onClick={() => setFavoritesOnly((value) => !value)}>{favoritesOnly ? "ALL TECHNOLOGIES" : "★ FAVOURITES"}</button></div>
        {!researchMode && <p className="engineering-codex-note">Discovery mode hides technologies you have not installed yet. Switch to Research Mode to inspect the complete catalogue and plan future builds.</p>}
        <div className="engineering-codex-category-progress">{categories.slice(1).map((name) => { const total = UPGRADE_CARD_POOL.filter((card) => card.subtitle === name).length; const found = UPGRADE_CARD_POOL.filter((card) => card.subtitle === name && discovered.has(card.id)).length; return <span key={name}>{name}<b>{found}/{total}</b></span>; })}</div>
        <div className="engineering-codex-catalogue">{filtered.map((card) => {
          const isDiscovered = discovered.has(card.id) || installedIds.has(card.id);
          const uses = meta.usageCounts[card.id] ?? 0;
          const isFavourite = meta.favoriteUpgradeIds.includes(card.id);
          return <article className={"engineering-codex-card rarity-" + card.rarity.toLowerCase()} key={card.id}>
            <div className="engineering-codex-card-top"><span>{card.subtitle}</span><b>{isDiscovered ? (installedIds.has(card.id) ? "INSTALLED THIS RUN" : "DISCOVERED") : "UNDISCOVERED"}</b></div>
            <h3>{isDiscovered || researchMode ? card.title : "Unidentified technology"}{isDiscovered || researchMode ? "" : " · ?????"}</h3>
            <p>{isDiscovered || researchMode ? card.description : "Complete a development pick with this technology to record its specification in your Codex."}</p>
            <div className="engineering-codex-card-bottom"><span>{isDiscovered || researchMode ? card.effect : "SPECIFICATION SEALED"}</span><b>{card.rarity}</b></div>
            <div className="engineering-codex-mastery"><span>MASTERY {uses >= 3 ? "LV.3 · EXPERT" : uses === 2 ? "LV.2 · TESTED" : uses === 1 ? "LV.1 · PROVEN" : "UNTESTED"}</span><span>{uses} completed run{uses === 1 ? "" : "s"}</span></div>
            <button className={"codex-favourite-button" + (isFavourite ? " active" : "")} onClick={() => onMetaChange((current) => ({ ...current, favoriteUpgradeIds: current.favoriteUpgradeIds.includes(card.id) ? current.favoriteUpgradeIds.filter((id) => id !== card.id) : [...current.favoriteUpgradeIds, card.id] }))}>{isFavourite ? "★ FAVOURITED" : "☆ ADD FAVOURITE"}</button>
            {researchMode && <button className="codex-plan-button" onClick={() => setPlannerIds((current) => current.includes(card.id) ? current.filter((id) => id !== card.id) : [...current, card.id])}>{plannerIds.includes(card.id) ? "REMOVE FROM PLAN −" : "ADD TO BUILD PLAN +"}</button>}
          </article>;
        })}{filtered.length === 0 && <div className="engineering-codex-empty">No matching technologies. Try another search or category.</div>}</div>
      </section>}
      {tab === "synergy" && <section className="engineering-codex-section">
        <div className="engineering-codex-section-heading"><div><span className="section-kicker">LIVE BUILD ANALYSIS</span><h2>Synergy Lab</h2></div><span>{planned.length ? "PLANNER + CURRENT SPEC" : "CURRENT RUN SPEC"}</span></div>
        <p className="engineering-codex-note">Module synergies are always-on thresholds. Technology evolutions are specific recipes: install every required technology in a run to activate a one-time bonus. The planner previews combinations without spending cash or changing your save.</p>
        <div className="engineering-codex-recipes">{recipes.map((recipe) => <article className={"engineering-codex-recipe" + (recipe.active ? " recipe-active" : "")} key={recipe.id}><div className="engineering-codex-recipe-icon">{recipe.active ? "✓" : "⌁"}</div><div><span>{recipe.active ? "REQUIREMENTS MET" : "REQUIREMENTS NOT MET"}</span><h3>{recipe.title}</h3><p>{recipe.description}</p><small>{recipe.requirements}</small></div></article>)}</div>
        <div className="engineering-codex-section-heading evolution-heading"><div><span className="section-kicker">COMBINATION RECIPES</span><h2>Technology Evolutions</h2></div><span>{activeEvolutionIds.length} ACTIVATED</span></div>
        <div className="engineering-codex-recipes">{evolutionRecipes.map((evolution) => <article className={"engineering-codex-recipe evolution-recipe" + (evolution.active ? " recipe-active" : "") + (!evolution.active && evolution.ready ? " recipe-ready" : "")} key={evolution.id}><div className="engineering-codex-recipe-icon">{evolution.active ? "✓" : evolution.ready ? "↗" : "⌁"}</div><div><span>{evolution.active ? "EVOLUTION ACTIVATED" : evolution.ready ? "RECIPE READY · PLANNER" : "MISSING TECHNOLOGIES"}</span><h3>{evolution.title}</h3><p>{evolution.description}</p><small>REQUIRES: {evolution.requiredTitles.join(" + ")}</small><strong className="evolution-reward">{evolution.rewardText}</strong></div></article>)}</div>
        <div className="engineering-codex-planner"><div className="engineering-codex-section-heading"><div><span className="section-kicker">EXPERIMENTAL WORKSPACE</span><h2>Build Planner</h2></div><button className="codex-mode-toggle" onClick={() => setPlannerIds([])}>CLEAR PLAN</button></div><div className="engineering-codex-planner-modules">{Object.entries(plannedModules).map(([key, value]) => <div key={key}><span>{key.toUpperCase()}</span><strong>{value}</strong></div>)}</div><div className="engineering-codex-planner-list">{planned.length ? planned.map((card) => <button key={card.id} onClick={() => setPlannerIds((current) => current.filter((id) => id !== card.id))}>{card.title}<span>REMOVE ×</span></button>) : <p>No planned upgrades yet. Open Technology Registry, switch to Research Mode, and add technologies to test a build.</p>}</div><button className="primary-button" onClick={() => setTab("registry")}>BROWSE TECHNOLOGIES ↗</button></div>
      </section>}
      {tab === "dossiers" && <section className="engineering-codex-section">
        <div className="engineering-codex-section-heading"><div><span className="section-kicker">CAREER MEMORY</span><h2>Run Dossiers</h2></div><span>LOCAL ARCHIVE · {meta.dossiers.length} RECORDS</span></div>
        <p className="engineering-codex-note">Completed championships and ended runs are recorded on this device. Use Save / Transfer to carry Codex records with your career to another browser or device.</p>
        <div className="engineering-codex-dossiers">{meta.dossiers.length ? meta.dossiers.map((dossier) => <article key={dossier.id}><div><span>{dossier.mode.toUpperCase()} · ROUND {dossier.round}</span><h3>{dossier.team}</h3><p>{dossier.position > 0 ? "Final team position P" + dossier.position : "Run ended before final classification"} · {dossier.points} championship points</p><small>{dossier.endedAt} · {dossier.upgrades.length} development picks · {money(dossier.cash)} final cash</small></div><div className="engineering-codex-dossier-upgrades">{dossier.upgrades.map((id) => <span key={id}>{UPGRADE_CARD_POOL.find((card) => card.id === id)?.title ?? id}</span>)}</div></article>) : <div className="engineering-codex-empty">No completed run has been archived yet. Finish a championship or reach a run-ending result to create your first dossier.</div>}</div>
      </section>}
      <footer className="engineering-codex-footer"><span>ENGINEERING CODEX · LOCAL FIRST · SAVE COMPATIBLE</span><div><button className="codex-mode-toggle" onClick={() => { const url = window.location.origin + window.location.pathname + "?view=codex"; window.open(url, "_blank", "noopener,noreferrer"); }}>OPEN EXTERNAL CODEX ↗</button><button className="secondary-button" onClick={onClose}>{closeLabel}</button></div></footer>
    </section>
  </div>;
}

export default function App() {
  const [race, setRace] = useState<RaceState>(() => loadRace());
  const [hasSavedCareer] = useState(() => { try { return Boolean(localStorage.getItem(SAVE_KEY)); } catch { return false; } });
  const [showStartScreen, setShowStartScreen] = useState(true);
  const [onboardingStep, setOnboardingStep] = useState<"home" | "mode" | "team" | "drivers">("home");
  const [mobileResearchExpanded, setMobileResearchExpanded] = useState(false);
  const [selectedMode, setSelectedMode] = useState<GameMode>(() => { try { const raw = localStorage.getItem(SAVE_KEY); const saved = raw ? JSON.parse(raw) as RaceState : null; return saved?.mode ?? "championship"; } catch { return "championship"; } });
  const [showInitialDraft, setShowInitialDraft] = useState(false);
  const [showIntermission, setShowIntermission] = useState(() => { try { return loadRace().status === "finished"; } catch { return false; } });
  const [intermissionUpgradeInstalled, setIntermissionUpgradeInstalled] = useState(false);
  const [mobileIntermissionStep, setMobileIntermissionStep] = useState<"scenario" | "upgrade">("scenario");
  useEffect(() => {
    if (!showStartScreen) return;
    const previousBodyOverflow = document.body.style.overflow;
    const previousRootOverflow = document.documentElement.style.overflow;
    const previousOverscroll = document.documentElement.style.overscrollBehavior;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    document.documentElement.style.overscrollBehavior = "none";
    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousRootOverflow;
      document.documentElement.style.overscrollBehavior = previousOverscroll;
    };
  }, [showStartScreen]);
  const [teamNameDraft, setTeamNameDraft] = useState(() => { try { const raw = localStorage.getItem(SAVE_KEY); const saved = raw ? JSON.parse(raw) as RaceState : null; return saved?.playerTeamName ?? saved?.cars?.find((car) => car.playerCar)?.team ?? "Redline GP"; } catch { return "Redline GP"; } });
  const [principalNameDraft, setPrincipalNameDraft] = useState(() => { try { const raw = localStorage.getItem(SAVE_KEY); const saved = raw ? JSON.parse(raw) as RaceState : null; return saved?.playerPrincipalName ?? "Team Principal"; } catch { return "Team Principal"; } });
  const [teamPrimaryColor, setTeamPrimaryColor] = useState(() => { try { const raw = localStorage.getItem(SAVE_KEY); const saved = raw ? JSON.parse(raw) as RaceState : null; return saved?.playerTeamColor ?? saved?.cars?.find((car) => car.playerCar)?.teamColor ?? "#f04438"; } catch { return "#f04438"; } });
  const [teamSecondaryColor, setTeamSecondaryColor] = useState(() => { try { const raw = localStorage.getItem(SAVE_KEY); const saved = raw ? JSON.parse(raw) as RaceState : null; return saved?.playerTeamSecondaryColor ?? "#f2f2f2"; } catch { return "#f2f2f2"; } });

  const [selectedDriverOne, setSelectedDriverOne] = useState("Luca Moretti");
  const [selectedDriverTwo, setSelectedDriverTwo] = useState("Emil Novak");
  const [bestRun, setBestRun] = useState<BestRun | null>(() => { try { const raw = localStorage.getItem(BEST_RUN_KEY); return raw ? JSON.parse(raw) as BestRun : null; } catch { return null; } });
  const [garageMeta, setGarageMeta] = useState<GarageMeta>(() => loadGarageMeta());
  const [codexMeta, setCodexMeta] = useState<CodexMeta>(() => loadCodexMeta());
  const [showEngineeringCodex, setShowEngineeringCodex] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [mobileTab, setMobileTab] = useState<"race" | "strategy" | "standings" | "garage" | "more">("race");
  const [savedAt, setSavedAt] = useState("LOCAL SAVE READY");
  const [showResults, setShowResults] = useState(false);
  const [showSaveTransfer, setShowSaveTransfer] = useState(false);
  const [saveCode, setSaveCode] = useState("");
  const [importCode, setImportCode] = useState("");
  const [saveTransferMessage, setSaveTransferMessage] = useState("");
  const [selectedDraftId, setSelectedDraftId] = useState("");
  const [draftRerolls, setDraftRerolls] = useState(0);
  const [replacementDriverOne, setReplacementDriverOne] = useState("Theo Laurent");
  const [replacementDriverTwo, setReplacementDriverTwo] = useState("Rafael Costa");
  const playerTeamName = race.playerTeamName ?? race.cars.find((car) => car.playerCar)?.team ?? "Redline GP";
  const redlinePoints = race.teamPoints?.[playerTeamName] ?? 0;
  const teamRankings = Object.entries(race.teamPoints ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const redlineRank = teamRankings.findIndex(([team]) => team === playerTeamName) + 1;
  useEffect(() => {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(race)); setSavedAt("SAVED LOCALLY · " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })); }
    catch { setSavedAt("LOCAL STORAGE UNAVAILABLE"); }
  }, [race]);
  useEffect(() => {
    try { localStorage.setItem(GARAGE_META_KEY, JSON.stringify(garageMeta)); } catch { /* Optional persistent storage. */ }
  }, [garageMeta]);
  useEffect(() => {
    try { localStorage.setItem(CODEX_META_KEY, JSON.stringify(codexMeta)); } catch { /* Codex remains usable for this session if storage is full. */ }
  }, [codexMeta]);
  const installedSignature = (race.installedUpgrades ?? []).map((item) => item.id).join("|");
  useEffect(() => {
    const discoveredNow = (race.installedUpgrades ?? []).map((item) => item.id);
    if (!discoveredNow.length) return;
    setCodexMeta((current) => {
      const discoveredUpgradeIds = [...new Set([...current.discoveredUpgradeIds, ...discoveredNow])];
      if (discoveredUpgradeIds.length === current.discoveredUpgradeIds.length) return current;
      return { ...current, discoveredUpgradeIds };
    });
    setGarageMeta((current) => {
      const rewarded = current.rewardedDiscoveries ?? [];
      const rewardable = discoveredNow.filter((id) => !rewarded.includes(id));
      if (!rewardable.length) return current;
      return { ...current, research: current.research + rewardable.length, rewardedDiscoveries: [...new Set([...rewarded, ...rewardable])].slice(-200) };
    });
  }, [installedSignature]);
  useEffect(() => {
    if (race.status !== "gameover") return;
    const id = String(race.seed) + ":" + String(race.weekendNumber) + ":" + (race.endReason ?? "complete");
    const playerTeam = race.playerTeamName ?? race.cars.find((car) => car.playerCar)?.team ?? "Redline GP";
    const position = Object.entries(race.teamPoints ?? {}).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).findIndex(([team]) => team === playerTeam) + 1;
    const upgrades = [...new Set((race.installedUpgrades ?? []).map((item) => item.id))];
    const dossier: CodexDossier = { id, team: playerTeam, mode: race.mode ?? "championship", round: race.weekendNumber, position, points: race.teamPoints?.[playerTeam] ?? 0, cash: race.cash, upgrades, endedAt: new Date().toLocaleDateString() };
    setCodexMeta((current) => {
      if (current.dossiers.some((item) => item.id === id)) return current;
      const usageCounts = { ...current.usageCounts };
      upgrades.forEach((upgradeId) => { usageCounts[upgradeId] = (usageCounts[upgradeId] ?? 0) + 1; });
      return { ...current, usageCounts, dossiers: [dossier, ...current.dossiers].slice(0, 50) };
    });
  }, [race.status, race.seed, race.weekendNumber, race.endReason]);
  useEffect(() => {
    const masteredIds = Object.entries(codexMeta.usageCounts).filter(([, count]) => count >= 3).map(([id]) => id);
    if (!masteredIds.length) return;
    setGarageMeta((current) => {
      const rewarded = current.masteryRewards ?? [];
      const rewardable = masteredIds.filter((id) => !rewarded.includes(id));
      if (!rewardable.length) return current;
      return { ...current, research: current.research + rewardable.length * 2, masteryRewards: [...new Set([...rewarded, ...rewardable])].slice(-200) };
    });
  }, [codexMeta.usageCounts]);
  useEffect(() => {
    if (race.status === "finished" && !showInitialDraft) {
      setShowIntermission(true);
      if (((race.mode ?? "championship") === "endless" || race.weekendNumber < CAMPAIGN_LENGTH) && !race.pendingPaddockEvent && (race.paddockEventRound ?? 0) !== race.weekendNumber) {
        setRace((current) => current.status !== "finished" || current.pendingPaddockEvent || (current.paddockEventRound ?? 0) === current.weekendNumber ? current : { ...current, pendingPaddockEvent: createPaddockEvent(current), paddockEventRound: current.weekendNumber });
      }
    }
    if (race.status !== "finished") { setShowIntermission(false); setIntermissionUpgradeInstalled(false); }
  }, [race.status, showInitialDraft, race.weekendNumber, race.pendingPaddockEvent, race.paddockEventRound]);
  useEffect(() => {
    if (race.status !== "finished" && race.status !== "gameover") return;
    const runId = race.seed + ":" + race.weekendNumber;
    const playerPosition = standings(race).findIndex((car) => car.playerCar) + 1;
    const earned = 1 + (playerPosition > 0 && playerPosition <= 3 ? 1 : 0) + Math.floor(garageLevel(garageMeta, "research-efficiency") / 2);
    const newlyRewarded = (race.latestChampionshipAchievements ?? []).filter((achievement) => !(garageMeta.rewardedAchievements ?? []).includes(race.seed + ":" + achievement.id));
    setGarageMeta((current) => {
      const rewardable = newlyRewarded.filter((achievement) => !(current.rewardedAchievements ?? []).includes(race.seed + ":" + achievement.id));
      const alreadyRewardedRun = current.rewardedRuns.includes(runId);
      if (alreadyRewardedRun && rewardable.length === 0) return current;
      return {
        ...current,
        research: current.research + (alreadyRewardedRun ? 0 : earned) + rewardable.reduce((total, achievement) => total + achievement.researchReward, 0),
        rewardedRuns: alreadyRewardedRun ? current.rewardedRuns : [...current.rewardedRuns, runId].slice(-500),
        rewardedAchievements: [...new Set([...(current.rewardedAchievements ?? []), ...rewardable.map((achievement) => race.seed + ":" + achievement.id)])].slice(-100),
      };
    });
  }, [race.status, race.seed, race.weekendNumber, race.cars, race.latestChampionshipAchievements, garageMeta.rewardedRuns, garageMeta.rewardedAchievements, garageMeta.levels]);
  useEffect(() => {
    if (race.status !== "running") return;
    const id = window.setInterval(() => setRace((current) => stepRace(current)), Math.max(120, 1000 / speed));
    return () => window.clearInterval(id);
  }, [race.status, speed]);
  useEffect(() => {
    if (race.status !== "gameover") return;
    const result: BestRun = { points: race.teamPoints?.[playerTeamName] ?? 0, position: redlineRank || 11, seed: race.seed };
    if (!bestRun || result.points > bestRun.points || (result.points === bestRun.points && result.position < bestRun.position)) {
      setBestRun(result);
      try { localStorage.setItem(BEST_RUN_KEY, JSON.stringify(result)); } catch { /* Best-run records are optional if storage is full. */ }
    }
  }, [race.status, race.teamPoints, race.seed, redlineRank, bestRun]);
  const order = useMemo(() => standings(race), [race]);
  const rivalIntel = useMemo(() => {
    const seen = new Map<string, { team: string; style: CarState["rivalStyle"]; color: string; wins: number; streak: number; position: number; history: number[] }>();
    order.forEach((car, index) => {
      if (!car.playerCar && !seen.has(car.team)) seen.set(car.team, { team: car.team, style: car.rivalStyle, color: car.teamColor, wins: race.rivalryWins?.[car.team] ?? 0, streak: race.rivalryBattles?.[car.team] ?? 0, position: index + 1, history: race.rivalryHistory?.[car.team] ?? [] });
    });
    return [...seen.values()].sort((a, b) => a.position - b.position);
  }, [race, order]);
  const finishedCount = race.cars.filter((car) => car.finished).length;
  const modules = race.upgradeModules ?? { aero: 0, power: 0, suspension: 0, reliability: 0 };
  const isInitialDraft = showInitialDraft;
  const discoveredTechnologyCount = codexMeta.discoveredUpgradeIds.length;
  const masteredTechnologyCount = UPGRADE_CARD_POOL.filter((card) => (codexMeta.usageCounts[card.id] ?? 0) >= 3).length;
  const draftCards = useMemo(() => race.status === "finished" || isInitialDraft ? draftUpgradeCards(race, { discoveredCount: discoveredTechnologyCount, rerollCount: draftRerolls }) : [], [race.status, race.seed, race.weekendNumber, isInitialDraft, discoveredTechnologyCount, draftRerolls]);
  const draftRerollCost = 50000 * (draftRerolls + 1);
  const rerollDraft = () => {
    if (race.cash < draftRerollCost) return;
    setRace((current) => current.cash < draftRerollCost ? current : { ...current, cash: current.cash - draftRerollCost });
    setDraftRerolls((current) => current + 1);
    setSelectedDraftId("");
    setIntermissionUpgradeInstalled(false);
  };
  const selectedDraft = draftCards.find((card) => card.id === selectedDraftId) ?? draftCards[0];
  const setStrategy = (car: CarState, patch: Partial<Pick<CarState, "pace" | "nextTyre" | "pitLap" | "battleMode" | "fuelMode">>) => setRace((current) => setDriverStrategy(current, car.id, patch));
  const createMetaCareer = (seed: number, name: string, principal: string, driverOne: string, driverTwo: string, primary = teamPrimaryColor, secondary = teamSecondaryColor, mode: GameMode = selectedMode) => {
    const fresh = createRace(seed, 0, 2500000, 1, name, driverOne, driverTwo, principal, mode);
    fresh.teamMorale = 62;
    fresh.teamReputation = 45;
    fresh.driverContracts = [driverOne, driverTwo].map((driverName, index) => ({ id: "driver-" + (index + 1), driverName, salaryPerRace: driverSalary(driverName), expiresAtRound: 10, renewed: false, loyalty: 60 }));
    fresh.paddockEventRound = 0;
    fresh.pendingPaddockEvent = null;
    fresh.resolvedPaddockEvents = [];
    fresh.playerTeamColor = primary;
    fresh.playerTeamSecondaryColor = secondary;
    fresh.cars = fresh.cars.map((car) => car.playerCar ? { ...car, teamColor: primary } : car);
    return applyGarageBonuses(fresh, garageMeta, true);
  };
  const startNextRace = (currentRace: RaceState = race, upgradeInstalled = intermissionUpgradeInstalled) => {
    if (!upgradeInstalled || currentRace.status !== "finished" || currentRace.pendingPaddockEvent) return;
    const playerCars = currentRace.cars.filter((car) => car.playerCar);
    const contracts = currentRace.driverContracts ?? [];
    if (contracts.some((contract) => contract.expiresAtRound <= currentRace.weekendNumber)) return;
    const drivers = contracts.length >= 2 ? contracts.map((contract) => contract.driverName) : [playerCars[0]?.driver ?? "Luca Moretti", playerCars[1]?.driver ?? "Emil Novak"];
    const payroll = contracts.reduce((sum, contract) => sum + contract.salaryPerRace, 0);
    const operatingCost = Math.round((215000 + payroll + 65000) * Math.max(0.65, 1 - garageLevel(garageMeta, "repair-efficiency") * 0.015 - garageLevel(garageMeta, "factory-workflow") * 0.01 - garageLevel(garageMeta, "budget-management") * 0.015));
    const sponsorIncome = Math.max(0, 65000 + ((currentRace.teamReputation ?? 45) - 45) * 1800 + garageLevel(garageMeta, "sponsor-network") * 20000);
    if (currentRace.cash + sponsorIncome < operatingCost) {
      setRace((current) => ({ ...current, status: "gameover", endReason: "bankruptcy", pendingPaddockEvent: null, lastOperatingCost: operatingCost, lastSponsorIncome: sponsorIncome }));
      setShowIntermission(false);
      return;
    }
    const nextCash = currentRace.cash + sponsorIncome - operatingCost;
    const next = createRace((currentRace.seed + 2654435761 + currentRace.weekendNumber * 97) >>> 0, currentRace.upgradeLevel, nextCash + garageLevel(garageMeta, "prize-money-bonus") * 25000, currentRace.weekendNumber + 1, playerTeamName, drivers[0], drivers[1], currentRace.playerPrincipalName ?? "Team Principal", currentRace.mode ?? "championship");
    next.rivalryWins = { ...(currentRace.rivalryWins ?? {}) };
    next.rivalryBattles = { ...(currentRace.rivalryBattles ?? {}) };
    next.rivalryHistory = Object.fromEntries(Object.entries(currentRace.rivalryHistory ?? {}).map(([team, history]) => [team, [...history]]));
    next.rivalryFeudTeam = currentRace.rivalryFeudTeam;
    if ((currentRace.mode ?? "championship") === "championship") {
      const rivalTeams = [...new Set(currentRace.cars.filter((car) => !car.playerCar).map((car) => car.team))];
      const adaptiveRival = currentRace.rivalryFeudTeam ?? rivalTeams
        .map((team) => ({ team, streak: currentRace.rivalryBattles?.[team] ?? 0 }))
        .filter((item) => item.streak >= 2)
        .sort((a, b) => b.streak - a.streak)[0]?.team;
      if (adaptiveRival) {
        const playerCars = currentRace.cars.filter((car) => car.playerCar);
        const averages = {
          pace: playerCars.reduce((sum, car) => sum + car.driverPace, 0) / Math.max(1, playerCars.length),
          racecraft: playerCars.reduce((sum, car) => sum + car.driverRacecraft, 0) / Math.max(1, playerCars.length),
          "tyre-management": playerCars.reduce((sum, car) => sum + car.driverTyreManagement, 0) / Math.max(1, playerCars.length),
          consistency: playerCars.reduce((sum, car) => sum + car.driverConsistency, 0) / Math.max(1, playerCars.length),
        };
        next.nemesisTeam = adaptiveRival;
        next.nemesisTarget = (Object.entries(averages).sort((a, b) => a[1] - b[1])[0]?.[0] ?? "pace") as "pace" | "racecraft" | "tyre-management" | "consistency";
        next.nemesisShowdown = next.weekendNumber % 5 === 0;
        next.championshipObjective = { id: "beat-nemesis", title: "Beat the Nemesis", detail: "Finish ahead of at least one car from " + adaptiveRival + " to claim a special board reward.", targetTeam: adaptiveRival, reward: 160000 };
      } else {
        next.nemesisTeam = undefined;
        next.nemesisTarget = undefined;
        next.nemesisShowdown = false;
      }
    } else {
      next.nemesisTeam = undefined;
      next.nemesisTarget = undefined;
      next.nemesisShowdown = false;
    }
    next.rivalryFeudBonus = currentRace.rivalryFeudBonus;
    next.weekendEffect = currentRace.nextWeekendEffect;
    next.weekendEffectTitle = currentRace.nextWeekendEffectTitle;
    next.lastOperatingCost = operatingCost;
    next.lastSponsorIncome = sponsorIncome;
    next.teamMorale = currentRace.teamMorale ?? 62;
    next.teamReputation = currentRace.teamReputation ?? 45;
    next.driverContracts = contracts.map((contract) => ({ ...contract }));
    next.resolvedPaddockEvents = [...(currentRace.resolvedPaddockEvents ?? [])];
    next.paddockEventRound = currentRace.weekendNumber;
    next.pendingPaddockEvent = null;
    const moraleModifier = ((next.teamMorale ?? 62) - 60) * 0.055;
    next.cars = next.cars.map((car) => car.playerCar ? { ...car, driverPace: Math.max(55, Math.min(99, car.driverPace + moraleModifier)), driverConsistency: Math.max(55, Math.min(99, car.driverConsistency + moraleModifier * 0.7)) } : car);
    next.playerTeamColor = currentRace.playerTeamColor ?? playerCars[0]?.teamColor ?? teamPrimaryColor;
    next.playerTeamSecondaryColor = currentRace.playerTeamSecondaryColor ?? teamSecondaryColor;
    next.cars = next.cars.map((car) => car.playerCar ? { ...car, teamColor: next.playerTeamColor! } : car);
    next.upgradeModules = { ...(currentRace.upgradeModules ?? { aero: 0, power: 0, suspension: 0, reliability: 0 }) };
    next.installedUpgrades = [...(currentRace.installedUpgrades ?? [])];
    next.teamPoints = { ...(currentRace.teamPoints ?? {}) };
    const nextWithGarage = applyGarageBonuses(next, garageMeta, false);
    setRace(nextWithGarage);
    setShowIntermission(false);
    setIntermissionUpgradeInstalled(false);
    setShowResults(false);
    setSelectedDraftId("");
  };
  const resolvePaddockChoice = (choiceId: string) => {
    setRace((current) => {
      const event = current.pendingPaddockEvent;
      const choice = event?.choices.find((item) => item.id === choiceId);
      if (!event || !choice || current.cash + choice.cashDelta < 0) return current;
      return { ...current, cash: current.cash + choice.cashDelta, teamMorale: Math.max(0, Math.min(100, (current.teamMorale ?? 62) + choice.moraleDelta)), teamReputation: Math.max(0, Math.min(100, (current.teamReputation ?? 45) + choice.reputationDelta)), pendingPaddockEvent: null, nextWeekendEffect: choice.weekendEffect, nextWeekendEffectTitle: choice.weekendEffect ? event.title : undefined, resolvedPaddockEvents: [...(current.resolvedPaddockEvents ?? []), event.id].slice(-20), events: [{ id: current.eventSequence + 1, lap: current.totalLaps, message: "PADDOCK: " + event.title + " — " + choice.label + ".", kind: "info" as const }, ...current.events].slice(0, 14), eventSequence: current.eventSequence + 1 };
    });
  };
  const renewDriverContract = (contractId: string) => {
    setRace((current) => {
      const contract = current.driverContracts?.find((item) => item.id === contractId);
      const renewalFee = 125000;
      if (!contract || current.cash < renewalFee) return current;
      return { ...current, cash: current.cash - renewalFee, driverContracts: current.driverContracts!.map((item) => item.id === contractId ? { ...item, salaryPerRace: Math.round(item.salaryPerRace * 1.12 / 5000) * 5000, expiresAtRound: (current.mode ?? "championship") === "endless" ? current.weekendNumber + 10 : CAMPAIGN_LENGTH, renewed: true, loyalty: Math.min(100, item.loyalty + 8) } : item), teamMorale: Math.min(100, (current.teamMorale ?? 62) + 3) };
    });
  };
  const unlockMarketDriver = (driverId: string) => {
    const driver = DRIVER_MARKET.find((item) => item.id === driverId);
    if (!driver?.unlockCost) return;
    setGarageMeta((current) => {
      const unlocked = current.unlockedDriverIds ?? [];
      if (unlocked.includes(driver.id) || current.research < driver.unlockCost!) return current;
      return { ...current, research: current.research - driver.unlockCost!, unlockedDriverIds: [...unlocked, driver.id] };
    });
  };
  const replaceDriverContract = (contractId: string, replacementName: string) => {
    setRace((current) => {
      const contract = current.driverContracts?.find((item) => item.id === contractId);
      const other = current.driverContracts?.find((item) => item.id !== contractId)?.driverName;
      const profile = DRIVER_MARKET.find((driver) => driver.name === replacementName);
      const driverUnlocked = Boolean(profile && (!profile.unlockCost || (garageMeta.unlockedDriverIds ?? []).includes(profile.id)));
      if (!contract || !profile || !driverUnlocked || replacementName === other) return current;
      const severance = Math.min(current.cash, contract.salaryPerRace * 2);
      return { ...current, cash: current.cash - severance, driverContracts: current.driverContracts!.map((item) => item.id === contractId ? { ...item, driverName: replacementName, salaryPerRace: driverSalary(replacementName), expiresAtRound: (current.mode ?? "championship") === "endless" ? current.weekendNumber + 10 : CAMPAIGN_LENGTH, renewed: true, loyalty: 55 } : item), teamMorale: Math.max(0, (current.teamMorale ?? 62) - 3) };
    });
  };
  const buyGaragePerk = (id: string) => {
    // Permanent research can only be spent from the start screen between runs.
    if (!showStartScreen) return;
    const perk = GARAGE_PERKS.find((item) => item.id === id);
    if (!perk) return;
    const currentLevel = garageLevel(garageMeta, id);
    if (currentLevel >= 5) return;
    const cost = perk.cost * (currentLevel + 1);
    if (garageMeta.research < cost) return;
    setGarageMeta((current) => {
      const level = garageLevel(current, id);
      const nextCost = perk.cost * (level + 1);
      if (level >= 5 || current.research < nextCost) return current;
      const levels = { ...current.levels, [id]: level + 1 };
      return { ...current, research: current.research - nextCost, levels, unlocks: current.unlocks.includes(id) ? current.unlocks : [...current.unlocks, id] };
    });
  };
  const resetCareer = () => { if (window.confirm("Start a new career? Your current local career will be replaced.")) { setRace(createMetaCareer(Date.now() >>> 0, playerTeamName, principalNameDraft, selectedDriverOne, selectedDriverTwo, teamPrimaryColor, teamSecondaryColor, selectedMode)); setShowResults(false); setSelectedDraftId(""); setDraftRerolls(0); setShowInitialDraft(true); } };
  const startCustomCareer = () => { const name = teamNameDraft.trim().slice(0, 24); const principal = principalNameDraft.trim().slice(0, 32); if (!name || !principal || !selectedDriverOne || !selectedDriverTwo || selectedDriverOne === selectedDriverTwo) return; setRace(createMetaCareer(Date.now() >>> 0, name, principal, selectedDriverOne, selectedDriverTwo, teamPrimaryColor, teamSecondaryColor, selectedMode)); setTeamNameDraft(name); setPrincipalNameDraft(principal); setShowStartScreen(false); setShowInitialDraft(true); setShowResults(false); setSelectedDraftId(""); setDraftRerolls(0); setOnboardingStep("mode"); };

  const exportSaveCode = () => {
    try {
      const code = encodeSaveCode({ format: 1, exportedAt: new Date().toISOString(), race, garageMeta, bestRun, codexMeta });
      setSaveCode(code);
      setSaveTransferMessage("Save code generated. Keep a copy somewhere safe.");
    } catch { setSaveTransferMessage("Could not generate a save code. Try again after the game has saved."); }
  };
  const importSaveCode = () => {
    try {
      const payload = decodeSaveCode(importCode);
      if (!window.confirm("Import this career and replace the current career and Garage data on this device? This cannot be undone unless you have exported the current save.")) return;
      const restored = ensureFullGrid({ ...payload.race, upgradeModules: payload.race.upgradeModules ?? { aero: 0, power: 0, suspension: 0, reliability: 0 } });
      setRace(restored);
      const importedUnlocks = payload.garageMeta.unlocks.filter((id: unknown): id is string => typeof id === "string");
      const importedLevels = payload.garageMeta.levels && typeof payload.garageMeta.levels === "object" ? Object.fromEntries(Object.entries(payload.garageMeta.levels).map(([id, level]) => [id, Math.max(0, Math.min(5, Math.floor(Number(level) || 0)))])) : Object.fromEntries(importedUnlocks.map((id: string) => [id, 1]));
      setGarageMeta({ research: Math.max(0, Number(payload.garageMeta.research) || 0), unlocks: importedUnlocks, levels: importedLevels, rewardedRuns: Array.isArray(payload.garageMeta.rewardedRuns) ? payload.garageMeta.rewardedRuns.filter((id: unknown): id is string => typeof id === "string") : [], rewardedAchievements: Array.isArray(payload.garageMeta.rewardedAchievements) ? payload.garageMeta.rewardedAchievements.filter((id: unknown): id is string => typeof id === "string") : [], rewardedDiscoveries: Array.isArray(payload.garageMeta.rewardedDiscoveries) ? payload.garageMeta.rewardedDiscoveries.filter((id: unknown): id is string => typeof id === "string") : [], masteryRewards: Array.isArray(payload.garageMeta.masteryRewards) ? payload.garageMeta.masteryRewards.filter((id: unknown): id is string => typeof id === "string") : [] });
      if (payload.codexMeta && Array.isArray(payload.codexMeta.discoveredUpgradeIds) && Array.isArray(payload.codexMeta.dossiers)) {
        const importedDiscoveredIds: string[] = payload.codexMeta.discoveredUpgradeIds.filter((id: unknown): id is string => typeof id === "string");
        const importedDossiers: CodexDossier[] = payload.codexMeta.dossiers.filter((item: unknown) => Boolean(item && typeof item === "object" && typeof (item as { id?: unknown }).id === "string" && Array.isArray((item as { upgrades?: unknown }).upgrades))).map((item: unknown) => { const record = item as Record<string, unknown>; return { id: String(record.id), team: typeof record.team === "string" ? record.team : "Unknown team", mode: typeof record.mode === "string" ? record.mode : "championship", round: Number(record.round) || 0, position: Number(record.position) || 0, points: Number(record.points) || 0, cash: Number(record.cash) || 0, upgrades: (record.upgrades as unknown[]).filter((id): id is string => typeof id === "string"), endedAt: typeof record.endedAt === "string" ? record.endedAt : "Imported" }; }).slice(0, 50);
        setCodexMeta({ discoveredUpgradeIds: [...new Set(importedDiscoveredIds)], dossiers: importedDossiers, usageCounts: payload.codexMeta.usageCounts && typeof payload.codexMeta.usageCounts === "object" ? Object.fromEntries(Object.entries(payload.codexMeta.usageCounts).filter(([, count]) => typeof count === "number").map(([id, count]) => [id, Math.max(0, Math.floor(count as number))])) : {}, favoriteUpgradeIds: (Array.isArray(payload.codexMeta.favoriteUpgradeIds) ? [...new Set(payload.codexMeta.favoriteUpgradeIds.filter((id: unknown): id is string => typeof id === "string"))] : []) as string[] });
      }
      setBestRun(payload.bestRun && typeof payload.bestRun.points === "number" ? payload.bestRun as BestRun : null);
      setTeamNameDraft(restored.playerTeamName ?? restored.cars.find((car) => car.playerCar)?.team ?? "Redline GP");
      setPrincipalNameDraft(restored.playerPrincipalName ?? "Team Principal");
      const restoredPrimary = restored.playerTeamColor ?? restored.cars.find((car) => car.playerCar)?.teamColor ?? "#f04438";
      const restoredSecondary = restored.playerTeamSecondaryColor ?? "#f2f2f2";
      setTeamPrimaryColor(restoredPrimary);
      setTeamSecondaryColor(restoredSecondary);

      const playerCars = restored.cars.filter((car) => car.playerCar);
      if (playerCars[0]?.driver) setSelectedDriverOne(playerCars[0].driver);
      if (playerCars[1]?.driver) setSelectedDriverTwo(playerCars[1].driver);
      setShowStartScreen(false);
      setShowInitialDraft(false);
      setShowIntermission(restored.status === "finished");
      setIntermissionUpgradeInstalled(false);
      setShowResults(restored.status === "gameover");
      setSelectedDraftId("");
      setSaveTransferMessage("Career imported successfully. Local autosave is now updated.");
      setImportCode("");
    } catch (error) {
      setSaveTransferMessage(error instanceof Error ? error.message : "Could not import this save code.");
    }
  };
  const bestLap = Math.min(...race.cars.filter((car) => car.playerCar && car.bestLap > 0).map((car) => car.bestLap), Infinity);
  const codexStandalone = new URLSearchParams(window.location.search).get("view") === "codex";
  if (codexStandalone) return <EngineeringCodex meta={codexMeta} onMetaChange={setCodexMeta} modules={race.upgradeModules ?? { aero: 0, power: 0, suspension: 0, reliability: 0 }} installedUpgrades={race.installedUpgrades ?? []} activeEvolutionIds={race.activeEvolutions ?? []} standalone onClose={() => { window.location.href = window.location.pathname; }} />;

  return <main className={"app-shell mobile-tab-" + mobileTab}>
    {showStartScreen && <div className="start-screen" role="dialog" aria-modal="true" aria-labelledby="start-screen-title"><div className="start-screen-grid"/><div className={"start-screen-content" + (mobileResearchExpanded ? " mobile-research-screen" : "")} data-onboarding-step={onboardingStep}><div className="start-screen-brand"><img className="brand-lockup-icon brand-lockup-icon-start" src="./redline-grid-ascension.svg" alt="" /><div className="brand-lockup-copy brand-lockup-copy-start"><strong>REDLINE ASCENSION</strong><span>ROGUELITE MOTORSPORTS</span></div></div><div className="start-screen-kicker">{onboardingStep === "home" ? "EVERY RUN. EVERY RISK. EVERY RACE." : "NEW CAREER SETUP"}</div><h1 id="start-screen-title">{onboardingStep === "home" ? <>Build. Race. <em>Survive.</em></> : onboardingStep === "mode" ? <>Choose your <em>race format.</em></> : onboardingStep === "team" ? <>Create your <em>team.</em></> : <>Choose your <em>drivers.</em></>}</h1><p className="start-screen-intro">{onboardingStep === "home" ? "ROGUELITE MOTORSPORTS MANAGEMENT · BUILD YOUR TEAM. EVOLVE YOUR CAR. SURVIVE THE GRID." : onboardingStep === "mode" ? "Choose how your career will unfold. You can build your team after selecting a format." : onboardingStep === "team" ? "Give your underdog constructor an identity before entering the driver market." : "Pick two drivers to complete your line-up. Their strengths will shape every race weekend."}</p><div className="onboarding-step-indicator"><span className={onboardingStep === "mode" ? "active" : "complete"}>01 MODE{onboardingStep !== "mode" ? " ✓" : ""}</span><span className={onboardingStep === "team" ? "active" : onboardingStep === "drivers" ? "complete" : ""}>02 TEAM{onboardingStep === "drivers" ? " ✓" : ""}</span><span className={onboardingStep === "drivers" ? "active" : ""}>03 DRIVERS</span></div><section className="mode-select-section" aria-label="Choose game mode"><div className="team-customization-heading"><div><span className="market-eyebrow">CAREER FORMAT</span><h2>Choose your season.</h2></div></div><div className="mode-select-grid"><button type="button" className={"mode-choice-card" + (selectedMode === "championship" ? " active" : "")} aria-pressed={selectedMode === "championship"} onClick={() => setSelectedMode("championship")}><span className="mode-choice-number">01 / CAREER</span><strong>Championship</strong><p>Race 20 rounds. Build your car, manage the team, and finish the season to claim your final championship position.</p><span className="mode-choice-footer">DEFINED SEASON · FINAL STANDINGS</span></button><button type="button" className={"mode-choice-card" + (selectedMode === "endless" ? " active" : "")} aria-pressed={selectedMode === "endless"} onClick={() => setSelectedMode("endless")}><span className="mode-choice-number">02 / SURVIVAL</span><strong>Endless Mode</strong><p>No final round. Keep racing, developing, and balancing the books until the team can no longer survive.</p><span className="mode-choice-footer">OPEN-ENDED · SURVIVE AS LONG AS YOU CAN</span></button></div><div className="onboarding-step-footer mode-next"><span>STEP 01 / 03</span><div><button className="secondary-button" onClick={() => setOnboardingStep("home")}>← BACK TO MENU</button><button className="primary-button" onClick={() => setOnboardingStep("team")}>CONTINUE TO TEAM SETUP ↗</button></div></div></section><label className="team-name-label" htmlFor="team-name-input">TEAM NAME <span>{teamNameDraft.trim().length}/24</span></label><input id="team-name-input" className="team-name-input" value={teamNameDraft} maxLength={24} placeholder="Enter your team name" onChange={(event) => setTeamNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && teamNameDraft.trim()) document.getElementById("principal-name-input")?.focus(); }}/><label className="team-name-label principal-name-label" htmlFor="principal-name-input">TEAM PRINCIPAL <span>{principalNameDraft.trim().length}/32</span></label><input id="principal-name-input" className="team-name-input" value={principalNameDraft} maxLength={32} placeholder="Enter your team principal name" onChange={(event) => setPrincipalNameDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && principalNameDraft.trim()) document.getElementById("principal-name-input")?.blur(); }}/><section className="team-customization"><div className="team-customization-heading"><div><span className="market-eyebrow">TEAM IDENTITY</span><h2>Make the grid yours.</h2></div><span className="team-customization-note">PRIMARY + ACCENT</span></div><p>Choose your team's colours. They'll appear on your cars and race markers, and stay with your career save.</p><div className="team-color-controls"><label className="team-color-picker"><span>PRIMARY COLOUR</span><div><input type="color" aria-label="Choose primary team colour" value={teamPrimaryColor} onChange={(event) => setTeamPrimaryColor(event.target.value)} /><code>{teamPrimaryColor.toUpperCase()}</code></div></label><label className="team-color-picker"><span>SECONDARY COLOUR</span><div><input type="color" aria-label="Choose secondary team colour" value={teamSecondaryColor} onChange={(event) => setTeamSecondaryColor(event.target.value)} /><code>{teamSecondaryColor.toUpperCase()}</code></div></label></div><div className="team-color-presets" aria-label="Team colour presets">{TEAM_COLOR_PRESETS.map((preset) => <button type="button" key={preset.name} className={"team-color-preset" + (teamPrimaryColor.toLowerCase() === preset.primary && teamSecondaryColor.toLowerCase() === preset.secondary ? " active" : "")} onClick={() => { setTeamPrimaryColor(preset.primary); setTeamSecondaryColor(preset.secondary); }} aria-label={"Use " + preset.name + " team colours"} title={preset.name}><span style={{ background: "linear-gradient(135deg, " + preset.primary + " 0 55%, " + preset.secondary + " 55% 100%)" }} /><small>{preset.name}</small></button>)}</div></section><div className="start-screen-preview" style={{ "--team-primary": teamPrimaryColor, "--team-secondary": teamSecondaryColor } as React.CSSProperties}><span className="team-preview-swatch"/><div><small>YOUR CONSTRUCTOR</small><strong>{teamNameDraft.trim() || "YOUR TEAM NAME"}</strong><small className="principal-preview-label">TEAM PRINCIPAL</small><strong className="principal-preview-name">{principalNameDraft.trim() || "YOUR NAME"}</strong></div><span className="team-preview-number">07 / 22</span></div><div className="onboarding-step-footer team-next"><span>STEP 02 / 03</span><div><button className="secondary-button" onClick={() => setOnboardingStep("mode")}>← BACK</button><button className="primary-button" disabled={!teamNameDraft.trim() || !principalNameDraft.trim()} onClick={() => setOnboardingStep("drivers")}>CONTINUE TO DRIVERS ↗</button></div></div><section className="driver-market"><div className="driver-market-heading"><div><span className="market-eyebrow">DRIVER MARKET · PRE-SEASON</span><h2>Build your driver line-up.</h2><p className="driver-market-copy">20 drivers available. The original eight are free; unlock additional talent with permanent Research Points. Unlocked drivers stay available across careers.</p></div><div className="driver-market-heading-side"><span className="market-seat-count">{selectedDriverOne && selectedDriverTwo ? "2 / 2 SEATS" : "SELECT 2 DRIVERS"}</span><span className="driver-market-research">✦ {garageMeta.research} RP AVAILABLE</span><span className="driver-market-unlock-count">{(garageMeta.unlockedDriverIds ?? []).length}/12 EXTRA DRIVERS UNLOCKED</span></div></div><div className="driver-market-seats"><div><small>SEAT 01</small><strong>{selectedDriverOne || "OPEN SEAT"}</strong></div><div><small>SEAT 02</small><strong>{selectedDriverTwo || "OPEN SEAT"}</strong></div></div><div className="driver-market-grid">{DRIVER_MARKET.map((driver, index) => { const seatOne = selectedDriverOne === driver.name; const seatTwo = selectedDriverTwo === driver.name; const unlocked = !driver.unlockCost || (garageMeta.unlockedDriverIds ?? []).includes(driver.id); const overall = Math.round((driver.pace + driver.racecraft + driver.tyreManagement + driver.consistency) / 4); return <article className={"market-driver-card" + (seatOne || seatTwo ? " market-driver-selected" : "") + (!unlocked ? " market-driver-locked" : "")} key={driver.id}><div className="market-driver-top"><span className="market-driver-number">#${String(index + 1).padStart(2, "0")}</span><span className="market-driver-overall">{overall}<small>OVR</small></span></div><div className="market-driver-identity"><DriverPortrait driver={driver} index={index} /><div className="market-driver-nameplate"><h3>{driver.name}</h3><span className="market-driver-role">{driver.role}</span></div></div><div className="market-driver-stats">{[["PACE", driver.pace], ["RACECRAFT", driver.racecraft], ["TYRE MGMT", driver.tyreManagement], ["CONSISTENCY", driver.consistency], ["POTENTIAL", driver.potential]].map(([label, value]) => <div className="market-stat" key={label as string}><span>{label}</span><div><i style={{ width: (value as number) + "%" }}/></div><b>{value}</b></div>)}</div>{unlocked ? <div className="market-driver-actions"><button type="button" className={seatOne ? "selected-seat" : ""} disabled={seatTwo} onClick={() => setSelectedDriverOne(driver.name)}>{seatOne ? "✓ SEAT 01" : "SELECT · 01"}</button><button type="button" className={seatTwo ? "selected-seat" : ""} disabled={seatOne} onClick={() => setSelectedDriverTwo(driver.name)}>{seatTwo ? "✓ SEAT 02" : "SELECT · 02"}</button></div> : <div className="market-driver-lock"><span>🔒 CONTRACT NOT AVAILABLE</span><strong>✦ {driver.unlockCost} RP</strong><button type="button" disabled={garageMeta.research < (driver.unlockCost ?? 0)} onClick={() => unlockMarketDriver(driver.id)}>{garageMeta.research >= (driver.unlockCost ?? 0) ? "UNLOCK DRIVER" : "NEED " + ((driver.unlockCost ?? 0) - garageMeta.research) + " MORE RP"}</button></div>}</article>; })}</div></section><button type="button" className="research-lab-entry-button" onClick={() => setMobileResearchExpanded(true)}><span className="research-entry-icon">✦</span><span><strong>GARAGE RESEARCH LAB</strong><small>{garageMeta.research} RP AVAILABLE · {GARAGE_PERKS.length} PERMANENT UPGRADES</small></span><span className="research-entry-arrow">↗</span></button><section className={"research-lab-panel" + (mobileResearchExpanded ? " mobile-research-expanded" : " mobile-research-collapsed")} aria-label="Permanent research lab"><div className="research-lab-heading"><div><span className="section-kicker">META PROGRESSION · BETWEEN RUNS ONLY</span><h2>Research Lab</h2></div><div className="research-lab-balance"><span>AVAILABLE RESEARCH</span><strong>✦ {garageMeta.research} RP</strong></div></div><button type="button" className="research-lab-mobile-toggle" aria-label={mobileResearchExpanded ? "Return to career setup" : "View all research upgrades"} aria-expanded={mobileResearchExpanded} onClick={() => setMobileResearchExpanded((expanded) => !expanded)}>{mobileResearchExpanded ? "← BACK TO CAREER SETUP" : "VIEW ALL 24 UPGRADES"} <span>{mobileResearchExpanded ? "←" : "+"}</span></button><p className="research-lab-copy">Spend research to unlock permanent blueprints. These benefits carry into future careers. Discover a technology for +1 RP, then master it by using it in three completed runs for +2 RP once.</p><div className="research-milestone-grid" aria-label="Technology discovery milestones">{[{ threshold: 10, title: "ADVANCED DATA", detail: "Guarantees at least one Rare-or-better upgrade in each draft." }, { threshold: 20, title: "EXPERIMENTAL PROGRAMME", detail: "Guarantees at least one Epic-or-better upgrade in each draft." }, { threshold: 30, title: "PROTOTYPE LAB", detail: "Guarantees a Legendary upgrade in each draft." }].map((milestone) => { const unlocked = discoveredTechnologyCount >= milestone.threshold; return <article key={milestone.threshold} className={"research-milestone" + (unlocked ? " unlocked" : "")}><div><span>{unlocked ? "✓ UNLOCKED" : "TECH DISCOVERIES"}</span><strong>{milestone.title}</strong></div><p>{milestone.detail}</p><b>{Math.min(discoveredTechnologyCount, milestone.threshold)}/{milestone.threshold}</b></article>; })}</div><div className="research-lab-foot research-lab-mastery-foot"><span>DISCOVERED TECHNOLOGIES: {discoveredTechnologyCount}/{UPGRADE_CARD_POOL.length}</span><span>MASTERED: {masteredTechnologyCount} · 3 COMPLETED RUNS EACH</span></div><div className="garage-perk-grid">{GARAGE_PERKS.map((perk) => { const level = garageLevel(garageMeta, perk.id); const maxed = level >= 5; const cost = perk.cost * (level + 1); const affordable = garageMeta.research >= cost; return <article className={"garage-perk-card" + (level > 0 ? " garage-perk-owned" : "")} key={perk.id}><div className="garage-perk-top"><span>{perk.category}</span><b>{maxed ? "MAX LEVEL" : cost + " RP"}</b></div><div className="garage-perk-title-row"><GaragePerkIcon effect={perk.effect} /><h3>{perk.title}</h3></div><div className="garage-perk-level" aria-label={"Level " + level + " of 5"}><strong>LVL {level}/5</strong><span>{[1,2,3,4,5].map((rank) => <i key={rank} className={rank <= level ? "filled" : ""}/>)}</span></div><p>{perk.description}</p><button className={maxed ? "garage-perk-button owned" : "garage-perk-button"} disabled={maxed || !affordable} onClick={() => buyGaragePerk(perk.id)}>{maxed ? "✓ MAXED OUT" : affordable ? "UPGRADE TO LVL " + (level + 1) + " ↗" : "NEED " + (cost - garageMeta.research) + " MORE RP"}</button></article>; })}</div><div className="research-lab-foot"><span>PERMANENT UNLOCKS: {garageMeta.unlocks.length}/{GARAGE_PERKS.length}</span><span>PROGRESS SAVED LOCALLY ACROSS RUNS</span></div></section><div className="start-menu-actions"><button className="primary-button start-new-game-button" onClick={() => { setMobileResearchExpanded(false); setOnboardingStep("mode"); }}>START NEW GAME <span>↗</span></button>{hasSavedCareer && <button className="continue-career-button" onClick={() => { setShowStartScreen(false); setShowInitialDraft(race.status === "ready" && race.upgradeLevel === 0 && race.weekendNumber === 1); }}>CONTINUE EXISTING CAREER <span>→</span></button>}</div><button className="primary-button start-career-button" disabled={!teamNameDraft.trim() || !principalNameDraft.trim() || !selectedDriverOne || !selectedDriverTwo || selectedDriverOne === selectedDriverTwo} onClick={startCustomCareer}>CONFIRM LINE-UP & START CAREER <span>↗</span></button><button className="start-save-transfer" onClick={() => { setShowSaveTransfer(true); setSaveTransferMessage(""); }}>IMPORT A SAVE CODE / TRANSFER CAREER ↗</button></div><div className="start-screen-visual start-screen-engineering-visual"><PitWallGraphic/><div className="start-track-window"><div className="start-track-grandstand"/><div className="start-track-circuit"/><div className="start-track-barrier"/></div><div className="start-engineer-silhouette"><div className="start-engineer-head"><i/></div><div className="start-engineer-neck"/><div className="start-engineer-body"><span>REDLINE</span></div><div className="start-engineer-headset"/><div className="start-engineer-mic"/></div><div className="start-engineering-overlay"><div className="start-engineering-topline"><span><i/> ENGINEERING WORKSTATION</span><b>SESSION 01 · PRE-SEASON</b></div><div className="start-engineering-readout"><span>VEHICLE SYSTEMS</span><b>ONLINE</b><i/><i/><i/></div><div className="start-engineering-footer"><span>REDLINE RACE OPERATIONS</span><b>DATA LINK ESTABLISHED</b></div></div></div></div>}
    {isInitialDraft && <div className="initial-upgrade-screen" role="dialog" aria-modal="true" aria-labelledby="initial-upgrade-title">
      <div className="initial-upgrade-topline"><span>REDLINE ASCENSION <i/> PRE-SEASON DEVELOPMENT</span><span>{(race.mode ?? "championship") === "endless" ? "ROUND 01 / ∞" : "ROUND 01 / 20"}</span></div>
      <div className="initial-upgrade-content">
        <div className="initial-upgrade-kicker">YOUR RUN STARTS HERE · DEVELOPMENT PICK 01</div>
        <h1 id="initial-upgrade-title">Define your <em>advantage.</em></h1>
        <p className="initial-upgrade-intro">Before the lights go out, your engineers have secured three development opportunities. Choose one permanent upgrade to shape your run. Every pick has a trade-off, and your build will evolve from here.</p>
        <div className="rogue-draft-grid initial-rogue-grid">
          {draftCards.map((card, index) => <button key={card.id} className={"rogue-card " + "rarity-" + card.rarity.toLowerCase() + (selectedDraft?.id === card.id ? " rogue-card-selected" : "")} aria-pressed={selectedDraft?.id === card.id} onClick={() => setSelectedDraftId(card.id)}>
            <span className="rogue-card-top"><span className="rogue-card-index">0{index + 1} / OFFER</span><b>{card.rarity}</b></span>
            <span className="rogue-card-art"><UpgradeIcon type={card.upgradeType}/></span>
            <span className="rogue-card-subtitle">{card.subtitle}</span>
            <strong>{card.title}</strong><p>{card.description}</p>
            <span className="rogue-card-effect">{card.effect}</span>
            {evolutionHintsForUpgrade(card.id, race).map((hint) => <span key={hint.key} className={"evolution-combo-hint" + (hint.ready ? " evolution-combo-ready" : "")}>{hint.text}</span>)}
            <span className="rogue-card-pick">{selectedDraft?.id === card.id ? "SELECTED ✓" : "SELECT THIS →"}</span>
          </button>)}
        </div>
        <div className="initial-upgrade-footer"><span>YOUR FIRST PICK IS PERMANENT · 19 MORE DEVELOPMENT PICKS AVAILABLE</span><div className="draft-action-buttons"><button className="secondary-button" disabled={race.cash < draftRerollCost} onClick={rerollDraft}>↻ REROLL · {money(draftRerollCost)}</button><button className="primary-button" disabled={!selectedDraft} onClick={() => { if (!selectedDraft) return; setRace((current) => applyStartingUpgrade(current, selectedDraft.id)); setShowInitialDraft(false); setSelectedDraftId(""); setDraftRerolls(0); }}>INSTALL STARTING UPGRADE ↗</button></div></div>
      </div>
    </div>}
    {showIntermission && race.status === "finished" && <div className={"career-intermission-screen mobile-intermission-" + mobileIntermissionStep} role="dialog" aria-modal="true" aria-labelledby="intermission-title">
      <div className="career-intermission-topline"><span>REDLINE ASCENSION <i/> BETWEEN RACES</span><span>ROUND {String(race.weekendNumber).padStart(2, "0")} COMPLETE</span></div>
      <nav className="mobile-intermission-steps" aria-label="Post-race steps"><button className={mobileIntermissionStep === "scenario" ? "active" : ""} onClick={() => setMobileIntermissionStep("scenario")}><span>01</span> RANDOM SCENARIO {race.pendingPaddockEvent ? "· ACTION REQUIRED" : "· REVIEW"}</button><button className={mobileIntermissionStep === "upgrade" ? "active" : ""} onClick={() => setMobileIntermissionStep("upgrade")}><span>02</span> UPGRADE PARTS</button></nav>
      <div className="career-intermission-content">
        <h1 id="intermission-title">Build your <em>next advantage.</em></h1>
        <p className="career-intermission-intro">Review the weekend, choose one upgrade for this career, then visit the garage before heading to the next circuit.</p>
        <div className="intermission-budget-mobile"><span>TEAM BUDGET REMAINING</span><strong>{money(race.cash)}</strong></div>
        <div className="intermission-summary"><span>TEAM BUDGET <b>{money(race.cash)}</b></span><span>TEAM MORALE <b>{race.teamMorale ?? 62}/100</b></span><span>PADDOCK REPUTATION <b>{race.teamReputation ?? 45}/100</b></span><span>RESEARCH BANK <b>✦ {garageMeta.research} RP</b></span></div>
        {race.pendingPaddockEvent ? <section className="panel paddock-event-panel" aria-label="Paddock incident"><div className="paddock-event-top"><div><div className="section-kicker">{race.pendingPaddockEvent.category} · PRE-RACE BRIEFING</div><h2>{race.pendingPaddockEvent.title}</h2></div><span className="paddock-alert-badge">PADDOCK ALERT</span></div><div className="paddock-event-source">{race.pendingPaddockEvent.source}</div><p className="paddock-event-story">{race.pendingPaddockEvent.story}</p><div className="paddock-choice-grid">{race.pendingPaddockEvent.choices.map((choice) => <button className="paddock-choice" key={choice.id} disabled={race.cash + choice.cashDelta < 0} onClick={() => resolvePaddockChoice(choice.id)}><strong>{choice.label}</strong><span>{choice.description}</span><small className={choice.cashDelta < 0 ? "paddock-cost" : choice.cashDelta > 0 ? "paddock-income" : ""}>{choice.cashDelta > 0 ? "+" : choice.cashDelta < 0 ? "−" : ""}{choice.cashDelta ? money(Math.abs(choice.cashDelta)) : "NO DIRECT COST"} · MORALE {choice.moraleDelta > 0 ? "+" : ""}{choice.moraleDelta} · REPUTATION {choice.reputationDelta > 0 ? "+" : ""}{choice.reputationDelta}</small></button>)}</div></section> : <section className="panel paddock-event-panel mobile-intermission-empty" aria-label="No random scenario"><div className="section-kicker">RACE WEEKEND REVIEW</div><h2>No random scenario this round</h2><p>There is no new paddock incident to resolve. Continue to the upgrade screen when you are ready.</p></section>}
        <section className="panel contract-desk-panel"><div className="panel-heading"><div><div className="section-kicker">TEAM MANAGEMENT · SEASON CONTRACTS</div><h2>Driver contract desk</h2></div><span className="contract-review-tag">{race.weekendNumber >= 10 ? "MID-SEASON REVIEW" : "REVIEW AT ROUND 10"}</span></div><p className="contract-desk-intro">Driver salaries are paid every race weekend. Contracts come up for renewal after Round 10. Renew to protect continuity, or terminate and recruit a replacement before the next race.</p><div className="contract-desk-grid">{(race.driverContracts ?? []).map((contract, index) => { const due = race.weekendNumber >= contract.expiresAtRound; const replacementDriver = index === 0 ? replacementDriverOne : replacementDriverTwo; const other = (race.driverContracts ?? []).find((item) => item.id !== contract.id)?.driverName; const candidates = DRIVER_MARKET.filter((driver) => driver.name !== other && (!driver.unlockCost || (garageMeta.unlockedDriverIds ?? []).includes(driver.id))); return <article className="contract-card" key={contract.id}><div className="contract-card-top"><span>DRIVER {index + 1}</span><b>{due ? "RENEWAL DUE" : contract.renewed ? "RENEWED" : "ACTIVE CONTRACT"}</b></div><h3>{contract.driverName}</h3><p>{money(contract.salaryPerRace)} <small>/ race weekend</small></p><div className="contract-progress"><span>TERM</span><strong>{due ? "REVIEW REQUIRED" : "THROUGH ROUND " + contract.expiresAtRound}</strong></div>{due && <><button className="contract-action" disabled={race.cash < 125000} onClick={() => renewDriverContract(contract.id)}>RENEW · RM125K SIGNING FEE</button><label className="contract-replacement-label">REPLACEMENT DRIVER<select value={replacementDriver} onChange={(event) => index === 0 ? setReplacementDriverOne(event.target.value) : setReplacementDriverTwo(event.target.value)}>{candidates.map((driver) => <option key={driver.id} value={driver.name}>{driver.name} · {driver.role}</option>)}</select></label><button className="contract-release-action" onClick={() => replaceDriverContract(contract.id, replacementDriver)}>TERMINATE & REPLACE · UP TO {money(contract.salaryPerRace * 2)} SEVERANCE</button></>}</article>; })}</div></section>
        <div className="intermission-finance-strip"><div><span>EST. NEXT WEEKEND COST</span><strong>{money(215000 + (race.driverContracts ?? []).reduce((sum, contract) => sum + contract.salaryPerRace, 0) + 65000)}</strong><small>OPERATIONS + DRIVER PAYROLL + STAFF</small></div><div><span>SPONSOR INCOME FORECAST</span><strong>{money(Math.max(0, 65000 + ((race.teamReputation ?? 45) - 45) * 1800))}</strong><small>BASED ON PADDOCK REPUTATION</small></div><div><span>PROJECTED CASH AFTER COSTS</span><strong className={race.cash + Math.max(0, 65000 + ((race.teamReputation ?? 45) - 45) * 1800) < (215000 + (race.driverContracts ?? []).reduce((sum, contract) => sum + contract.salaryPerRace, 0) + 65000) ? "finance-danger" : ""}>{money(race.cash + Math.max(0, 65000 + ((race.teamReputation ?? 45) - 45) * 1800) - (215000 + (race.driverContracts ?? []).reduce((sum, contract) => sum + contract.salaryPerRace, 0) + 65000))}</strong><small>BEFORE OPTIONAL SPENDING</small></div></div>
        <div className="intermission-section-heading"><div><span>STEP 01</span><h2>Choose your next upgrade</h2></div></div>
        <div className="rogue-draft-grid intermission-upgrade-grid">
          {draftCards.map((card, index) => <button key={card.id} className={"rogue-card " + "rarity-" + card.rarity.toLowerCase() + (selectedDraft?.id === card.id ? " rogue-card-selected" : "")} aria-pressed={selectedDraft?.id === card.id} onClick={() => { setSelectedDraftId(card.id); setIntermissionUpgradeInstalled(false); }}>
            <span className="rogue-card-top"><span className="rogue-card-index">0{index + 1} / OFFER</span><b>{card.rarity}</b></span>
            <span className="rogue-card-art"><UpgradeIcon type={card.upgradeType}/></span><span className="rogue-card-subtitle">{card.subtitle}</span><strong>{card.title}</strong><p>{card.description}</p><span className="rogue-card-effect">{card.effect}</span>{evolutionHintsForUpgrade(card.id, race).map((hint) => <span key={hint.key} className={"evolution-combo-hint" + (hint.ready ? " evolution-combo-ready" : "")}>{hint.text}</span>)}<span className="rogue-card-pick">{selectedDraft?.id === card.id ? "SELECTED ✓" : "SELECT THIS →"}</span>
          </button>)}
        </div>
        <div className="intermission-reroll-row"><span>NOT HAPPY WITH THESE OFFERS?</span><button className="secondary-button" disabled={race.cash < draftRerollCost || intermissionUpgradeInstalled} onClick={rerollDraft}>↻ REROLL OFFERS · {money(draftRerollCost)}</button></div>
        <section className="mobile-upgrade-detail panel" aria-live="polite" aria-label="Selected upgrade details">
          {selectedDraft ? <>
            <div className="mobile-upgrade-detail-top"><span className="section-kicker">SELECTED OFFER · FULL DETAILS</span><b className={"rarity-label rarity-" + selectedDraft.rarity.toLowerCase()}>{selectedDraft.rarity}</b></div>
            <div className="mobile-upgrade-detail-title"><span className="rogue-card-art"><UpgradeIcon type={selectedDraft.upgradeType}/></span><div><span className="rogue-card-subtitle">{selectedDraft.subtitle}</span><h3>{selectedDraft.title}</h3></div></div>
            <p>{selectedDraft.description}</p>
            <div className="mobile-upgrade-detail-effect"><span>PERFORMANCE EFFECT</span><strong>{selectedDraft.effect}</strong></div>
            {evolutionHintsForUpgrade(selectedDraft.id, race).map((hint) => <div key={hint.key} className={"evolution-combo-hint" + (hint.ready ? " evolution-combo-ready" : "")}>{hint.text}</div>)}
          </> : <div className="mobile-upgrade-detail-empty"><span className="section-kicker">UPGRADE DETAILS</span><strong>Choose an offer above</strong><p>Its full description and any evolution hints will appear here.</p></div>}
        </section>
        <div className="intermission-action-row">
          <div><span className="section-kicker">SELECTED DEVELOPMENT</span><strong>{selectedDraft?.title ?? "Choose one offer above"}</strong><p>{intermissionUpgradeInstalled ? "Upgrade installed. You can now continue to the garage and next race." : "Lock in your choice before moving to the garage."}</p></div>
          <button className="primary-button" disabled={!selectedDraft || intermissionUpgradeInstalled || Boolean(race.pendingPaddockEvent) || (race.driverContracts ?? []).some((contract) => race.weekendNumber >= contract.expiresAtRound) || race.cash < (selectedDraft?.cashBonus ? 0 : selectedDraft?.rarity === "EPIC" ? 260000 : selectedDraft?.rarity === "RARE" ? 165000 : 95000)} onClick={() => { if (!selectedDraft || race.pendingPaddockEvent || (race.driverContracts ?? []).some((contract) => race.weekendNumber >= contract.expiresAtRound)) return; const cost = selectedDraft.cashBonus ? 0 : selectedDraft.rarity === "EPIC" ? 260000 : selectedDraft.rarity === "RARE" ? 165000 : 95000; if (race.cash < cost) return; const upgradedRace = upgradeCar(race, selectedDraft.id); const preparedRace = { ...race, upgradeModules: upgradedRace.upgradeModules, installedUpgrades: upgradedRace.installedUpgrades, buildTraits: upgradedRace.buildTraits, activeEvolutions: upgradedRace.activeEvolutions, upgradeLevel: upgradedRace.upgradeLevel, cash: Math.max(0, upgradedRace.cash - cost) }; setDraftRerolls(0); startNextRace(preparedRace, true); }}> {intermissionUpgradeInstalled ? "UPGRADE INSTALLED ✓" : "INSTALL UPGRADE · " + (selectedDraft?.cashBonus ? "NO COST" : money(selectedDraft?.rarity === "EPIC" ? 260000 : selectedDraft?.rarity === "RARE" ? 165000 : 95000)) + " ↗"}</button>
        </div>
        <div className="intermission-research-locked"><span className="research-counter">✦ {garageMeta.research} RESEARCH BANKED</span><strong>Permanent research is locked during a run.</strong><p>After the run ends, return to the start screen to spend RP before starting your next run.</p></div>
        
      </div>
    </div>}
    <header className="topbar"><a className="brand" href="#" aria-label="Redline Ascension home"><img className="brand-lockup-icon brand-lockup-icon-header" src="./redline-grid-ascension.svg" alt="" /><span className="brand-lockup-copy"><strong>REDLINE ASCENSION</strong><span>ROGUELITE MOTORSPORTS</span></span></a><nav className="main-nav"><span className="nav-active">OPERATIONS</span><span>ENGINEERING</span><span>CHAMPIONSHIP</span></nav><div className="top-status"><i className="status-dot"/> PROTOTYPE <b/> {savedAt}<button className="save-transfer-trigger codex-header-trigger" onClick={() => setShowEngineeringCodex(true)}>ENGINEERING CODEX</button><button className="save-transfer-trigger" aria-label="Save or transfer game data" onClick={() => { setShowSaveTransfer(true); setSaveTransferMessage(""); }}>SAVE / TRANSFER</button></div></header>
    <section className="page-heading"><div className="heading-copy"><div className="eyebrow">TEAM PRINCIPAL: {race.playerPrincipalName ?? "Team Principal"} <b>/</b> TEAM OPERATIONS <b>/</b> ROUND {String((race.mode ?? "championship") === "championship" ? Math.min(race.weekendNumber, CAMPAIGN_LENGTH) : race.weekendNumber).padStart(2, "0")} / {(race.mode ?? "championship") === "endless" ? "∞" : CAMPAIGN_LENGTH}</div><h1>Race <em>Control.</em></h1><p>Every decision has a cost. Every lap is an opportunity.</p></div><PitWallGraphic /><div className="weekend-status"><i className={"live-indicator " + (race.status === "running" ? "is-live" : "")}/><div><strong>{race.status === "running" ? "SESSION LIVE" : race.status === "finished" || race.status === "gameover" ? "SESSION COMPLETE" : race.status === "paused" ? "SESSION PAUSED" : "RACE WEEKEND"}</strong><span>{(race.circuitName ?? "Copperhead Ring").toUpperCase()} · GENERATED CIRCUIT</span></div></div></section>
    <section className="stat-strip stat-strip-overview">
      <div className="stat-cell"><span>TEAM BUDGET</span><strong>{money(race.cash)}</strong><small>{race.upgradeLevel ? "PACKAGE LEVEL " + race.upgradeLevel : "INITIAL ALLOCATION"}</small></div>
      <div className="stat-cell"><span>CAR PERFORMANCE</span><strong>{Math.min(100, 82 + modules.aero * 2 + modules.power * 3 + modules.suspension + modules.reliability)}<small className="inline-unit"> / 100</small></strong><small>{race.upgradeLevel ? "DRAFTED SPEC" : "BASELINE SPEC"}</small></div>
    </section>
    <section className="panel current-upgrades-panel" aria-label="Current team upgrades">
      <div className="panel-heading"><div><div className="section-kicker">CAR DEVELOPMENT · CURRENT SPEC</div><h2>Installed upgrades</h2></div><span className="upgrade-count-badge">{(race.installedUpgrades ?? []).length} FITTED</span></div>
      <div className="upgrade-module-strip">
        {([{ key: "aero", label: "AERODYNAMICS", icon: "A" }, { key: "power", label: "POWER UNIT", icon: "P" }, { key: "suspension", label: "MECHANICAL GRIP", icon: "S" }, { key: "reliability", label: "RELIABILITY", icon: "R" }] as const).map((module) => <div className="upgrade-module-meter" key={module.key}><span className={"upgrade-module-icon module-" + module.key}>{module.icon}</span><div><small>{module.label}</small><strong>LEVEL {modules[module.key]}</strong><div className="upgrade-module-track"><i style={{ width: Math.min(100, modules[module.key] * 20) + "%" }} /></div></div></div>)}
      </div>
      {(race.installedUpgrades ?? []).length > 0 ? <div className="installed-upgrade-list">{[...(race.installedUpgrades ?? [])].reverse().map((upgrade, index) => <article className="installed-upgrade-item" key={upgrade.id + "-" + index}><span className={"installed-upgrade-icon " + (upgrade.upgradeType ? "type-" + upgrade.upgradeType : "type-commercial")}>{upgrade.upgradeType ? upgrade.upgradeType === "aero" ? "A" : upgrade.upgradeType === "power" ? "P" : upgrade.upgradeType === "suspension" ? "S" : "R" : "₥"}</span><div className="installed-upgrade-copy"><div><span>{upgrade.subtitle}</span><b className={"rarity-label rarity-text-" + upgrade.rarity.toLowerCase()}>{upgrade.rarity}</b></div><strong>{upgrade.title}</strong><small>{upgrade.effect}</small></div></article>)}</div> : <div className="upgrade-empty-state"><span>+</span><div><strong>No career upgrades installed yet</strong><p>Your selected development cards will be listed here after you fit your first upgrade. Permanent Garage blueprints are tracked separately.</p></div></div>}
      <div className="current-upgrades-foot"><span>CAREER BUILD · {race.upgradeLevel} DEVELOPMENT PICKS</span><span>{buildSynergies(modules).length} ACTIVE SYNERGIES</span></div>
    </section>
    {(race.status === "finished" || race.status === "gameover") && <><section className="build-intel" aria-label="Engineering build profile">
      <div className="build-intel-heading"><span>ENGINEERING PROFILE</span><b>{buildSynergies(modules).length === 1 ? "1 ACTIVE SYNERGY" : buildSynergies(modules).length + " ACTIVE SYNERGIES"}</b></div>
      <div className="build-intel-items">
        <div className="build-tradeoff"><strong>DEVELOPMENT TRADE-OFFS</strong><span>Aero increases tyre load · Power packages use more fuel</span></div>
        {buildSynergies(modules).length === 0 ? <div className="build-synergy-empty">No build synergy yet. Invest in two related departments to unlock a combined effect.</div> : buildSynergies(modules).map((synergy) => <div className="build-synergy" key={synergy}><strong>{synergy}</strong><span>{synergy === "AERO + POWER INTEGRATION" ? "Extra 0.10s pace per lap from a coordinated aero and power package." : "10% less tyre wear and component condition loss from an endurance-focused platform."}</span></div>)}
      </div>
    </section>
    </>}
    <div className="content-grid">
      <div className="content-column left-column">
      <section className="panel race-panel">
        <div className="panel-heading"><div><div className="section-kicker">LIVE TELEMETRY <i className="tiny-live"/></div><h2>Race overview</h2></div></div>
        <CircuitMap cars={race.cars} lap={race.lap} teamName={playerTeamName} speed={speed} circuitSeed={race.circuitSeed ?? race.seed} circuitName={race.circuitName ?? "Copperhead Ring"}/>

        {(race.status === "finished" || race.status === "gameover") && <div className="finish-banner"><div><span className="section-kicker">CHEQUERED FLAG</span><h3>{race.status === "gameover" ? (race.endReason === "bankruptcy" ? "Administration called." : "Campaign complete.") : "Race complete."}</h3><p>{race.status === "gameover" ? (race.endReason === "bankruptcy" ? "The team could not cover the next weekend’s committed costs. This run ends here." : "The 20-round season is complete. Final championship points are locked.") : "Prize income and classification are ready for review."}</p></div><button className="secondary-button" onClick={() => setShowResults(!showResults)}>{showResults ? "HIDE REPORT" : "VIEW RACE REPORT"} ↗</button></div>}
        {(race.status === "finished" || race.status === "gameover") && race.latestChampionshipMilestone && <section className="championship-milestone" aria-label="Championship milestone"><div className="milestone-mark">★</div><div className="milestone-copy"><span className="section-kicker">CHAMPIONSHIP MILESTONE · ROUND {race.latestChampionshipMilestone.round}/{CAMPAIGN_LENGTH}</span><h3>{race.latestChampionshipMilestone.title}</h3><p>{race.latestChampionshipMilestone.detail}</p><small>CHAMPIONSHIP POSITION · P{race.latestChampionshipMilestone.position}</small></div><div className="milestone-reward"><span>COMMERCIAL REWARD</span><strong>+{money(race.latestChampionshipMilestone.reward)}</strong></div></section>}
        {showResults && (race.status === "finished" || race.status === "gameover") && <RaceReport race={race}/>}
      </section>

      {(race.activeEvolutions ?? []).length > 0 && <section className="active-evolution-showcase" aria-label="Active technology evolutions">
        <div className="active-evolution-showcase-heading"><div><span className="section-kicker">ENGINEERING BREAKTHROUGHS</span><h3>Active Technology Evolutions</h3><p>Your upgrade combinations are now delivering their integrated build bonuses.</p></div><strong>{(race.activeEvolutions ?? []).length} ACTIVE</strong></div>
        <div className="active-evolution-showcase-grid">{(race.activeEvolutions ?? []).map((id) => UPGRADE_EVOLUTIONS.find((evolution) => evolution.id === id)).filter((evolution): evolution is NonNullable<typeof evolution> => Boolean(evolution)).map((evolution) => <article className="active-evolution-showcase-card" key={evolution.id}><div className="active-evolution-check">✓</div><div className="active-evolution-copy"><h4>{evolution.title}</h4><p>{evolution.description}</p><strong>{evolution.rewardText}</strong></div></article>)}</div>
      </section>}
      {(race.mode ?? "championship") === "championship" && race.championshipObjective && <section className={"championship-objective-panel" + (race.status === "finished" ? race.championshipObjective.completed ? " objective-complete" : " objective-missed" : "")} aria-label="Championship weekend objective">
        <div className="objective-panel-mark">{race.status === "finished" ? race.championshipObjective.completed ? "✓" : "×" : "◎"}</div>
        <div className="objective-panel-copy"><span className="section-kicker">{race.status === "finished" ? race.championshipObjective.completed ? "BOARD TARGET ACHIEVED" : "BOARD TARGET MISSED" : "CHAMPIONSHIP BRIEFING · ROUND " + race.weekendNumber}</span><h3>{race.championshipObjective.title}</h3><p>{race.championshipObjective.detail}</p></div>
        <div className="objective-panel-reward"><span>{race.status === "finished" ? race.championshipObjective.completed ? "REWARD EARNED" : "POTENTIAL REWARD" : "BONUS PAYOUT"}</span><strong>RM{race.championshipObjective.reward.toLocaleString("en-MY")}</strong></div>
      </section>}
      {(race.mode ?? "championship") === "championship" && race.nemesisTeam && <section className={"championship-nemesis-panel" + (race.nemesisShowdown ? " nemesis-showdown" : "")} aria-label="Championship nemesis storyline">
        <div className="nemesis-panel-mark">{race.nemesisShowdown ? "⚑" : "↗"}</div>
        <div className="nemesis-panel-copy"><span className="section-kicker">{race.nemesisShowdown ? "CHAMPIONSHIP SHOWDOWN · ROUND " + race.weekendNumber : "RIVAL STORYLINE · ROUND " + race.weekendNumber}</span><h3>{race.nemesisTeam} {race.nemesisShowdown ? "— Showdown Weekend" : "are adapting to your team"}</h3><p>{race.nemesisTarget === "pace" ? "Their engineers are prioritising raw speed to attack your team's weakest pace profile." : race.nemesisTarget === "racecraft" ? "Their drivers are studying your racecraft and will attack when they get close on track." : race.nemesisTarget === "tyre-management" ? "Their strategists are targeting your tyre management, forcing your crew to protect stint life." : "Their analysts are exploiting consistency gaps and trying to force mistakes."} {race.nemesisShowdown ? "This is a major season checkpoint: the rival's tactical pace advantage is stronger this weekend." : "Expect a small tactical edge for the rival until you beat them and break the storyline."}</p></div>
        <span className="nemesis-panel-status">{race.nemesisShowdown ? "SHOWDOWN" : "ADAPTING"}</span>
      </section>}
      {race.weekendEffect && <section className={"weekend-condition-panel condition-" + race.weekendEffect} aria-label="Race weekend condition"><div><span className="section-kicker">WEEKEND BRIEFING · ACTIVE CONDITION</span><h3>{race.weekendEffectTitle ?? "Race weekend conditions"}</h3></div><p>{race.weekendEffect === "wet-prepared" ? "Wet-weather preparation is active: your cars gain pace and tyre control in changing conditions." : race.weekendEffect === "wet-unprepared" ? "The team skipped wet-weather preparation. Rain could cost your cars pace." : race.weekendEffect === "directive-compliant" ? "The technical directive was handled early. A small pace compromise avoids a larger scrutineering disruption." : race.weekendEffect === "directive-restricted" ? "The team challenged the technical directive. The current package is restricted and costs extra pace." : race.weekendEffect === "spares-secured" ? "Emergency spare parts are ready. Component condition loss is significantly reduced." : race.weekendEffect === "feud-attack" ? "Showdown mode is active: your cars gain a stronger pace edge against your nemesis, but tyre wear rises." : race.weekendEffect === "feud-composed" ? "A controlled feud strategy is active. Your cars give up a little peak pace, while your nemesis receives a smaller pace boost." : "Spare parts are running short. Component condition will deteriorate faster this weekend."}</p></section>}
        <section className="panel event-panel"><div className="panel-heading"><div><div className="section-kicker">RACE RADIO</div><h2>Event log</h2></div><span className="event-count">{race.events.length} EVENTS</span></div><div className="event-list">{race.events.slice(0, 8).map((item) => <div className="event-item" key={item.id}><span className={"event-marker marker-" + item.kind}>{item.kind === "pit" ? "P" : item.kind === "battle" ? "↗" : item.kind === "finish" ? "■" : "·"}</span><div><span className="event-lap">LAP {String(item.lap).padStart(2, "0")} · RACE CONTROL</span><p>{item.message}</p></div></div>)}</div></section>
                <section className="rival-intel-panel" aria-label="Rival team intelligence">
          <div className="rival-intel-heading"><div><span>PADDOCK SCOUTING</span><strong>Rival intelligence</strong></div><small>{rivalIntel.length} TEAM PROFILES</small></div>
          <div className="rival-intel-grid">{rivalIntel.map((rival) => {
            const style = RIVAL_STYLE_INFO[rival.style ?? "consistency-expert"];
            return <article className="rival-intel-card" key={rival.team}>
              <div className="rival-intel-card-top"><i style={{ background: rival.color }} /><strong>{rival.team}</strong><small>P{String(rival.position).padStart(2, "0")}</small></div>
              <span>{style.label}</span><p>{style.description}</p>
              <em>{rival.wins} {rival.wins === 1 ? "WEEKEND" : "WEEKENDS"} BEATEN</em>
              <em className={race.rivalryFeudTeam === rival.team ? "rival-feud-active" : rival.streak >= 2 ? "rival-streak-hot" : "rival-streak-calm"}>{race.rivalryFeudTeam === rival.team ? "NEMESIS FEUD · RM" + (race.rivalryFeudBonus ?? 100000).toLocaleString("en-MY") + " REWARD" : null}</em>
              <em className={rival.streak >= 2 ? "rival-streak-hot" : "rival-streak-calm"}>{rival.streak >= 2 ? "RIVAL ALERT · " : "CURRENT STREAK · "}{rival.streak} {rival.streak === 1 ? "WIN" : "WINS"}</em>
              <em className="rival-form-line">RECENT FORM · {rival.history.length ? rival.history.map((position) => "P" + String(position).padStart(2, "0")).join(" → ") : "NO RACE DATA"}</em>
              <em className={"rival-threat-line " + (rival.streak >= 4 ? "threat-high" : rival.streak >= 2 ? "threat-elevated" : "threat-standard")}>{rival.streak >= 4 ? "THREAT · HIGH — ADAPTING" : rival.streak >= 2 ? "THREAT · ELEVATED — STUDYING YOU" : "THREAT · STANDARD"}</em>
            </article>;
          })}</div>
        </section>
      {(race.mode ?? "championship") === "championship" && <section className="panel championship-achievements-panel" aria-label="Championship achievements">
        <div className="panel-heading"><div><div className="section-kicker">SEASON PROGRESSION</div><h2>Championship achievements</h2></div><span className="field-count">{(race.championshipAchievements ?? []).length}/{CHAMPIONSHIP_ACHIEVEMENTS.length} UNLOCKED</span></div>
        <div className="achievement-progress-track"><i style={{ width: (((race.championshipAchievements ?? []).length / CHAMPIONSHIP_ACHIEVEMENTS.length) * 100) + "%" }}/></div>
        <div className="achievement-grid">{CHAMPIONSHIP_ACHIEVEMENTS.map((achievement) => {
          const unlocked = (race.championshipAchievements ?? []).includes(achievement.id);
          const results = race.championshipRaceResults ?? [];
          const pointsFinishes = results.filter((result) => result.position > 0 && result.position <= 10).length;
          const lastThree = results.slice(-3);
          const streakProgress = unlocked ? 3 : lastThree.length === 3 && lastThree.every((result) => result.position <= 10) ? 3 : lastThree.slice(-2).filter((result) => result.position <= 10).length;
          const points = race.teamPoints?.[playerTeamName] ?? 0;
          const progress = achievement.id === "five-points-finishes" ? Math.min(5, pointsFinishes) : achievement.id === "three-points-streak" ? streakProgress : achievement.id === "century-club" ? Math.min(100, points) : achievement.id === "top-three-season" ? (unlocked ? 20 : Math.min(19, race.weekendNumber - 1)) : achievement.id === "world-champion" ? (unlocked ? 1 : 0) : (unlocked || results.some((result) => achievement.id === "first-points" ? result.position <= 10 : achievement.id === "first-podium" ? result.position <= 3 : result.position === 1) ? 1 : 0);
          const target = achievement.id === "five-points-finishes" ? 5 : achievement.id === "three-points-streak" ? 3 : achievement.id === "century-club" ? 100 : achievement.id === "top-three-season" ? 20 : 1;
          const progressLabel = achievement.id === "century-club" ? progress + " / 100 PTS" : achievement.id === "five-points-finishes" ? progress + " / 5 FINISHES" : achievement.id === "three-points-streak" ? progress + " / 3 ROUNDS" : achievement.id === "top-three-season" ? (unlocked ? "SEASON COMPLETE" : Math.max(0, race.weekendNumber - 1) + " / 20 ROUNDS") : achievement.id === "world-champion" ? (unlocked ? "CHAMPION" : "SEASON TARGET") : (unlocked ? "COMPLETED" : "LOCKED");
          const bar = unlocked ? 100 : achievement.id === "century-club" ? progress : achievement.id === "five-points-finishes" || achievement.id === "three-points-streak" ? progress / target * 100 : achievement.id === "top-three-season" ? progress / target * 100 : 0;
          return <article className={"achievement-card" + (unlocked ? " achievement-unlocked" : "")} key={achievement.id}><div className="achievement-card-top"><span>{unlocked ? "✓ UNLOCKED" : "ACHIEVEMENT"}</span><b>RM{achievement.cashReward.toLocaleString("en-MY")}</b></div><h3>{achievement.title}</h3><p>{achievement.description}</p><div className="achievement-card-progress"><span>{progressLabel}</span><small>+{achievement.researchReward} RP</small></div><div className="achievement-card-track"><i style={{ width: bar + "%" }}/></div></article>;
        })}</div>
        {(race.latestChampionshipAchievements ?? []).length > 0 && <div className="achievement-unlock-feed">{(race.latestChampionshipAchievements ?? []).map((achievement) => <div key={achievement.id}><strong>★ {achievement.title}</strong><span>{achievement.detail} · +RM{achievement.cashReward.toLocaleString("en-MY")} · +{achievement.researchReward} RP</span></div>)}</div>}
      </section>}
      </div>
      <div className="content-column right-column">
      {(race.safetyCarActive || (race.incidentCount ?? 0) > 0) && <section className={"race-control-alert" + (race.safetyCarActive ? " safety-car-alert" : "")} role="status"><span>{race.safetyCarActive ? "SC" : "!"}</span><div><strong>{race.safetyCarActive ? "SAFETY CAR DEPLOYED" : "RACE CONTROL · INCIDENTS"}</strong><p>{race.safetyCarActive ? "Field neutralised. Tyre wear and fuel consumption are reduced; consider pitting if the stop loss is favourable." : (race.incidentCount ?? 0) + " incident(s) reported this race. Monitor component condition and traffic."}</p></div></section>}
       <section className="panel strategy-panel"><div className="panel-heading"><div><div className="section-kicker">PIT WALL</div><h2>Race engineer console</h2></div><span className="strategy-count">02 CARS</span></div>
        {(race.status === "running" || race.status === "paused") && <div className="race-session-timing" aria-label="Live race timing"><div className="race-session-progress"><span>RACE PROGRESS</span><strong>{Math.min(race.lap, race.totalLaps)}<small> / {race.totalLaps} LAPS</small></strong><div className="race-progress-track"><i style={{ width: Math.min(100, Math.max(0, race.lap / race.totalLaps * 100)) + "%" }}/></div><small>{finishedCount}/22 CARS FINISHED</small></div><div className="race-session-best"><span>YOUR BEST LAP</span><strong>{Number.isFinite(bestLap) ? formatLapTime(bestLap) : "—"}</strong><small>SESSION TIMING</small></div></div>}
        <div className="race-controls pitwall-race-controls"><div className="control-left"><button className="primary-button" disabled={race.status === "finished" || race.status === "gameover"} onClick={() => setRace((current) => ({ ...current, status: current.status === "running" ? "paused" : "running" }))}><span>{race.status === "running" ? "Ⅱ" : "▶"}</span>{race.status === "running" ? "PAUSE" : race.status === "paused" ? "RESUME RACE" : "START RACE"}</button>{race.status === "running" && <span className="running-copy">● RACE RUNNING</span>}{race.status === "paused" && <span className="paused-copy">RACE PAUSED</span>}</div><div className="speed-control"><span>SIM SPEED</span>{[1, 2, 4, 8].map((n) => <button key={n} className={speed === n ? "speed-active" : ""} onClick={() => setSpeed(n)} aria-pressed={speed === n}>{n}×</button>)}</div></div>
        <div className="strategy-grid">{race.cars.filter((car) => car.playerCar).map((car) => {
          const advice = getStrategyAdvice(race, car.id);
          return <DriverStrategy key={car.id} car={car} status={race.status} teamName={playerTeamName} advice={advice}
            onApplyAdvice={() => { if (!advice) return; if (advice.action === "PIT") setStrategy(car, { pitLap: Math.max(3, Math.min(race.totalLaps - 1, Math.floor(car.progress) + 1)) }); else if (advice.action === "OVERTAKE") setStrategy(car, { battleMode: "OVERTAKE" }); else if (advice.action === "DEFEND") setStrategy(car, { battleMode: "DEFEND" }); else if (advice.action === "FUEL_SAVE") setStrategy(car, { fuelMode: "SAVE" }); else setStrategy(car, { pace: advice.action }); }}
            onPace={(pace) => setStrategy(car, { pace })} onTyre={(nextTyre) => setStrategy(car, { nextTyre })} onPitLap={(pitLap) => setStrategy(car, { pitLap })} onBattleMode={(battleMode) => setStrategy(car, { battleMode })} onFuelMode={(fuelMode) => setStrategy(car, { fuelMode })}/>;
        })}</div>
        <div className="engineer-note"><span className="engineer-icon">i</span><div><strong>ENGINEER'S NOTE</strong><p>{race.status === "finished" ? "Review the report, then fit an upgrade to prepare for the next weekend." : race.safetyCarActive ? "Safety car conditions reduce tyre wear and fuel use. This can be a low-cost pit window, but calling both cars together may cost track position." : race.cars.some((car) => car.playerCar && car.tyreWear > .7) ? "Tyre wear is high. CONSERVE protects the stint; PUSH trades tyre life and fuel for lap time. Adjust each car independently." : "Tyre life is manageable. PUSH gains pace but burns more fuel and rubber; CONSERVE extends the stint. Watch traffic and avoid exposing both cars to the same strategy."}</p></div></div>
      </section>

      <section className="panel standings-panel"><div className="panel-heading"><div><div className="section-kicker">TIMING TOWER</div><h2>Race classification</h2></div><span className="field-count">22 CARS</span></div>
        <div className="standings-table"><div className="table-header"><span>POS</span><span>DRIVER / TEAM</span><span>GAP</span><span>TYRE</span></div>
          {order.map((car, index) => <div className={"standings-row " + (car.playerCar ? "player-row" : "")} key={car.id}><span className="position">{String(index + 1).padStart(2, "0")}</span><span className="driver-cell"><i style={{ background: car.teamColor }}/><span><strong>{car.driver}</strong><small>{car.team}</small></span>{car.playerCar && <b className="you-tag">YOU</b>}</span><span className="gap-cell">{index === 0 ? "LEADER" : car.finished && order[0].finished ? "+" + ((car.finishTime ?? 0) - (order[0].finishTime ?? 0)).toFixed(1) + "s" : "+" + Math.max(0, (order[0].progress - car.progress) * 91.4).toFixed(1) + "s"}</span><span className={"tyre-mini tyre-" + car.tyre.toLowerCase()}>{car.tyre[0]}</span></div>)}
        </div>
        <div className="standings-foot"><span><i className="dot red"/> {playerTeamName.toUpperCase()}</span><span>POSITION UPDATES LIVE</span></div>
      </section>

      </div>
      {race.status === "finished" && <section className="panel upgrade-panel roguelite-panel">
        <div className="upgrade-copy">
          <div className="section-kicker">ENGINEERING DEPARTMENT · POST-RACE DRAFT</div>
          <h2>Three leads. One breakthrough.</h2>
          <p>Your engineers have surfaced three opportunities from the weekend's data. Pick one to carry through the rest of this 20-round run. Offers are randomised each round, and rare breakthroughs can change your team's direction.</p>
          <div className="upgrade-meta"><span>TEAM BUDGET <b>{money(race.cash)}</b></span><span>DEVELOPMENT PICKS <b>{race.upgradeLevel}</b></span><span>ROUND COMPLETED <b>{String(race.weekendNumber).padStart(2, "0")}</b></span><button className="secondary-button" disabled={race.cash < draftRerollCost} onClick={rerollDraft}>↻ REROLL OFFERS · {money(draftRerollCost)}</button></div>
          <div className="rogue-draft-grid">
            {draftCards.map((card, index) => <button key={card.id} className={"rogue-card " + "rarity-" + card.rarity.toLowerCase() + (selectedDraft?.id === card.id ? " rogue-card-selected" : "")} aria-pressed={selectedDraft?.id === card.id} onClick={() => setSelectedDraftId(card.id)}>
              <span className="rogue-card-top"><span className="rogue-card-index">0{index + 1} / OFFER</span><b>{card.rarity}</b></span>
              <span className="rogue-card-art"><UpgradeIcon type={card.upgradeType}/></span>
              <span className="rogue-card-subtitle">{card.subtitle}</span>
              <strong>{card.title}</strong>
              <p>{card.description}</p>
              <span className="rogue-card-effect">{card.effect}</span>
              {evolutionHintsForUpgrade(card.id, race).map((hint) => <span key={hint.key} className={"evolution-combo-hint" + (hint.ready ? " evolution-combo-ready" : "")}>{hint.text}</span>)}
              <span className="rogue-card-pick">{selectedDraft?.id === card.id ? "SELECTED ✓" : "SELECT THIS →"}</span>
            </button>)}
          </div>
          <p className="rogue-rule-note">One pick per race · Permanent for this run · Rerolls cost team budget and get more expensive with each use</p>
        </div>
        <div className="upgrade-action rogue-selection">
          <div className="upgrade-symbol">✦</div>
          <span className="selected-package-label">YOUR NEXT BREAKTHROUGH</span>
          <strong>{selectedDraft?.title ?? "Choose a development card"}</strong>
          <p className="selected-package-description">{selectedDraft?.description ?? "Select one of the three engineering offers."}</p>
          {selectedDraft && <div className="upgrade-summary-row"><span>RARITY</span><b className={"rarity-text-" + selectedDraft.rarity.toLowerCase()}>{selectedDraft.rarity}</b></div>}
          {selectedDraft && <div className="upgrade-summary-row"><span>REWARD</span><b>{selectedDraft.effect}</b></div>}
          <div className="upgrade-summary-row"><span>CAREER DEVELOPMENT</span><b>{race.upgradeLevel} PICKS COMPLETED</b></div>
          <button className="primary-button" disabled={!selectedDraft} onClick={() => { if (selectedDraft) { setRace((current) => upgradeCar(current, selectedDraft.id)); setShowResults(false); setSelectedDraftId(""); setDraftRerolls(0); } }}>LOCK IN PICK & CONTINUE ↗</button>
          <p className="upgrade-install-note">Your choice is permanent. Future races bring a fresh set of offers.</p>
          <button className="text-button" onClick={resetCareer}>START NEW CAREER</button>
        </div>
      </section>}
    </div>
    {race.status === "gameover" && <section className="panel gameover-panel">
      <div className="gameover-kicker">REDLINE ASCENSION · RUN COMPLETE</div>
      <h2>Chequered flag. <em>Game over.</em></h2>
      <p className="gameover-intro">{race.endReason === "bankruptcy" ? "The team ran out of available cash before it could meet the next weekend’s committed costs. The run ends in insolvency, but your banked research remains yours. Return to the start screen to spend it before your next run." : "The 20-round championship is complete. Your run-specific build is retired; return to the start screen to spend banked research before your next season."}</p>
      <div className="gameover-stats">
        <div><span>TEAM CHAMPIONSHIP</span><strong>{redlineRank ? "P" + redlineRank : "—"} <small>/ 11</small></strong></div>
        <div><span>REDLINE POINTS</span><strong>{redlinePoints}</strong></div>
        <div><span>{race.endReason === "bankruptcy" ? "ROUND REACHED" : "UPGRADES DRAFTED"}</span><strong>{race.endReason === "bankruptcy" ? race.weekendNumber : race.upgradeLevel}</strong></div>
        <div><span>FINAL TEAM BUDGET</span><strong>{money(race.cash)}</strong></div>
      </div>
      <div className="gameover-lower">
        <div><strong>CHAMPIONSHIP ORDER</strong>{teamRankings.map(([team, points], index) => <div className={"team-points-row " + (team === playerTeamName ? "team-points-player" : "")} key={team}><span>{String(index + 1).padStart(2, "0")} · {team}</span><b>{points} PTS</b></div>)}</div>
        <div className="gameover-best"><span>PERSONAL BEST · LOCAL RECORD</span><strong>{bestRun ? bestRun.points + " POINTS" : "FIRST RUN"}</strong><p>{bestRun ? "Best championship score: P" + bestRun.position + " team finish. This record survives a new run on this device." : "Finish a campaign to set your first personal-best record."}</p><button className="primary-button" onClick={() => { setTeamNameDraft(playerTeamName); setPrincipalNameDraft(race.playerPrincipalName ?? principalNameDraft); setOnboardingStep("home"); setShowStartScreen(true); setShowResults(false); setSelectedDraftId(""); }}>START NEW RUN ↗</button></div>
      </div>
    </section>}

    <nav className="mobile-play-dock" aria-label="Quick race controls and game screens">
      {(race.status === "running" || race.status === "paused") && <div className="mobile-dock-timing" aria-label="Live race timing"><div className="mobile-dock-progress"><span>RACE PROGRESS</span><strong>{Math.min(race.lap, race.totalLaps)}<small> / {race.totalLaps} LAPS</small></strong><div className="mobile-dock-progress-track"><i style={{ width: Math.min(100, Math.max(0, race.lap / race.totalLaps * 100)) + "%" }}/></div></div><div className="mobile-dock-best-lap"><span>YOUR BEST LAP</span><strong>{Number.isFinite(bestLap) ? formatLapTime(bestLap) : "—"}</strong></div></div>}
      <div className="mobile-dock-actions">
        <button className="mobile-race-toggle" disabled={race.status === "finished" || race.status === "gameover"} onClick={() => setRace((current) => ({ ...current, status: current.status === "running" ? "paused" : "running" }))}>
          <span>{race.status === "running" ? "Ⅱ" : "▶"}</span>{race.status === "running" ? "PAUSE" : race.status === "paused" ? "RESUME" : race.status === "ready" ? "START RACE" : race.status === "finished" || race.status === "gameover" ? "SESSION ENDED" : "START RACE"}
        </button>
        <div className="mobile-speed-control" aria-label="Simulation speed">
          {[1, 2, 4, 8].map((n) => <button key={n} className={speed === n ? "active" : ""} aria-pressed={speed === n} onClick={() => setSpeed(n)}>{n}×</button>)}
        </div>
      </div>
      <div className="mobile-dock-tabs" role="group" aria-label="Game navigation">
        {([{ id: "race", label: "RACE", hint: "Race overview" }, { id: "strategy", label: "STRATEGY", hint: "Driver strategy" }, { id: "standings", label: "GRID", hint: "Race classification" }, { id: "garage", label: "GARAGE", hint: "Car upgrades" }, { id: "more", label: "MORE", hint: "Events and team intel" }] as const).map((tab) =>
          <button key={tab.id} type="button" className={mobileTab === tab.id ? "active" : ""} aria-label={tab.hint} aria-pressed={mobileTab === tab.id} onClick={() => { setMobileTab(tab.id); window.scrollTo({ top: 0, behavior: "smooth" }); }}>
            <span className="mobile-tab-icon-wrap" aria-hidden="true"><MobileTabIcon id={tab.id} /></span><small>{tab.label}</small>
          </button>
        )}
      </div>
    </nav>
    {showEngineeringCodex && <EngineeringCodex meta={codexMeta} onMetaChange={setCodexMeta} modules={race.upgradeModules ?? { aero: 0, power: 0, suspension: 0, reliability: 0 }} installedUpgrades={race.installedUpgrades ?? []} activeEvolutionIds={race.activeEvolutions ?? []} onClose={() => setShowEngineeringCodex(false)} />}
    {showSaveTransfer && <div className="save-transfer-overlay" role="dialog" aria-modal="true" aria-labelledby="save-transfer-title">
      <section className="save-transfer-panel">
        <div className="save-transfer-heading"><div><span className="section-kicker">CAREER DATA MANAGEMENT</span><h2 id="save-transfer-title">Save <em>& transfer.</em></h2><p>Move your career and permanent Garage blueprints between browsers or devices. No account required.</p></div><button className="save-transfer-close" aria-label="Close save transfer" onClick={() => setShowSaveTransfer(false)}>×</button></div>
        <div className="save-transfer-columns">
          <section className="save-transfer-card"><span className="save-transfer-step">01 / EXPORT</span><h3>Generate a save code</h3><p>Includes your current race or career, car upgrades, standings, research, permanent blueprints and personal best.</p><button className="primary-button" onClick={exportSaveCode}>GENERATE SAVE CODE ↗</button>
            {saveCode && <><label htmlFor="save-code-output">YOUR SAVE CODE</label><textarea id="save-code-output" readOnly value={saveCode} rows={5} onFocus={(event) => event.currentTarget.select()} /><button className="save-transfer-secondary" onClick={() => { if (!navigator.clipboard?.writeText) { setSaveTransferMessage("Select the code above and copy it manually."); return; } void navigator.clipboard.writeText(saveCode).then(() => setSaveTransferMessage("Save code copied to clipboard."), () => setSaveTransferMessage("Select the code above and copy it manually.")); }}>COPY CODE</button></>}
          </section>
          <section className="save-transfer-card"><span className="save-transfer-step">02 / IMPORT</span><h3>Restore a career</h3><p>Paste a previously exported code. We verify it before asking to replace the current local career.</p><label htmlFor="save-code-import">PASTE SAVE CODE</label><textarea id="save-code-import" value={importCode} onChange={(event) => setImportCode(event.target.value)} placeholder="RLP1.… paste your full code here" rows={5} /><button className="primary-button" disabled={!importCode.trim()} onClick={importSaveCode}>VERIFY & IMPORT ↗</button>
          </section>
        </div>
        {saveTransferMessage && <p className="save-transfer-message" role="status">{saveTransferMessage}</p>}
        <div className="save-transfer-footnote"><span><i/> LOCAL AUTOSAVE ACTIVE</span><span>Keep your code private to your own backups; anyone with it can restore that save.</span></div>
      </section>
    </div>}
    <footer className="footer"><span>REDLINE ASCENSION · ROGUELITE MOTORSPORTS MANAGEMENT</span><span>A GAME BY <strong>REDLINE GRID</strong></span></footer>
  </main>;
}

function RaceReport({ race }: { race: RaceState }) {
  const order = standings(race);
  const best = [...race.cars].filter((car) => car.bestLap > 0).sort((a, b) => a.bestLap - b.bestLap)[0];
  const playerBest = [...race.cars].filter((car) => car.playerCar && car.bestLap > 0).sort((a, b) => a.bestLap - b.bestLap)[0];
  const playerPositions = order.map((car, index) => car.playerCar ? index + 1 : 0).filter(Boolean);
  const playerPosition = playerPositions[0] ?? 0;
  return <div className="report-box"><div className="report-heading"><span>POST-RACE ANALYSIS</span><strong>ROUND {String(race.weekendNumber).padStart(2, "0")}</strong></div><h3>{playerPosition <= 3 ? "Good work on the pit wall." : "The data tells a story."}</h3><p>{playerPosition <= 3 ? "A strong result. Keep building on this performance." : playerPosition <= 6 ? "A solid foundation. There is room to improve the next package." : "A difficult result, but useful data for the engineering team."}</p><div className="report-stats"><div><span>BEST LAP</span><strong>{best ? formatLapTime(best.bestLap) : "—"}</strong><small>{best ? best.driver : "No timing"}</small></div><div><span>REDLINE BEST</span><strong>{playerBest ? formatLapTime(playerBest.bestLap) : "—"}</strong><small>{playerBest ? playerBest.driver : "No timing"}</small></div><div><span>TEAM RESULT</span><strong>P{playerPosition} / P{playerPositions[1] ?? "—"}</strong><small>Two-car classification</small></div></div><div className="report-note">Seeded local simulation. This build models pace, tyre wear, fuel, pit stops and a simplified upgrade effect. Full damage, weather and regulations are planned for later.</div></div>;
}
