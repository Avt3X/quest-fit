import { useEffect, useMemo, useRef } from 'react';
import { View, type ViewStyle } from 'react-native';
import MapView, { Marker, Polyline } from 'react-native-maps';

import { type LatLng, boundsOf } from '@/domain/geo';
import { useAppTheme } from '@/theme/ThemeProvider';

export interface RouteMapProps {
  points: readonly (LatLng & { segment?: number })[];
  height?: number;
  style?: ViewStyle;
  /** Live mode keeps the camera on the latest point and shows the user's location. */
  live?: boolean;
  current?: LatLng | null;
  interactive?: boolean;
}

function splitSegments(points: readonly (LatLng & { segment?: number })[]) {
  const out: { latitude: number; longitude: number }[][] = [];
  let seg: number | null = null;
  for (const p of points) {
    if (p.segment !== seg) {
      out.push([]);
      seg = p.segment ?? 0;
    }
    out[out.length - 1].push({ latitude: p.lat, longitude: p.lng });
  }
  return out;
}

export function RouteMap({ points, height = 240, style, live, current, interactive = true }: RouteMapProps) {
  const { colors, radii, scheme } = useAppTheme();
  const ref = useRef<MapView>(null);
  const segments = useMemo(() => splitSegments(points), [points]);
  const last = current ?? (points.length ? points[points.length - 1] : null);

  useEffect(() => {
    if (!ref.current) return;
    if (live && last) {
      ref.current.animateCamera({ center: { latitude: last.lat, longitude: last.lng }, zoom: 16 }, { duration: 600 });
      return;
    }
    const b = boundsOf(points);
    if (b) {
      ref.current.fitToCoordinates(
        [
          { latitude: b.minLat, longitude: b.minLng },
          { latitude: b.maxLat, longitude: b.maxLng },
        ],
        { edgePadding: { top: 40, right: 40, bottom: 40, left: 40 }, animated: false },
      );
    }
  }, [live, last, points]);

  const initial = last ?? { lat: 41.7151, lng: 44.8271 };
  return (
    <View style={[{ height, borderRadius: radii.xl, overflow: 'hidden', backgroundColor: colors.surfaceMuted }, style]}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={{ latitude: initial.lat, longitude: initial.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }}
        showsUserLocation={!!live}
        followsUserLocation={!!live}
        userInterfaceStyle={scheme}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        pitchEnabled={false}
        rotateEnabled={interactive}
        toolbarEnabled={false}
        accessibilityLabel={live ? 'Live map of your route' : 'Map of the route'}
      >
        {segments.map((coords, i) => (
          <Polyline key={i} coordinates={coords} strokeColor={colors.accent} strokeWidth={5} lineCap="round" lineJoin="round" />
        ))}
        {!live && points.length > 1 ? (
          <>
            <Marker coordinate={{ latitude: points[0].lat, longitude: points[0].lng }} pinColor="green" title="Start" />
            <Marker coordinate={{ latitude: points[points.length - 1].lat, longitude: points[points.length - 1].lng }} pinColor="red" title="Finish" />
          </>
        ) : null}
      </MapView>
    </View>
  );
}
