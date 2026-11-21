import type { MissionDef } from './Missions';

/**
 * Act 2 — "জাম্বু ভাইয়ের দল". Mostofa works for a (fictional) local boss after the
 * thana selfie made him famous. Real places, metres from Tajmahal Road. Keep ids stable.
 */
export const ACT2: MissionDef[] = [
  {
    id: 'a2-wedding-mishti',
    title: 'বিয়ের মিষ্টি',
    giver: 'boroBhai',
    intro:
      'সেলফি দেইখা খুশি হইছি, মোস্তফা! প্রথম কাজ: টাউন হল থেকে বিয়ের মিষ্টি নিয়া চানমিয়া হাউজিং। একটা রসগোল্লা ফাটলে তোমার মাথাও ফাটবো!',
    introEn:
      'Loved the selfie, Mostofa! First job: wedding sweets from Town Hall to Chanmiya Housing. One rosogolla bursts, so does your head!',
    start: { x: 9, z: 22 },
    requires: ['a1-thana-selfie'],
    steps: [
      { kind: 'enter', vehicle: 'any', text: 'একটা গাড়ি, সিএনজি বা বাইক জোগাড় করো' },
      { kind: 'goto', x: -55, z: 682, r: 12, text: 'টাউন হল মার্কেট থেকে মিষ্টি তোলো' },
      {
        kind: 'goto',
        x: -801,
        z: 409,
        r: 14,
        fragile: 15,
        text: 'আস্তে! মিষ্টি নিয়ে চানমিয়া হাউজিং যাও (ধাক্কা খাইলে মিষ্টি শেষ)',
      },
    ],
    time: 300,
    reward: { taka: 1200, love: 2 },
  },
  {
    id: 'a2-snatch-class',
    title: 'ছিনতাইয়ের ক্লাস',
    giver: 'boroBhai',
    intro: 'নতুন পোলাপানরে হাতে-কলমে শিখাও। তিনটা ছিনতাই, তারপর হাওয়া। আড়াই মিনিট সময়, ক্লাস শুরু!',
    introEn: 'Teach the new boys hands-on. Three snatches, then vanish. Two and a half minutes!',
    start: { x: 3, z: 45 },
    requires: ['a2-wedding-mishti'],
    steps: [
      { kind: 'crime', crime: 'snatch', count: 3, text: 'পথচারীর কাছ থেকে ছিনতাই করো' },
      { kind: 'lose', text: 'পুলিশকে ফাঁকি দাও' },
    ],
    time: 150,
    reward: { taka: 1500, ammo: 18 },
  },
  {
    id: 'a2-speed-test',
    title: 'বাইকের স্পিড টেস্ট',
    giver: 'boroBhai',
    intro:
      'ভাইয়ের নতুন বাইকের স্পিডোমিটার নাকি মিথ্যা কয়। ৯০ তুইলা দেখাও, তারপর সাত মসজিদ রোডে আমার লোকের কাছে দিয়া আসো।',
    introEn:
      "Bhai's new bike's speedometer supposedly lies. Hit 90, then hand it to my guy on Satmasjid Road.",
    start: { x: 8.8, z: 16 },
    requires: ['a2-wedding-mishti'],
    steps: [
      { kind: 'enter', vehicle: 'bike', text: 'মোটরসাইকেলে ওঠো' },
      { kind: 'speed', kmh: 90, text: 'ঘণ্টায় ৯০ কিমি তোলো (সোজা রাস্তা খোঁজো!)' },
      { kind: 'goto', x: -261, z: 1291, r: 14, text: 'সাত মসজিদ রোডে বাইক পৌঁছে দাও' },
    ],
    time: 240,
    reward: { taka: 1300 },
  },
  {
    id: 'a2-carjack-order',
    title: 'গ্যারেজের অর্ডার',
    giver: 'boroBhai',
    intro: 'বাঁশবাড়ির গ্যারেজে দুইটা গাড়ির অর্ডার আসছে। রাস্তা থেকে "ধার" নাও। ধার মানে বুঝছো তো?',
    introEn: 'The Bashbari garage ordered two cars. "Borrow" them off the street. You get it?',
    start: { x: -171, z: 175 },
    requires: ['a2-snatch-class', 'a2-speed-test'],
    steps: [
      { kind: 'crime', crime: 'carjack', count: 1, text: 'রাস্তার একটা গাড়ি ছিনিয়ে নাও' },
      { kind: 'goto', x: -693, z: 582, r: 14, text: 'বাঁশবাড়ির গ্যারেজে গাড়ি রেখে আসো' },
      { kind: 'crime', crime: 'carjack', count: 1, text: 'আরেকটা গাড়ি ছিনিয়ে নাও' },
      { kind: 'goto', x: -693, z: 582, r: 14, text: 'দ্বিতীয় গাড়িও গ্যারেজে দাও' },
      { kind: 'lose', text: 'ওয়ান্টেড থাকলে পুলিশকে ফাঁকি দাও' },
    ],
    reward: { taka: 2500, grenades: 2 },
  },
  {
    id: 'a2-kalyan-bazar',
    title: 'কল্যাণ বাজারের তাণ্ডব',
    giver: 'boroBhai',
    intro:
      'অন্য দলের পোলাপান কল্যাণ বাজারে আমার নামে চান্দা তুলতেছে! যাও, এমন হইচই করো যে পুরা মোহাম্মদপুর জানে কে আসল ভাই।',
    introEn:
      "A rival crew is collecting 'tolls' in my name at Kalyan Bazar! Make such a scene all Mohammadpur knows who the real bhai is.",
    start: { x: 9, z: -20 },
    requires: ['a2-carjack-order'],
    steps: [
      { kind: 'goto', x: -657, z: 691, r: 14, text: 'কল্যাণ বাজারে যাও' },
      {
        kind: 'stay',
        x: -657,
        z: 691,
        r: 14,
        seconds: 5,
        heat: 4,
        headline: 'কল্যাণ বাজারে {hero}-এর তাণ্ডব! ব্যবসায়ীরা বললেন "এর চেয়ে লোডশেডিং ভালো"',
        text: 'বাজারে দাঁড়িয়ে নাম জানান দাও…',
      },
      {
        kind: 'crime',
        crime: 'copAssault',
        count: 2,
        text: 'দুইবার পুলিশের গায়ে হাত তোলো (ঘুষি বা গুলি)',
      },
      { kind: 'lose', text: 'পুরা থানা পেছনে! পালাও' },
      { kind: 'goto', x: 9, z: 0, r: 4, text: 'তাজমহল রোডের আস্তানায় ফিরে যাও' },
    ],
    reward: { taka: 5000, ammo: 36, grenades: 3, love: -2 },
  },
];
