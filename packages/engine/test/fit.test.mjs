// Run with: npm test -w @fitroom/engine
// The Rails app's test/models/fit_test.rb, case for case, against fit.js.
import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { checkSize, checkTrousers, design, fitRequest, rank, round } from "../src/fit.js"

const chart = key => JSON.parse(readFileSync(new URL(`../assets/size_charts/${key}.json`, import.meta.url), "utf8"))
// As SizeChart#sizes: each size's name and its five measurements.
const sizesOf = key => chart(key).sizes.map(({ name, chest, waist, shoulders, sleeve, length }) => ({ name, chest, waist, shoulders, sleeve, length }))

// A made-up 40R build: 40 in chest, 34 in waist, 5 ft 10 in.
const BODY = Object.freeze({ chest: 101.6, waist: 86.4, shoulders: 45.5, arm: 65.5, height: 178 })
const SUIT = sizesOf("sample_suit_jacket")
const size = name => SUIT.find(s => s.name === name)
const part = (found, name) => found.checks.find(c => c.part === name)
const MAN = Object.freeze({ ...BODY, hips: 101, inseam: 81 })
const WOMAN = Object.freeze({ chest: 91.5, waist: 74, shoulders: 39.5, arm: 58, height: 165, hips: 99, inseam: 76 })
const letters = (names, rows, keys) => names.map((name, i) => ({ name, ...Object.fromEntries(keys.map((key, j) => [key, rows[i][j]])) }))
const inches = (...values) => values.map(v => round(v * 2.54, 2))
const verdictOf = name => fitRequest({ unit: "cm", garment: "jacket", measurements: BODY, sizes: [size(name)] }).body.sizes[0].verdict

test("a 40R body gets 40R in a regular cut, with nothing to fix", () => {
  const best = rank(BODY, SUIT, "regular")[0]
  assert.equal(best.size, "40R")
  assert.equal(verdictOf("40R"), "fits")
  assert.equal(best.penalty, 0)
})

test("longer arms are a sleeve alteration, not a different size", () => {
  const found = checkSize({ ...BODY, arm: 68.5 }, size("40R"))
  const sleeve = part(found, "sleeve")
  assert.equal(sleeve.status, "short")
  assert.equal(sleeve.fix.action, "lengthen_sleeves")
  assert.equal(fitRequest({ garment: "jacket", measurements: { ...BODY, arm: 68.5 }, sizes: [size("40R")] }).body.sizes[0].verdict, "alter")
})

test("shoulders that are too narrow can't be fixed", () => {
  const shoulders = part(checkSize(BODY, size("36R")), "shoulders")
  assert.equal(shoulders.status, "tight")
  assert.equal(shoulders.fix, null)
  assert.equal(verdictOf("36R"), "compromise")
})

test("a slim cut never picks a bigger size than regular", () => {
  assert.ok(parseInt(rank(BODY, SUIT, "slim")[0].size, 10) <= 40)
})

test("a waist that's too loose is taken in, up to a limit", () => {
  assert.equal(part(checkSize({ ...BODY, waist: 81 }, size("40R")), "waist").fix.action, "take_in_waist")
  assert.equal(part(checkSize({ ...BODY, waist: 70 }, size("40R")), "waist").fix, null)
})

test("a coat gets room for a jacket underneath, and its length is described, not judged", () => {
  const coat = { name: "L", chest: 101.6 + 18, waist: null, shoulders: 46, sleeve: 64, length: 95 }
  const found = checkSize(BODY, coat, "regular", "coat")
  assert.equal(part(found, "chest").status, "good")
  const length = part(found, "length")
  assert.equal(length.status, "good")
  assert.equal(length.note, "Ends just above the knee")
  assert.equal(part(checkSize(BODY, coat, "regular", "jacket"), "chest").status, "loose")
})

