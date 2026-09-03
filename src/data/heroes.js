export const TITLE_TYPE_STYLE = {
  '尊号': { bg: '#7c3aed', color: '#fff' },
  '仙号': { bg: '#db2777', color: '#fff' },
  '道号': { bg: '#0d9488', color: '#fff' },
};

export const HERO_SEASONS = [
  {
    season: 'S1',
    heroes: [
      { id: '保龙大帝',        name: '天龙',  img: '/heroes/保龙大帝.png',        title: '苍穹龙尊', titleType: '尊号', desc: '朝翔九霄，镇压四方，龙威震天地。' },
      { id: '撸哥',           name: '卢震',  img: '/heroes/撸哥.png',            title: '雷渊震尊', titleType: '尊号', desc: '雷法通玄，震慑八荒，一声轰鸣动九渊。' },
      { id: '陈少钧',          name: '陈少钧', img: '/heroes/陈少钧.png',          title: '玉衡天君', titleType: '尊号', desc: '少年持衡，权衡天地，执掌乾坤正道。' },
      { id: '翔总',            name: '陈翔',  img: '/heroes/翔总.png',            title: '御风剑仙', titleType: '仙号', desc: '踏剑御风，凌空而翔，剑气贯日月。' },
      { id: '思婷',            name: '思婷',  img: '/heroes/思婷.png',            title: '霜华仙子', titleType: '仙号', desc: '思若幽兰，姿若霜华，清冷绝尘世间。' },
      { id: '标桑',            name: '阿标',  img: '/heroes/阿标.png',            title: '玄风游客', titleType: '道号', desc: '来去无踪，身似浮云，随风而游四海。' },
      { id: '洁娜',            name: '洁娜',  img: '/heroes/洁娜.jpg',            title: '冰壶道人', titleType: '道号', desc: '洁比霜雪，心澄似镜，尘埃不落此身。' },
      { id: '大胖',            name: '大胖',  img: '/heroes/大胖.png',            title: '圆满道君', titleType: '道号', desc: '体魄浑圆，功德圆满，福泽天下苍生。' },
      { id: '韬少',            name: '文韬',  img: '/heroes/韬少.png',            title: '藏锋散人', titleType: '道号', desc: '韬光养晦，文蕴深藏，一朝出鞘惊天地。' },
      { id: '大傻(美少女形态)', name: '大傻',  img: '/heroes/大傻(美少女形态).png', title: '混沌真人', titleType: '道号', desc: '大智若愚，混沌藏道，傻中自有乾坤。' },
    ],
  },
  {
    season: 'S2',
    heroes: [
      { id: '徐P',   name: '徐P',   img: '/heroes/徐P.png' },
      { id: '牢丁',  name: '牢丁',  img: '/heroes/牢丁.png' },
      { id: '？？',  name: '？？',  img: '/heroes/？？.png' },
      { id: '？？？', name: '？？？', img: '/heroes/？？？.png' },
    ],
  },
];

export const HEROES = HERO_SEASONS.flatMap(s => s.heroes);
