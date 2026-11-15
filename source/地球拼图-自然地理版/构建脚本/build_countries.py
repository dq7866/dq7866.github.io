# -*- coding: utf-8 -*-
"""构建「国家点位」属性表（geodata-countries.js）。

设计原则（合规优先）
--------------------
1. **只输出属性，不输出任何面几何**。本脚本读取 NE 的 admin-0 多边形后，
   只取「名称 / 首都 / 首都坐标 / 大洲 / 标注等级」五个属性，最后丢弃几何。
   成品 game.js 里没有一条国界线、没有一块领土面、没有国家轮廓，
   球面上只有一个点和一行国名——这是「点位注记」，不是政区地图。
2. **清单只取联合国会员国 + 两个观察员国（梵蒂冈、巴勒斯坦），共 195 条**。
   中国台湾、中国香港、中国澳门等地区不单独成条；科索沃、西撒哈拉、
   北塞浦路斯、索马里兰、阿布哈兹、南奥塞梯等 NE 里单列的争议实体
   一律不进表（白名单机制，缺省即排除）。
3. 中国条目只保留一个（首都北京）。
4. 以色列首都取特拉维夫、巴勒斯坦取拉姆安拉（我国立场与教学惯例）。

用法
----
    python build_countries.py
数据放在 ../data/ 下：
    ne_10m_admin_0_countries.geojson
    ne_10m_populated_places.geojson
"""
import io
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, '..', 'data')
OUT = os.path.join(HERE, 'geodata-countries.js')

# ── 195 国白名单：ISO3 → 中文短名（按我国规范） ────────────────────────────
ZH = {
    'AFG': '阿富汗', 'ALB': '阿尔巴尼亚', 'DZA': '阿尔及利亚', 'AND': '安道尔',
    'AGO': '安哥拉', 'ATG': '安提瓜和巴布达', 'ARG': '阿根廷', 'ARM': '亚美尼亚',
    'AUS': '澳大利亚', 'AUT': '奥地利', 'AZE': '阿塞拜疆', 'BHS': '巴哈马',
    'BHR': '巴林', 'BGD': '孟加拉国', 'BRB': '巴巴多斯', 'BLR': '白俄罗斯',
    'BEL': '比利时', 'BLZ': '伯利兹', 'BEN': '贝宁', 'BTN': '不丹',
    'BOL': '玻利维亚', 'BIH': '波黑', 'BWA': '博茨瓦纳', 'BRA': '巴西',
    'BRN': '文莱', 'BGR': '保加利亚', 'BFA': '布基纳法索', 'BDI': '布隆迪',
    'CPV': '佛得角', 'KHM': '柬埔寨', 'CMR': '喀麦隆', 'CAN': '加拿大',
    'CAF': '中非', 'TCD': '乍得', 'CHL': '智利', 'CHN': '中国',
    'COL': '哥伦比亚', 'COM': '科摩罗', 'COG': '刚果（布）', 'COD': '刚果（金）',
    'CRI': '哥斯达黎加', 'CIV': '科特迪瓦', 'HRV': '克罗地亚', 'CUB': '古巴',
    'CYP': '塞浦路斯', 'CZE': '捷克', 'PRK': '朝鲜', 'KOR': '韩国', 'DNK': '丹麦',
    'DJI': '吉布提', 'DMA': '多米尼克', 'DOM': '多米尼加', 'ECU': '厄瓜多尔',
    'EGY': '埃及', 'SLV': '萨尔瓦多', 'GNQ': '赤道几内亚', 'ERI': '厄立特里亚',
    'EST': '爱沙尼亚', 'SWZ': '埃斯瓦蒂尼', 'ETH': '埃塞俄比亚', 'FJI': '斐济',
    'FIN': '芬兰', 'FRA': '法国', 'GAB': '加蓬', 'GMB': '冈比亚',
    'GEO': '格鲁吉亚', 'DEU': '德国', 'GHA': '加纳', 'GRC': '希腊',
    'GRD': '格林纳达', 'GTM': '危地马拉', 'GIN': '几内亚', 'GNB': '几内亚比绍',
    'GUY': '圭亚那', 'HTI': '海地', 'HND': '洪都拉斯', 'HUN': '匈牙利',
    'ISL': '冰岛', 'IND': '印度', 'IDN': '印度尼西亚', 'IRN': '伊朗',
    'IRQ': '伊拉克', 'IRL': '爱尔兰', 'ISR': '以色列', 'ITA': '意大利',
    'JAM': '牙买加', 'JPN': '日本', 'JOR': '约旦', 'KAZ': '哈萨克斯坦',
    'KEN': '肯尼亚', 'KIR': '基里巴斯', 'KWT': '科威特', 'KGZ': '吉尔吉斯斯坦',
    'LAO': '老挝', 'LVA': '拉脱维亚', 'LBN': '黎巴嫩', 'LSO': '莱索托',
    'LBR': '利比里亚', 'LBY': '利比亚', 'LIE': '列支敦士登', 'LTU': '立陶宛',
    'LUX': '卢森堡', 'MDG': '马达加斯加', 'MWI': '马拉维', 'MYS': '马来西亚',
    'MDV': '马尔代夫', 'MLI': '马里', 'MLT': '马耳他', 'MHL': '马绍尔群岛',
    'MRT': '毛里塔尼亚', 'MUS': '毛里求斯', 'MEX': '墨西哥', 'FSM': '密克罗尼西亚',
    'MDA': '摩尔多瓦', 'MCO': '摩纳哥', 'MNG': '蒙古', 'MNE': '黑山',
    'MAR': '摩洛哥', 'MOZ': '莫桑比克', 'MMR': '缅甸', 'NAM': '纳米比亚',
    'NRU': '瑙鲁', 'NPL': '尼泊尔', 'NLD': '荷兰', 'NZL': '新西兰',
    'NIC': '尼加拉瓜', 'NER': '尼日尔', 'NGA': '尼日利亚', 'MKD': '北马其顿',
    'NOR': '挪威', 'OMN': '阿曼', 'PAK': '巴基斯坦', 'PLW': '帕劳',
    'PAN': '巴拿马', 'PNG': '巴布亚新几内亚', 'PRY': '巴拉圭', 'PER': '秘鲁',
    'PHL': '菲律宾', 'POL': '波兰', 'PRT': '葡萄牙', 'QAT': '卡塔尔',
    'ROU': '罗马尼亚', 'RUS': '俄罗斯', 'RWA': '卢旺达', 'KNA': '圣基茨和尼维斯',
    'LCA': '圣卢西亚', 'VCT': '圣文森特和格林纳丁斯', 'WSM': '萨摩亚',
    'SMR': '圣马力诺', 'STP': '圣多美和普林西比', 'SAU': '沙特阿拉伯',
    'SEN': '塞内加尔', 'SRB': '塞尔维亚', 'SYC': '塞舌尔', 'SLE': '塞拉利昂',
    'SGP': '新加坡', 'SVK': '斯洛伐克', 'SVN': '斯洛文尼亚', 'SLB': '所罗门群岛',
    'SOM': '索马里', 'ZAF': '南非', 'SSD': '南苏丹', 'ESP': '西班牙',
    'LKA': '斯里兰卡', 'SDN': '苏丹', 'SUR': '苏里南', 'SWE': '瑞典',
    'CHE': '瑞士', 'SYR': '叙利亚', 'TJK': '塔吉克斯坦', 'TZA': '坦桑尼亚',
    'THA': '泰国', 'TLS': '东帝汶', 'TGO': '多哥', 'TON': '汤加',
    'TTO': '特立尼达和多巴哥', 'TUN': '突尼斯', 'TUR': '土耳其',
    'TKM': '土库曼斯坦', 'TUV': '图瓦卢', 'UGA': '乌干达', 'UKR': '乌克兰',
    'ARE': '阿联酋', 'GBR': '英国', 'USA': '美国', 'URY': '乌拉圭',
    'UZB': '乌兹别克斯坦', 'VUT': '瓦努阿图', 'VEN': '委内瑞拉',
    'VNM': '越南', 'YEM': '也门', 'ZMB': '赞比亚', 'ZWE': '津巴布韦',
    'VAT': '梵蒂冈', 'PSE': '巴勒斯坦',
}

