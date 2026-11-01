// Fit maths for tops (T-shirts, shirts, sweatshirts, dresses), jackets, coats and trousers, ported from the
// Rails app's Fit module (app/models/fit.rb) so it can run without it: in the small Node API (apps/api), and
// in the page itself. Everything is in centimetres. Pure functions, no DOM.
//
// Ease is the garment's measurement minus the body's. A jacket needs some ease to move in; how much depends
// on the cut. Parts a tailor can change (sleeves, waist) cost little when they're off; parts they can't
// (shoulders, chest, length) cost a lot.
//
// Ranges are [min, max], both ends included (Ruby's a..b). Numbers are rounded as Ruby rounds them (halves
// away from zero), so the results match the Rails API's.
//
// Nothing here keeps the measurements it's given.

export const CUTS = {
  slim: { label: "Slim", chest: [6, 10], waist: [6, 11] },
  regular: { label: "Regular", chest: [9, 13], waist: [10, 15] },
  classic: { label: "Classic", chest: [12, 17], waist: [14, 20] }
}

// What to ask for: the range of answers the API accepts, the range most adults fall in (outside it, the page
// asks whether it was measured right), and how to measure it. Hips and inseam are only needed for trousers.
export const MEASUREMENTS = [
  { key: "chest", label: "Chest", help: "Around the fullest part, under the arms.", range: [60, 200], usual: [80, 135],
    how: "around the fullest part of the chest, under the arms, with the tape level" },
  { key: "waist", label: "Waist", help: "Around your middle, at the navel.", range: [50, 200], usual: [60, 130],
    how: "around your middle at the navel, tape snug but not tight" },
  { key: "shoulders", label: "Shoulders", help: "Across the back, shoulder bone to shoulder bone.", range: [30, 70], usual: [38, 54],
    how: "straight across the back from one shoulder bone to the other, not around the arms" },
  { key: "arm", label: "Arm", help: "Shoulder bone to wrist bone, arm relaxed.", range: [40, 90], usual: [52, 72],
    how: "from the shoulder bone to the wrist bone with the arm hanging" },
  { key: "height", label: "Height", help: "Standing, without shoes.", range: [130, 230], usual: [150, 205],
    how: "standing straight against a wall, without shoes" },
  { key: "hips", label: "Hips", help: "Around the fullest part of the seat. For trousers.", range: [60, 200], usual: [82, 135],
    optional: true, how: "around the fullest part of the seat, feet together" },
  { key: "inseam", label: "Inseam", help: "Crotch to floor, inside the leg. For trousers.", range: [50, 110], usual: [66, 92],
    optional: true, how: "from the crotch down the inside of the leg to the floor, without shoes" }
]

// What a size chart gives for each size: finished garment measurements in centimetres.
export const SIZE_MEASUREMENTS = ["chest", "waist", "shoulders", "sleeve", "length"]
export const TROUSER_MEASUREMENTS = ["waist", "seat", "thigh", "inseam", "leg_opening"]
// The columns a chart sent for a garment may have (the Rails app's ChartReader.measures), the first required.
export const CHART_COLUMNS = {
  jacket: ["chest", "waist", "shoulders", "sleeve", "length"],
  trousers: ["waist", "seat", "thigh", "inseam", "leg_opening", "rise", "length"]
}
export const KINDS = ["top", "jacket", "coat", "trousers"]

// Leggings stretch over the body: made a little smaller than it, at the waist and the seat.
const LEGGINGS_WAIST_EASE = [-12, 1]
const LEGGINGS_SEAT_EASE = { slim: [-16, -4], regular: [-14, -2], classic: [-10, 1] }
// An elastic waist (joggers, sweatpants, pull-on pants) is made smaller than the body and stretches on, by about
// 8% of the body's waist; past that it's tight, and a tailor can't let it out. It may be up to 6 cm bigger than
// the body, gathered in by its cord. Within that, the size that stretches a little under halfway wins a tie.
const ELASTIC_STRETCH = 0.08
const ELASTIC_ROOM = 6
const ELASTIC_AIM = 0.4
const ELASTIC_TIE = 0.1
// The cloth under an elastic waist is gathered in, so pull-on pants are made this much fuller over the seat.
const GATHERED_SEAT = 8
// The knee is about this share of the way down from the crotch to the floor.
const KNEE_SHARE = 0.47

// Trousers sit at the waist with a little room, need more over the seat (by cut), and break just above the
// shoe: about 3 cm shorter than the inseam measured to the floor.
const TROUSER_WAIST_EASE = [0, 3]
const SEAT_EASE = { slim: [3, 7], regular: [6, 10], classic: [9, 14] }
// Pants made loose on purpose (baggy, wide-leg, pleated): 20 cm or more over the seat is how they're meant to be.
const LOOSE_SEAT_EASE = [8, 34]
const HEM_ABOVE_FLOOR = 3
const HEM_TOLERANCE = 1.5
const LEG_OPENINGS = [[38, "a slim, tapered leg"], [44, "a straight leg"], [Infinity, "a wide leg"]]

