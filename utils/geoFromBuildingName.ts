/**
 * 从建筑名称判断是否包含可检索的地理信息（市/区/路名等），用于自动落点；否则走地图点击自由放置。
 */

const GEO_HINT_CN =
  /(?:省|市|自治区|特别行政区|[\u4e00-\u9fff]{1,8}区|[\u4e00-\u9fff]{1,8}县|州|盟|旗|镇|乡|村|大道|路|街|巷|胡同|里|弄)/;

/** 常见景点/建筑类后缀（如「悉尼歌剧院」无「市」「区」但仍可整体地理编码） */
const GEO_LANDMARK_SUFFIX =
  /歌剧院|大剧院|音乐厅|博物馆|美术馆|纪念馆|展览馆|图书馆|电视塔|观光塔|车站|机场|码头|大桥|钟楼|城堡|故宫|天坛|鼓楼|寺庙|教堂|广场|公园|乐园|度假区|外滩|港口/;

/** 常见中外城市/地区关键词（便于「悉尼歌剧院」等识别） */
const GEO_CITY_TOKEN =
  /悉尼|墨尔本|堪培拉|布里斯班|珀斯|阿德莱德|奥克兰|惠灵顿|纽约|洛杉矶|旧金山|伦敦|巴黎|柏林|罗马|巴塞罗那|东京|大阪|京都|首尔|曼谷|新加坡|吉隆坡|雅加达|河内|迪拜|开罗|莫斯科|北京|上海|天津|重庆|广州|深圳|杭州|南京|武汉|成都|西安|苏州|青岛|厦门|三亚|香港|澳门|台北|高雄/;

const GEO_HINT_EN =
  /\b(city|district|county|province|state|region|prefecture|avenue|street|st\.|road|rd\.|blvd|lane|opera|museum|tower|bridge|airport|station|park|palace|cathedral)\b/i;

/** 名称中是否像包含行政区划或道路等可地理编码信息 */
export function hasGeographicHint(name: string): boolean {
  const s = name.trim();
  if (!s) return false;
  if (GEO_HINT_CN.test(s)) return true;
  if (GEO_LANDMARK_SUFFIX.test(s)) return true;
  if (GEO_CITY_TOKEN.test(s)) return true;
  if (GEO_HINT_EN.test(s)) return true;
  // "Beijing, China" / "上海，浦东"
  if (/[,，]\s*[\u4e00-\u9fffA-Za-z]/.test(s)) return true;
  return false;
}

/** 生成多组检索串：全文 + 抽取的省市区片段，提高 Nominatim 命中率 */
export function buildGeocodeQueries(name: string): string[] {
  const q = name.trim();
  const out: string[] = [];
  const push = (x: string) => {
    const t = x.trim();
    if (t.length >= 2 && !out.includes(t)) out.push(t);
  };

  push(q);

  const provCity = q.match(/[\u4e00-\u9fff]+(?:省|市|自治区|特别行政区)/g);
  if (provCity) provCity.forEach(push);

  const districts = q.match(/[\u4e00-\u9fff]{2,10}(?:区|县)/g);
  if (districts) districts.forEach(push);

  // 常见「XX路」「XX大道」作为补充（偏街道级）
  const roads = q.match(/[\u4e00-\u9fff]{2,12}(?:大道|路|街|巷)/g);
  if (roads) roads.slice(0, 2).forEach(push);

  // 「悉尼歌剧院」→ 补充检索「悉尼」，提高 Nominatim 命中率
  const landmarkCity = q.match(
    /^([\u4e00-\u9fff]{2,8})(?=歌剧院|大剧院|音乐厅|博物馆|美术馆|纪念馆|电视塔|车站|机场|大桥|广场|公园)/
  );
  if (landmarkCity?.[1]) push(landmarkCity[1]);

  return out.slice(0, 8);
}