test("a top made big on purpose, with dropped shoulders, is judged as it's meant to be worn", () => {
  const sizes = [["XS", 135.3, 69.2, 54.0, 62.2], ["S", 140.3, 70.5, 54.3, 63.5], ["M", 145.4, 71.8, 54.6, 64.8],
    ["L", 150.5, 73.0, 54.9, 66.0], ["XL", 158.1, 74.9, 55.2, 68.0]].map(([name, chest, shoulders, sleeve, length]) => ({ name, chest, waist: null, shoulders, sleeve, length }))
  assert.ok(design(sizes).dropped)
  const best = rank(BODY, sizes, "regular", "top")[0]
  assert.equal(best.size, "M")
  assert.deepEqual(best.checks.filter(c => ["shoulders", "chest"].includes(c.part)).map(c => c.status), ["good", "good"])
  assert.equal(rank(BODY, sizes, "slim", "top")[0].size, "S")
})

test("a dress sits closer than a T-shirt, and its length is where it ends", () => {
  const woman = { chest: 91.5, waist: 74, shoulders: 39.5, arm: 58, height: 165 }
  const best = rank(woman, sizesOf("sample_dress"), "regular", "top", { style: "dress" })[0]
  assert.equal(best.size, "M")
  assert.match(part(best, "length").note, /knee/)
})

test("a baby tee is made the size of the body, short, and its size is picked so", () => {
  const body = { chest: 91.5, waist: 74, shoulders: 39.5, arm: 58, height: 165 }
  const sizes = [["S", 85, 35.5, 53], ["M", 90, 37, 54], ["L", 95, 38.5, 55.5], ["XL", 100, 40, 57]].map(([name, chest, shoulders, length]) => ({ name, chest, waist: null, shoulders, sleeve: 12, length }))
  assert.equal(rank(body, sizes, "regular", "top", { style: "tee", details: { women: true } })[0].size, "L")
  const snug = rank(body, sizes, "regular", "top", { style: "tee", details: { women: true, snug: true } })
  assert.equal(snug[0].size, "M")
  assert.match(part(snug[0], "length").note, /baby tee/)
})

test("a fitted knit hoodie stretches on: it's picked a little smaller than the body, not a size with a jacket's room", () => {
  const body = { chest: 91.5, waist: 74, shoulders: 39.5, arm: 58, height: 165 }
  const sizes = [["XS", 76.2, 35.56, 63.82, 48.9], ["S", 81.28, 36.83, 64.77, 50.8], ["M", 86.36, 38.1, 65.72, 52.71],
    ["L", 91.44, 39.37, 66.68, 54.61], ["XL", 99.06, 41.28, 67.95, 56.52], ["XXL", 106.68, 43.18, 69.22, 58.42]].map(([name, chest, shoulders, sleeve, length]) => ({ name, chest, waist: null, shoulders, sleeve, length }))
  const knit = { women: true, fit: "fitted", stretch: true }

  assert.equal(rank(body, sizes, "regular", "jacket")[0].size, "XL")
  assert.equal(rank(body, sizes, "regular", "top", { style: "hoodie", details: { women: true } })[0].size, "XL")
  const ranked = rank(body, sizes, "regular", "top", { style: "hoodie", details: knit })
  assert.ok(["S", "M"].includes(ranked[0].size))
  const chest = part(ranked[0], "chest")
  assert.equal(chest.status, "good")
  assert.ok(chest.ease < 0)
  assert.match(chest.note, /stretches/)
  assert.equal(part(ranked[0], "shoulders").status, "good")
  assert.equal(part(ranked[0], "length").status, "good")
  assert.match(part(ranked[0], "length").note, /waist/)
  assert.ok(["S", "M"].includes(rank(body, sizes, "slim", "top", { style: "hoodie", details: knit })[0].size))
  assert.ok(["M", "L"].includes(rank(body, sizes, "classic", "top", { style: "hoodie", details: knit })[0].size))
  assert.equal(part(ranked.find(r => r.size === "XS"), "chest").status, "tight")
  assert.equal(part(ranked.find(r => r.size === "XL"), "chest").status, "loose")
  assert.equal(rank(body, sizes, "regular", "top", { style: "hoodie", details: { women: true, fit: "fitted", stretch: false } })[0].size, "XL")
})