// Rules of thumb a tailor would use.
const SHOULDER_EASE = [-0.75, 1.5]   // seam sits on the shoulder bone or just past it
const SLEEVE_ABOVE_WRIST = 1.5       // sleeve ends ~1.5 cm above the wrist bone, showing shirt cuff
const SLEEVE_TOLERANCE = 1
const LENGTH_PER_HEIGHT = 0.43       // jacket back length is about 43% of height
const LENGTH_TOLERANCE = 2
const ALTERATIONS = {
  waist: { loose: ["take_in_waist", "Take in the waist", 5], tight: ["let_out_waist", "Let out the waist", 2.5] },
  trouser_waist: { loose: ["take_in_waist", "Take in the waist", 5], tight: ["let_out_waist", "Let out the waist", 3] },
  // Through the centre back seam, which trousers are made with extra in for this.
  seat: { loose: ["take_in_seat", "Take in the seat", 6] },
  inseam: { long: ["shorten_hem", "Take up the hem", 15], short: ["lengthen_hem", "Let down the hem", 4] },
  sleeve: { long: ["shorten_sleeves", "Shorten the sleeves", 5], short: ["lengthen_sleeves", "Lengthen the sleeves", 3] }
}

// A coat goes over a jacket, so it needs this much more room in the chest and waist. Its length is a matter of
// style, so Fitroom says where it ends rather than calling it right or wrong.
const COAT_EXTRA_EASE = 7
const NECK_BASE_PER_HEIGHT = 0.835   // the collar seam sits at about 83.5% of height
const HEMLINES = [
  [0.47, "at the hip"], [0.40, "at the seat"], [0.34, "mid-thigh"], [0.29, "just above the knee"],
  [0.25, "at the knee"], [0.19, "below the knee"], [0.12, "mid-calf"], [0.07, "low on the calf"],
  [0.0, "at the ankle"]
]

// Tops are worn closer or looser than tailoring, and how much is mostly style: these are the usual ranges.
const TOP_CUTS = { slim: { chest: [4, 9], waist: [4, 10] }, regular: { chest: [8, 15], waist: [8, 18] }, classic: { chest: [14, 26], waist: [14, 30] } }
// A dress sits closer than a T-shirt.
const DRESS_CUTS = { slim: { chest: [2, 6], waist: [2, 7] }, regular: { chest: [4, 9], waist: [4, 11] }, classic: { chest: [7, 14], waist: [8, 16] } }
// A women's top sits closer than a men's.
const WOMEN_TOP_CUTS = { slim: { chest: [0, 6], waist: [0, 8] }, regular: { chest: [3, 10], waist: [4, 14] }, classic: { chest: [8, 18], waist: [10, 24] } }
// A baby tee's stretchy knit is made about the size of the body, or a little smaller.
const SNUG_TOP_CUTS = { slim: { chest: [-7, 1], waist: [-6, 4] }, regular: { chest: [-5, 4], waist: [-4, 8] }, classic: { chest: [-2, 8], waist: [0, 12] } }
const SNUG_SHORT = 10                  // and may end this much higher than a women's top usually does
const SNUG_SHOULDER_EASE = [-5, 3]     // its shoulder seams sit a little in from the shoulder
// A fitted knit: made a little smaller than the body, and stretches on. Its chest as a share of the body's, by
// how close it's worn; the size nearest the aim wins a tie.
const FITTED_KNIT_SHARE = { slim: [-0.12, -0.02], regular: [-0.09, 0.02], classic: [-0.05, 0.05] }
const FITTED_KNIT_AIM = { slim: -0.08, regular: -0.05, classic: -0.01 }
const FITTED_KNIT_SHOULDER_EASE = [-2, 2]
const FITTED_KNIT_TIE = 0.2
const TOP_SHOULDER_EASE = [-1, 5]
const TOP_LENGTH_PER_HEIGHT = 0.41
const TOP_LENGTH_TOLERANCE = 4
// A women's top usually ends higher, at the top of the hip.
const WOMEN_TOP_LENGTH_PER_HEIGHT = 0.36
const SHORT_SLEEVE = 40   // a sleeve shorter than this (cm, from the shoulder seam) is a short sleeve

// Penalty per centimetre outside the target, plus a flat cost when no tailor can fix it.
const WEIGHT = { shoulders: 4, chest: 3, length: 2, waist: 1, sleeve: 0.5, trouser_waist: 2, elastic_waist: 2, seat: 2, stretch_seat: 2, inseam: 0.4, hips: 2 }
const UNFIXABLE = 6

// A women's jacket usually ends higher, at the top of the hip.
const WOMEN_JACKET_LENGTH_PER_HEIGHT = 0.37
// Where a jacket made to end at the waist ends, by its length as a share of the height: the first it's under.
const WAIST_HEMLINES = [[0.27, "Cropped. It ends above your waist."], [0.32, "Made short. It ends at your waist."],
  [0.38, "Made short. It ends at the top of your hips."], [Infinity, "It ends at your hips."]]

