import { Alignment, EngineAction, EngineContext, EngineResult, Phase, RoleType } from './types';

// Deterministic, pure resolution engine. No IO.
export function resolveNight(
  context: EngineContext,
  pendingActions: EngineAction[],
): EngineResult {
  const errors: string[] = [];
  const deaths: string[] = [];
  const protectedIds: string[] = [];
  const investigations: EngineResult['investigations'] = [];
  const logEntries: EngineResult['logEntries'] = [];

  if (context.phase !== 'NIGHT') {
    return {
      nextPhase: context.phase,
      deaths,
      protected: protectedIds,
      investigations,
      errors: ['Not in night phase'],
      logEntries,
    };
  }

  // Normalize actions by last-write-wins per actor per action type
  const lastByActorType = new Map<string, EngineAction>();
  for (const a of pendingActions) {
    if ('actorId' in a) {
      lastByActorType.set(a.type + ':' + a.actorId, a);
    }
  }
  const actions: EngineAction[] = Array.from(lastByActorType.values());

  // Validate actors are alive and roles permitted
  function getRole(playerId: string) {
    return context.roles[playerId];
  }
  function isAlive(playerId: string) {
    return context.roles[playerId]?.isAlive === true;
  }
  function roleTypeOf(playerId: string): RoleType | undefined {
    return context.roles[playerId]?.roleType;
  }

  const mafiaKillVotes = new Map<string, number>();
  let numLivingMafia = 0;

  // Step 1: Role blocks (e.g., Silencer/Block). We only model BLOCK neutralizer here.
  const blocked = new Set<string>();
  for (const a of actions) {
    if (a.type === 'BLOCK') {
      if (!isAlive(a.actorId)) { errors.push('Blocked: actor dead'); continue; }
      const actorRole = roleTypeOf(a.actorId);
      if (actorRole !== 'SILENCER' && actorRole !== 'WITCH') { errors.push('Blocked: illegal actor'); continue; }
      if (!a.targetId || !isAlive(a.targetId)) { errors.push('Blocked: invalid target'); continue; }
      blocked.add(a.targetId);
      logEntries.push({ message: 'A player was blocked', meta: { targetId: a.targetId } });
    }
  }

  // Count living mafia for majority logic
  for (const [pid, r] of Object.entries(context.roles)) {
    if (r.isAlive && r.alignment === 'MAFIA' && r.roleType === 'MAFIA') numLivingMafia += 1;
  }

  // Step 2: Protections
  for (const a of actions) {
    if (a.type === 'PROTECT') {
      if (!isAlive(a.actorId)) { errors.push('Protect: actor dead'); continue; }
      if (blocked.has(a.actorId)) { errors.push('Protect: actor blocked'); continue; }
      const actorRole = roleTypeOf(a.actorId);
      if (actorRole !== 'DOCTOR' && actorRole !== 'BODYGUARD' && actorRole !== 'WITCH') { errors.push('Protect: illegal actor'); continue; }
      if (!a.targetId || !isAlive(a.targetId)) { errors.push('Protect: invalid target'); continue; }
      if (actorRole === 'DOCTOR' && a.targetId === a.actorId && !context.settings.selfHealAllowed) { errors.push('Protect: self-heal disabled'); continue; }
      protectedIds.push(a.targetId);
    }
  }

  // Step 3: Kills (mafia majority, vigilante, serial killer)
  // Build mafia intent votes
  for (const a of actions) {
    if (a.type === 'KILL') {
      if (!isAlive(a.actorId)) { errors.push('Kill: actor dead'); continue; }
      if (blocked.has(a.actorId)) { errors.push('Kill: actor blocked'); continue; }
      const actorRole = roleTypeOf(a.actorId);
      if (!a.targetId || !isAlive(a.targetId)) { errors.push('Kill: invalid target'); continue; }

      if (actorRole === 'MAFIA') {
        mafiaKillVotes.set(a.targetId, (mafiaKillVotes.get(a.targetId) || 0) + 1);
      } else if (actorRole === 'VIGILANTE' || actorRole === 'SERIAL_KILLER' || actorRole === 'WITCH') {
        // Immediate solo kills if not protected
        if (!protectedIds.includes(a.targetId)) {
          deaths.push(a.targetId);
          logEntries.push({ message: 'A player was killed at night', meta: { targetId: a.targetId, by: actorRole } });
        } else {
          logEntries.push({ message: 'A kill was prevented', meta: { targetId: a.targetId, by: actorRole } });
        }
      } else {
        errors.push('Kill: illegal actor');
      }
    }
  }

  // Resolve mafia majority kill
  if (numLivingMafia > 0) {
    let chosenTarget: string | undefined;
    let topVotes = 0;
    for (const [tid, count] of mafiaKillVotes) {
      if (count > topVotes) { topVotes = count; chosenTarget = tid; }
      else if (count === topVotes) {
        // tie → no kill if majority required
        chosenTarget = undefined;
      }
    }
    const required = context.settings.mafiaMajorityRequired ? Math.floor(numLivingMafia / 2) + 1 : 1;
    if (chosenTarget && topVotes >= required) {
      if (!protectedIds.includes(chosenTarget)) {
        deaths.push(chosenTarget);
        logEntries.push({ message: 'Mafia performed a kill', meta: { targetId: chosenTarget, votes: topVotes } });
      } else {
        logEntries.push({ message: 'Doctor prevented the mafia kill', meta: { targetId: chosenTarget } });
      }
    } else {
      logEntries.push({ message: 'Mafia did not reach majority; no kill' });
    }
  }

  // Step 4: Information reveals (Detective)
  for (const a of actions) {
    if (a.type === 'INVESTIGATE') {
      if (!isAlive(a.actorId)) { errors.push('Investigate: actor dead'); continue; }
      if (blocked.has(a.actorId)) { errors.push('Investigate: actor blocked'); continue; }
      if (!a.targetId || !isAlive(a.targetId)) { errors.push('Investigate: invalid target'); continue; }
      const actorRole = roleTypeOf(a.actorId);
      if (actorRole !== 'DETECTIVE') { errors.push('Investigate: illegal actor'); continue; }
      const target = getRole(a.targetId);
      investigations.push({ actorId: a.actorId, targetId: a.targetId, isMafia: target.alignment === 'MAFIA' });
    }
  }

  const nextPhase: Phase = 'DAWN';
  return { nextPhase, deaths, protected: protectedIds, investigations, errors, logEntries };
}

