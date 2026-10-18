import { useEffect, useRef } from 'react'
import DirectionsBusIcon from '@mui/icons-material/DirectionsBus'
import TramIcon from '@mui/icons-material/Tram'
import type {
  ExpressionSpecification,
  GeoJSONSource,
  MapLayerMouseEvent,
  SymbolLayerSpecification,
} from 'maplibre-gl'
import { useMap } from '../map/MapContext'
import { BUS_COLOR, TRAM_COLOR } from '../map/vehicleStyle'
import type { StopCollection } from '../types/stop'
import { VEHICLES_DIRECTION_LAYER, VEHICLES_LABEL_LAYER, VEHICLES_LAYER } from './VehicleLayer'

export const STOPS_LAYER = 'stops-icon'
const SOURCE = 'stops'
const LABELS = 'stops-label'
const ROUTE_STOPS_LAYER = 'route-stops-icon'
const STOPS_MIN_ZOOM = 14 + Math.log2(1.25)
const ICONS: SymbolLayerSpecification = {
  id: STOPS_LAYER,
  type: 'symbol',
  source: SOURCE,
  minzoom: STOPS_MIN_ZOOM,
  layout: {
    'icon-image': ['concat', 'stop-', ['get', 'type']],
    'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.56, 17, 0.8],
    'icon-allow-overlap': true,
  },
}

// Rasterize the installed Material icons once for MapLibre, without creating a DOM marker per stop.
function stopImage(icons: [SVGSVGElement, string][], selected: boolean) {
  const canvas = document.createElement('canvas')
  canvas.width = icons.length === 2 ? 112 : 64
  canvas.height = 64
  const context = canvas.getContext('2d')!
  context.scale(2, 2)
  context.fillStyle = selected ? icons[0][1] : '#ffffff'
  context.strokeStyle = selected ? '#ffffff' : '#546e7a'
  context.lineWidth = 1.5
  context.beginPath()
  context.roundRect(1, 1, canvas.width / 2 - 2, 30, 7)
  context.fill()
  if (selected && icons.length === 2) {
    context.save()
    context.clip()
    context.fillStyle = icons[1][1]
    context.fillRect(canvas.width / 4, 0, canvas.width / 4, 32)
    context.restore()
  }
  context.stroke()
  icons.forEach(([icon, color], index) => {
    context.save()
    context.translate(4 + index * 24, 4)
    context.fillStyle = selected ? '#ffffff' : color
    for (const path of icon.querySelectorAll('path')) {
      context.fill(new Path2D(path.getAttribute('d')!))
    }
    context.restore()
  })
  return context.getImageData(0, 0, canvas.width, canvas.height)
}

