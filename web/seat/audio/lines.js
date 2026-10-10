// ATC line table. {CS} = callsign + flight digits. Each line has display text and a spoken form.
const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const SIDE = { L: 'left', R: 'right', C: 'centre' };

const CITY = { CCJ: 'Calicut', COK: 'Cochin', DXB: 'Dubai' };

export const LINES = {
  gate:      '{CS}, {DEP} Tower, runway {DEPRWY}, line up and wait.',
  takeoff:   '{CS}, wind calm, runway {DEPRWY}, cleared for takeoff.',
  departure: '{CS}, contact departure. Good flight.',
  handoff:   '{CS}, Muscat Control, radar contact, maintain flight level 360.',
  tod:       '{CS}, Dubai Approach, descend to 3000 feet, cleared ILS runway {ARRRWY}.',
  land:      '{CS}, runway {ARRRWY}, wind calm, cleared to land.',
  high:      "{CS}, you're high on the glide path.",
  low:       "{CS}, you're low on the glide path, check altitude.",
  fast:      '{CS}, reduce speed.',
  slow:      '{CS}, increase speed.',
  centre:    '{CS}, correct to the centreline.',
  goaround:  '{CS}, go around, go around. Vectors for another approach.',
  welcome:   '{CS}, welcome to Dubai. Taxi to the gate.',
};

const spellDigits = s => String(s).split('').map(c => DIGITS[+c] ?? SIDE[c] ?? c).join(' ');

export function callsign(config, route) {
  const digits = route.flightNo.replace(/\D/g, '');
  return { text: `${config.CALLSIGN} ${digits}`, speech: `${config.CALLSIGN} ${spellDigits(digits)}` };
}

/** @returns {{id:string, text:string, speech:string}} */
export function line(id, config, route) {
  const tpl = LINES[id];
  if (!tpl) return null;
  const cs = callsign(config, route);
  const fill = spoken => tpl
    .replace('{CS}', spoken ? cs.speech : cs.text)
    .replace('{DEP}', CITY[route.from] || route.from)
    .replace(/\{DEPRWY\}/g, spoken ? spellDigits(route.depRwy) : route.depRwy)
    .replace(/\{ARRRWY\}/g, spoken ? spellDigits(route.arrRwy) : route.arrRwy);
  return { id, text: fill(false), speech: fill(true).replace('3000', 'three thousand').replace('360', 'three six zero') };
}
