import { Head, router, usePage } from '@inertiajs/react';
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    Coffee,
    Compass,
    Crosshair,
    HelpCircle,
    Info,
    LocateFixed,
    LogIn,
    LogOut,
    MapPin,
    Navigation,
    PauseCircle,
    PlayCircle,
    RefreshCw,
    Search,
    Settings,
    ShieldAlert,
    ShieldCheck,
    UserCheck,
    Zap,
} from 'lucide-react';
import * as React from 'react';
import AppLayout from '@/layouts/app-layout';
import Heading from '@/components/heading';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { hasAnyPermission } from '@/lib/permissions';
import { toast } from '@/lib/toast';
import type { Auth, BreadcrumbItem } from '@/types';

const breadcrumbs: BreadcrumbItem[] = [
    { title: 'Employee Management', href: '/employee-management/roster' },
    { title: 'Time & Attendance', href: '/employee-management/attendance' },
];

type EmployeeOption = {
    id: number;
    employee_code: string;
    firstname: string;
    lastname: string;
    biometric_id: string | null;
    position?: string;
    department?: string;
};

type DtrRow = {
    id: number;
    work_date: string;
    time_in: string | null;
    break_out: string | null;
    break_in: string | null;
    time_out: string | null;
    regular_hours: string | number;
    ot_hours: string | number;
    tardiness_minutes: number;
    distance_meters?: number | null;
    location_status?: string;
    is_absent: boolean;
    notes?: string | null;
    employee?: {
        id: number;
        employee_code: string;
        firstname: string;
        lastname: string;
        position: string;
        department: string;
        biometric_id: string | null;
    };
};

type BranchLocation = {
    id?: number;
    name: string;
    latitude: number;
    longitude: number;
    geofence_radius: number;
    geofence_enforced: boolean;
};

type PaginatedDtr = {
    data: DtrRow[];
    current_page: number;
    last_page: number;
    total: number;
    per_page: number;
    prev_page_url: string | null;
    next_page_url: string | null;
};

type Props = {
    entries: PaginatedDtr;
    employees: EmployeeOption[];
    kpis: {
        totalRegularHours: number;
        totalOtHours: number;
        totalTardinessMinutes: number;
        exceptionsCount: number;
    };
    branchLocation: BranchLocation;
    todayEntries: Record<string, DtrRow>;
    currentUserEmployee: EmployeeOption | null;
    filters: {
        date_from: string;
        date_to: string;
        employee_id: string | null;
        exceptions_only: boolean;
    };
};

/**
 * Calculate client-side Haversine distance in meters
 */
function calculateDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371000; // meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) *
            Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
}

