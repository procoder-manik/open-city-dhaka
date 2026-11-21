import type { MissionDef } from './Missions';

/**
 * Act 3 — "ওসির ডাবল গেম". A rival crew moves in and OC Kamal Pasha plays both sides.
 * Introduces target vehicles (tail / destroy). All characters and crews are fictional.
 * Real places, metres from Tajmahal Road; targets spawn on the nearest main road. Keep ids stable.
 */
export const ACT3: MissionDef[] = [
  {
    id: 'a3-tail-rival',
    title: 'হলুদ গাড়ির পিছু',
    giver: 'boroBhai',
    intro:
      'লাল পাগড়ি গ্রুপের বস হলুদ গাড়িতে ঘুরতেছে। পিছু নাও, কিন্তু বেশি কাছে যাইয়ো না — চিনে ফেললে খেলা শেষ!',
    introEn:
      "The Red Turban crew's boss rides a yellow car. Tail him, but not too close — if he spots you, it's over!",
    start: { x: -74, z: 670 },
    requires: ['a2-kalyan-bazar'],
    target: { kind: 'car', x: -70, z: 699 },
    steps: [
      { kind: 'enter', vehicle: 'any', text: 'একটা গাড়ি বা বাইক নাও' },
      {
        kind: 'tail',
        seconds: 40,
        near: 10,
        far: 50,
        text: 'হলুদ গাড়ির পিছু নাও (১০–৫০ মিটার দূরে থাকো)',
      },
      { kind: 'goto', x: 9, z: 0, r: 5, text: 'আস্তানায় ফিরে জাম্বু ভাইকে রিপোর্ট দাও' },
    ],
    reward: { taka: 1800, love: 1 },
  },
  {
    id: 'a3-extortion-car',
    title: 'চান্দাবাজের গাড়ি',
    giver: 'boroBhai',
    intro: 'লাল পাগড়ির চান্দা তোলার গাড়ি কল্যাণ বাজারে ঘুরতেছে। গাড়িটা আর যেন রাস্তায় না নামে — বুঝছো?',
    introEn: "The Red Turban 'toll' car is cruising Kalyan Bazar. Make sure it never drives again.",
    start: { x: -663, z: 693 },
    requires: ['a3-tail-rival'],
    target: { kind: 'car', x: -663, z: 693 },
    steps: [
      {
        kind: 'destroy',
        text: 'হলুদ গাড়িটা শেষ করো (গুলি, গ্রেনেড বা জোরে ধাক্কা)',
      },
      { kind: 'lose', text: 'পুলিশ আসার আগে হাওয়া হও' },
    ],
    time: 240,
    reward: { taka: 2200, ammo: 24 },
  },
  {
    id: 'a3-market-loot',
    title: 'টাউন হলে দিনে-দুপুরে',
    giver: 'boroBhai',
    intro:
      'টাউন হল মার্কেটে লাল পাগড়ির গুদাম। মাল তুলবা, তারপর আস্তে আস্তে বাঁশবাড়ির গ্যারেজে — মাল ভাঙলে টাকা নাই!',
    introEn:
      'The Red Turban stash is in Town Hall market. Grab the goods, then drive gently to the Bashbari garage — break it, no pay!',
    start: { x: 9, z: 30 },
    requires: ['a3-tail-rival'],
    steps: [
      { kind: 'goto', x: -74, z: 670, r: 12, text: 'টাউন হল মার্কেটে যাও' },
      {
        kind: 'stay',
        x: -74,
        z: 670,
        r: 12,
        seconds: 6,
        heat: 3,
        headline: 'টাউন হল মার্কেটে দিনে-দুপুরে গুদাম ফাঁকা! সন্দেহের তালিকায় {hero}',
        text: 'গুদাম খালি করো… নড়বা না!',
      },
      { kind: 'enter', vehicle: 'any', text: 'মাল তোলার জন্য একটা গাড়ি নাও' },
      {
        kind: 'goto',
        x: -698.9,
        z: 583.3,
        r: 14,
        fragile: 30,
        text: 'আস্তে! মাল নিয়ে বাঁশবাড়ির গ্যারেজে যাও',
      },
      { kind: 'lose', text: 'পুলিশকে ফাঁকি দাও' },
    ],
    reward: { taka: 3000, grenades: 2 },
  },
  {
    id: 'a3-cng-bribe',
    title: 'ঘুষের সিএনজি',
    giver: 'boroBhai',
    intro:
      'ওসি কামাল পাশা লাল পাগড়ির কাছ থেকে ঘুষ নিতেছে! টাকা যাইতেছে একটা হলুদ সিএনজিতে। আগে পিছু নাও, তারপর থামাও।',
    introEn:
      'OC Kamal Pasha is taking money from the Red Turbans! The cash rides a yellow CNG. Tail it first, then stop it.',
    start: { x: 392, z: 360 },
    requires: ['a3-extortion-car', 'a3-market-loot'],
    target: { kind: 'cng', x: 380, z: 360 },
    steps: [
      { kind: 'enter', vehicle: 'any', text: 'একটা গাড়ি বা বাইক নাও' },
      {
        kind: 'tail',
        seconds: 25,
        near: 8,
        far: 45,
        text: 'হলুদ সিএনজির পিছু নাও',
      },
      { kind: 'destroy', text: 'এবার সিএনজি থামাও — ধাক্কা দাও বা গুলি করো!' },
      { kind: 'lose', text: 'পুলিশকে ফাঁকি দাও' },
    ],
    reward: { taka: 3500, ammo: 30 },
  },
  {
    id: 'a3-oc-double-game',
    title: 'ওসির ডাবল গেম',
    giver: 'boroBhai',
    intro:
      'ওসি এবার আমাদের নামেই মামলা দিছে! থানার সামনে ওর নতুন হলুদ জিপ দাঁড়ায়ে আছে। একটা মেসেজ দিয়া আসো, মোস্তফা।',
    introEn:
      'Now the OC filed a case against US! His new yellow jeep sits outside the station. Go send a message, Mostofa.',
    start: { x: 9, z: -30 },
    requires: ['a3-cng-bribe'],
    target: { kind: 'car', x: -397, z: 1090 },
    steps: [
      { kind: 'destroy', text: 'মোহাম্মদপুর থানার কাছে ওসির হলুদ জিপ উড়িয়ে দাও' },
      {
        kind: 'stay',
        x: -383,
        z: 1082,
        r: 25,
        seconds: 3,
        heat: 5,
        headline: 'থানার সামনে ওসির জিপ ছাই! {hero} এখন মোহাম্মদপুরের মোস্ট ওয়ান্টেড',
        text: 'থানার সামনে দাঁড়িয়ে একটু হাসো…',
      },
      { kind: 'lose', text: 'পুরা মোহাম্মদপুর পুলিশ পেছনে! পালাও' },
      { kind: 'goto', x: 9, z: 0, r: 5, text: 'আস্তানায় ফিরে যাও' },
    ],
    reward: { taka: 8000, ammo: 40, grenades: 4, love: -3 },
  },
];