# NE 的 NAME 是缩写的地方改成规范英文名
EN_FIX = {
    'Dem. Rep. Congo': 'DR Congo',
    'Bosnia and Herz.': 'Bosnia and Herzegovina',
    'Central African Rep.': 'Central African Republic',
    'Eq. Guinea': 'Equatorial Guinea',
    'S. Sudan': 'South Sudan',
    'Solomon Is.': 'Solomon Islands',
    'Dominican Rep.': 'Dominican Republic',
    'Lao PDR': 'Laos',
    'Dem. Rep. Korea': 'North Korea',
    'Republic of Korea': 'South Korea',
    'St. Vin. and Gren.': 'Saint Vincent and the Grenadines',
    'Antigua and Barb.': 'Antigua and Barbuda',
    'São Tomé and Principe': 'São Tomé and Príncipe',
    'eSwatini': 'Eswatini',
    'Swaziland': 'Eswatini',
    'Macedonia': 'North Macedonia',
    'Cabo Verde': 'Cabo Verde',
    'Turkey': 'Türkiye',
    'Côte d\'Ivoire': "Côte d'Ivoire",
    'Falkland Is.': 'Falkland Islands',
    'W. Sahara': 'Western Sahara',
    'Fr. S. Antarctic Lands': 'French Southern Territories',
}

