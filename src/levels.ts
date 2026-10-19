export type Level = {
  name: string;
  sub: string;
  snack: string[]; // food-kit model files, stacked if more than one
  snackSize: number; // largest side of the snack in the kid's hands, in world units
  sound: 'crinkle' | 'clank' | 'none';
  noise: number; // multiplier on noise while carrying the snack
  snore: [number, number]; // seconds Dad sleeps between checks
  warn: number; // seconds between the snore stopping and Dad looking
  check: [number, number]; // seconds Dad looks around
  fake: number; // chance that a stir is a fake-out
  creaky: number[]; // x positions of creaky floorboards
  par: number; // seconds for 3 stars
};

export const LEVELS: Level[] = [
  {
    name: 'One Biscuit',
    sub: 'Easy. Dad is in deep sleep.',
    snack: ['cookie.glb'],
    snackSize: 0.35,
    sound: 'none',
    noise: 0.6,
    snore: [3.2, 5],
    warn: 1.0,
    check: [1.2, 1.8],
    fake: 0,
    creaky: [],
    par: 30,
  },
  {
    name: 'Cold Cola',
    sub: 'Cans fizz. Fizz is loud.',
    snack: ['soda-can.glb'],
    snackSize: 0.4,
    sound: 'none',
    noise: 0.8,
    snore: [2.6, 4.5],
    warn: 0.9,
    check: [1.3, 2],
    fake: 0,
    creaky: [-3],
    par: 32,
  },
  {
    name: 'Chips Packet',
    sub: 'The loudest bag ever made.',
    snack: ['bag.glb'],
    snackSize: 0.55,
    sound: 'crinkle',
    noise: 1.25,
    snore: [2.2, 4],
    warn: 0.8,
    check: [1.3, 2.1],
    fake: 0.2,
    creaky: [-3, 2],
    par: 36,
  },
  {
    name: 'Steel Plate',
    sub: 'Why a plate? Do not ask.',
    snack: ['plate.glb'],
    snackSize: 0.6,
    sound: 'clank',
    noise: 1.3,
    snore: [2, 3.8],
    warn: 0.75,
    check: [1.4, 2.2],
    fake: 0.25,
    creaky: [-4, 1, 4],
    par: 38,
  },
  {
    name: 'Ice Cream Tub',
    sub: 'Dad counts the scoops.',
    snack: ['ice-cream-cup.glb'],
    snackSize: 0.55,
    sound: 'none',
    noise: 1.0,
    snore: [1.8, 3.5],
    warn: 0.7,
    check: [1.6, 2.6],
    fake: 0.3,
    creaky: [-2, 3],
    par: 38,
  },
  {
    name: 'Pressure Cooker',
    sub: 'It whistles if you look at it.',
    snack: ['pot-stew.glb', 'pot-stew-lid.glb'],
    snackSize: 0.8,
    sound: 'clank',
    noise: 1.8,
    snore: [1.8, 3.4],
    warn: 0.7,
    check: [1.5, 2.4],
    fake: 0.3,
    creaky: [-4, -1, 3],
    par: 42,
  },
  {
    name: "Sister's Cake",
    sub: 'It is not even your birthday.',
    snack: ['cake-birthday.glb'],
    snackSize: 0.8,
    sound: 'none',
    noise: 1.4,
    snore: [1.5, 3],
    warn: 0.6,
    check: [1.6, 2.6],
    fake: 0.4,
    creaky: [-3, 0.5, 4],
    par: 42,
  },
  {
    name: 'A Whole Watermelon',
    sub: 'Final boss. Good luck.',
    snack: ['watermelon.glb'],
    snackSize: 1.15,
    sound: 'none',
    noise: 2.0,
    snore: [1.3, 2.8],
    warn: 0.55,
    check: [1.7, 2.8],
    fake: 0.45,
    creaky: [-4.5, -1.5, 1.5, 4.5],
    par: 46,
  },
];

export const CAUGHT_LINES = [
  'WHO IS IT?!',
  'Is that you? At 2 AM?',
  'I can hear you breathing.',
  'Put. It. Back.',
  'Do you know what time it is?',
  'I paid for that fridge.',
  'Go to sleep or I will make you sleep.',
  'I was NOT sleeping.',
  'Your mother will hear about this.',
  'Tiptoe? In THIS house?',
  'I have been awake for 20 years.',
  'Next time, ask.',
  'The slipper never misses.',
  'You thought the TV was loud enough?',
];

export const NOISE_LINES = [
  'You call that sneaking?',
  'Even the neighbours woke up.',
  'Were you carrying a drum set?',
];

export const WIN_LINES = [
  'Dad never knew.',
  'Ninja level: legendary.',
  'The fridge is your kingdom.',
  'Snack in bed. Dad in dreamland.',
  'Silent. Deadly. Hungry.',
];