// A stretch dress is made smaller than the body and stretches onto it: its chest, waist and hips as a share
// of the body's, by how close it's worn.
const STRETCH_SHARE = { slim: [-0.12, -0.03], regular: [-0.09, 0.01], classic: [-0.05, 0.05] }
const DRESS_HIPS = { slim: [2, 6], regular: [3, 10], classic: [6, 16] }
const NO_SLEEVES = { none: "Sleeveless", straps: "Straps, no sleeves", thin_straps: "Thin straps, no sleeves",
  strapless: "Strapless", one_shoulder: "One shoulder", halter: "Halter, no sleeves" }
const STRAPLESS_TOP = 18   // cm: a strapless dress's length is measured from its top edge, this far below the shoulder

// The usual body for each letter size: [chest, shoulders] in cm, a men's and a women's.
const LETTER_BODY = { XXS: [81, 40], XS: [86, 41], S: [91, 43], M: [97, 45], L: [104, 47], XL: [112, 49], XXL: [120, 51], XXXL: [128, 53] }
const WOMEN_LETTER_BODY = { XXS: [78, 36], XS: [82, 37], S: [87, 38], M: [92, 39.5], L: [98, 41], XL: [104, 42.5], XXL: [110, 44], XXXL: [116, 45.5] }
// Italian and French men's sizes (44 to 60) are half the chest they're made for; the shoulders grow about 1 cm
// a size from 45 cm at a 48.
const NUMBERED = /^(4[2-9]|5\d|6[0-2])\b/
// This much more chest than its size's usual body (cm): made roomy; or any more than a regular cut's when the
// shop says it's oversized.
const ROOMY = 25
const ROOMY_WOMEN = 18
const OVERSIZED = { men: 15, women: 10 }
const DROPPED = 8          // this much wider shoulders than its size's usual body: a dropped shoulder
const ROOMY_CUT = { slim: -6, regular: 0, classic: 6 }   // Snug sizes down, Loose sizes up
const ROOMY_EASE = [-5, 7] // around the room it's made with
const BOXY_SHORT = 10      // a roomy top may be cut this much shorter than usual (boxy)

// ---------------------------------------------------------------------------------------------------------

// Ruby's Float#round(digits): halves away from zero, by its own routine (round_half_up in Ruby's float.c), so a
// number on the edge rounds the same way here as there.
export function round(x, digits = 0) {
  if (!Number.isFinite(x)) return x
  if (digits === 0) return Math.sign(x) * Math.round(Math.abs(x)) || 0
  const s = 10 ** digits
  let f = Math.sign(x * s) * Math.round(Math.abs(x * s))
  if (x > 0 && (f + 0.5) / s <= x) f += 1
  if (x < 0 && (f - 0.5) / s >= x) f -= 1
  return f / s || 0
}

const covers = ([min, max], value) => value >= min && value <= max
const flag = (details, key) => details?.[key] === true || details?.[key] === "true"
const text = value => (value === null || value === undefined ? "" : String(value))
// Ruby's Array#sum of floats: compensated (Kahan-Babuska), so the total rounds as it does there.
function sum(list) {
  let total = 0, carry = 0
  for (const { penalty: x } of list) {
    const t = total + x
    carry += Math.abs(total) >= Math.abs(x) ? (total - t) + x : (x - t) + total
    total = t
  }
  return total + carry
}
const pick = (table, key) => {
  if (!(key in table)) throw new RangeError(`unknown cut: ${key}`)
  return table[key]
}

function makeCheck({ part, label, ease = null, status, fix = null, penalty = 0, note = null, good = null }) {
  return { part, label, ease, status, fix, penalty, note, good }
}
const fixable = c => c.status === "good" || c.status === "unknown" || c.fix !== null
const result = (size, checks) => ({ size: size.name, checks, penalty: round(sum(checks), 2) })

// "fits" as it comes, "alter" with a tailor's help, or "compromise" when something can't be fixed.
export function verdict(found) {
  if (!found.checks.every(fixable)) return "compromise"
  return found.checks.some(c => c.fix) ? "alter" : "fits"
}

function check(part, label, ease, status, fix = null, penalty = 0, good = null) {
  return makeCheck({ part, label, ease: round(ease, 2), status, fix, penalty: round(penalty, 2), good })
}

function given(size, part, label, then) {
  const value = size[part]
  if (value === null || value === undefined) return makeCheck({ part, label, status: "unknown" })
  return then(value)
}

function needs(part, label, measurement) {
  return makeCheck({ part, label, status: "unknown", note: `Add your ${measurement} to check this` })
}

function altered(rule, label, ease, status, off, shownAs = null, good = null) {
  const [action, words, limit] = ALTERATIONS[rule]?.[status] ?? []
  if (action && off <= limit) {
    return check(shownAs ?? rule, label, ease, status, { action, text: words, amount: round(off, 2) }, off * WEIGHT[rule], good)
  }
  return check(shownAs ?? rule, label, ease, status, null, off * WEIGHT[rule] + UNFIXABLE, good)
}