export function resolveDay(
  context: EngineContext,
  votes: { voterId: string; nomineeId?: string; value: 'LYNCH' | 'NO_LYNCH' }[],
): EngineResult {
  const errors: string[] = [];
  const logEntries: EngineResult['logEntries'] = [];
  if (context.phase !== 'DAY') {
    return { nextPhase: context.phase, deaths: [], protected: [], investigations: [], errors: ['Not in day phase'], logEntries };
  }

  // Only living players count
  const livingVoters = votes.filter((v) => context.roles[v.voterId]?.isAlive);

  // Tally
  const tally = new Map<string, number>();
  let noLynch = 0;
  for (const v of livingVoters) {
    if (v.value === 'NO_LYNCH') {
      noLynch += 1;
    } else if (v.nomineeId && context.roles[v.nomineeId]?.isAlive) {
      tally.set(v.nomineeId, (tally.get(v.nomineeId) || 0) + 1);
    }
  }

  let topTarget: string | undefined;
  let topVotes = 0;
  for (const [nid, count] of tally) {
    if (count > topVotes) { topVotes = count; topTarget = nid; }
    else if (count === topVotes) { topTarget = undefined; }
  }

  const totalLiving = Object.values(context.roles).filter((r) => r.isAlive).length;
  const majority = Math.floor(totalLiving / 2) + 1;
  const deaths: string[] = [];

  if (topTarget && topVotes >= majority) {
    deaths.push(topTarget);
    logEntries.push({ message: 'A player was lynched', meta: { targetId: topTarget, votes: topVotes } });
  } else {
    if (context.settings.tiePolicy === 'NO_LYNCH' || !topTarget) {
      logEntries.push({ message: 'No lynch' });
    } else {
      errors.push('Tie detected, requires revote');
    }
  }

  const nextPhase: Phase = 'NIGHT';
  return { nextPhase, deaths, protected: [], investigations: [], errors, logEntries };
}


