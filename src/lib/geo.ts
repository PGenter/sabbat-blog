import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import { point, polygon } from '@turf/helpers'

const germanyPolygon = polygon([[
  [5.5, 47.0],    // Südwest
  [15.5, 47.0],   // Südost
  [15.5, 55.5],   // Nordost
  [5.5, 55.5],    // Nordwest
  [5.5, 47.0]
]])

const australiaPolygon = polygon([[
  [112, -44],
  [154, -44],
  [154, -10],
  [112, -10],
  [112, -44]
]])

const tasmaniaPolygon = polygon([[
  [144, -44],
  [149, -44],
  [149, -39],
  [144, -39],
  [144, -44]
]])

const newZealandPolygon = polygon([[
  [166, -48],
  [179, -48],
  [179, -33],
  [166, -33],
  [166, -48]
]])

export function determineSection(lat: number, lng: number): 'DE' | 'AU' | 'TAS' | 'NZ' | 'FJ' {
  const pt = point([lng, lat])

  
  if (booleanPointInPolygon(pt, germanyPolygon)) return 'DE'
  if (booleanPointInPolygon(pt, tasmaniaPolygon)) return 'TAS'
  if (booleanPointInPolygon(pt, australiaPolygon)) return 'AU'
  if (booleanPointInPolygon(pt, newZealandPolygon)) return 'NZ'

  return 'FJ'
}