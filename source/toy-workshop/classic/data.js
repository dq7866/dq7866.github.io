/* ============================================================
 * data.js — 玩具零件数据（本原型唯一的 mock 数据源）
 * 场景坐标系：480 × 360，所有零件的 x/y/w/h 都在该坐标系下定义
 * 零件 svg 字段为「0 0 w h」视窗内的内层图形标记
 *
 * seq = 拆装顺序序号（同一序号可互换）
 *   · 组装：seq 小的先装
 *   · 拆解：seq 大的先拆（即组装的逆序）
 * 例：算盘 seq 拆解顺序 = 外框 → 横梁 → 档杆 → 算珠
 * ============================================================ */

const TOYS = {

  /* ---------------- 小汽车：底盘(车轮/排气管) → 车壳 → 车灯/车门/车窗 → 后视镜 ---------------- */
  car: {
    id: 'car',
    name: '小汽车',
    tag: '空间思维',
    base: `
      <ellipse cx="240" cy="312" rx="175" ry="13" fill="rgba(61,44,30,.08)"/>
      <rect x="110" y="222" width="260" height="26" rx="10" fill="#6B5B4F" stroke="#3D2C1E" stroke-width="4"/>
      <rect x="92" y="228" width="20" height="12" rx="5" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>
      <circle cx="150" cy="250" r="9" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>
      <circle cx="330" cy="250" r="9" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>
    `,
    parts: [
      {
        id: 'exhaust', name: '排气管', x: 66, y: 230, w: 44, h: 18, z: 2, seq: 1,
        easy: false,
        hint: '排气管装在车尾下方，先把它固定到底盘上',
        svg: `<rect x="2" y="4" width="30" height="10" rx="5" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="3"/>
              <ellipse cx="36" cy="9" rx="6" ry="7" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'rearWheel', name: '后车轮', x: 112, y: 212, w: 76, h: 76, z: 1, seq: 1,
        easy: true,
        hint: '把车轮对准圆圆的车轴，咔哒装上！',
        svg: `<circle cx="38" cy="38" r="33" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="38" cy="38" r="19" fill="#FFC53D" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="38" cy="48" r="2.8" fill="#3D2C1E"/><circle cx="47.5" cy="41.1" r="2.8" fill="#3D2C1E"/>
              <circle cx="43.9" cy="29.9" r="2.8" fill="#3D2C1E"/><circle cx="32.1" cy="29.9" r="2.8" fill="#3D2C1E"/>
              <circle cx="28.5" cy="41.1" r="2.8" fill="#3D2C1E"/>
              <circle cx="38" cy="38" r="4.5" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'frontWheel', name: '前车轮', x: 292, y: 212, w: 76, h: 76, z: 1, seq: 1,
        easy: true,
        hint: '把车轮对准圆圆的车轴，咔哒装上！',
        svg: `<circle cx="38" cy="38" r="33" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="38" cy="38" r="19" fill="#FFC53D" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="38" cy="48" r="2.8" fill="#3D2C1E"/><circle cx="47.5" cy="41.1" r="2.8" fill="#3D2C1E"/>
              <circle cx="43.9" cy="29.9" r="2.8" fill="#3D2C1E"/><circle cx="32.1" cy="29.9" r="2.8" fill="#3D2C1E"/>
              <circle cx="28.5" cy="41.1" r="2.8" fill="#3D2C1E"/>
              <circle cx="38" cy="38" r="4.5" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'bodyShell', name: '车身上盖', x: 95, y: 120, w: 290, h: 110, z: 2, seq: 2,
        easy: true,
        hint: '把车身上盖扣到底盘上，车轮要卡进拱形里',
        svg: `<path d="M10 108 L10 66 Q10 46 30 44 L96 38 Q120 10 168 12 L208 16 Q240 20 252 46 L272 50 Q280 52 280 66 L280 108 L275 108 A40 40 0 0 0 195 108 L95 108 A40 40 0 0 0 15 108 Z"
                fill="#FF7A45" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M26 60 L92 50" stroke="#FFB08A" stroke-width="6" stroke-linecap="round"/>`
      },
      {
        id: 'door', name: '车门', x: 208, y: 162, w: 88, h: 60, z: 3, seq: 3,
        easy: false,
        hint: '车门装在车身中间，有小把手',
        svg: `<rect x="4" y="4" width="80" height="52" rx="12" fill="#FF8C5C" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="54" y="20" width="20" height="7" rx="3.5" fill="#3D2C1E"/>
              <path d="M14 14 L40 10" stroke="#FFB08A" stroke-width="5" stroke-linecap="round"/>`
      },
      {
        id: 'windshield', name: '车窗', x: 208, y: 130, w: 100, h: 38, z: 3, seq: 3,
        easy: true,
        hint: '蓝色的车窗贴在车顶上',
        svg: `<path d="M8 34 L24 6 L50 4 L50 34 Z" fill="#C9ECFF" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M58 34 L58 4 L82 8 Q92 16 94 34 Z" fill="#C9ECFF" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M18 20 L30 10" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".8"/>`
      },
      {
        id: 'headlight', name: '车灯', x: 352, y: 166, w: 34, h: 26, z: 4, seq: 3,
        easy: false,
        hint: '圆圆的车灯装在最前面，照亮马路',
        svg: `<ellipse cx="17" cy="13" rx="14" ry="10" fill="#FFF3B0" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="13" cy="10" r="2.5" fill="#FFFFFF"/>`
      },
      {
        id: 'taillight', name: '尾灯', x: 92, y: 162, w: 24, h: 32, z: 4, seq: 3,
        easy: false,
        hint: '红色的尾灯，装在车屁股上',
        svg: `<rect x="4" y="4" width="16" height="24" rx="7" fill="#FF5A5A" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="11" cy="11" r="2" fill="#FFFFFF" opacity=".8"/>`
      },
      {
        id: 'mirror', name: '后视镜', x: 296, y: 134, w: 26, h: 24, z: 4, seq: 4,
        easy: false,
        hint: '后视镜装在车门的前上方',
        svg: `<path d="M6 22 L12 12" stroke="#3D2C1E" stroke-width="4" stroke-linecap="round"/>
              <rect x="9" y="2" width="15" height="12" rx="5" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="3"/>`
      }
    ]
  },

  /* ---------------- 小算盘：外框 → 横梁 → 档杆 → 算珠（组装逆序） ---------------- */
  abacus: {
    id: 'abacus',
    name: '小算盘',
    tag: '数感启蒙',
    base: `
      <ellipse cx="240" cy="298" rx="165" ry="12" fill="rgba(61,44,30,.08)"/>
      <rect x="115" y="106" width="250" height="150" fill="#FDF6E9"/>
    `,
    parts: [
      {
        id: 'frame', name: '外框', x: 93, y: 84, w: 294, h: 194, z: 6, seq: 4,
        easy: false, staticInEasy: true,
        hint: '最后把外框扣上去，算盘就完整啦',
        svg: `<path d="M2 2 H292 V192 H2 Z M22 22 H272 V172 H22 Z" fill-rule="evenodd"
                fill="#E8B06A" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <circle cx="13" cy="12" r="4" fill="#C98A4B"/><circle cx="281" cy="12" r="4" fill="#C98A4B"/>
              <circle cx="13" cy="182" r="4" fill="#C98A4B"/><circle cx="281" cy="182" r="4" fill="#C98A4B"/>`
      },
      {
        id: 'beam', name: '横梁', x: 115, y: 166, w: 250, h: 18, z: 5, seq: 3,
        easy: false, staticInEasy: true,
        hint: '长长的横梁，把算盘分成上和下',
        svg: `<rect x="2" y="2" width="246" height="14" rx="7" fill="#D9A35B" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'rod1', name: '第一档杆', x: 159, y: 106, w: 12, h: 150, z: 1, seq: 2,
        easy: false, staticInEasy: true,
        hint: '档杆竖着插进框框里',
        svg: `<rect x="2" y="2" width="8" height="146" rx="4" fill="#A9743C" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'rod2', name: '第二档杆', x: 234, y: 106, w: 12, h: 150, z: 1, seq: 2,
        easy: false, staticInEasy: true,
        hint: '档杆竖着插进框框里',
        svg: `<rect x="2" y="2" width="8" height="146" rx="4" fill="#A9743C" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'rod3', name: '第三档杆', x: 309, y: 106, w: 12, h: 150, z: 1, seq: 2,
        easy: false, staticInEasy: true,
        hint: '档杆竖着插进框框里',
        svg: `<rect x="2" y="2" width="8" height="146" rx="4" fill="#A9743C" stroke="#3D2C1E" stroke-width="3"/>`
      },
      ...[
        ['bead1', 142, 120, '#FF7A45', '橙色算珠'],
        ['bead2', 142, 200, '#FF7A45', '橙色算珠'],
        ['bead3', 217, 120, '#2EC4B6', '绿色算珠'],
        ['bead4', 217, 200, '#2EC4B6', '绿色算珠'],
        ['bead5', 292, 120, '#FFC53D', '黄色算珠'],
        ['bead6', 292, 200, '#FFC53D', '黄色算珠']
      ].map(([id, x, y, color, name]) => ({
        id, name, x, y, w: 46, h: 32, z: 3, seq: 1, isBead: true,
        easy: true,
        hint: '算珠中间有洞，要穿在档杆上哦',
        svg: `<ellipse cx="23" cy="16" rx="20" ry="13" fill="${color}" stroke="#3D2C1E" stroke-width="4"/>
              <ellipse cx="23" cy="16" rx="6" ry="4.5" fill="#FDF6E9" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M10 10 Q16 5 24 6" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity=".7" fill="none"/>`
      }))
    ]
  },

  /* ---------------- 机器人：腿/手臂 → 头 → 眼睛天线 ---------------- */
  robot: {
    id: 'robot',
    name: '机器人',
    tag: '想象创造',
    base: `
      <ellipse cx="240" cy="320" rx="120" ry="12" fill="rgba(61,44,30,.08)"/>
      <rect x="230" y="136" width="20" height="18" rx="6" fill="#C7D0D8" stroke="#3D2C1E" stroke-width="3"/>
      <circle cx="195" cy="175" r="7" fill="#C7D0D8" stroke="#3D2C1E" stroke-width="3"/>
      <circle cx="285" cy="175" r="7" fill="#C7D0D8" stroke="#3D2C1E" stroke-width="3"/>
      <rect x="206" y="250" width="28" height="12" rx="5" fill="#C7D0D8" stroke="#3D2C1E" stroke-width="3"/>
      <rect x="246" y="250" width="28" height="12" rx="5" fill="#C7D0D8" stroke="#3D2C1E" stroke-width="3"/>
      <rect x="195" y="150" width="90" height="106" rx="16" fill="#E8EDF2" stroke="#3D2C1E" stroke-width="4"/>
      <rect x="210" y="216" width="60" height="8" rx="4" fill="#C7D0D8"/>
      <rect x="210" y="232" width="60" height="8" rx="4" fill="#C7D0D8"/>
    `,
    parts: [
      {
        id: 'legL', name: '左腿', x: 206, y: 256, w: 28, h: 52, z: 1, seq: 1,
        easy: false,
        hint: '腿装在身体下面，机器人才能站起来',
        svg: `<rect x="5" y="2" width="18" height="34" rx="8" fill="#4D96FF" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="2" y="34" width="24" height="14" rx="7" fill="#3D6CB5" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'legR', name: '右腿', x: 246, y: 256, w: 28, h: 52, z: 1, seq: 1,
        easy: false,
        hint: '腿装在身体下面，机器人才能站起来',
        svg: `<rect x="5" y="2" width="18" height="34" rx="8" fill="#4D96FF" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="2" y="34" width="24" height="14" rx="7" fill="#3D6CB5" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'armL', name: '左手臂', x: 136, y: 162, w: 52, h: 26, z: 1, seq: 2,
        easy: true,
        hint: '手臂装在身体左边的小圆钮上',
        svg: `<rect x="10" y="3" width="38" height="20" rx="10" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="10" cy="13" r="8" fill="#F4F7FA" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'armR', name: '右手臂', x: 292, y: 162, w: 52, h: 26, z: 1, seq: 2,
        easy: true,
        hint: '手臂装在身体右边的小圆钮上',
        svg: `<rect x="4" y="3" width="38" height="20" rx="10" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="42" cy="13" r="8" fill="#F4F7FA" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'core', name: '电池仓', x: 216, y: 180, w: 48, h: 48, z: 2, seq: 2,
        easy: true,
        hint: '打开胸口的盖板，里面装着两节电池',
        svg: `<rect x="3" y="3" width="42" height="42" rx="9" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="9" y="15" width="13" height="22" rx="3" fill="#FFC53D" stroke="#3D2C1E" stroke-width="3"/>
              <rect x="26" y="15" width="13" height="22" rx="3" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M36 9 L36 5 M38 7 L34 7" stroke="#FFF7EA" stroke-width="2" stroke-linecap="round"/>`
      },
      {
        id: 'head', name: '脑袋', x: 192, y: 72, w: 96, h: 62, z: 3, seq: 3,
        easy: true,
        hint: '方方的大脑袋，放在脖子上',
        svg: `<rect x="4" y="4" width="88" height="54" rx="14" fill="#F4F7FA" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="6" cy="31" r="6" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="3"/>
              <circle cx="90" cy="31" r="6" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'eyes', name: '眼睛面板', x: 206, y: 88, w: 68, h: 26, z: 4, seq: 4,
        easy: false,
        hint: '亮亮的眼睛，贴在脸中间',
        svg: `<rect x="2" y="2" width="64" height="22" rx="11" fill="#3D2C1E"/>
              <circle cx="20" cy="13" r="5.5" fill="#FFE066"/>
              <circle cx="48" cy="13" r="5.5" fill="#FFE066"/>`
      },
      {
        id: 'antenna', name: '天线', x: 232, y: 38, w: 16, h: 36, z: 5, seq: 4,
        easy: false,
        hint: '天线插在头顶上，接受信号',
        svg: `<path d="M8 34 L8 14" stroke="#3D2C1E" stroke-width="5" stroke-linecap="round"/>
              <circle cx="8" cy="8" r="6" fill="#FF7A45" stroke="#3D2C1E" stroke-width="3"/>`
      }
    ]
  },

  /* ---------------- 小闹钟：发条钥匙(背面) → 钟面 → 指针 → 铃铛(外壳顶) → 提手 ---------------- */
  clock: {
    id: 'clock',
    name: '小闹钟',
    tag: '时间认知',
    base: `
      <ellipse cx="240" cy="312" rx="150" ry="12" fill="rgba(61,44,30,.08)"/>
      <path d="M180 286 L172 306 L196 306 L192 288 Z" fill="#F0B429" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
      <path d="M300 286 L308 306 L284 306 L288 288 Z" fill="#F0B429" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="240" cy="206" r="88" fill="#FFD43B" stroke="#3D2C1E" stroke-width="5"/>
      <circle cx="240" cy="206" r="72" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="3"/>
    `,
    parts: [
      {
        id: 'bellL', name: '左铃铛', x: 158, y: 92, w: 54, h: 44, z: 2, seq: 4,
        easy: true,
        hint: '铃铛装在闹钟头顶，叮铃铃叫人起床',
        svg: `<circle cx="27" cy="8" r="5" fill="#F0652F" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M8 40 L8 30 Q8 12 27 12 Q46 12 46 30 L46 40 Z" fill="#FF7A45" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M4 40 L50 40" stroke="#3D2C1E" stroke-width="4" stroke-linecap="round"/>`
      },
      {
        id: 'bellR', name: '右铃铛', x: 268, y: 92, w: 54, h: 44, z: 2, seq: 4,
        easy: true,
        hint: '铃铛装在闹钟头顶，叮铃铃叫人起床',
        svg: `<circle cx="27" cy="8" r="5" fill="#F0652F" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M8 40 L8 30 Q8 12 27 12 Q46 12 46 30 L46 40 Z" fill="#FF7A45" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M4 40 L50 40" stroke="#3D2C1E" stroke-width="4" stroke-linecap="round"/>`
      },
      {
        id: 'key', name: '发条钥匙', x: 322, y: 194, w: 44, h: 24, z: 2, seq: 1,
        easy: false,
        hint: '钥匙插在闹钟的耳朵边上，拧一拧上发条',
        svg: `<rect x="2" y="9" width="14" height="7" rx="3" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="3"/>
              <ellipse cx="30" cy="12" rx="11" ry="9" fill="#FFC53D" stroke="#3D2C1E" stroke-width="3"/>
              <circle cx="30" cy="12" r="3" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="2"/>`
      },
      {
        id: 'face', name: '钟面', x: 178, y: 144, w: 124, h: 124, z: 1, seq: 2,
        easy: false,
        hint: '白色的钟面贴在正中间，数字 12 朝上',
        svg: `<circle cx="62" cy="62" r="58" fill="#FFFFFF" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="62" cy="62" r="48" fill="none" stroke="#3D2C1E" stroke-width="9" pathLength="60" stroke-dasharray="1.6 3.4"/>
              <text x="62" y="26" text-anchor="middle" font-size="15" font-weight="800" fill="#8A7364">12</text>
              <text x="104" y="67" text-anchor="middle" font-size="15" font-weight="800" fill="#8A7364">3</text>
              <text x="62" y="108" text-anchor="middle" font-size="15" font-weight="800" fill="#8A7364">6</text>
              <text x="20" y="67" text-anchor="middle" font-size="15" font-weight="800" fill="#8A7364">9</text>`
      },
      {
        id: 'hourHand', name: '时针', x: 204, y: 166, w: 44, h: 46, z: 3, seq: 3,
        easy: true,
        hint: '短短的时针，指着数字 10',
        svg: `<path d="M36 40 L10 25" stroke="#3D2C1E" stroke-width="9" stroke-linecap="round"/>
              <circle cx="36" cy="40" r="7" fill="#FF7A45" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'minuteHand', name: '分针', x: 238, y: 172, w: 50, h: 36, z: 4, seq: 3,
        easy: true,
        hint: '长长的分针，指着数字 2',
        svg: `<path d="M2 34 L42 11" stroke="#3D2C1E" stroke-width="6" stroke-linecap="round"/>
              <circle cx="2" cy="34" r="5" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'handle', name: '提手', x: 206, y: 64, w: 68, h: 30, z: 5, seq: 5,
        easy: false,
        hint: '弯弯的提手，最后架在两个铃铛中间',
        svg: `<path d="M6 28 Q6 6 34 6 Q62 6 62 28" fill="none" stroke="#3D2C1E" stroke-width="7" stroke-linecap="round"/>`
      }
    ]
  },

  /* ---------------- 小台灯：灯座(含电源线) → 灯杆 → 灯泡 → 灯罩 ---------------- */
  lamp: {
    id: 'lamp',
    name: '小台灯',
    tag: '生活认知',
    base: `
      <ellipse cx="240" cy="316" rx="128" ry="12" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'cord', name: '电源线', x: 316, y: 282, w: 78, h: 44, z: 1, seq: 1,
        easy: false,
        hint: '电源线从灯座背面接出去，插头在最末端',
        svg: `<path d="M4 18 Q28 18 38 28 Q48 38 70 34" fill="none" stroke="#3D2C1E" stroke-width="5" stroke-linecap="round"/>
              <rect x="64" y="26" width="12" height="16" rx="4" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'lampBase', name: '灯座', x: 160, y: 266, w: 160, h: 50, z: 2, seq: 1,
        easy: true,
        hint: '灯座要放在桌面上，底座稳了灯才不倒',
        svg: `<path d="M16 44 Q16 8 80 8 Q144 8 144 44 Z" fill="#6B5B4F" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <ellipse cx="80" cy="44" rx="64" ry="6" fill="#8A7364"/>
              <circle cx="120" cy="28" r="7" fill="#FFC53D" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'pole', name: '灯杆', x: 228, y: 148, w: 24, h: 128, z: 1, seq: 2,
        easy: true,
        hint: '灯杆一头插进灯座，一头托住灯罩',
        svg: `<path d="M12 126 L12 14" stroke="#3D2C1E" stroke-width="12" stroke-linecap="round"/>
              <path d="M12 122 L12 16" stroke="#B8B2A7" stroke-width="6" stroke-linecap="round"/>
              <circle cx="12" cy="12" r="9" fill="#8A7364" stroke="#3D2C1E" stroke-width="4"/>`
      },
      {
        id: 'bulb', name: '灯泡', x: 194, y: 126, w: 34, h: 44, z: 2, seq: 3,
        easy: true,
        hint: '灯泡拧进灯座里，再罩上灯罩才不会刺眼',
        svg: `<circle cx="17" cy="16" r="14" fill="#FFF3B0" stroke="#3D2C1E" stroke-width="4"/>
              <path d="M11 14 Q17 22 23 14" fill="none" stroke="#B88A2E" stroke-width="3" stroke-linecap="round"/>
              <rect x="8" y="28" width="18" height="12" rx="4" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'shade', name: '灯罩', x: 148, y: 60, w: 128, h: 100, z: 3, seq: 4,
        easy: true,
        hint: '灯罩是台灯最外面的一层，罩住灯泡',
        svg: `<path d="M6 94 L38 12 Q41 4 50 4 L78 4 Q87 4 90 12 L122 94 Q124 100 116 100 L12 100 Q4 100 6 94 Z" fill="#FF7A45" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M20 90 Q64 72 108 90" stroke="#FFB08A" stroke-width="6" fill="none" stroke-linecap="round"/>
              <rect x="52" y="0" width="24" height="8" rx="4" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>`
      }
    ]
  },

  /* ---------------- 小风扇：底座(含旋钮) → 电机 → 后网罩 → 扇叶 → 前网罩 ---------------- */
  fan: {
    id: 'fan',
    name: '小风扇',
    tag: '机械原理',
    base: `
      <ellipse cx="240" cy="312" rx="98" ry="11" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'fanBase', name: '底座', x: 180, y: 210, w: 120, h: 98, z: 2, seq: 1,
        easy: true,
        hint: '底座压稳桌面，风扇转起来才不会晃',
        svg: `<rect x="54" y="2" width="12" height="52" rx="6" fill="#8A7364" stroke="#3D2C1E" stroke-width="4"/>
              <path d="M10 92 Q10 56 60 56 Q110 56 110 92 Z" fill="#6B5B4F" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <ellipse cx="60" cy="92" rx="50" ry="6" fill="#8A7364"/>`
      },
      {
        id: 'knob', name: '旋钮', x: 250, y: 272, w: 28, h: 18, z: 3, seq: 1,
        easy: true,
        hint: '底座上的旋钮，拧一下就开始转',
        svg: `<rect x="2" y="2" width="24" height="14" rx="7" fill="#FFC53D" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'motor', name: '电机', x: 214, y: 190, w: 52, h: 84, z: 1, seq: 2,
        easy: false, staticInEasy: true,
        hint: '电机藏在网罩后面，是风扇的心脏',
        svg: `<rect x="20" y="34" width="12" height="50" rx="6" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="4" y="2" width="44" height="38" rx="12" fill="#8A7364" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="26" cy="21" r="10" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'rearGuard', name: '后网罩', x: 154, y: 42, w: 172, h: 172, z: 2, seq: 3,
        easy: false, staticInEasy: true,
        hint: '后网罩套在电机上，扇叶装在它前面',
        svg: `<circle cx="86" cy="86" r="80" fill="#FFF7EA" fill-opacity=".6" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="86" cy="86" r="58" fill="none" stroke="#8A7364" stroke-width="3"/>
              <circle cx="86" cy="86" r="36" fill="none" stroke="#8A7364" stroke-width="3"/>
              <path d="M86 6 L86 166 M6 86 L166 86" stroke="#8A7364" stroke-width="3"/>`
      },
      {
        id: 'blades', name: '扇叶', x: 176, y: 64, w: 128, h: 128, z: 3, seq: 4,
        easy: true,
        hint: '三片扇叶套在电机轴上，转起来才有风',
        svg: `<g stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round">
                <path d="M64 64 Q96 44 100 20 Q74 24 58 52 Z" fill="#2EC4B6"/>
                <path d="M64 64 Q92 90 116 88 Q100 62 76 62 Z" fill="#2EC4B6"/>
                <path d="M64 64 Q38 90 28 108 Q54 98 62 76 Z" fill="#2EC4B6"/>
              </g>
              <circle cx="64" cy="64" r="15" fill="#FFC53D" stroke="#3D2C1E" stroke-width="4"/>`
      },
      {
        id: 'frontGuard', name: '前网罩', x: 154, y: 42, w: 172, h: 172, z: 4, seq: 5,
        easy: true,
        hint: '前网罩扣在最外面，挡住飞速旋转的扇叶',
        svg: `<circle cx="86" cy="86" r="80" fill="none" stroke="#3D2C1E" stroke-width="5"/>
              <circle cx="86" cy="86" r="68" fill="none" stroke="#8A7364" stroke-width="3"/>
              <circle cx="86" cy="86" r="46" fill="none" stroke="#8A7364" stroke-width="3"/>
              <circle cx="86" cy="86" r="24" fill="none" stroke="#8A7364" stroke-width="3"/>
              <path d="M86 6 L86 166 M6 86 L166 86 M29 29 L143 143 M143 29 L29 143" stroke="#8A7364" stroke-width="3"/>
              <circle cx="86" cy="86" r="13" fill="#FF7A45" stroke="#3D2C1E" stroke-width="4"/>`
      }
    ]
  },

  /* ---------------- 手电筒：电池 → 筒身 → 灯泡 → 镜片 → 灯头盖 ---------------- */
  flashlight: {
    id: 'flashlight',
    name: '手电筒',
    tag: '生活认知',
    base: `
      <ellipse cx="240" cy="236" rx="152" ry="10" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'battery', name: '电池', x: 132, y: 164, w: 84, h: 40, z: 1, seq: 1,
        easy: false, staticInEasy: true,
        hint: '电池装在筒身里，正负极要对准',
        svg: `<rect x="2" y="4" width="68" height="32" rx="6" fill="#FFC53D" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="66" y="12" width="10" height="16" rx="3" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M16 20 L34 20 M25 11 L25 29" stroke="#3D2C1E" stroke-width="3" stroke-linecap="round"/>`
      },
      {
        id: 'shell', name: '筒身', x: 108, y: 150, w: 232, h: 68, z: 2, seq: 2,
        easy: true,
        hint: '筒身是手电筒的外壳，电池就装在它里面',
        svg: `<rect x="2" y="4" width="228" height="60" rx="16" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="24" y="14" width="150" height="12" rx="6" fill="#FFF7EA" opacity=".35"/>
              <rect x="60" y="38" width="46" height="12" rx="6" fill="#FF7A45" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'bulb', name: '灯泡', x: 328, y: 166, w: 32, h: 38, z: 3, seq: 3,
        easy: true,
        hint: '灯泡装在灯头里，通电就会发光',
        svg: `<circle cx="16" cy="17" r="14" fill="#FFF3B0" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="5" y="29" width="22" height="8" rx="4" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'lens', name: '镜片', x: 392, y: 156, w: 24, h: 56, z: 5, seq: 4,
        easy: true,
        hint: '透明镜片卡在灯头最前面，保护灯泡',
        svg: `<ellipse cx="12" cy="28" rx="9" ry="26" fill="#C9ECFF" stroke="#3D2C1E" stroke-width="4"/>
              <path d="M8 18 Q13 12 10 4" stroke="#FFFFFF" stroke-width="3" stroke-linecap="round" opacity=".85"/>`
      },
      {
        id: 'head', name: '灯头盖', x: 336, y: 146, w: 66, h: 76, z: 4, seq: 5,
        easy: true,
        hint: '灯头盖是筒身前端的喇叭口，最外一层',
        svg: `<path d="M4 32 L14 8 Q16 2 24 2 L44 2 Q56 2 58 10 L58 66 Q56 74 44 74 L24 74 Q16 74 14 68 Z" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M50 6 L50 70" stroke="#8A7364" stroke-width="5" stroke-linecap="round"/>`
      }
    ]
  },

  /* ---------------- 铅笔盒：盒身 → 文具 → 盒盖 ---------------- */
  pencilCase: {
    id: 'pencilCase',
    name: '铅笔盒',
    tag: '整理收纳',
    base: `
      <ellipse cx="240" cy="288" rx="122" ry="10" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'caseBody', name: '盒身', x: 128, y: 198, w: 224, h: 74, z: 2, seq: 1,
        easy: true,
        hint: '盒身是铅笔盒的底，文具都放在里面',
        svg: `<rect x="3" y="10" width="218" height="61" rx="12" fill="#4D96FF" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="14" y="14" width="196" height="34" rx="8" fill="#EAF2FF" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'pencil', name: '铅笔', x: 150, y: 180, w: 150, h: 16, z: 3, seq: 2,
        easy: true,
        hint: '铅笔躺在盒子里，笔尖朝外',
        svg: `<rect x="2" y="3" width="128" height="10" rx="5" fill="#FFC53D" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M130 3 L146 8 L130 13 Z" fill="#FFE0B2" stroke="#3D2C1E" stroke-width="3" stroke-linejoin="round"/>
              <path d="M140 6 L146 8 L140 10 Z" fill="#3D2C1E"/>`
      },
      {
        id: 'ruler', name: '尺子', x: 156, y: 198, w: 120, h: 14, z: 3, seq: 2,
        easy: true,
        hint: '尺子贴着盒子边放平',
        svg: `<rect x="2" y="2" width="116" height="10" rx="3" fill="#FFE066" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M16 2 L16 8 M30 2 L30 8 M44 2 L44 8 M58 2 L58 8 M72 2 L72 8 M86 2 L86 8 M100 2 L100 8" stroke="#3D2C1E" stroke-width="2"/>`
      },
      {
        id: 'eraser', name: '橡皮', x: 286, y: 188, w: 36, h: 26, z: 3, seq: 2,
        easy: false,
        hint: '橡皮放在盒子右端，盖盖子前别忘拿',
        svg: `<rect x="2" y="2" width="32" height="22" rx="6" fill="#FF9FB2" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M10 2 L10 24" stroke="#3D2C1E" stroke-width="2"/>`
      },
      {
        id: 'caseLid', name: '盒盖', x: 136, y: 138, w: 208, h: 52, z: 4, seq: 3,
        easy: true,
        hint: '盒盖最后扣上，咔哒一声就关好了',
        svg: `<rect x="2" y="6" width="204" height="42" rx="12" fill="#2EC4B6" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="86" y="20" width="36" height="10" rx="5" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="3"/>`
      }
    ]
  },

  /* ---------------- 烧水壶：底座(含开关) → 内胆 → 壶身 → 手柄 → 壶盖 ---------------- */
  kettle: {
    id: 'kettle',
    name: '烧水壶',
    tag: '生活认知',
    base: `
      <ellipse cx="240" cy="316" rx="112" ry="11" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'kettleBase', name: '底座', x: 172, y: 268, w: 136, h: 44, z: 1, seq: 1,
        easy: true,
        hint: '底座插上电，壶放上去才能烧水',
        svg: `<path d="M8 40 Q8 10 68 10 Q128 10 128 40 Z" fill="#6B5B4F" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <ellipse cx="68" cy="40" rx="58" ry="6" fill="#8A7364"/>`
      },
      {
        id: 'kettleSwitch', name: '开关', x: 276, y: 276, w: 26, h: 16, z: 3, seq: 1,
        easy: false,
        hint: '底座侧面的开关，按下去就通电',
        svg: `<rect x="2" y="2" width="22" height="12" rx="6" fill="#FF7A45" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'heater', name: '内胆', x: 186, y: 196, w: 108, h: 74, z: 1, seq: 2,
        easy: false, staticInEasy: true,
        hint: '内胆包着加热盘，水就是在这里烧开的',
        svg: `<rect x="6" y="6" width="96" height="62" rx="12" fill="#C7D0D8" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="54" cy="36" r="24" fill="none" stroke="#8A7364" stroke-width="4"/>
              <path d="M36 36 Q54 24 72 36 Q54 48 36 36" fill="none" stroke="#8A7364" stroke-width="3"/>`
      },
      {
        id: 'kettleBody', name: '壶身', x: 170, y: 150, w: 160, h: 126, z: 2, seq: 3,
        easy: true,
        hint: '壶身套在内胆外面，左边是壶嘴',
        svg: `<path d="M20 120 Q6 60 24 30 Q40 6 80 6 Q120 6 136 30 Q154 60 140 120 Z" fill="#F4F7FA" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M20 46 L2 26 L6 62 Z" fill="#E8EDF2" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M34 96 Q80 84 126 96" stroke="#C7D0D8" stroke-width="4" fill="none"/>`
      },
      {
        id: 'kettleHandle', name: '手柄', x: 320, y: 132, w: 56, h: 96, z: 3, seq: 4,
        easy: true,
        hint: '手柄装在壶身右侧，握着不烫手',
        svg: `<path d="M8 8 Q44 8 44 48 Q44 88 8 88" fill="none" stroke="#3D2C1E" stroke-width="12" stroke-linecap="round"/>
              <path d="M8 8 Q44 8 44 48 Q44 88 8 88" fill="none" stroke="#8A7364" stroke-width="6" stroke-linecap="round"/>`
      },
      {
        id: 'kettleLid', name: '壶盖', x: 196, y: 118, w: 88, h: 40, z: 4, seq: 5,
        easy: true,
        hint: '壶盖最后盖上，水开后别马上掀',
        svg: `<path d="M6 32 Q6 6 44 6 Q82 6 82 32 Z" fill="#E8EDF2" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <rect x="34" y="0" width="20" height="10" rx="5" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>`
      }
    ]
  },

  /* ---------------- 自行车：车架 → 车轮 → 链条/脚踏 → 挡泥板 → 车座车把 → 车铃 ---------------- */
  bike: {
    id: 'bike',
    name: '自行车',
    tag: '机械原理',
    base: `
      <ellipse cx="240" cy="306" rx="150" ry="10" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'chain', name: '链条', x: 146, y: 230, w: 100, h: 32, z: 1, seq: 3,
        easy: false,
        hint: '链条套在前齿盘和后飞轮上，要啮合住',
        svg: `<ellipse cx="50" cy="16" rx="44" ry="11" fill="none" stroke="#3D2C1E" stroke-width="4" stroke-dasharray="5 4"/>`
      },
      {
        id: 'crank', name: '脚踏', x: 226, y: 238, w: 56, h: 50, z: 2, seq: 3,
        easy: false,
        hint: '脚踏接在前齿盘轴上，踩它车才会走',
        svg: `<circle cx="14" cy="22" r="10" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>
              <path d="M14 22 L42 22" stroke="#3D2C1E" stroke-width="6" stroke-linecap="round"/>
              <rect x="36" y="14" width="16" height="12" rx="4" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'frame', name: '车架', x: 130, y: 140, w: 210, h: 120, z: 2, seq: 1,
        easy: true,
        hint: '车架是整车的骨架，所有零件都挂在它上面',
        svg: `<g fill="none" stroke-linecap="round" stroke-linejoin="round">
                <path d="M20 106 L80 12 L110 106 Z M80 12 L180 26 M110 106 L180 26 M180 26 L200 106" stroke="#3D2C1E" stroke-width="13"/>
                <path d="M20 106 L80 12 L110 106 Z M80 12 L180 26 M110 106 L180 26 M180 26 L200 106" stroke="#FF7A45" stroke-width="7"/>
              </g>`
      },
      {
        id: 'rearWheelB', name: '后车轮', x: 100, y: 196, w: 100, h: 100, z: 1, seq: 2,
        easy: true,
        hint: '后车轮套在车架后叉上',
        svg: `<circle cx="50" cy="50" r="46" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="5"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#B8B2A7" stroke-width="3"/>
              <path d="M50 10 L50 90 M10 50 L90 50 M22 22 L78 78 M78 22 L22 78" stroke="#B8B2A7" stroke-width="2"/>
              <circle cx="50" cy="50" r="8" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'frontWheelB', name: '前车轮', x: 280, y: 196, w: 100, h: 100, z: 1, seq: 2,
        easy: true,
        hint: '前车轮装在前叉上，能带着车把转向',
        svg: `<circle cx="50" cy="50" r="46" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="5"/>
              <circle cx="50" cy="50" r="40" fill="none" stroke="#B8B2A7" stroke-width="3"/>
              <path d="M50 10 L50 90 M10 50 L90 50 M22 22 L78 78 M78 22 L22 78" stroke="#B8B2A7" stroke-width="2"/>
              <circle cx="50" cy="50" r="8" fill="#8A7364" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'fenderR', name: '后挡泥板', x: 92, y: 172, w: 116, h: 46, z: 3, seq: 4,
        easy: false,
        hint: '挡泥板罩在车轮上方，挡住甩起来的泥水',
        svg: `<path d="M6 40 Q8 8 58 8 Q108 8 110 40" fill="none" stroke="#3D2C1E" stroke-width="9" stroke-linecap="round"/>`
      },
      {
        id: 'fenderF', name: '前挡泥板', x: 272, y: 172, w: 116, h: 46, z: 3, seq: 4,
        easy: false,
        hint: '前挡泥板装在前轮上方',
        svg: `<path d="M6 40 Q8 8 58 8 Q108 8 110 40" fill="none" stroke="#3D2C1E" stroke-width="9" stroke-linecap="round"/>`
      },
      {
        id: 'saddle', name: '车座', x: 176, y: 116, w: 62, h: 26, z: 3, seq: 5,
        easy: true,
        hint: '车座插在座管顶端，坐上去才舒服',
        svg: `<path d="M4 18 Q10 4 34 4 Q58 4 58 16 Q58 24 40 24 L10 24 Q4 24 4 18 Z" fill="#4A3A2E" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'handlebar', name: '车把', x: 290, y: 138, w: 90, h: 52, z: 3, seq: 5,
        easy: true,
        hint: '车把装在前叉上，用来掌握方向',
        svg: `<path d="M14 44 Q14 10 50 10 Q82 10 82 30" fill="none" stroke="#3D2C1E" stroke-width="9" stroke-linecap="round"/>
              <path d="M4 44 L22 44" stroke="#3D2C1E" stroke-width="11" stroke-linecap="round"/>`
      },
      {
        id: 'bell', name: '车铃', x: 336, y: 122, w: 28, h: 28, z: 4, seq: 6,
        easy: true,
        hint: '车铃装在车把上，叮铃铃提醒行人',
        svg: `<circle cx="14" cy="16" r="11" fill="#FFC53D" stroke="#3D2C1E" stroke-width="4"/>
              <path d="M14 5 L14 1" stroke="#3D2C1E" stroke-width="3" stroke-linecap="round"/>`
      }
    ]
  },

  /* ---------------- 台钻：底座 → 立柱 → 工作台 → 机头 → 电机 → 皮带 → 钻夹头 → 钻头 ---------------- */
  drill: {
    id: 'drill',
    name: '台钻',
    tag: '机械原理',
    base: `
      <ellipse cx="240" cy="316" rx="126" ry="11" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'drillBase', name: '底座', x: 150, y: 274, w: 180, h: 40, z: 1, seq: 1,
        easy: true,
        hint: '底座最重，压在台面上台钻才不会晃',
        svg: `<path d="M10 34 Q10 8 90 8 Q170 8 170 34 Z" fill="#6B5B4F" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <ellipse cx="90" cy="34" rx="80" ry="6" fill="#8A7364"/>`
      },
      {
        id: 'column', name: '立柱', x: 228, y: 158, w: 24, h: 122, z: 1, seq: 2,
        easy: true,
        hint: '立柱插进底座，是整台的脊梁',
        svg: `<rect x="4" y="4" width="16" height="114" rx="6" fill="#B8B2A7" stroke="#3D2C1E" stroke-width="4"/>
              <rect x="8" y="10" width="4" height="100" rx="2" fill="#FFF7EA" opacity=".5"/>`
      },
      {
        id: 'drillTable', name: '工作台', x: 196, y: 228, w: 108, h: 22, z: 2, seq: 3,
        easy: true,
        hint: '工作台套在立柱上，工件放在这里',
        svg: `<rect x="2" y="2" width="104" height="18" rx="6" fill="#8A7364" stroke="#3D2C1E" stroke-width="4"/>`
      },
      {
        id: 'drillHead', name: '机头', x: 196, y: 100, w: 100, h: 60, z: 2, seq: 4,
        easy: true,
        hint: '机头套在立柱顶端，里面是主轴',
        svg: `<rect x="2" y="2" width="96" height="56" rx="14" fill="#4D96FF" stroke="#3D2C1E" stroke-width="4"/>
              <circle cx="28" cy="16" r="7" fill="#FFF7EA" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'motor', name: '电机', x: 288, y: 112, w: 64, h: 46, z: 1, seq: 5,
        easy: false,
        hint: '电机挂在机头后面，通过皮带带动主轴',
        svg: `<rect x="2" y="6" width="56" height="34" rx="12" fill="#8A7364" stroke="#3D2C1E" stroke-width="4"/>
              <path d="M14 14 L14 32 M24 14 L24 32 M34 14 L34 32" stroke="#6B5B4F" stroke-width="3"/>`
      },
      {
        id: 'belt', name: '皮带', x: 214, y: 104, w: 96, h: 24, z: 3, seq: 6,
        easy: false,
        hint: '皮带把电机的动力传给主轴，要张紧',
        svg: `<path d="M8 4 L88 4 A8 8 0 0 1 88 20 L8 20 A8 8 0 0 1 8 4 Z" fill="none" stroke="#3D2C1E" stroke-width="6"/>
              <path d="M20 4 L20 20 M44 4 L44 20 M68 4 L68 20" stroke="#3D2C1E" stroke-width="2"/>`
      },
      {
        id: 'chuck', name: '钻夹头', x: 216, y: 158, w: 30, h: 30, z: 3, seq: 7,
        easy: true,
        hint: '钻夹头卡住钻头，装的时候要对准主轴',
        svg: `<circle cx="15" cy="12" r="10" fill="#8A7364" stroke="#3D2C1E" stroke-width="4"/>
              <path d="M8 20 L22 20" stroke="#3D2C1E" stroke-width="5" stroke-linecap="round"/>`
      },
      {
        id: 'bit', name: '钻头', x: 226, y: 186, w: 12, h: 44, z: 3, seq: 8,
        easy: true,
        hint: '钻头最后装进夹头，尖头朝下对准工件',
        svg: `<path d="M6 2 L6 30 M2 30 L10 30" stroke="#3D2C1E" stroke-width="4" stroke-linecap="round"/>
              <path d="M6 8 L9 12 M6 16 L9 20 M6 24 L9 28" stroke="#B8B2A7" stroke-width="3"/>`
      }
    ]
  },

  /* ---------------- 雨伞：伞杆 → 伞柄 → 开关 → 伞骨 → 伞面 → 伞顶盖 → 伞尖 ---------------- */
  umbrella: {
    id: 'umbrella',
    name: '雨伞',
    tag: '结构认知',
    base: `
      <ellipse cx="240" cy="322" rx="70" ry="9" fill="rgba(61,44,30,.08)"/>
    `,
    parts: [
      {
        id: 'shaft', name: '伞杆', x: 232, y: 80, w: 16, h: 194, z: 1, seq: 1,
        easy: true,
        hint: '伞杆是雨伞的中轴，一头接伞柄，一头接伞骨',
        svg: `<path d="M8 4 L8 190" stroke="#3D2C1E" stroke-width="8" stroke-linecap="round"/>
              <path d="M8 8 L8 186" stroke="#B8B2A7" stroke-width="3" stroke-linecap="round"/>`
      },
      {
        id: 'umbrellaHandle', name: '伞柄', x: 214, y: 258, w: 60, h: 62, z: 1, seq: 2,
        easy: true,
        hint: '伞柄接在伞杆下端，弯钩方便挂着',
        svg: `<path d="M30 4 L30 30 Q30 52 12 52 Q2 52 2 40" fill="none" stroke="#3D2C1E" stroke-width="9" stroke-linecap="round"/>`
      },
      {
        id: 'runner', name: '开关', x: 246, y: 186, w: 28, h: 22, z: 2, seq: 3,
        easy: false,
        hint: '伞杆上的开关卡住下巢，按一下就能收伞',
        svg: `<rect x="2" y="2" width="24" height="18" rx="8" fill="#FF7A45" stroke="#3D2C1E" stroke-width="3"/>`
      },
      {
        id: 'ribs', name: '伞骨', x: 96, y: 92, w: 288, h: 96, z: 2, seq: 4,
        easy: false,
        hint: '伞骨从伞杆顶端撑开，撑住整个伞面',
        svg: `<g stroke="#8A7364" stroke-width="4" stroke-linecap="round">
                <path d="M144 6 L20 74"/><path d="M144 6 L74 88"/><path d="M144 6 L144 92"/>
                <path d="M144 6 L214 88"/><path d="M144 6 L268 74"/>
              </g>`
      },
      {
        id: 'canopy', name: '伞面', x: 88, y: 66, w: 304, h: 112, z: 3, seq: 5,
        easy: true,
        hint: '伞面罩在伞骨外面，挡住雨水',
        svg: `<path d="M4 100 Q14 6 152 6 Q290 6 300 100 Q262 78 224 100 Q186 78 152 100 Q118 78 80 100 Q42 78 4 100 Z" fill="#FF7A45" stroke="#3D2C1E" stroke-width="4" stroke-linejoin="round"/>
              <path d="M76 92 Q84 44 120 20" stroke="#FFB08A" stroke-width="5" fill="none" stroke-linecap="round"/>`
      },
      {
        id: 'cap', name: '伞顶盖', x: 226, y: 48, w: 28, h: 22, z: 4, seq: 6,
        easy: true,
        hint: '伞顶盖扣在伞杆顶端，把伞骨固定住',
        svg: `<path d="M4 18 Q4 2 14 2 Q24 2 24 18 Z" fill="#FFC53D" stroke="#3D2C1E" stroke-width="3" stroke-linejoin="round"/>`
      },
      {
        id: 'tip', name: '伞尖', x: 233, y: 26, w: 14, h: 26, z: 4, seq: 7,
        easy: true,
        hint: '伞尖在最顶上，收伞时朝下就能插住',
        svg: `<path d="M7 24 L7 4" stroke="#3D2C1E" stroke-width="5" stroke-linecap="round"/>`
      }
    ]
  }
};

/* 玩具分级：1 简单 / 2 中度 / 3 困难 */
const TOY_LEVEL = {
  car: 1, lamp: 1, flashlight: 1, pencilCase: 1,
  abacus: 2, clock: 2, robot: 2, fan: 2, kettle: 2,
  bike: 3, drill: 3, umbrella: 3
};

const TOY_ORDER = [
  'car', 'lamp', 'flashlight', 'pencilCase',
  'abacus', 'clock', 'robot', 'fan', 'kettle',
  'bike', 'drill', 'umbrella'
];

/* 组装态完整预览（大厅卡片 / 完成弹窗共用） */
function assembledPreview(toy, viewBox) {
  const parts = toy.parts
    .slice()
    .sort((a, b) => (a.z || 2) - (b.z || 2))
    .map(p => `<g transform="translate(${p.x} ${p.y})">${p.svg}</g>`)
    .join('');
  return `<svg viewBox="${viewBox || '0 0 480 360'}" xmlns="http://www.w3.org/2000/svg">${toy.base}${parts}</svg>`;
}
