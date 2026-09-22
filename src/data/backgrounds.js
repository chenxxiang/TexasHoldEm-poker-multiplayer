// Table backgrounds. Each player picks their own; the choice is local and never leaves the
// browser, so two people at the same table can be looking at completely different rooms.
//
// The community cards and the pot sit at a fixed `top: 47%`, independent of the image, and
// each picture frames its table differently — `style` is what pulls a given image's table
// under that fixed layout. Tune it by eye against a phone-sized viewport.
//
// `buttons` picks the action-button treatment: 'solid' is the chunky 3D look, 'glow' the
// translucent luminous one. It follows the background because they have to sit together.

export const BACKGROUNDS = [
  {
    id: 'macau',
    name: '澳门风云',
    img: '/bg/macau.webp',
    thumb: '/bg/macau-thumb.webp',
    style: { objectPosition: 'center bottom' },
    buttons: 'solid',
  },
  {
    id: 'xianfeng',
    name: '仙风道骨',
    img: '/bg/xianfeng.webp',
    thumb: '/bg/xianfeng-thumb.webp',
    style: { top: '-18%', height: '118%' },
    buttons: 'glow',
  },
  {
    id: 'parlor',
    name: '私人牌桌',
    img: '/bg/parlor.webp',
    thumb: '/bg/parlor-thumb.webp',
    style: { objectPosition: 'center bottom' },
    buttons: 'solid',
  },
  {
    id: 'cyber',
    name: '赛博朋克',
    img: '/bg/cyber.webp',
    thumb: '/bg/cyber-thumb.webp',
    style: { objectPosition: 'center bottom' },
    buttons: 'glow',
  },
];

export const DEFAULT_BG = 'macau';

export function getBackground(id) {
  return BACKGROUNDS.find(b => b.id === id) || BACKGROUNDS.find(b => b.id === DEFAULT_BG);
}
