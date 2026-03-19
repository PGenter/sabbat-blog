// import australia from "../geo/AU.json";
// import tasmania from "../geo/TAS.json";
// import newZealand from "../geo/NZ.json";
// import germany from "../geo/DE.json";
// import fiji from "../geo/FJ.json";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

type GeoJson = any;
const geoCache: Partial<Record<CountryCode, GeoJson>> = {};

export const COUNTRIES = {
  DE: { name: "Deutschland", center: [51.5, 7], zoom: 9, geo: () => import("../geo/DE.json"), img: "../../assets/DE-32.jpg" },
  AU: { name: "Australien", center: [-27, 135], zoom: 5, geo: () => import("../geo/AU.json"), img: "../../assets/AU-32.jpg" },
  TAS: { name: "Tasmanien", center: [-43, 147.5], zoom: 9, geo: () => import("../geo/TAS.json"), img: "../../assets/TAS-32.jpg" },
  NZ: { name: "Neuseeland", center: [-40, 175], zoom: 5, geo: () => import("../geo/NZ.json"), img: "../../assets/NZ-32.jpg" },
  FJ: { name: "Fiji", center: [-17.75, 177.15], zoom: 12, geo: () => import("../geo/FJ.json"), img: "../../assets/FJ-32.jpg" },
} as const satisfies Record<
  string,
  { name: string; center: [number, number]; zoom: number; geo: () => Promise<GeoJson> | GeoJson; img: string }
>;

export type CountryCode = keyof typeof COUNTRIES;

export async function determineSection(
  lat: number,
  lng: number,
): Promise<CountryCode | "Unknown"> {
  // if (isInside(germany, lat, lng)) return "DE";
  // if (isInside(tasmania, lat, lng)) return "TAS";
  // if (isInside(australia, lat, lng)) return "AU";
  // if (isInside(newZealand, lat, lng)) return "NZ";
  // if (isInside(fiji, lat, lng)) return "FJ";
  for (const country of Object.keys(COUNTRIES) as CountryCode[]) {
    const geo = await loadGeo(country);
    if (isInside(geo, lat, lng)) {
      return country;
    }
  }

  return "Unknown";
}

function isInside(geojson: any, lat: number, lng: number) {
  const pt = point([lng, lat]);

  for (const feature of geojson.features) {
    if (booleanPointInPolygon(pt, feature)) {
      return true;
    }
  }

  return false;
}

async function loadGeo(country: CountryCode): Promise<GeoJson> {
  if (geoCache[country]) {
    return geoCache[country]!;
  }

  const module = await COUNTRIES[country].geo();

  geoCache[country] = module.default;

  return geoCache[country]!;
}