export default function AttendancePage({
    entries,
    employees,
    kpis,
    branchLocation,
    todayEntries,
    currentUserEmployee,
    filters,
}: Props) {
    const { auth } = usePage<{ auth: Auth }>().props;
    const canManageAttendance = hasAnyPermission(auth, ['attendance.manage', 'payroll.manage']);

    // Current live clock state (PST)
    const [currentTime, setCurrentTime] = React.useState<Date>(new Date());

    React.useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Geolocation State
    const [userCoords, setUserCoords] = React.useState<{
        latitude: number;
        longitude: number;
        accuracy: number;
    } | null>(null);
    const [geoStatus, setGeoStatus] = React.useState<
        'disabled' | 'locating' | 'in_range' | 'out_of_range' | 'permission_denied' | 'unavailable'
    >(branchLocation.geofence_enforced ? 'locating' : 'disabled');
    const [distanceToBranch, setDistanceToBranch] = React.useState<number | null>(null);
    const [geoErrorMessage, setGeoErrorMessage] = React.useState<string | null>(null);
    const [isRefreshingLocation, setIsRefreshingLocation] = React.useState(false);

    // Active Punch Employee State
    const [selectedEmployeeId, setSelectedEmployeeId] = React.useState<string>(() => {
        if (currentUserEmployee?.id) return String(currentUserEmployee.id);
        if (employees.length > 0) return String(employees[0].id);
        return '';
    });

    const [isSubmittingPunch, setIsSubmittingPunch] = React.useState(false);
    const [isGeofenceSettingsOpen, setIsGeofenceSettingsOpen] = React.useState(false);
    const [isCheckoutRemarkOpen, setIsCheckoutRemarkOpen] = React.useState(false);
    const [checkoutRemark, setCheckoutRemark] = React.useState('');

    // Branch Settings Form State
    const [geofenceForm, setGeofenceForm] = React.useState({
        latitude: String(branchLocation.latitude),
        longitude: String(branchLocation.longitude),
        geofence_radius: String(branchLocation.geofence_radius),
        geofence_enforced: branchLocation.geofence_enforced,
    });

    // Request/Refresh GPS Coordinates
    const requestLocation = React.useCallback(() => {
        if (!branchLocation.geofence_enforced) {
            setGeoStatus('disabled');
            setGeoErrorMessage(null);
            setIsRefreshingLocation(false);
            return;
        }

        if (!navigator.geolocation) {
            setGeoStatus('unavailable');
            setGeoErrorMessage('Geolocation is not supported by your browser.');
            return;
        }

        setIsRefreshingLocation(true);
        setGeoStatus('locating');
        setGeoErrorMessage(null);

        navigator.geolocation.getCurrentPosition(
            (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                const accuracy = Math.round(pos.coords.accuracy);

                setUserCoords({ latitude: lat, longitude: lon, accuracy });

                const dist = calculateDistanceMeters(
                    lat,
                    lon,
                    branchLocation.latitude,
                    branchLocation.longitude
                );
                setDistanceToBranch(dist);

                if (!branchLocation.geofence_enforced || dist <= branchLocation.geofence_radius) {
                    setGeoStatus('in_range');
                } else {
                    setGeoStatus('out_of_range');
                }
                setIsRefreshingLocation(false);
            },
            (err) => {
                setIsRefreshingLocation(false);
                if (err.code === 1) {
                    setGeoStatus('permission_denied');
                    setGeoErrorMessage('Location permission was denied. Please allow location access to clock attendance.');
                } else {
                    setGeoStatus('unavailable');
                    setGeoErrorMessage(err.message || 'Unable to retrieve your current location.');
                }
            },
            {
                enableHighAccuracy: true,
                timeout: 10000,
                maximumAge: 0,
            }
        );
    }, [branchLocation.latitude, branchLocation.longitude, branchLocation.geofence_radius, branchLocation.geofence_enforced]);

    // Initial GPS location request on load
    React.useEffect(() => {
        requestLocation();
    }, [requestLocation]);

    // Today's DTR entry for the currently selected employee
    const currentTodayEntry = selectedEmployeeId ? todayEntries[selectedEmployeeId] : undefined;

    // Shift punch flags
    const hasCheckedIn = Boolean(currentTodayEntry?.time_in);
    const hasBrokenOut = Boolean(currentTodayEntry?.break_out);
    const hasBrokenIn = Boolean(currentTodayEntry?.break_in);
    const hasCheckedOut = Boolean(currentTodayEntry?.time_out);
    const hasBreakPunchGap = !hasBrokenOut || !hasBrokenIn;

    // Geofence activation check
    const isLocationAuthorized =
        !branchLocation.geofence_enforced || geoStatus === 'in_range';

    // Buttons enabled status
    const canCheckIn = !hasCheckedIn && isLocationAuthorized && !isSubmittingPunch;
    const canBreakOut = hasCheckedIn && !hasBrokenOut && !hasCheckedOut && isLocationAuthorized && !isSubmittingPunch;
    const canBreakIn = hasBrokenOut && !hasBrokenIn && !hasCheckedOut && isLocationAuthorized && !isSubmittingPunch;
    const canCheckOut = hasCheckedIn && !hasCheckedOut && isLocationAuthorized && !isSubmittingPunch;

    // Handle Direct Punch
    const handlePunch = (punchType: 'check_in' | 'break_out' | 'break_in' | 'check_out', notes?: string) => {
        if (!selectedEmployeeId) {
            toast.error('Please select an employee.');
            return;
        }

        if (punchType === 'check_out' && hasBreakPunchGap && notes === undefined) {
            setIsCheckoutRemarkOpen(true);
            return;
        }

        if (punchType === 'check_out' && hasBreakPunchGap && !notes?.trim()) {
            toast.error('Add a remark explaining the missing break punch before checking out.');
            return;
        }

        if (branchLocation.geofence_enforced && geoStatus !== 'in_range') {
            toast.error(
                `Clocking disabled: You must be within ${branchLocation.geofence_radius}m of ${branchLocation.name}. Currently ${distanceToBranch ?? 'unknown'}m away.`
            );
            return;
        }

        setIsSubmittingPunch(true);

        const payload: Record<string, any> = {
            employee_id: selectedEmployeeId,
            punch_type: punchType,
        };

        if (notes?.trim()) {
            payload.notes = notes.trim();
        }

        if (userCoords) {
            payload.latitude = userCoords.latitude;
            payload.longitude = userCoords.longitude;
        }

        router.post('/employee-management/attendance/punch', payload, {
            preserveScroll: true,
            onSuccess: () => {
                const labels: Record<string, string> = {
                    check_in: 'Check-In registered successfully!',
                    break_out: 'Break-Out recorded. Have a great break!',
                    break_in: 'Break-In recorded. Welcome back!',
                    check_out: 'Check-Out recorded. Shift completed!',
                };
                toast.success(labels[punchType] || 'Punch registered successfully.');
                if (punchType === 'check_out') {
                    setIsCheckoutRemarkOpen(false);
                    setCheckoutRemark('');
                }
            },
            onError: (errors) => {
                const message = (Object.values(errors)[0] as string) || 'Failed to record punch.';
                toast.error(message);
            },
            onFinish: () => setIsSubmittingPunch(false),
        });
    };

    // Handle Geofence Configuration Update
    const handleUpdateGeofence = (e: React.FormEvent) => {
        e.preventDefault();
        router.post(
            '/employee-management/attendance/geofence',
            {
                latitude: Number(geofenceForm.latitude),
                longitude: Number(geofenceForm.longitude),
                geofence_radius: Number(geofenceForm.geofence_radius),
                geofence_enforced: geofenceForm.geofence_enforced,
            },
            {
                onSuccess: () => {
                    toast.success('Branch GPS geofence settings updated.');
                    setIsGeofenceSettingsOpen(false);
                    requestLocation();
                },
                onError: (err) => {
                    const msg = (Object.values(err)[0] as string) || 'Failed to update geofence.';
                    toast.error(msg);
                },
            }
        );
    };

    // Populate branch form with user's current GPS position
    const handleUseCurrentLocationForBranch = () => {
        if (!userCoords) {
            toast.error('GPS location not detected yet.');
            return;
        }
        setGeofenceForm({
            ...geofenceForm,
            latitude: userCoords.latitude.toFixed(6),
            longitude: userCoords.longitude.toFixed(6),
        });
        toast.info('Coordinates filled with your current detected location.');
    };

    // Filters State
    const [dateFrom, setDateFrom] = React.useState(filters.date_from);
    const [dateTo, setDateTo] = React.useState(filters.date_to);
    const [empId, setEmpId] = React.useState(filters.employee_id || 'all');
    const [exceptionsOnly, setExceptionsOnly] = React.useState(filters.exceptions_only);

    const handleFilterSubmit = (customParams = {}) => {
        router.get(
            '/employee-management/attendance',
            {
                date_from: dateFrom,
                date_to: dateTo,
                employee_id: empId === 'all' ? undefined : empId,
                exceptions_only: exceptionsOnly ? true : undefined,
                ...customParams,
            },
            { preserveState: true, preserveScroll: true }
        );
    };

    const handleVerifyPunch = (dtrId: number) => {
        router.post(
            `/employee-management/attendance/${dtrId}/verify`,
            {},
            {
                onSuccess: () => toast.success('Attendance punch verified by HR.'),
                onError: () => toast.error('Failed to verify punch.'),
            }
        );
    };

    // Format digital clock time
    const formattedClockTime = currentTime.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true,
    });

    const formattedClockDate = currentTime.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
    });

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Direct Attendance Clock & Geofencing" />

            <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
                {/* Header */}
                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <Heading
                            title="Time & Attendance + Geofence Clock"
                            description="Direct system clock-in, break-out, break-in, and check-out activated strictly via clinic GPS coordinates."
                        />
                    </div>
                    <div className="flex items-center gap-2">
                        {canManageAttendance && (
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setIsGeofenceSettingsOpen(true)}
                                className="gap-2 text-xs shadow-xs"
                            >
                                <Settings className="h-4 w-4 text-muted-foreground" />
                                Branch GPS Settings
                            </Button>
                        )}
                    </div>
                </div>

                {/* DIRECT WEB TIME CLOCK & GEOFENCE ACTIVATION PANEL */}
                <Card className="border-border/80 shadow-sm overflow-hidden bg-gradient-to-br from-card via-card to-muted/20">
                    <CardHeader className="border-b border-border/50 pb-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                            {/* Live Clock & Date */}
                            <div className="flex items-center gap-4">
                                <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-primary/10 text-primary border border-primary/20 shadow-xs">
                                    <Clock className="h-7 w-7 animate-pulse text-primary" />
                                </div>
                                <div>
                                    <div className="flex items-center gap-2">
                                        <h3 className="font-mono text-3xl font-extrabold tracking-tight text-foreground">
                                            {formattedClockTime}
                                        </h3>
                                        <Badge variant="secondary" className="font-mono text-[10px] tracking-wider uppercase">
                                            PST (GMT+8)
                                        </Badge>
                                    </div>
                                    <p className="text-xs text-muted-foreground font-medium mt-0.5">
                                        {formattedClockDate}
                                    </p>
                                </div>
                            </div>

                            {/* Active Employee Selector */}
                            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                <div className="space-y-1">
                                    <Label className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
                                        <UserCheck className="h-3.5 w-3.5 text-primary" />
                                        Punching Staff Member
                                    </Label>
                                    {canManageAttendance ? (
                                        <Select
                                            value={selectedEmployeeId}
                                            onValueChange={setSelectedEmployeeId}
                                        >
                                            <SelectTrigger className="w-full sm:w-[260px] bg-background">
                                                <SelectValue placeholder="Select Employee" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {employees.map((emp) => (
                                                    <SelectItem key={emp.id} value={String(emp.id)}>
                                                        <span className="font-medium">
                                                            {emp.firstname} {emp.lastname}
                                                        </span>{' '}
                                                        <span className="text-xs text-muted-foreground">
                                                            ({emp.employee_code})
                                                        </span>
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    ) : (
                                        <div className="flex items-center h-9 px-3 rounded-md border border-input bg-muted/50 text-sm font-medium">
                                            {currentUserEmployee
                                                ? `${currentUserEmployee.firstname} ${currentUserEmployee.lastname} (${currentUserEmployee.employee_code})`
                                                : employees[0]
                                                ? `${employees[0].firstname} ${employees[0].lastname} (${employees[0].employee_code})`
                                                : 'Current Employee'}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </CardHeader>

                    <CardContent className="pt-6 pb-6 space-y-6">
                        {/* GPS Coordinates & Geofence Status Banner */}
                        <div className="rounded-xl border border-border/80 bg-background/80 p-4 shadow-xs">
                            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                <div className="space-y-1.5">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                                            <MapPin className="h-3.5 w-3.5 text-primary" />
                                            Target Clinic:
                                        </span>
                                        <span className="text-sm font-semibold text-foreground">
                                            {branchLocation.name}
                                        </span>
                                        <span className="font-mono text-xs text-muted-foreground">
                                            ({branchLocation.latitude.toFixed(4)}°, {branchLocation.longitude.toFixed(4)}°)
                                        </span>
                                        <Badge variant="outline" className="text-[10px] font-mono">
                                            Radius: {branchLocation.geofence_radius}m
                                        </Badge>
                                    </div>

                                    {branchLocation.geofence_enforced && <div className="flex items-center gap-2 text-xs flex-wrap">
                                        <span className="text-muted-foreground flex items-center gap-1">
                                            <Crosshair className="h-3.5 w-3.5" />
                                            Detected GPS:
                                        </span>
                                        {userCoords ? (
                                            <span className="font-mono font-medium text-foreground">
                                                {userCoords.latitude.toFixed(5)}°, {userCoords.longitude.toFixed(5)}°
                                                <span className="text-muted-foreground ml-1 font-normal">
                                                    (±{userCoords.accuracy}m accuracy)
                                                </span>
                                            </span>
                                        ) : (
                                            <span className="italic text-muted-foreground">
                                                Acquiring satellite lock...
                                            </span>
                                        )}
                                    </div>}
                                </div>

                                {/* Live Geofence Status Badge & Relocate Button */}
                                <div className="flex items-center gap-3">
                                    {geoStatus === 'disabled' ? (
                                        <Badge variant="outline" className="px-3 py-1.5 text-xs font-semibold border-amber-500/40 text-amber-600">
                                            Geofence Disabled
                                        </Badge>
                                    ) : geoStatus === 'locating' ? (
                                        <Badge
                                            variant="secondary"
                                            className="px-3 py-1.5 text-xs font-semibold gap-1.5 animate-pulse bg-muted"
                                        >
                                            <RefreshCw className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                                            Verifying Location...
                                        </Badge>
                                    ) : geoStatus === 'in_range' ? (
                                        <Badge className="px-3 py-1.5 text-xs font-semibold gap-1.5 bg-emerald-600 hover:bg-emerald-600 text-white shadow-xs">
                                            <ShieldCheck className="h-4 w-4" />
                                            Inside Branch Zone ({distanceToBranch ?? 0}m away) — Clocking Activated
                                        </Badge>
                                    ) : geoStatus === 'out_of_range' ? (
                                        <Badge
                                            variant="destructive"
                                            className="px-3 py-1.5 text-xs font-semibold gap-1.5 shadow-xs"
                                        >
                                            <ShieldAlert className="h-4 w-4" />
                                            Out of Range ({distanceToBranch ?? 0}m away) — Clocking Disabled
                                        </Badge>
                                    ) : geoStatus === 'permission_denied' ? (
                                        <Badge
                                            variant="destructive"
                                            className="px-3 py-1.5 text-xs font-semibold gap-1.5"
                                        >
                                            <AlertCircle className="h-4 w-4" />
                                            Location Access Denied — Enable GPS
                                        </Badge>
                                    ) : (
                                        <Badge
                                            variant="outline"
                                            className="px-3 py-1.5 text-xs font-semibold gap-1.5 border-amber-500/40 text-amber-600"
                                        >
                                            <HelpCircle className="h-4 w-4" />
                                            GPS Unavailable
                                        </Badge>
                                    )}

                                    {branchLocation.geofence_enforced && <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={requestLocation}
                                        disabled={isRefreshingLocation}
                                        className="h-8 gap-1.5 text-xs"
                                        title="Refresh current GPS position"
                                    >
                                        <LocateFixed
                                            className={`h-3.5 w-3.5 ${isRefreshingLocation ? 'animate-spin text-primary' : ''}`}
                                        />
                                        <span className="hidden sm:inline">Relocate</span>
                                    </Button>}
                                </div>
                            </div>

                            {/* Warning notification when outside geofence */}
                            {!isLocationAuthorized && (
                                <div className="mt-3 rounded-lg bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-700 dark:text-rose-400 flex items-start gap-2">
                                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                                    <div>
                                        <span className="font-semibold">Attendance clocking locked:</span> You are currently{' '}
                                        <span className="font-bold underline">{distanceToBranch ?? 0} meters</span> away from{' '}
                                        {branchLocation.name}. Time clock buttons are strictly activated only when within{' '}
                                        {branchLocation.geofence_radius} meters of clinic coordinates.
                                    </div>
                                </div>
                            )}

                            {geoErrorMessage && geoStatus === 'permission_denied' && (
                                <div className="mt-3 rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-700 dark:text-amber-400 flex items-center gap-2">
                                    <Info className="h-4 w-4 shrink-0" />
                                    <span>{geoErrorMessage}</span>
                                </div>
                            )}
                        </div>

                        {/* 4 PUNCH ACTION BUTTONS */}
                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Select Direct Action for Today ({currentTodayEntry?.work_date || 'Today'})
                                </Label>
                                {hasCheckedOut && (
                                    <Badge variant="outline" className="text-xs bg-emerald-500/10 text-emerald-700 border-emerald-500/30 font-medium">
                                        ✓ Daily Shift Completed
                                    </Badge>
                                )}
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                {/* 1. CHECK-IN */}
                                <Button
                                    size="lg"
                                    onClick={() => handlePunch('check_in')}
                                    disabled={!canCheckIn}
                                    className={`h-20 flex flex-col items-center justify-center gap-1 shadow-sm transition-all text-sm font-bold ${
                                        canCheckIn
                                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer active:scale-98'
                                            : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <LogIn className="h-5 w-5" />
                                        <span>CHECK-IN</span>
                                    </div>
                                    <span className="text-[11px] font-normal opacity-90">
                                        {hasCheckedIn
                                            ? `In: ${currentTodayEntry?.time_in?.substring(0, 5)}`
                                            : 'Shift Start / Morning'}
                                    </span>
                                </Button>

                                {/* 2. BREAK-OUT */}
                                <Button
                                    size="lg"
                                    onClick={() => handlePunch('break_out')}
                                    disabled={!canBreakOut}
                                    className={`h-20 flex flex-col items-center justify-center gap-1 shadow-sm transition-all text-sm font-bold ${
                                        canBreakOut
                                            ? 'bg-amber-600 hover:bg-amber-700 text-white cursor-pointer active:scale-98'
                                            : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <Coffee className="h-5 w-5" />
                                        <span>BREAK-OUT</span>
                                    </div>
                                    <span className="text-[11px] font-normal opacity-90">
                                        {hasBrokenOut
                                            ? `Out: ${currentTodayEntry?.break_out?.substring(0, 5)}`
                                            : 'Lunch / Meal Break'}
                                    </span>
                                </Button>

                                {/* 3. BREAK-IN */}
                                <Button
                                    size="lg"
                                    onClick={() => handlePunch('break_in')}
                                    disabled={!canBreakIn}
                                    className={`h-20 flex flex-col items-center justify-center gap-1 shadow-sm transition-all text-sm font-bold ${
                                        canBreakIn
                                            ? 'bg-blue-600 hover:bg-blue-700 text-white cursor-pointer active:scale-98'
                                            : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <PlayCircle className="h-5 w-5" />
                                        <span>BREAK-IN</span>
                                    </div>
                                    <span className="text-[11px] font-normal opacity-90">
                                        {hasBrokenIn
                                            ? `In: ${currentTodayEntry?.break_in?.substring(0, 5)}`
                                            : 'Resume Shift'}
                                    </span>
                                </Button>

                                {/* 4. CHECK-OUT */}
                                <Button
                                    size="lg"
                                    onClick={() => handlePunch('check_out')}
                                    disabled={!canCheckOut}
                                    className={`h-20 flex flex-col items-center justify-center gap-1 shadow-sm transition-all text-sm font-bold ${
                                        canCheckOut
                                            ? 'bg-rose-600 hover:bg-rose-700 text-white cursor-pointer active:scale-98'
                                            : 'opacity-50 cursor-not-allowed bg-muted text-muted-foreground'
                                    }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <LogOut className="h-5 w-5" />
                                        <span>CHECK-OUT</span>
                                    </div>
                                    <span className="text-[11px] font-normal opacity-90">
                                        {hasCheckedOut
                                            ? `Out: ${currentTodayEntry?.time_out?.substring(0, 5)}`
                                            : 'Shift End / Evening'}
                                    </span>
                                </Button>
                            </div>
                        </div>

                        {/* TODAY'S TIMELINE PROGRESSION */}
                        <div className="rounded-xl border border-border/70 bg-muted/20 p-4">
                            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                                Today's Shift Punch Sequence Summary
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <div className={`p-3 rounded-lg border ${hasCheckedIn ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-background border-border/60'}`}>
                                    <div className="text-[11px] text-muted-foreground font-medium flex items-center justify-between">
                                        <span>1. Check-In</span>
                                        {hasCheckedIn && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
                                    </div>
                                    <div className="mt-1 font-mono text-sm font-bold text-foreground">
                                        {currentTodayEntry?.time_in ? currentTodayEntry.time_in.substring(0, 5) : '—'}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        {currentTodayEntry?.distance_meters != null
                                            ? `GPS: ${Math.round(Number(currentTodayEntry.distance_meters))}m`
                                            : hasCheckedIn
                                              ? 'Recorded'
                                              : 'Pending'}
                                    </div>
                                </div>

                                <div className={`p-3 rounded-lg border ${hasBrokenOut ? 'bg-amber-500/10 border-amber-500/30' : 'bg-background border-border/60'}`}>
                                    <div className="text-[11px] text-muted-foreground font-medium flex items-center justify-between">
                                        <span>2. Break-Out</span>
                                        {hasBrokenOut && <CheckCircle2 className="h-3.5 w-3.5 text-amber-600" />}
                                    </div>
                                    <div className="mt-1 font-mono text-sm font-bold text-foreground">
                                        {currentTodayEntry?.break_out ? currentTodayEntry.break_out.substring(0, 5) : '—'}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        {hasBrokenOut ? 'Lunch Out' : 'Pending'}
                                    </div>
                                </div>

                                <div className={`p-3 rounded-lg border ${hasBrokenIn ? 'bg-blue-500/10 border-blue-500/30' : 'bg-background border-border/60'}`}>
                                    <div className="text-[11px] text-muted-foreground font-medium flex items-center justify-between">
                                        <span>3. Break-In</span>
                                        {hasBrokenIn && <CheckCircle2 className="h-3.5 w-3.5 text-blue-600" />}
                                    </div>
                                    <div className="mt-1 font-mono text-sm font-bold text-foreground">
                                        {currentTodayEntry?.break_in ? currentTodayEntry.break_in.substring(0, 5) : '—'}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        {hasBrokenIn ? 'Lunch In' : 'Pending'}
                                    </div>
                                </div>

                                <div className={`p-3 rounded-lg border ${hasCheckedOut ? 'bg-rose-500/10 border-rose-500/30' : 'bg-background border-border/60'}`}>
                                    <div className="text-[11px] text-muted-foreground font-medium flex items-center justify-between">
                                        <span>4. Check-Out</span>
                                        {hasCheckedOut && <CheckCircle2 className="h-3.5 w-3.5 text-rose-600" />}
                                    </div>
                                    <div className="mt-1 font-mono text-sm font-bold text-foreground">
                                        {currentTodayEntry?.time_out ? currentTodayEntry.time_out.substring(0, 5) : '—'}
                                    </div>
                                    <div className="mt-0.5 text-[10px] text-muted-foreground">
                                        {hasCheckedOut
                                            ? `Net: ${currentTodayEntry?.regular_hours ?? 0}h`
                                            : 'Pending'}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* KPI CARDS */}
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Regular Hours
                            </CardTitle>
                            <div className="rounded-full bg-primary/10 p-2 text-primary">
                                <Clock className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-primary">
                                {Number(kpis.totalRegularHours).toFixed(1)} hrs
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Net rendered hours this week</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Overtime Hours
                            </CardTitle>
                            <div className="rounded-full bg-blue-500/10 p-2 text-blue-600 dark:text-blue-400">
                                <Zap className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-blue-600 dark:text-blue-400">
                                {Number(kpis.totalOtHours).toFixed(1)} hrs
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Approved overtime rendered</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Total Tardiness
                            </CardTitle>
                            <div className="rounded-full bg-amber-500/10 p-2 text-amber-600 dark:text-amber-400">
                                <Clock className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-amber-600 dark:text-amber-400">
                                {kpis.totalTardinessMinutes} mins
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Cumulative tardiness</p>
                        </CardContent>
                    </Card>

                    <Card className="border-border/80 shadow-xs">
                        <CardHeader className="flex flex-row items-center justify-between pb-2">
                            <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                                Exceptions Alert
                            </CardTitle>
                            <div className="rounded-full bg-rose-500/10 p-2 text-rose-600 dark:text-rose-400">
                                <AlertCircle className="h-4 w-4" />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="text-2xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
                                {kpis.exceptionsCount} records
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">Tardy, absent, or missing punches</p>
                        </CardContent>
                    </Card>
                </div>

                {/* FILTER TOOLBAR */}
                <Card className="border-border/80 shadow-xs">
                    <CardContent className="pt-4 pb-4">
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-5">
                            <div>
                                <Label className="text-xs text-muted-foreground">Date From</Label>
                                <Input
                                    type="date"
                                    value={dateFrom}
                                    onChange={(e) => setDateFrom(e.target.value)}
                                    className="mt-1"
                                />
                            </div>

                            <div>
                                <Label className="text-xs text-muted-foreground">Date To</Label>
                                <Input
                                    type="date"
                                    value={dateTo}
                                    onChange={(e) => setDateTo(e.target.value)}
                                    className="mt-1"
                                />
                            </div>

                            {canManageAttendance && (
                                <div>
                                    <Label className="text-xs text-muted-foreground">Employee</Label>
                                    <Select
                                        value={empId}
                                        onValueChange={(val) => {
                                            setEmpId(val);
                                            handleFilterSubmit({ employee_id: val === 'all' ? undefined : val });
                                        }}
                                    >
                                        <SelectTrigger className="mt-1">
                                            <SelectValue placeholder="All Employees" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Employees</SelectItem>
                                            {employees.map((emp) => (
                                                <SelectItem key={emp.id} value={String(emp.id)}>
                                                    {emp.firstname} {emp.lastname}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}

                            <div className="flex flex-col justify-end">
                                <Button
                                    variant={exceptionsOnly ? 'default' : 'outline'}
                                    onClick={() => {
                                        const newEx = !exceptionsOnly;
                                        setExceptionsOnly(newEx);
                                        handleFilterSubmit({ exceptions_only: newEx ? true : undefined });
                                    }}
                                    className="gap-2"
                                >
                                    <AlertCircle className="h-4 w-4" />
                                    {exceptionsOnly ? 'Showing Exceptions' : 'Exceptions Only'}
                                </Button>
                            </div>

                            <div className="flex items-end gap-2">
                                <Button
                                    variant="secondary"
                                    onClick={() => handleFilterSubmit()}
                                    className="flex-1"
                                >
                                    Apply
                                </Button>
                                <Button
                                    variant="ghost"
                                    onClick={() => {
                                        setDateFrom(filters.date_from);
                                        setDateTo(filters.date_to);
                                        setEmpId('all');
                                        setExceptionsOnly(false);
                                        router.get('/employee-management/attendance', {}, { preserveState: true });
                                    }}
                                >
                                    <RefreshCw className="h-4 w-4" />
                                </Button>
                            </div>
                        </div>
                    </CardContent>
                </Card>

                {/* ATTENDANCE & GEOLOCATION LOG TABLE */}
                <Card className="border-border/80 shadow-xs">
                    <CardHeader className="flex flex-row items-center justify-between pb-3">
                        <div>
                            <CardTitle className="text-base font-semibold">Attendance & Geofence Verification Log</CardTitle>
                            <CardDescription>
                                Showing {entries.data.length} of {entries.total} attendance logs with coordinates verification
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <Table>
                                <TableHeader>
                                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                                        <TableHead>Date</TableHead>
                                        <TableHead>Employee</TableHead>
                                        <TableHead>Check In</TableHead>
                                        <TableHead>Break Out</TableHead>
                                        <TableHead>Break In</TableHead>
                                        <TableHead>Check Out</TableHead>
                                        <TableHead className="text-right">Reg Hrs</TableHead>
                                        <TableHead className="text-right">OT Hrs</TableHead>
                                        <TableHead className="text-right">Tardy</TableHead>
                                        <TableHead>GPS Location</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {entries.data.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={11} className="h-32 text-center text-muted-foreground">
                                                No attendance punch records found for this period.
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        entries.data.map((row) => {
                                            const isTardy = row.tardiness_minutes > 0;
                                            const isAbsent = row.is_absent;
                                            const hasOt = Number(row.ot_hours) > 0;
                                            const missingPunch = !row.time_in || !row.time_out;

                                            return (
                                                <TableRow key={row.id} className="hover:bg-muted/30">
                                                    <TableCell className="font-mono text-xs whitespace-nowrap">
                                                        {row.work_date}
                                                    </TableCell>
                                                    <TableCell>
                                                        <div className="font-medium text-xs">
                                                            {row.employee?.firstname} {row.employee?.lastname}
                                                        </div>
                                                        <div className="text-[11px] text-muted-foreground">
                                                            {row.employee?.position}
                                                        </div>
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {row.time_in ? (
                                                            <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400 font-medium">
                                                                <LogIn className="h-3 w-3" />
                                                                {row.time_in.substring(0, 5)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-rose-500 text-xs font-medium">Missing</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {row.break_out ? (
                                                            <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                                                                <Coffee className="h-3 w-3" />
                                                                {row.break_out.substring(0, 5)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {row.break_in ? (
                                                            <span className="flex items-center gap-1 text-blue-700 dark:text-blue-400">
                                                                <PlayCircle className="h-3 w-3" />
                                                                {row.break_in.substring(0, 5)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-muted-foreground text-xs">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="font-mono text-xs">
                                                        {row.time_out ? (
                                                            <span className="flex items-center gap-1 text-rose-700 dark:text-rose-400 font-medium">
                                                                <LogOut className="h-3 w-3" />
                                                                {row.time_out.substring(0, 5)}
                                                            </span>
                                                        ) : (
                                                            <span className="text-amber-500 text-xs">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs font-semibold">
                                                        {Number(row.regular_hours).toFixed(1)}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {hasOt ? (
                                                            <span className="text-blue-600 font-semibold">
                                                                +{Number(row.ot_hours).toFixed(1)}
                                                            </span>
                                                        ) : (
                                                            '0.0'
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right font-mono text-xs">
                                                        {isTardy ? (
                                                            <span className="text-rose-600 font-semibold">
                                                                {row.tardiness_minutes}m
                                                            </span>
                                                        ) : (
                                                            '0'
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {row.location_status === 'verified' ? (
                                                            <Badge
                                                                variant="outline"
                                                                className="border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] gap-1 font-mono"
                                                            >
                                                                <ShieldCheck className="h-3 w-3 text-emerald-600" />
                                                                {row.distance_meters != null
                                                                    ? `${Math.round(Number(row.distance_meters))}m Verified`
                                                                    : 'Verified'}
                                                            </Badge>
                                                        ) : row.location_status === 'out_of_bounds' ? (
                                                            <Badge
                                                                variant="destructive"
                                                                className="text-[10px] gap-1 font-mono"
                                                            >
                                                                <ShieldAlert className="h-3 w-3" />
                                                                {row.distance_meters != null
                                                                    ? `${Math.round(Number(row.distance_meters))}m Out`
                                                                    : 'Out of bounds'}
                                                            </Badge>
                                                        ) : (
                                                            <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                                                {row.location_status || 'Manual'}
                                                            </Badge>
                                                        )}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        {canManageAttendance && (isTardy || missingPunch) && (
                                                            <Button
                                                                size="sm"
                                                                variant="ghost"
                                                                className="h-7 text-xs text-primary"
                                                                onClick={() => handleVerifyPunch(row.id)}
                                                            >
                                                                Verify
                                                            </Button>
                                                        )}
                                                    </TableCell>
                                                </TableRow>
                                            );
                                        })
                                    )}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Dialog
                open={isCheckoutRemarkOpen}
                onOpenChange={(open) => {
                    setIsCheckoutRemarkOpen(open);
                    if (!open) setCheckoutRemark('');
                }}
            >
                <DialogContent className="sm:max-w-[480px]">
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            handlePunch('check_out', checkoutRemark.trim());
                        }}
                    >
                        <DialogHeader>
                            <DialogTitle>Remark required for missing break punch</DialogTitle>
                            <DialogDescription>
                                You can check out now. Explain the missing break-out or break-in for today’s attendance record.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="py-4">
                            <Label htmlFor="checkout-remark">Remark *</Label>
                            <Textarea
                                id="checkout-remark"
                                value={checkoutRemark}
                                onChange={(event) => setCheckoutRemark(event.target.value)}
                                maxLength={500}
                                rows={4}
                                placeholder="Explain why the break punch was missed"
                                required
                                autoFocus
                            />
                        </div>

                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsCheckoutRemarkOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={!checkoutRemark.trim() || isSubmittingPunch}>
                                Confirm Check-out
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* MODAL: BRANCH GPS & GEOFENCE CONFIGURATION */}
            <Dialog open={isGeofenceSettingsOpen} onOpenChange={setIsGeofenceSettingsOpen}>
                <DialogContent className="sm:max-w-[480px]">
                    <form onSubmit={handleUpdateGeofence}>
                        <DialogHeader>
                            <DialogTitle className="flex items-center gap-2">
                                <MapPin className="h-5 w-5 text-primary" />
                                Clinic Branch GPS & Geofence
                            </DialogTitle>
                            <DialogDescription>
                                Set branch latitude, longitude, and geofence perimeter to activate employee time clocking.
                            </DialogDescription>
                        </DialogHeader>

                        <div className="grid gap-4 py-4">
                            <div className="flex items-center justify-between rounded-lg bg-muted/40 p-3 border border-border/60">
                                <div className="space-y-0.5">
                                    <Label className="text-xs font-semibold">Current Device Position</Label>
                                    <p className="text-[11px] text-muted-foreground font-mono">
                                        {userCoords
                                            ? `${userCoords.latitude.toFixed(5)}°, ${userCoords.longitude.toFixed(5)}° (±${userCoords.accuracy}m)`
                                            : 'Acquiring GPS location...'}
                                    </p>
                                </div>
                                <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={handleUseCurrentLocationForBranch}
                                    disabled={!userCoords}
                                    className="gap-1 text-xs"
                                >
                                    <Crosshair className="h-3.5 w-3.5" />
                                    Use My GPS
                                </Button>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1.5">
                                    <Label htmlFor="branch_lat" className="text-xs">Latitude *</Label>
                                    <Input
                                        id="branch_lat"
                                        type="number"
                                        step="any"
                                        value={geofenceForm.latitude}
                                        onChange={(e) => setGeofenceForm({ ...geofenceForm, latitude: e.target.value })}
                                        required
                                    />
                                </div>

                                <div className="space-y-1.5">
                                    <Label htmlFor="branch_lon" className="text-xs">Longitude *</Label>
                                    <Input
                                        id="branch_lon"
                                        type="number"
                                        step="any"
                                        value={geofenceForm.longitude}
                                        onChange={(e) => setGeofenceForm({ ...geofenceForm, longitude: e.target.value })}
                                        required
                                    />
                                </div>
                            </div>

                            <div className="space-y-1.5">
                                <Label htmlFor="geo_radius" className="text-xs">Allowed Geofence Radius (Meters) *</Label>
                                <Input
                                    id="geo_radius"
                                    type="number"
                                    min="20"
                                    max="5000"
                                    value={geofenceForm.geofence_radius}
                                    onChange={(e) => setGeofenceForm({ ...geofenceForm, geofence_radius: e.target.value })}
                                    required
                                />
                                <p className="text-[11px] text-muted-foreground">
                                    Employees must be within this distance (e.g. 250m) to activate the time clock.
                                </p>
                            </div>

                            <div className="flex items-center justify-between rounded-lg border p-3">
                                <div>
                                    <Label className="text-xs font-semibold">Strict Geofence Enforcement</Label>
                                    <p className="text-[11px] text-muted-foreground">
                                        When active, clock buttons are disabled outside coordinates.
                                    </p>
                                </div>
                                <input
                                    type="checkbox"
                                    id="geofence_enforced"
                                    checked={geofenceForm.geofence_enforced}
                                    onChange={(e) =>
                                        setGeofenceForm({ ...geofenceForm, geofence_enforced: e.target.checked })
                                    }
                                    className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                />
                            </div>
                        </div>

                        <DialogFooter>
                            <Button
                                type="button"
                                variant="outline"
                                onClick={() => setIsGeofenceSettingsOpen(false)}
                            >
                                Cancel
                            </Button>
                            <Button type="submit">
                                Save Geofence Settings
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </AppLayout>
    );
}