# 首都特殊处理：NE 的标记不符合我国立场或教学惯例的，手工指定
# 值 = (英文名, 中文名) 或 (英文名, 中文名, 经度, 纬度)
CAP_FIX = {
    'ISR': ('Tel Aviv', '特拉维夫'),
    'PSE': ('Ramallah', '拉姆安拉', 35.206, 31.903),
    'ZAF': ('Pretoria', '比勒陀利亚'),
    'LKA': ('Sri Jayewardenepura Kotte', '斯里贾亚瓦德纳普拉科特'),
    'NLD': ('Amsterdam', '阿姆斯特丹'),
    'BOL': ('Sucre', '苏克雷'),
    'CIV': ('Yamoussoukro', '亚穆苏克罗'),
    'TZA': ('Dodoma', '多多马'),
    'MMR': ('Naypyidaw', '内比都'),
    'KAZ': ('Astana', '阿斯塔纳'),
    # 瑙鲁无正式首都，亚伦为事实上的行政中心
    'NRU': ('Yaren', '亚伦', 166.917, -0.547),
}

# NE 名称/中文名的逐条订正
NAME_FIX = {
    'USA': ('United States of America', None),
    'VAT': ('Vatican City', None),
    'COD': (None, '刚果（金）'),
}

CONT = {
    'Asia': 'AS', 'Africa': 'AF', 'Europe': 'EU', 'North America': 'NA',
    'South America': 'SA', 'Oceania': 'OC', 'Antarctica': 'AN',
    'Seven seas (open ocean)': 'OC',
}


def main():
    countries = json.load(io.open(os.path.join(DATA, 'ne_10m_admin_0_countries.geojson'),
                                 encoding='utf-8'))['features']
    places = json.load(io.open(os.path.join(DATA, 'ne_10m_populated_places.geojson'),
                               encoding='utf-8'))['features']

    def key_of(p):
        """NE 的编码不统一：巴勒斯坦 ADM0_A3=PSX、南苏丹 ADM0_A3=SDS、
        法国/挪威的 ISO_A3=-99。先试 ADM0_A3，再退回 ISO_A3。"""
        for k in (p.get('ADM0_A3'), p.get('ISO_A3'), p.get('ISO_A3_EH')):
            if k in ZH:
                return k
        return None

    by_iso = {}
    for f in countries:
        p = f['properties']
        k = key_of(p)
        if k and k not in by_iso:
            by_iso[k] = p

    caps = {}
    for f in places:
        p = f['properties']
        if p.get('FEATURECLA') != 'Admin-0 capital':
            continue
        k = key_of(p)
        if k and k not in caps:
            caps[k] = p

    rows, missing = [], []
    for iso, zh in ZH.items():
        p = by_iso.get(iso)
        if not p:
            missing.append((iso, 'country'))
            continue
        name = p.get('NAME') or p.get('NAME_LONG') or iso
        en = EN_FIX.get(name, name)
        if iso in NAME_FIX:
            en_fix, zh_fix = NAME_FIX[iso]
            en = en_fix or en
            zh = zh_fix or zh
        cap = caps.get(iso)
        if iso in CAP_FIX:
            fx = CAP_FIX[iso]
            cap_en, cap_zh = fx[0], fx[1]
            if len(fx) >= 4:
                x, y = fx[2], fx[3]
            elif cap:
                x, y = cap['LONGITUDE'], cap['LATITUDE']
            else:
                x, y = p.get('LABEL_X'), p.get('LABEL_Y')
        elif cap:
            cap_en = cap.get('NAME')
            cap_zh = cap.get('NAME_ZH') or cap_en
            x, y = cap['LONGITUDE'], cap['LATITUDE']
        else:
            # 没有首都点位（极少）：退回国家标注点，并把首都留空
            cap_en, cap_zh = '', ''
            x, y = p.get('LABEL_X'), p.get('LABEL_Y')
            missing.append((iso, 'capital'))
        # 清理 NE 里的多余空格（"Washington,  D.C."）
        cap_en = ' '.join(str(cap_en).split())
        if x is None or y is None:
            missing.append((iso, 'coord'))
            continue
        rows.append({
            'a': iso, 'en': en, 'zh': zh,
            'c': CONT.get(p.get('CONTINENT'), 'AS'),
            'r': int(p.get('LABELRANK') or 8),
            'cap': cap_en, 'capz': cap_zh,
            'x': round(float(x), 3), 'y': round(float(y), 3),
        })

    rows.sort(key=lambda r: (r['c'], r['r'], r['en']))
    payload = json.dumps(rows, ensure_ascii=False, separators=(',', ':'))
    io.open(OUT, 'w', encoding='utf-8').write(
        '// 195 国属性表（仅名称/首都/坐标/大洲/标注等级，不含任何国界几何）\n'
        'export const COUNTRIES = %s;\n' % payload)

    print('输出 %d 条，%.1f KB' % (len(rows), len(payload.encode('utf-8')) / 1024))
    if missing:
        print('缺项 %d：%s' % (len(missing), missing))
    # 抽检
    for a in ('CHN', 'USA', 'ISR', 'PSE', 'ZAF', 'VAT', 'TWN', 'XKX'):
        hit = [r for r in rows if r['a'] == a]
        print('  %-4s %s' % (a, hit[0] if hit else '（未收录 · 符合预期）' if a in ('TWN', 'XKX') else '（缺失！）'))


if __name__ == '__main__':
    main()
