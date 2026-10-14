import * as React from 'react';
import type { BranchLocation } from './lib';

export type GeoStatus = 'disabled' | 'locating' | 'in_range' | 'out_of_range' | 'permission_denied' | 'unavailable';

export type Coords = { latitude: number; longitude: number; accuracy: number };

export function distanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Tracks the device position against the branch geofence. When enforcement is off it
 * still tries once (silently) so punches can carry coordinates, but never blocks.
 */
export function useGeofence(branch: BranchLocation, enabled = true) {
    const [coords, setCoords] = React.useState<Coords | null>(null);
    const [status, setStatus] = React.useState<GeoStatus>(branch.geofence_enforced ? 'locating' : 'disabled');
    const [distance, setDistance] = React.useState<number | null>(null);
    const [error, setError] = React.useState<string | null>(null);

    const locate = React.useCallback(() => {
        if (!enabled) return;
        if (!navigator.geolocation) {
            setStatus(branch.geofence_enforced ? 'unavailable' : 'disabled');
            setError('This browser does not support location.');
            return;
        }
        if (branch.geofence_enforced) setStatus('locating');
        setError(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const c = { latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) };
                const d = distanceMeters(c.latitude, c.longitude, branch.latitude, branch.longitude);
                setCoords(c);
                setDistance(d);
                setStatus(!branch.geofence_enforced ? 'disabled' : d <= branch.geofence_radius ? 'in_range' : 'out_of_range');
            },
            (err) => {
                if (!branch.geofence_enforced) {
                    setStatus('disabled');
                    return;
                }
                setStatus(err.code === 1 ? 'permission_denied' : 'unavailable');
                setError(err.code === 1 ? 'Location access is blocked for this site.' : err.message || 'Unable to get your location.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 },
        );
    }, [enabled, branch.latitude, branch.longitude, branch.geofence_radius, branch.geofence_enforced]);

    React.useEffect(() => {
        locate();
    }, [locate]);

    const canPunch = !branch.geofence_enforced || status === 'in_range';

    return { coords, status, distance, error, locate, canPunch };
}
