import australia from '../geojson/australia.json';
import tasmania from '../geojson/tasmania.json';
import newZealand from '../geojson/newZealand.json';
import germany from '../geojson/germany.json';
import fiji from '../geojson/fiji.json';

import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point } from '@turf/helpers'

// const germanyPolygon = polygon([[
//   [5.5, 47.0],    // Südwest
//   [15.5, 47.0],   // Südost
//   [15.5, 55.5],   // Nordost
//   [5.5, 55.5],    // Nordwest
//   [5.5, 47.0]
// ]])

// const australiaPolygon = polygon([[
//   [112, -44],
//   [154, -44],
//   [154, -10],
//   [112, -10],
//   [112, -44]
// ]])

// const tasmaniaPolygon = polygon([[
//   [144, -44],
//   [149, -44],
//   [149, -39],
//   [144, -39],
//   [144, -44]
// ]])

// const newZealandPolygon = polygon([[
//   [166, -48],
//   [179, -48],
//   [179, -33],
//   [166, -33],
//   [166, -48]
// ]])

// export function determineSection(lat: number, lng: number): 'DE' | 'AU' | 'TAS' | 'NZ' | 'FJ' {
//   const pt = point([lng, lat])

  
//   if (booleanPointInPolygon(pt, germanyPolygon)) return 'DE'
//   if (booleanPointInPolygon(pt, tasmaniaPolygon)) return 'TAS'
//   if (booleanPointInPolygon(pt, australiaPolygon)) return 'AU'
//   if (booleanPointInPolygon(pt, newZealandPolygon)) return 'NZ'

//   return 'FJ'
// }

export function determineSection(
  lat: number,
  lng: number
): 'AU' | 'TAS' | 'NZ' | 'FJ' | 'DE' | 'Unknown' {

  if (isInside(germany, lat, lng)) return 'DE'
  if (isInside(tasmania, lat, lng)) return 'TAS'
  if (isInside(australia, lat, lng)) return 'AU'
  if (isInside(newZealand, lat, lng)) return 'NZ'
  if (isInside(fiji, lat, lng)) return 'FJ'

  return 'Unknown'

}

function isInside(geojson: any, lat: number, lng: number) {
  const pt = point([lng, lat])

  for (const feature of geojson.features) {
    if (booleanPointInPolygon(pt, feature)) {
      return true
    }
  }

  return false
}