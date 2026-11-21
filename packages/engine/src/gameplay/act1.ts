import type { MissionDef } from './Missions';

/**
 * Act 1 — "মোহাম্মদপুরের মাস্তান". Real Mohammadpur locations (metres from Tajmahal Road).
 * Add more acts as new files; keep ids stable (they're saved in player progress).
 */
export const ACT1: MissionDef[] = [
  {
    id: 'a1-tea-debt',
    title: 'মফিজ চাচার বাকি',
    giver: 'teaChacha',
    intro: 'মোস্তফা বাবা, রিকশাওয়ালা তিন মাসের চায়ের বাকি দেয় না। একটু "বুঝাইয়া" আসো তো!',
    introEn: 'Mostofa son, the rickshaw-wala owes three months of tea. Go "explain" things to him!',
    start: { x: 8.7, z: -10.5 },
    steps: [
      {
        kind: 'talk',
        npc: 'rickshaw1',
        option: 'threaten',
        x: 7.4,
        z: -15.6,
        text: 'রিকশাওয়ালাকে হুমকি দিয়ে বাকি আদায় করো',
      },
      { kind: 'goto', x: 8.7, z: -10.5, r: 2.2, text: 'মফিজ চাচার দোকানে ফিরে যাও' },
    ],
    reward: { taka: 250, love: 1 },
  },
  {
    id: 'a1-cng-parcel',
    title: 'সিএনজি পার্সেল',
    giver: 'shopkeeper',
    intro: 'ভাই, টাউন হল বাজারে জরুরি পার্সেল যাইব। সিএনজি জোগাড় করেন, তিন মিনিটে পৌঁছাইবেন!',
    introEn: 'Bro, an urgent parcel must reach Town Hall market. Get a CNG, three minutes!',
    start: { x: 8.8, z: 5 },
    requires: ['a1-tea-debt'],
    steps: [
      {
        kind: 'enter',
        vehicle: 'cng',
        text: 'একটা সিএনজি জোগাড় করো (রাস্তা থেকে ছিনিয়ে নিলেও চলবে!)',
      },
      { kind: 'goto', x: -74, z: 670, r: 12, text: 'টাউন হল বাজারে পার্সেল পৌঁছাও' },
    ],
    time: 180,
    reward: { taka: 700 },
  },
  {
    id: 'a1-oc-promotion',
    title: 'ওসির প্রমোশন',
    giver: 'oc',
    intro: 'শোনো মোস্তফা, প্রমোশনের জন্য খাতায় একটা "চেজ" দরকার। হইচই করো, তারপর হাওয়া! কেউ জানবে না।',
    introEn:
      'Listen Mostofa, I need a "chase" on record for my promotion. Make noise, then vanish!',
    start: { x: 380, z: 362 },
    requires: ['a1-cng-parcel'],
    steps: [
      { kind: 'wanted', min: 2, text: 'এলাকায় হইচই করো — ২ তারা ওয়ান্টেড হও' },
      { kind: 'lose', text: 'পুলিশকে ফাঁকি দাও (ওয়ান্টেড শূন্য করো)' },
    ],
    reward: { taka: 1000, ammo: 24 },
  },
  {
    id: 'a1-bike-race',
    title: 'সাত মসজিদ বাইক রেস',
    giver: 'hero',
    intro: 'পোলাপান বলে মোস্তফা নাকি আস্তে চালায়! আজকে সাত মসজিদ রোড পর্যন্ত রেস!',
    introEn: 'The kids say Mostofa drives slow! Today: a race to Satmasjid Road!',
    start: { x: 8.8, z: 16 },
    requires: ['a1-cng-parcel'],
    steps: [
      { kind: 'enter', vehicle: 'bike', text: 'মোটরসাইকেলে ওঠো' },
      { kind: 'goto', x: 3, z: 125, r: 9, text: 'চেকপয়েন্ট ১: তাজমহল রোডের মাথা' },
      { kind: 'goto', x: -74, z: 670, r: 12, text: 'চেকপয়েন্ট ২: টাউন হল' },
      { kind: 'goto', x: -270, z: 1330, r: 14, text: 'ফিনিশ: সাত মসজিদ রোড' },
    ],
    time: 200,
    reward: { taka: 900 },
  },
  {
    id: 'a1-thana-selfie',
    title: 'থানার সামনে সেলফি',
    giver: 'hero',
    intro: 'আদাবর থানার সামনে একটা সেলফি তুইলা দিমু — ক্যাপশন: "মোস্তফা ওয়াজ হিয়ার"!',
    introEn: 'A selfie in front of Adabor police station — caption: "Mostofa was here"!',
    start: { x: -170, z: 180 },
    requires: ['a1-oc-promotion', 'a1-bike-race'],
    steps: [
      { kind: 'goto', x: -290, z: -740, r: 12, text: 'আদাবর থানার সামনে যাও' },
      {
        kind: 'stay',
        x: -290,
        z: -740,
        r: 12,
        seconds: 4,
        heat: 3,
        text: 'সেলফি তোলো… নড়বা না!',
      },
      { kind: 'lose', text: 'এবার পালাও! পুলিশকে ফাঁকি দাও' },
      { kind: 'goto', x: 9, z: 0, r: 4, text: 'তাজমহল রোডের আস্তানায় ফিরে যাও' },
    ],
    reward: { taka: 2000, grenades: 3 },
  },
];