// rule: which weight and alterations apply; shownAs: the part name the API reports, when it differs.
function rangeCheck(rule, label, ease, range, shownAs = null) {
  if (covers(range, ease)) return check(shownAs ?? rule, label, ease, "good", null, 0, range)
  const status = ease < range[0] ? "tight" : "loose"
  const off = ease < range[0] ? range[0] - ease : ease - range[1]
  return altered(rule, label, ease, status, off, shownAs, range)
}

function sleeveCheck(diff) {
  const good = [-SLEEVE_TOLERANCE, SLEEVE_TOLERANCE]
  if (Math.abs(diff) <= SLEEVE_TOLERANCE) return check("sleeve", "Sleeves", diff, "good", null, 0, good)
  return altered("sleeve", "Sleeves", diff, diff > 0 ? "long" : "short", Math.abs(diff), null, good)
}

function lengthCheck(diff) {
  const good = [-LENGTH_TOLERANCE, LENGTH_TOLERANCE]
  if (Math.abs(diff) <= LENGTH_TOLERANCE) return check("length", "Length", diff, "good", null, 0, good)
  return altered("length", "Length", diff, diff > 0 ? "long" : "short", Math.abs(diff) - LENGTH_TOLERANCE, null, good)
}

function hemCheck(diff) {
  const good = [-HEM_TOLERANCE, HEM_TOLERANCE]
  if (Math.abs(diff) <= HEM_TOLERANCE) return check("inseam", "Length", diff, "good", null, 0, good)
  return altered("inseam", "Length", diff, diff > 0 ? "long" : "short", Math.abs(diff) - HEM_TOLERANCE, null, good)
}

function coatLength(length, height) {
  const hem = (height * NECK_BASE_PER_HEIGHT - length) / height
  const where = HEMLINES.find(([share]) => hem >= share)?.[1] ?? HEMLINES.at(-1)[1]
  return makeCheck({ part: "length", label: "Length", ease: round(length - height * LENGTH_PER_HEIGHT, 2), status: "good", note: `Ends ${where}` })
}

// Where a skirt ends, from the waist down: the knee is about a little under a third of the height below it (or
// the inseam's share, when given).
export function skirtLength(length, inseam, height) {
  const knee = inseam ? inseam * (1 - KNEE_SHARE) + height * 0.13 : height * 0.32
  const above = round(knee - length)
  let note = above >= 3 ? `Ends about ${above} cm above the knee` : above <= -3 ? `Ends about ${-above} cm below the knee` : "Ends at the knee"
  if (length > knee + 25) note = "Ends near the ankle"
  return makeCheck({ part: "length", label: "Length", ease: round(length - knee, 1), status: "good", note })
}

// Where shorts end: above or at the knee, said in centimetres.
export function shortsLength(inseam, leg) {
  const above = round(leg * KNEE_SHARE - inseam)
  const note = above >= 2 ? `Ends about ${above} cm above the knee` : above <= -2 ? `Ends about ${-above} cm below the knee` : "Ends at the knee"
  return makeCheck({ part: "inseam", label: "Length", ease: round(inseam - leg * KNEE_SHARE, 1), status: "good", note })
}

// A jacket made to end at the waist: where it ends, not right or wrong.
function waistLength(length, diff, height) {
  const note = WAIST_HEMLINES.find(([share]) => length < height * share)[1]
  return makeCheck({ part: "length", label: "Length", ease: round(diff, 2), status: "good", note })
}

// A chest made roomy on purpose (see design): judged against the room it's made with, the size nearest it first.
function roomyChest(ease, roomy, cut) {
  const aim = roomy + pick(ROOMY_CUT, cut)
  let found = rangeCheck("chest", "Chest", ease, [aim + ROOMY_EASE[0], aim + ROOMY_EASE[1]])
  found = { ...found, penalty: round(found.penalty + Math.abs(ease - aim) * 0.05, 2) }
  return found.status === "good" ? { ...found, note: "Made to be big and loose. On you, it's loose the way it should be." } : found
}

// A jacket or coat. design: how its sizes are cut (see design). style: how it looks ("bomber"). details:
// { women, cropped, ends: "waist" (made to end at the waist: a track jacket, a blouson) }.
export function checkSize(body, size, cut = "regular", garment = "jacket", design = {}, { style = null, details = {} } = {}) {
  const coat = garment === "coat"
  let { chest: chestRange, waist: waistRange } = pick(CUTS, cut)
  if (coat) {
    chestRange = [chestRange[0] + COAT_EXTRA_EASE, chestRange[1] + COAT_EXTRA_EASE]
    waistRange = [waistRange[0] + COAT_EXTRA_EASE, waistRange[1] + COAT_EXTRA_EASE]
  }
  const roomy = coat ? null : design?.roomy ?? null
  const dropped = coat ? false : design?.dropped ?? null
  const women = flag(details, "women")
  const shortByDesign = !coat && (flag(details, "cropped") || text(details?.ends) === "waist" || style === "bomber")
  const checks = [
    given(size, "shoulders", "Shoulders", shoulders => {
      if (dropped) return { ...check("shoulders", "Shoulders", shoulders - body.shoulders, "good"), note: "The shoulder seam is made to sit down the arm." }
      return rangeCheck("shoulders", "Shoulders", shoulders - body.shoulders, SHOULDER_EASE)
    }),
    given(size, "chest", "Chest", chest => roomy ? roomyChest(chest - body.chest, roomy, cut) : rangeCheck("chest", "Chest", chest - body.chest, chestRange)),
    given(size, "waist", "Waist", waist => rangeCheck("waist", "Waist", waist - body.waist, roomy ? [waistRange[0] + roomy, waistRange[1] + roomy] : waistRange)),
    given(size, "sleeve", "Sleeves", sleeve => sleeveCheck(sleeve - (body.arm - SLEEVE_ABOVE_WRIST))),
    given(size, "length", "Length", length => {
      if (coat) return coatLength(length, body.height)
      const diff = length - body.height * (women ? WOMEN_JACKET_LENGTH_PER_HEIGHT : LENGTH_PER_HEIGHT)
      if (shortByDesign && diff < 0) return waistLength(length, diff, body.height)
      if ((roomy || dropped) && diff < 0 && diff >= -BOXY_SHORT) return { ...check("length", "Length", diff, "good"), note: "Made short and boxy. It ends at your hips." }
      return lengthCheck(diff)
    })
  ]
  return result(size, checks)
}

