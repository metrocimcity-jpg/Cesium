const WGS84_A = 6378137.0;
const WGS84_F = 1 / 298.257223563;
const UTM_K0 = 0.9996;
const UTM_FALSE_EASTING = 500000.0;
const UTM_FALSE_NORTHING_SOUTH = 10000000.0;

function centralMeridianRadians(zone) {
  return ((zone - 1) * 6 - 180 + 3) * (Math.PI / 180);
}

export function utmToDegrees(easting, northing, zone, northHemisphere) {
  const e2 = WGS84_F * (2 - WGS84_F);
  const ep2 = e2 / (1 - e2);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const x = easting - UTM_FALSE_EASTING;
  let y = northing;
  if (!northHemisphere) {
    y -= UTM_FALSE_NORTHING_SOUTH;
  }

  const m = y / UTM_K0;
  const mu =
    m /
    (WGS84_A *
      (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
  const phi1 =
    mu +
    ((3 * e1) / 2 - (27 * e1 ** 3) / 32) * Math.sin(2 * mu) +
    ((21 * e1 ** 2) / 16 - (55 * e1 ** 4) / 32) * Math.sin(4 * mu) +
    ((151 * e1 ** 3) / 96) * Math.sin(6 * mu) +
    ((1097 * e1 ** 4) / 512) * Math.sin(8 * mu);

  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const n1 = WGS84_A / Math.sqrt(1 - e2 * sinPhi * sinPhi);
  const t1 = tanPhi * tanPhi;
  const c1 = ep2 * cosPhi * cosPhi;
  const r1 = (WGS84_A * (1 - e2)) / (1 - e2 * sinPhi * sinPhi) ** 1.5;
  const d = x / (n1 * UTM_K0);

  const latitude =
    phi1 -
    ((n1 * tanPhi) / r1) *
      (d ** 2 / 2 -
        ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4) / 24 +
        ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) *
          d ** 6) /
          720);
  const longitude =
    centralMeridianRadians(zone) +
    (d -
      ((1 + 2 * t1 + c1) * d ** 3) / 6 +
      ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5) /
        120) /
      cosPhi;

  return {
    longitude: (longitude * 180) / Math.PI,
    latitude: (latitude * 180) / Math.PI,
  };
}

export function degreesToUtm(longitude, latitude) {
  const zone = Math.floor((longitude + 180) / 6) + 1;
  const northHemisphere = latitude >= 0;
  const e2 = WGS84_F * (2 - WGS84_F);
  const ep2 = e2 / (1 - e2);
  const lon = (longitude * Math.PI) / 180;
  const lat = (latitude * Math.PI) / 180;
  const lon0 = centralMeridianRadians(zone);
  const n = WGS84_A / Math.sqrt(1 - e2 * Math.sin(lat) ** 2);
  const t = Math.tan(lat) ** 2;
  const c = ep2 * Math.cos(lat) ** 2;
  const a = Math.cos(lat) * (lon - lon0);
  const m =
    WGS84_A *
    ((1 - e2 / 4 - (3 * e2 ** 2) / 64 - (5 * e2 ** 3) / 256) * lat -
      ((3 * e2) / 8 + (3 * e2 ** 2) / 32 + (45 * e2 ** 3) / 1024) *
        Math.sin(2 * lat) +
      ((15 * e2 ** 2) / 256 + (45 * e2 ** 3) / 1024) * Math.sin(4 * lat) -
      ((35 * e2 ** 3) / 3072) * Math.sin(6 * lat));

  const easting =
    UTM_K0 *
      n *
      (a +
        ((1 - t + c) * a ** 3) / 6 +
        ((5 - 18 * t + t ** 2 + 72 * c - 58 * ep2) * a ** 5) / 120) +
    UTM_FALSE_EASTING;
  let northing =
    UTM_K0 *
    (m +
      n *
        Math.tan(lat) *
        (a ** 2 / 2 +
          ((5 - t + 9 * c + 4 * c ** 2) * a ** 4) / 24 +
          ((61 - 58 * t + t ** 2 + 600 * c - 330 * ep2) * a ** 6) / 720));
  if (!northHemisphere) {
    northing += UTM_FALSE_NORTHING_SOUTH;
  }

  return { easting, northing, zone, northHemisphere };
}
