import australia from "../geo/AU.json";
import tasmania from "../geo/TAS.json";
import newZealand from "../geo/NZ.json";
import germany from "../geo/DE.json";
import fiji from "../geo/FJ.json";

import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { point } from "@turf/helpers";

export const COUNTRIES = {
  DE: { name: "Deutschland", center: [51.5, 7], zoom: 9 },
  AU: { name: "Australien", center: [-27, 135], zoom: 5 },
  TAS: { name: "Tasmanien", center: [-43, 147.5], zoom: 9 },
  NZ: { name: "Neuseeland", center: [-40, 175], zoom: 5 },
  FJ: { name: "Fiji", center: [-17.75, 177.15], zoom: 12 },
} as const satisfies Record<string, { name: string; center: [number, number]; zoom: number }>;

export type CountryCode = keyof typeof COUNTRIES;

export function determineSection(
  lat: number,
  lng: number,
): "AU" | "TAS" | "NZ" | "FJ" | "DE" | "Unknown" {
  if (isInside(germany, lat, lng)) return "DE";
  if (isInside(tasmania, lat, lng)) return "TAS";
  if (isInside(australia, lat, lng)) return "AU";
  if (isInside(newZealand, lat, lng)) return "NZ";
  if (isInside(fiji, lat, lng)) return "FJ";

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