// An elastic waist against the body's: within its stretch, the size nearest the aim first.
function elasticWaist(ease, waist) {
  const stretch = round(waist * ELASTIC_STRETCH, 1)
  let found = rangeCheck("elastic_waist", "Waist", ease, [-stretch, ELASTIC_ROOM], "waist")
  found = { ...found, penalty: round(found.penalty + Math.abs(ease + stretch * ELASTIC_AIM) * ELASTIC_TIE, 2) }
  return found.status === "good" && ease < 0 ? { ...found, note: "The elastic waist stretches to fit" } : found
}

// Leggings' seat: made smaller than the body, it stretches on.
function stretchSeat(ease, cut) {
  const found = rangeCheck("stretch_seat", "Seat", ease, pick(LEGGINGS_SEAT_EASE, cut), "seat")
  return found.status === "good" ? { ...found, note: "Stretches to fit close to the body" } : found
}

// Pants sold long, to be hemmed to the wearer: their length is a note, not a fault.
function unhemmed(inseam, leg) {
  const hem = round(leg - HEM_ABOVE_FLOOR)
  return makeCheck({ part: "inseam", label: "Length", ease: round(inseam - hem, 2), status: "good", note: `Comes unhemmed. Have it hemmed to about ${hem} cm.` })
}

// style: "shorts" (their length is where they end), "leggings" (stretch, made smaller than the body), "skirt",
// or another (trousers, jeans, joggers). details: { elastic (pull-on), fit: "loose" or "slim", hem: "unfinished" }.
export function checkTrousers(body, size, cut = "regular", { style = null, details = {} } = {}) {
  const stretch = style === "leggings"
  const elastic = style === "joggers" || flag(details, "elastic")
  const made = style === "skirt" || stretch ? null : text(details?.fit)
  const checks = [
    given(size, "waist", "Waist", waist => {
      if (!elastic) return rangeCheck("trouser_waist", "Waist", waist - body.waist, stretch ? LEGGINGS_WAIST_EASE : TROUSER_WAIST_EASE, "waist")
      return elasticWaist(waist - body.waist, body.waist)
    }),
    given(size, "seat", "Seat", seat => {
      if (!body.hips) return needs("seat", "Seat", "hips")
      if (stretch) return stretchSeat(seat - body.hips, cut)
      let range = made === "loose" ? LOOSE_SEAT_EASE : pick(SEAT_EASE, made === "slim" ? "slim" : cut)
      if (elastic && made !== "loose") range = [range[0], range[1] + GATHERED_SEAT]
      const found = rangeCheck("seat", "Seat", seat - body.hips, range)
      if (found.status === "good" && made === "loose" && seat - body.hips > SEAT_EASE.classic[1]) return { ...found, note: "Cut loose over the seat, as it's meant to be" }
      return found
    }),
    style === "skirt" ? given(size, "length", "Length", length => skirtLength(length, body.inseam, body.height)) : null,
    style === "skirt" ? null : given(size, "inseam", "Length", inseam => {
      if (!body.inseam) return needs("inseam", "Length", "inseam")
      if (style === "shorts") return shortsLength(inseam, body.inseam)
      if (text(details?.hem) === "unfinished") return unhemmed(inseam, body.inseam)
      return hemCheck(inseam - (body.inseam - HEM_ABOVE_FLOOR))
    }),
    style === "skirt" ? null : given(size, "leg_opening", "Leg", opening => {
      const leg = LEG_OPENINGS.find(([limit]) => opening < limit)[1]
      return makeCheck({ part: "leg_opening", label: "Leg", status: "good", note: `Cut with ${leg}` })
    })
  ].filter(Boolean)
  return result(size, checks)
}