test("a tee whose photo shows dropped shoulders is meant to be wide there and boxy", () => {
  const sizes = [{ name: "S", chest: 110.5, waist: null, shoulders: 50.8, sleeve: 19.4, length: 68.6 }]
  const plain = rank(BODY, sizes, "regular", "top", { style: "tee" })[0]
  assert.deepEqual([plain.checks[0].status, plain.checks[4].status], ["loose", "short"])
  const boxy = rank(BODY, sizes, "regular", "top", { style: "tee", details: { dropped: true } })[0]
  assert.deepEqual([boxy.checks[0].status, boxy.checks[4].status], ["good", "good"])
})

test("joggers' elastic waist stretches onto the body, and a tailor can't let it out", () => {
  const sizes = [{ name: "L", waist: 86, seat: 112, thigh: 67, inseam: 81, leg_opening: 26 }, { name: "XS", waist: 71, seat: 97, thigh: 58, inseam: 81, leg_opening: 26 }]
  const body = { ...BODY, waist: 87.6 }
  const snug = part(checkTrousers(body, sizes[0], "regular", { style: "joggers" }), "waist")
  assert.equal(snug.status, "good")
  assert.match(snug.note, /elastic/i)
  const small = part(checkTrousers(body, sizes[1], "regular", { style: "joggers" }), "waist")
  assert.equal(small.status, "tight")
  assert.equal(small.fix, null)
  assert.equal(part(checkTrousers(body, sizes[0]), "waist").fix.action, "let_out_waist")
})

test("pull-on trousers (a drawcord or elastic waist) stretch onto the body as joggers do", () => {
  const waist = part(checkTrousers({ ...BODY, waist: 86.4 }, { name: "M", waist: 81.3, seat: 122.6, inseam: 73.7, leg_opening: 45.7 }, "regular", { details: { elastic: true } }), "waist")
  assert.equal(waist.status, "good")
  assert.match(waist.note, /elastic/i)
})

test("a skirt and shorts say where they end", () => {
  const body = { ...BODY, hips: 100, inseam: 81 }
  assert.equal(part(checkTrousers(body, { name: "M", waist: 72, seat: 98, length: 96 }, "regular", { style: "skirt" }), "length").note, "Ends near the ankle")
  assert.match(part(checkTrousers(body, { name: "M", waist: 86, seat: 108, inseam: 18 }, "regular", { style: "shorts" }), "inseam").note, /above the knee/)
})

test("an elastic waist stretches about 8%, not 15 cm: past that it's tight, and a size that stretches a little wins", () => {
  const sizes = letters(["XS", "S", "M", "L", "XL", "XXL"], [0, 1, 2, 3, 4, 5].map(i => [...inches(28 + 2 * i, 44.27 + 2 * i), 73.4, 45.72]), ["waist", "seat", "inseam", "leg_opening"])
  const ranked = rank(MAN, sizes, "regular", "trousers", { style: "trousers", details: { elastic: true } })
  assert.equal(ranked[0].size, "M")
  assert.equal(part(ranked[0], "waist").status, "good")
  for (const name of ["XS", "S"]) {
    const waist = part(ranked.find(r => r.size === name), "waist")
    assert.deepEqual([waist.status, waist.fix], ["tight", null])
  }
})

