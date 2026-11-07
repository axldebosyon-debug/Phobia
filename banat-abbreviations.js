"use strict";

// [from, to] pairs used by human-mimic.js. Longest "from" wins.
const BANAT_SHORTHANDS = Object.freeze([
  ["hindi", "di"],
  ["wala", "wla"],
  ["kasi", "kc"],
  ["naman", "nmn"],
  ["talaga", "tlga"],
  ["lang", "lng"],
  ["sino", "sno"],
  ["bakit", "bkt"],
  ["ikaw", "ikw"],
  ["sige", "sge"],
  ["pero", "pro"],
  ["parang", "prng"],
  ["tapos", "tas"],
  ["kayo", "kyo"],
  ["ngayon", "ngyn"],
  ["baby", "bby"],
  ["please", "pls"],
  ["because", "bc"],
  ["right now", "rn"],
  ["i don't know", "idk"],
  ["not gonna lie", "ngl"],
  ["to be honest", "tbh"],
  ["you", "u"],
  ["your", "ur"],
  ["are", "r"],
]);

module.exports = { BANAT_SHORTHANDS };