// A dress: bust, waist and hips (it sits on all three), sleeves and shoulders only when it has sleeves, and its
// length as where it ends. A stretch dress may be smaller than the body; a flared one free at the hips.
export function checkDress(body, size, cut = "regular", details = {}) {
  const stretch = flag(details, "stretch")
  const sleeves = text(details?.sleeves)
  const flared = text(details?.fit) === "flared"
  const ranges = pick(DRESS_CUTS, cut)
  const around = (rule, label, value, own, plain) => {
    if (!own) return needs(rule, label, rule)
    const range = stretch ? (([lo, hi]) => [own * lo, own * hi])(pick(STRETCH_SHARE, cut)) : plain
    const found = rangeCheck(rule, label, value - own, range)
    return stretch && found.status === "good" && value < own ? { ...found, note: "Stretches to fit close to the body" } : found
  }
  const checks = [
    given(size, "chest", "Bust", chest => around("chest", "Bust", chest, body.chest, ranges.chest)),
    given(size, "waist", "Waist", waist => flared && !stretch ? rangeCheck("waist", "Waist", waist - body.waist, ranges.waist) : around("waist", "Waist", waist, body.waist, ranges.waist)),
    size.hips ? given(size, "hips", "Hips", hips => around("hips", "Hips", hips, body.hips, flared ? [2, 80] : pick(DRESS_HIPS, cut))) : null,
    ...(sleeves in NO_SLEEVES ? [makeCheck({ part: "sleeve", label: "Sleeves", status: "good", note: NO_SLEEVES[sleeves] })] : [
      given(size, "shoulders", "Shoulders", shoulders => rangeCheck("shoulders", "Shoulders", shoulders - body.shoulders, TOP_SHOULDER_EASE)),
      given(size, "sleeve", "Sleeves", sleeve => {
        if (sleeve < SHORT_SLEEVE) return makeCheck({ part: "sleeve", label: "Sleeves", status: "good", note: "Short sleeves" })
        return sleeveCheck(sleeve - body.arm)
      })
    ]),
    given(size, "length", "Length", length => coatLength(length + (sleeves === "strapless" ? STRAPLESS_TOP : 0), body.height))
  ].filter(Boolean)
  return result(size, checks)
}

// The usual body [chest, shoulders] a size is made for, from its name; null when the name isn't a size
// Fitroom knows.
export function sizeBody(name, women = false, { numbered = true } = {}) {
  const label = text(name).toUpperCase().trim()
  const letter = label.match(/^(XXXL|3XL|XXL|2XL|XL|XXS|2XS|XS|S|M|L)\b/)?.[1]?.replace("3XL", "XXXL").replace("2XL", "XXL").replace("2XS", "XXS")
  if (letter) return (women ? WOMEN_LETTER_BODY : LETTER_BODY)[letter] ?? null
  const n = label.match(NUMBERED)?.[1]
  if (women || !numbered || !n) return null
  return [Number(n) * 2, 45 + (Number(n) - 48) / 2]
}

// How a top's or a jacket's sizes are cut: { roomy: the extra chest it's made with (cm), or null; dropped },
// from each size's chart against the body that size is for. details: dropped (its photo shows dropped
// shoulders), women, fit: "oversized" (the shop says it's oversized or boxy).
export function design(sizes, details = {}) {
  const women = flag(details, "women")
  // (Numbers that stop below 50 are more likely a shirt's collar.)
  const italian = sizes.some(size => /^(5\d|6[0-2])\b/.test(text(size.name).trim()))
  const known = sizes.map(size => [size, sizeBody(size.name, women, { numbered: italian })]).filter(([, body]) => body)
  const chest = known.filter(([size]) => isNumber(size.chest)).map(([size, [c]]) => size.chest - c).sort((a, b) => a - b)
  const shoulders = known.filter(([size]) => isNumber(size.shoulders)).map(([size, [, s]]) => size.shoulders - s).sort((a, b) => a - b)
  const middle = chest[Math.floor(chest.length / 2)]
  const said = text(details?.fit) === "oversized"
  const roomy = middle !== undefined && (middle >= (women ? ROOMY_WOMEN : ROOMY) || (said && middle > OVERSIZED[women ? "women" : "men"])) ? middle : null
  return { roomy, dropped: flag(details, "dropped") || (shoulders.length > 0 && shoulders[Math.floor(shoulders.length / 2)] >= DROPPED) }
}

const isNumber = value => typeof value === "number" && Number.isFinite(value)