test("elastic-waist shorts and track pants are picked by the waist they stretch to, not one 10 cm smaller", () => {
  const shorts = letters(["XS", "S", "M", "L", "XL", "XXL"], [0, 1, 2, 3, 4, 5].map(i => [...inches(28 + 2 * i, 40.5 + 2 * i), 12]), ["waist", "seat", "inseam"])
  assert.equal(rank(MAN, shorts, "regular", "trousers", { style: "shorts", details: { elastic: true } })[0].size, "M")
  const track = letters(["XS", "S", "M", "L", "XL"], [0, 1, 2, 3, 4].map(i => [71.04 + 5 * i, 105.03 + 5 * i, 81, 30]), ["waist", "seat", "inseam", "leg_opening"])
  const best = rank(MAN, track, "regular", "trousers", { style: "joggers" })[0]
  assert.ok(["M", "L"].includes(best.size))
  assert.match(part(best, "waist").note, /stretches/)
})

test("pants made loose on purpose are picked by the waist, their roomy seat as it's meant to be", () => {
  const rows = [[79, 118, 69.7], [83, 122, 70.6], [87, 126, 71.5], [91, 130, 72.4], [95, 134, 72.8], [99, 138, 73.2]]
  const sizes = letters(["44", "46", "48", "50", "52", "54"], rows.map(r => [...r, 40]), ["waist", "seat", "inseam", "leg_opening"])
  const best = rank(MAN, sizes, "regular", "trousers", { style: "trousers", details: { fit: "loose" } })[0]
  assert.equal(best.size, "48")
  assert.equal(part(best, "seat").status, "good")
  assert.match(part(best, "seat").note, /meant to be/)

  const loewe = letters(["38", "40", "42", "44", "46"], [28, 30, 32, 34, 36].map(w => [...inches(w), round(w * 2.54 + 28, 1), 81, 40]), ["waist", "seat", "inseam", "leg_opening"])
  assert.equal(rank(MAN, loewe, "regular", "trousers", { style: "jeans", details: { fit: "loose" } })[0].size, "44")

  const pleated = letters(["44", "46", "48", "50", "52"], [0, 1, 2, 3, 4].map(i => [77 + 4 * i, 124 + 4 * i, 72, 40]), ["waist", "seat", "inseam", "leg_opening"])
  const pull = rank(MAN, pleated, "regular", "trousers", { style: "trousers", details: { elastic: true, fit: "loose" } })[0]
  assert.equal(pull.size, "48")
  assert.match(part(pull, "waist").note, /stretches/)
})

test("a tailored trouser a little loose over the seat has it taken in", () => {
  const seat = part(checkTrousers(MAN, { name: "48", waist: 87, seat: 114, inseam: 87.8, leg_opening: 48 }), "seat")
  assert.deepEqual([seat.status, seat.fix.action], ["loose", "take_in_seat"])
})

test("trousers sold unhemmed say so, and how long to hem them, instead of being 26 cm too long", () => {
  const sizes = letters(["44", "46", "48", "50", "52"], [0, 1, 2, 3, 4].map(i => [79 + 4 * i, 108 + 4 * i, 103.97, 47]), ["waist", "seat", "inseam", "leg_opening"])
  const best = rank(MAN, sizes, "regular", "trousers", { style: "trousers", details: { hem: "unfinished" } })[0]
  assert.equal(best.size, "48")
  const length = part(best, "inseam")
  assert.equal(length.status, "good")
  assert.equal(length.note, "Comes unhemmed. Have it hemmed to about 78 cm.")
  assert.equal(part(checkTrousers(MAN, sizes[2]), "inseam").status, "long")
})