export function StopLayer({
  data,
  selectedId,
  onSelect,
  routeStopIds,
}: {
  data: StopCollection
  selectedId: number | null
  onSelect: (id: number) => void
  routeStopIds?: number[] | null
}) {
  const map = useMap()
  const bus = useRef<SVGSVGElement>(null)
  const tram = useRef<SVGSVGElement>(null)
  const initialData = useRef(data)

  // The map can outlive a UI update; restore missing images before switching icon names.
  useEffect(() => {
    if (!map) return
    const busIcon: [SVGSVGElement, string] = [bus.current!, BUS_COLOR]
    const tramIcon: [SVGSVGElement, string] = [tram.current!, TRAM_COLOR]
    for (const [id, icons] of [
      ['bus', [busIcon]],
      ['tram', [tramIcon]],
      ['bus_tram', [busIcon, tramIcon]],
    ] as const) {
      for (const selected of [false, true]) {
        const imageId = `stop-${id}${selected ? '-selected' : ''}`
        if (map.hasImage(imageId)) continue
        map.addImage(imageId, stopImage([...icons], selected), {
          pixelRatio: 2,
        })
      }
      if (!map.hasImage(`stop-${id}-muted`)) {
        map.addImage(
          `stop-${id}-muted`,
          stopImage(
            icons.map(([icon]) => [icon, '#9e9e9e']),
            false,
          ),
          { pixelRatio: 2 },
        )
      }
    }
  }, [map, data, selectedId, routeStopIds])

  useEffect(() => {
    if (!map) return
    map.addSource(SOURCE, { type: 'geojson', data: initialData.current })
    const before = map.getLayer(VEHICLES_LAYER) ? VEHICLES_LAYER : undefined
    map.addLayer(ICONS, before)
    map.addLayer(
      {
        id: LABELS,
        type: 'symbol',
        source: SOURCE,
        minzoom: 16,
        layout: {
          'text-field': ['concat', ['get', 'name'], ' ', ['coalesce', ['get', 'code'], '']],
          'text-font': ['Noto Sans Regular'],
          'text-size': 11,
          'text-anchor': 'top',
          'text-offset': [0, 1.6],
        },
        paint: { 'text-color': '#37474f', 'text-halo-color': '#ffffff', 'text-halo-width': 2 },
      },
      before,
    )
    return () => {
      if (!map.style) return
      for (const id of [LABELS, ROUTE_STOPS_LAYER, STOPS_LAYER])
        if (map.getLayer(id)) map.removeLayer(id)
      if (map.getSource(SOURCE)) map.removeSource(SOURCE)
      for (const type of ['bus', 'tram', 'bus_tram']) {
        for (const suffix of ['', '-selected', '-muted']) {
          if (map.hasImage(`stop-${type}${suffix}`)) map.removeImage(`stop-${type}${suffix}`)
        }
      }
    }
  }, [map])

  useEffect(() => {
    if (!map) return
    if (!map.getLayer(ROUTE_STOPS_LAYER)) {
      map.addLayer(
        {
          ...ICONS,
          id: ROUTE_STOPS_LAYER,
          minzoom: 0,
          maxzoom: STOPS_MIN_ZOOM,
          filter: false,
        },
        LABELS,
      )
    }
    map.getSource<GeoJSONSource>(SOURCE)?.setData(data)
    const relevant: boolean | ExpressionSpecification =
      routeStopIds == null ? true : ['in', ['get', 'stop_id'], ['literal', routeStopIds]]
    for (const layer of [STOPS_LAYER, ROUTE_STOPS_LAYER])
      map.setLayoutProperty(layer, 'icon-image', [
        'concat',
        'stop-',
        ['get', 'type'],
        ['case', ['==', ['get', 'stop_id'], selectedId ?? -1], '-selected', relevant, '', '-muted'],
      ])
    map.setFilter(ROUTE_STOPS_LAYER, routeStopIds == null ? false : relevant)
    map.setPaintProperty(LABELS, 'text-color', ['case', relevant, '#37474f', '#9e9e9e'])
  }, [map, data, selectedId, routeStopIds])

  useEffect(() => {
    if (!map) return
    const layers = [STOPS_LAYER, ROUTE_STOPS_LAYER, LABELS]
    const select = (event: MapLayerMouseEvent) => {
      const vehicles = [VEHICLES_LAYER, VEHICLES_LABEL_LAYER, VEHICLES_DIRECTION_LAYER].filter(
        (id) => map.getLayer(id),
      )
      if (vehicles.length && map.queryRenderedFeatures(event.point, { layers: vehicles }).length)
        return
      const id = event.features?.[0]?.properties?.stop_id
      if (typeof id === 'number') onSelect(id)
    }
    const enter = () => {
      map.getCanvas().style.cursor = 'pointer'
    }
    const leave = () => {
      map.getCanvas().style.cursor = ''
    }
    map.on('click', layers, select)
    map.on('mouseenter', layers, enter)
    map.on('mouseleave', layers, leave)
    return () => {
      map.off('click', layers, select)
      map.off('mouseenter', layers, enter)
      map.off('mouseleave', layers, leave)
      leave()
    }
  }, [map, onSelect])

  return (
    <span hidden>
      <DirectionsBusIcon ref={bus} />
      <TramIcon ref={tram} />
    </span>
  )
}