// A T-shirt, shirt, sweatshirt or other top. Short sleeves end on the upper arm, so they aren't checked against
// the arm. details: { women, cropped, snug (a baby tee), fit: "fitted" with stretch: a fitted knit }.
export function checkTop(body, size, cut = "regular", design = {}, { style = null, details = {} } = {}) {
  const women = flag(details, "women")
  const cropped = flag(details, "cropped")
  let snug = flag(details, "snug")
  const { roomy = null, dropped = null } = design ?? {}
  // A chart made roomy says more than a listing's "fitted".
  const knit = !roomy && text(details?.fit) === "fitted" && flag(details, "stretch")
  snug ||= knit
  const ranges = pick(style === "dress" ? DRESS_CUTS : snug ? SNUG_TOP_CUTS : women ? WOMEN_TOP_CUTS : TOP_CUTS, cut)
  const checks = [
    given(size, "shoulders", "Shoulders", shoulders => {
      if (dropped) return { ...check("shoulders", "Shoulders", shoulders - body.shoulders, "good"), note: "The shoulder seam is made to sit down the arm." }
      return rangeCheck("shoulders", "Shoulders", shoulders - body.shoulders, knit ? FITTED_KNIT_SHOULDER_EASE : snug ? SNUG_SHOULDER_EASE : TOP_SHOULDER_EASE)
    }),
    given(size, "chest", "Chest", chest => {
      if (knit) {
        const share = pick(FITTED_KNIT_SHARE, cut)
        let found = rangeCheck("chest", "Chest", chest - body.chest, [body.chest * share[0], body.chest * share[1]])
        found = { ...found, penalty: round(found.penalty + Math.abs(chest - body.chest * (1 + pick(FITTED_KNIT_AIM, cut))) * FITTED_KNIT_TIE, 2) }
        return found.status === "good" && chest < body.chest ? { ...found, note: "A fitted knit: it stretches to fit close to the body." } : found
      }
      return roomy ? roomyChest(chest - body.chest, roomy, cut) : rangeCheck("chest", "Chest", chest - body.chest, ranges.chest)
    }),
    given(size, "waist", "Waist", waist => rangeCheck("waist", "Waist", waist - body.waist, roomy ? [ranges.waist[0] + roomy, ranges.waist[1] + roomy] : ranges.waist)),
    given(size, "sleeve", "Sleeves", sleeve => {
      if (sleeve < SHORT_SLEEVE) return makeCheck({ part: "sleeve", label: "Sleeves", status: "good", note: "Short sleeves" })
      // Long sleeves end at the wrist bone. A dropped shoulder's sleeve starts down the arm.
      const start = dropped && size.shoulders ? (size.shoulders - body.shoulders) / 2 : 0
      return sleeveCheck(sleeve + start - body.arm)
    }),
    given(size, "length", "Length", length => {
      if (style === "dress") return coatLength(length, body.height)
      const diff = length - body.height * (women ? WOMEN_TOP_LENGTH_PER_HEIGHT : TOP_LENGTH_PER_HEIGHT)
      if (cropped) return { ...check("length", "Length", diff, "good"), note: "Cropped. It's made to end above your waist." }
      if (snug && diff >= -SNUG_SHORT && diff <= TOP_LENGTH_TOLERANCE) {
        return { ...check("length", "Length", diff, "good"), note: knit ? "Made short, to end near your waist." : "A baby tee: made short, to end near your waist." }
      }
      const good = [-TOP_LENGTH_TOLERANCE, TOP_LENGTH_TOLERANCE]
      if (Math.abs(diff) <= TOP_LENGTH_TOLERANCE) return check("length", "Length", diff, "good", null, 0, good)
      if ((roomy || dropped) && diff < 0 && diff >= -BOXY_SHORT) return { ...check("length", "Length", diff, "good"), note: "Made short and boxy. It ends at your hips." }
      return check("length", "Length", diff, diff > 0 ? "long" : "short", null, (Math.abs(diff) - TOP_LENGTH_TOLERANCE) * WEIGHT.length, good)
    })
  ]
  return result(size, checks)
}

// Every size, best first (sizes that tie keep the chart's order).
// style: how a top is cut, when it changes what fits ("dress"). details: a dress's cut ({ stretch, sleeves,
// fit }), or how a top, jacket or pants are made (see checkTop, checkSize, checkTrousers).
export function rank(body, sizes, cut = "regular", garment = "jacket", { style = null, details = {} } = {}) {
  let cuts = null
  const results = sizes.map(size => {
    switch (garment) {
      case "trousers": return checkTrousers(body, size, cut, { style, details })
      case "top": return style === "dress" ? checkDress(body, size, cut, details) : checkTop(body, size, cut, cuts ??= design(sizes, details), { style, details })
      case "jacket": return checkSize(body, size, cut, garment, cuts ??= design(sizes, details), { style, details })
      default: return checkSize(body, size, cut, garment, {}, { style, details })
    }
  })
  return results.map((found, i) => [found, i]).sort((a, b) => a[0].penalty - b[0].penalty || a[1] - b[1]).map(([found]) => found)
}

// Measurements outside the range most adults fall in, with how to measure them again.
export function warnings(body) {
  return MEASUREMENTS.flatMap(m => {
    const value = body[m.key]
    if (value === null || value === undefined || covers(m.usual, value)) return []
    const way = value > m.usual[1] ? "larger" : "smaller"
    return [{ part: m.key, message: `${m.label} looks ${way} than most people's. Check it: measure ${m.how}.` }]
  })
}

// ---------------------------------------------------------------------------------------------------------
// The fit API's request and answer (POST /api/v1/fits, the Rails app's FitsController), so a server or the page
// can give the same answer. fitRequest(params) → { status: 200, body } or { status: 422, body: { error, errors } }.

const UNITS = { cm: 1, in: 2.54 }
const MAX_SIZES = 60
const DETAIL_KEYS = ["stretch", "sleeves", "fit", "women", "cropped", "snug", "dropped", "elastic", "hem", "ends"]