test("a jacket made big on purpose is picked by the room it's made with, not squeezed into the smallest size", () => {
  const rows = [[59.3, 53.9, 118.4, 63], [60.5, 55.1, 122.4, 63.4], [61.7, 56.3, 126.4, 63.8], [62.9, 57.5, 130.4, 64.2], [64.1, 58.7, 134.4, 64.6],
    [65.3, 59.9, 139.4, 65], [65.8, 61.1, 144.4, 65.4], [66.3, 62.3, 149.4, 65.8], [66.8, 63.5, 154.4, 66.2]]
  const aviator = letters(["44", "46", "48", "50", "52", "54", "56", "58", "60"], rows, ["length", "shoulders", "chest", "sleeve"])
  assert.ok(design(aviator).roomy)
  const best = rank(BODY, aviator, "regular", "jacket", { style: "bomber" })[0]
  assert.equal(best.size, "50")
  assert.deepEqual(best.checks.filter(c => ["shoulders", "chest", "length"].includes(c.part)).map(c => c.status), ["good", "good", "good"])
  assert.match(part(best, "length").note, /top of your hips/)

  const dejanRows = [[27, 47, 35.13], [27.5, 49, 35.5], [28, 51, 35.88], [28.5, 53, 36.25], [29.25, 56, 36.75], [30, 59, 37.25]]
  const dejan = letters(["XS", "S", "M", "L", "XL", "XXL"], dejanRows.map(([l, c, s]) => [...inches(l, c), round(s * 2.54 - 23, 2)]), ["length", "chest", "sleeve"])
  const zip = rank(BODY, dejan, "regular", "jacket", { style: "zip" })[0]
  assert.ok(["M", "L"].includes(zip.size))
  assert.equal(part(zip, "chest").status, "good")
})

test("a women's hoodie made big on purpose is picked as it's meant to be worn, even when the listing says fitted", () => {
  const elvina = letters(["XS", "S", "M", "L", "XL", "XXL"], [0, 1, 2, 3, 4, 5].map(i => [...inches(41.5 + 2 * i), null, null, ...inches(19 + 0.5 * i)]), ["chest", "shoulders", "sleeve", "length"])
  const best = rank(WOMAN, elvina, "regular", "top", { style: "hoodie", details: { women: true } })[0]
  assert.equal(best.size, "M")
  assert.deepEqual(best.checks.filter(c => ["chest", "length"].includes(c.part)).map(c => c.status), ["good", "good"])

  const toyo = letters(["XS", "S", "M", "L", "XL", "XXL"], [0, 1, 2, 3, 4, 5].map(i => inches(43 + 2 * i, 19.78 + 0.5 * i, 19.74 + 0.5 * i)), ["chest", "sleeve", "length"])
  const ranked = rank(WOMAN, toyo, "regular", "top", { style: "hoodie", details: { women: true, fit: "fitted", stretch: true } })
  assert.ok(["M", "L"].includes(ranked[0].size))
  assert.equal(part(ranked[0], "chest").status, "good")
})

test("a cropped jacket, a bomber or a track jacket says where it ends instead of being too short", () => {
  const syd = { name: "M", chest: 101.66, shoulders: 39.5, sleeve: 56.5, length: 54.57 }
  const length = part(checkSize(WOMAN, syd, "regular", "jacket", {}, { style: "bomber", details: { women: true } }), "length")
  assert.deepEqual([length.status, length.penalty], ["good", 0])
  assert.match(length.note, /ends at the top of your hips/)

  const keshi = { name: "L", chest: 100.39, shoulders: 40.77, sleeve: 56.5, length: 49.49 }
  assert.equal(part(checkSize(WOMAN, keshi, "regular", "jacket", {}, { style: "tailored", details: { women: true } }), "length").status, "short")
  const cropped = checkSize(WOMAN, keshi, "regular", "jacket", {}, { style: "tailored", details: { women: true, cropped: true } })
  assert.match(part(cropped, "length").note, /ends at your waist/)
  const track = checkSize(WOMAN, keshi, "regular", "jacket", {}, { style: "zip", details: { women: true, ends: "waist" } })
  assert.equal(part(track, "length").status, "good")
})

test("rounds as Ruby does: halves away from zero", () => {
  assert.equal(round(2.5), 3)
  assert.equal(round(-2.5), -3)
  assert.equal(round(1.005, 2), 1.01)
  assert.equal(round(-0.125, 2), -0.13)
})
