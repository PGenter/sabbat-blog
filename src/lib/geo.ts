import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

type GeoJson = any;
const geoCache: Partial<Record<CountryCode, GeoJson>> = {};

export const COUNTRIES = {
  DE: {
    name: { german: "Deutschland", spanish: "Alemania" },
    center: [51.5, 7],
    zoom: 9,
    geo: () => import("../geo/DE.json"),
    img: "../../assets/DE-32.jpg",
  },
  NL: {
    name: { german: "Niederlande", spanish: "Países Bajos" },
    center: [52.35, 4.9],
    zoom: 10,
    geo: () => import("../geo/NL.json"),
    img: "../../assets/NL-32.jpg",
  },
  HK: {
    name: { german: "Hong Kong", spanish: "Hong Kong" },
    center: [22.3, 114.2],
    zoom: 10,
    geo: () => import("../geo/HK.json"),
    img: "../../assets/HK-32.jpg",
  },
  AU: {
    name: { german: "Australien", spanish: "Australia" },
    center: [-31, 148],
    zoom: 5,
    geo: () => import("../geo/AU.json"),
    img: "../../assets/AU-32.jpg",
  },
  TAS: {
    name: { german: "Tasmanien", spanish: "Tasmania" },
    center: [-43, 147.5],
    zoom: 9,
    geo: () => import("../geo/TAS.json"),
    img: "../../assets/TAS-32.jpg",
  },
  NZ: {
    name: { german: "Neuseeland", spanish: "Nueva Zelanda" },
    center: [-42, 172],
    zoom: 5.5,
    geo: () => import("../geo/NZ.json"),
    img: "../../assets/NZ-32.jpg",
  },
  FJ: {
    name: { german: "Fiji", spanish: "Fiyi" },
    center: [-17.75, 177.17],
    zoom: 12,
    geo: () => import("../geo/FJ.json"),
    img: "../../assets/FJ-32.jpg",
  },
  CDN: {
    name: { german: "Kanada", spanish: "Canadá" },
    center: [49.28, -123.12],
    zoom: 5,
    geo: () => import("../geo/CDN.json"),
    img: "../../assets/CDN-32.jpg",
  },
} as const satisfies Record<
  string,
  {
    name: { german: string; spanish: string };
    center: [number, number];
    zoom: number;
    geo: () => Promise<GeoJson> | GeoJson;
    img: string;
  }
>;

export type CountryCode = keyof typeof COUNTRIES;

export function getCountryName(
  country: CountryCode,
  language: "german" | "spanish",
) {
  return COUNTRIES[country].name[language];
}

export async function determineSection(
  lat: number,
  lng: number,
): Promise<CountryCode | "Unknown"> {
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
