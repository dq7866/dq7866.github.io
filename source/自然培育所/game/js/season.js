/* 季节与市价：按天数推移轮换节令，不同物种在不同节令有旺淡季 */
const SEASONS = [
  { key: 'spring', name: '春', glyph: '芽', tag: '回暖多雨，适合育苗',
    // 旺/淡：1.35 为旺季溢价，0.72 为淡季压价
    market: { tomato: 1.0, strawberry: 1.35, sunflower: 1.0, monarch: 0.72, frog: 1.35, koi: 1.0, rabbit: 1.35, bee: 1.35, mush: 1.0, duck: 1.35, tortoise: 1.0, silkworm: 1.35, owl: 1.35, chicken: 1.35, dog: 1.0, cat: 1.0, aloe: 1.0, jelly: 1.0 } },
  { key: 'summer', name: '夏', glyph: '暑', tag: '光照足、蒸发快，注意补水',
    market: { tomato: 1.35, strawberry: 0.72, sunflower: 1.35, monarch: 1.35, frog: 1.0, koi: 1.35, rabbit: 0.72, bee: 1.35, mush: 0.72, duck: 0.72, tortoise: 0.72, silkworm: 0.72, owl: 1.0, chicken: 0.72, dog: 0.72, cat: 0.72, aloe: 1.35, jelly: 1.35 } },
  { key: 'autumn', name: '秋', glyph: '收', tag: '昼夜温差大，是收获季',
    market: { tomato: 1.0, strawberry: 1.0, sunflower: 1.35, monarch: 1.0, frog: 0.72, koi: 1.0, rabbit: 1.0, bee: 0.72, mush: 1.35, duck: 1.35, tortoise: 1.35, silkworm: 1.35, owl: 1.0, chicken: 1.0, dog: 1.35, cat: 1.0, aloe: 1.0, jelly: 1.0 } },
  { key: 'winter', name: '冬', glyph: '藏', tag: '低温缺光，成本最高',
    market: { tomato: 0.72, strawberry: 1.0, sunflower: 0.72, monarch: 0.72, frog: 0.72, koi: 0.8, rabbit: 1.0, bee: 0.72, mush: 1.0, duck: 1.0, tortoise: 0.72, silkworm: 0.72, owl: 1.35, chicken: 1.0, dog: 1.0, cat: 1.35, aloe: 0.72, jelly: 0.8 } }
];

const SEASON_LEN = 10;   // 每季 10 个游戏天

function seasonForDay(day) {
  const i = Math.floor((day - 1) / SEASON_LEN) % SEASONS.length;
  return SEASONS[i];
}
function seasonIndex(day) { return Math.floor((day - 1) / SEASON_LEN) % SEASONS.length; }
// 距下一季还有几天
function daysToNextSeason(day) { return SEASON_LEN - ((day - 1) % SEASON_LEN); }

// 某物种当前市价系数
function marketFactor(speciesId, day) {
  const s = SEASONS[Math.floor(((day === undefined ? 1 : day) - 1) / SEASON_LEN) % SEASONS.length];
  return (s.market && s.market[speciesId]) || 1;
}
// 季节对环境的额外修正（冬天更冷更干、夏天更热）
function seasonEnvMod(day) {
  const k = SEASONS[Math.floor(((day === undefined ? 1 : day) - 1) / SEASON_LEN) % SEASONS.length].key;
  // 冬季压制最重：低温+干燥+缺光，设备效率也打折，是最难熬的季节
  if (k === 'winter') return { temp: -7, humid: -9, light: -2.0, water: -8 };
  if (k === 'summer') return { temp: +2.5, humid: -5, light: +1.4, water: -10 };
  if (k === 'spring') return { temp: 0, humid: +5, light: 0, water: +4 };
  return { temp: 0, humid: 0, light: 0, water: 0 };
}

function marketTag(speciesId, day) {
  const f = marketFactor(speciesId, day);
  if (f > 1.2) return { t: '旺季', c: '#f6d365', f };
  if (f < 0.85) return { t: '淡季', c: '#e0796c', f };
  return { t: '平季', c: '#9fb8a4', f };
}
