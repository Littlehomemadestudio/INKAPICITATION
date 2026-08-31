'use client';

// ─────────────────────────────────────────────────────────────
// PAPER STORM · THE ARSENAL — recognition plates
// Silhouettes rendered with the game's own drawVehicle/drawShip
// (UnitGlyph 'plate' skin); specifications read straight out of
// UNIT_DEFS — the same numbers the simulation runs on.
// ─────────────────────────────────────────────────────────────

import { UNIT_DEFS, type UnitType } from '@/game/entities/unitDefs';
import { UnitGlyph } from '@/components/game/hud/UnitGlyph';
import Reveal from './Reveal';

function Spec({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline gap-2 border-b border-[#e5e1d3] py-1.5 last:border-b-0">
      <span className="lp-mono w-[86px] shrink-0 text-[8.5px] tracking-[0.22em] text-[#8b8577]">{k}</span>
      <span className="lp-mono text-[10.5px] tracking-[0.08em] text-[#26231c]">{v}</span>
    </div>
  );
}

function Plate({
  type,
  title,
  tags,
  specs,
  glyphW,
  glyphH,
  wide = false,
}: {
  type: UnitType;
  title: string;
  tags: string[];
  specs: [string, string][];
  glyphW: number;
  glyphH: number;
  wide?: boolean;
}) {
  const def = UNIT_DEFS[type];
  return (
    <div
      className={`lp-grain relative flex flex-col bg-[#f3f1ea] ${wide ? 'md:flex-row md:items-center md:gap-10' : ''}`}
    >
      <span className="lp-mono absolute right-4 top-3.5 text-[8.5px] tracking-[0.24em] text-[#8b8577]">
        {def ? def.name.split(' ').slice(-1)[0] : ''}
      </span>
      <div className={`flex items-center justify-center ${wide ? 'md:w-[300px] md:shrink-0' : ''}`}>
        <UnitGlyph type={type} w={glyphW} h={glyphH} skin="plate" />
      </div>
      <div className={`${wide ? 'md:flex-1' : ''} mt-4 md:mt-0`}>
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h3 className="lp-mono text-[13px] font-bold tracking-[0.2em] text-[#17150f]">{title}</h3>
          {tags.map((t) => (
            <span key={t} className="lp-mono border border-[#b9b4a6] px-1.5 py-px text-[7.5px] tracking-[0.18em] text-[#575247]">
              {t}
            </span>
          ))}
        </div>
        <div className="mt-2.5">
          {specs.map(([k, v]) => (
            <Spec key={k} k={k} v={v} />
          ))}
        </div>
      </div>
    </div>
  );
}

export default function Arsenal() {
  const mbt = UNIT_DEFS.M1A2;
  const spg = UNIT_DEFS.M109A7;
  const shorad = UNIT_DEFS.LINEBACKER;
  const cas = UNIT_DEFS.A10C;
  const dd = UNIT_DEFS.DESTROYER;

  return (
    <section id="arsenal" className="relative border-t border-[#d8d4c8] py-24 md:py-32">
      <div className="mx-auto max-w-[1440px] px-6 md:px-10">
        <Reveal>
          <p className="lp-kicker mb-4">03 · The Arsenal</p>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <h2 className="lp-display max-w-[620px] text-[clamp(38px,4.6vw,64px)] font-medium leading-[1.04] text-[#17150f]">
              Recognise every hull
              <br />
              <em className="text-[#575247]">at a glance.</em>
            </h2>
            <p className="lp-mono max-w-[300px] text-[10px] leading-[1.9] tracking-[0.14em] text-[#6b6557]">
              FIELD-MANUAL RECOGNITION PLATES. SPECS BELOW ARE THE
              SIMULATION'S OWN — RANGE IN METRES, SPEED IN M/S, INK
              PAID ON KILL.
            </p>
          </div>
        </Reveal>

        <Reveal delay={120} className="mt-14">
          {/* the featured tank carries the spread; the rest fold in */}
          <div className="grid gap-px border border-[#d8d4c8] bg-[#d8d4c8] md:grid-cols-12">
            <div className="p-8 md:col-span-5 md:p-10">
              <Plate
                type="M1A2"
                title="MAIN BATTLE TANK"
                tags={['BREAKTHROUGH', 'DIRECT FIRE']}
                glyphW={240}
                glyphH={96}
                specs={[
                  ['DESIGNATION', mbt.name],
                  ['GUN RANGE', `${mbt.range} M`],
                  ['ROAD SPEED', `${mbt.speed} M/S`],
                  ['RELOAD', `${mbt.reload} S`],
                  ['INK BOUNTY', `${mbt.bounty}`],
                ]}
              />
            </div>

            <div className="grid gap-px bg-[#d8d4c8] md:col-span-7">
              <div className="grid gap-px md:grid-cols-2">
                <div className="bg-[#f3f1ea] p-7">
                  <Plate
                    type="M109A7"
                    title="SELF-PROPELLED HOWITZER"
                    tags={['155 MM', 'INDIRECT']}
                    glyphW={190}
                    glyphH={72}
                    specs={[
                      ['MAX RANGE', `${spg.range} M`],
                      ['SPLASH', `${spg.splash} M`],
                      ['RELOAD', `${spg.reload} S`],
                    ]}
                  />
                </div>
                <div className="bg-[#f3f1ea] p-7">
                  <Plate
                    type="LINEBACKER"
                    title="SHORAD"
                    tags={['MOBILE', 'AIR DEFENCE']}
                    glyphW={190}
                    glyphH={72}
                    specs={[
                      ['ENVELOPE', `${shorad.aa?.range} M`],
                      ['LOCK TIME', `${shorad.aa?.lock} S`],
                      ['SALVO', `${shorad.ammo} RDS`],
                    ]}
                  />
                </div>
              </div>
              <div className="bg-[#f3f1ea] p-7">
                <Plate
                  type="A10C"
                  title="ATTACK AIRCRAFT"
                  tags={['CAS', 'COMMITTED PASS']}
                  glyphW={200}
                  glyphH={80}
                  specs={[
                    ['STRIKE RANGE', `${cas.range} M`],
                    ['ORDNANCE', `${cas.ammo} × AGM`],
                    ['INK BOUNTY', `${cas.bounty}`],
                  ]}
                />
              </div>
            </div>

            {/* the navy owns the bottom edge, wide */}
            <div className="p-8 md:col-span-12 md:px-10">
              <Plate
                type="DESTROYER"
                title="GUIDED MISSILE DESTROYER"
                tags={['SURFACE COMBAT', 'FLEET DEFENCE', 'NAVAL GUNFIRE']}
                glyphW={340}
                glyphH={84}
                wide
                specs={[
                  ['DESIGNATION', dd.name],
                  ['GUN RANGE', `${dd.range} M`],
                  ['DISPLACEMENT POWER', `${dd.damage} × MOUNTS`],
                  ['INK BOUNTY', `${dd.bounty}`],
                ]}
              />
            </div>
          </div>

          <p className="lp-mono mt-5 text-[9px] tracking-[0.24em] text-[#8b8577]">
            + INFANTRY · RECON · GUN AA · SAM UMBRELLAS · FIVE NAVAL HULLS —
            THE FULL ORDER OF BATTLE LIVES IN-GAME, PRICED IN INK. [R]
          </p>
        </Reveal>
      </div>
    </section>
  );
}