// Ruby's Float(value, exception: false): a number, or a string that's one; null otherwise.
function toFloat(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : null
  if (typeof value !== "string") return null
  const s = value.trim()
  return /^[+-]?(\d[\d_]*)?(\.\d+)?([eE][+-]?\d+)?$/.test(s) && /\d/.test(s) ? Number(s.replaceAll("_", "")) : null
}

function readBody(given, scale, errors) {
  const source = given && typeof given === "object" ? given : {}
  return Object.fromEntries(MEASUREMENTS.map(m => {
    const value = toFloat(source[m.key])
    const cm = value === null ? null : value * scale
    if (cm === null) {
      if (!m.optional) errors[m.key] = "is required"
    } else if (!covers(m.range, cm)) {
      errors[m.key] = `must be between ${m.range[0]} and ${m.range[1]} cm`
    }
    return [m.key, cm]
  }))
}

// Sizes sent with the request, in centimetres. The garment's main measurement (chest, or waist for trousers)
// is required; the rest can be missing.
function readSizes(given, garment, errors) {
  const keys = [...CHART_COLUMNS[garment === "trousers" ? "trousers" : "jacket"], ...(garment === "top" ? ["hips"] : [])]
  const required = keys[0]
  if (!Array.isArray(given) || given.length < 1 || given.length > MAX_SIZES) {
    errors.sizes = `must be a list of 1 to ${MAX_SIZES} sizes`
    return []
  }
  return given.map((raw, index) => {
    const size = raw && typeof raw === "object" ? raw : {}
    const name = text(size.name).trim().slice(0, 20)
    if (!name) errors[`sizes.${index}.name`] = "is required"
    const out = {}
    for (const key of keys) {
      const present = size[key] !== null && size[key] !== undefined
      const value = present ? toFloat(size[key]) : null
      if (value === null && present) errors[`sizes.${index}.${key}`] = "must be a number"
      const least = key === "inseam" ? 0 : 5   // (a micro short's inseam is an inch or two)
      if (value !== null && (value < least || value > 250)) errors[`sizes.${index}.${key}`] = `must be between ${least} and 250 cm`
      out[key] = value
    }
    out.name = name
    if (out[required] === null) errors[`sizes.${index}.${required}`] ??= "is required"
    return out
  })
}

function resultJson(found) {
  return {
    size: found.size,
    verdict: verdict(found),
    penalty: found.penalty,
    checks: found.checks.map(c => ({
      part: c.part,
      label: c.label,
      ease_cm: c.ease,
      good_cm: c.good && [round(c.good[0], 2), round(c.good[1], 2)],
      status: c.status,
      fixable: fixable(c),
      note: c.note,
      fix: c.fix && { action: c.fix.action, text: c.fix.text, amount_cm: c.fix.amount }
    }))
  }
}

// params: what the page posts ({ cut, unit, garment, style, details, sizes, measurements }). chart: a stored
// size chart ({ summary, sizes }) to use instead of the sizes sent.
export function fitRequest(params = {}, { chart = null } = {}) {
  // (As Rails' params.fetch: a default only when the key isn't sent at all.)
  const param = (key, fallback) => text(key in params ? params[key] : fallback)
  const cut = param("cut", "regular")
  const garment = param("garment", "jacket")
  const unit = param("unit", "cm")
  const errors = {}
  if (!(cut in CUTS)) errors.cut = `must be one of ${Object.keys(CUTS).join(", ")}`
  if (!(unit in UNITS)) errors.unit = "must be cm or in"
  if (!KINDS.includes(garment)) errors.garment = `must be one of ${KINDS.join(", ")}`
  const body = readBody(params.measurements, UNITS[unit] ?? 1, errors)
  const sizes = chart ? chart.sizes : readSizes(params.sizes, garment, errors)
  if (Object.keys(errors).length) return { status: 422, body: { error: "invalid", errors } }

  const raw = params.details && typeof params.details === "object" && !Array.isArray(params.details) ? params.details : {}
  const details = Object.fromEntries(DETAIL_KEYS.filter(key => key in raw).map(key => [key, raw[key]]))
  const style = text(params.style).trim() ? text(params.style) : null
  const results = rank(body, sizes, cut, garment, { style, details })
  return {
    status: 200,
    body: { size_chart: chart?.summary ?? null, cut, garment, units: "cm", best: results[0].size, warnings: warnings(body), sizes: results.map(resultJson) }
  }
}

// What a client needs to build the measurements form (GET /api/v1/fit_guide).
export function fitGuide() {
  return {
    units: "cm",
    measurements: MEASUREMENTS.map(m => ({ key: m.key, label: m.label, help: m.help, optional: m.optional ?? false,
      min_cm: m.range[0], max_cm: m.range[1], usual_cm: { min: m.usual[0], max: m.usual[1] } })),
    cuts: Object.entries(CUTS).map(([key, c]) => ({ key, label: c.label, chest_ease_cm: { min: c.chest[0], max: c.chest[1] }, waist_ease_cm: { min: c.waist[0], max: c.waist[1] } }))
  }
}
